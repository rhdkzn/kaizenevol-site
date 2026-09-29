-- Client portal: logins for the apps with no team invite (2026-09-29).
--
-- Rahaid: TikTok, SoundCloud, the distributor (DistroKid and the like) and X have no team
-- invite, so we need the client's own login. Until now the portal said "tell us the password
-- on FaceTime". This lets the client type it into the portal instead, and keeps it where the
-- rest of the site cannot see it:
--
--   * The login is stored in Supabase Vault (vault.create_secret), which encrypts it at rest.
--     It is NEVER written to app_data.ke_data: the whole CRM reads that blob and caches it in
--     the browser's localStorage.
--   * The client can write it and replace it, and can never read it back, not even their own.
--     They see only the app and the date it was saved (ke_portal_logins, below).
--   * Staff read it one login at a time through portal_login_reveal(), which checks is_staff(),
--     the same check behind every staff_all policy (db/portal.sql). The CRM signs in as one
--     shared account (CRM_EMAIL in crm.html), which is the one row in ke_staff.
--   * Once we are logged in, staff delete it (portal_login_delete). Anything left after 14 days
--     is deleted by portal_login_purge(). Reveal also refuses anything older than 14 days, so
--     the limit holds even before the scheduled purge runs.
--
-- The login-type app ids are duplicated in portal.html (LOGIN_APPS) and crm.html
-- (PL_APPS). If you add one, add it in all three places: portal_login_set refuses any other id.
--
-- pg_cron: available on the project but NOT enabled as of 2026-09-29. The schedule at the
-- bottom only runs if it is. Enable it first (Dashboard, Integrations, Cron), then re-run
-- that block. Until then, the 14-day limit is enforced by reveal and by every save.

CREATE TABLE IF NOT EXISTS public.ke_portal_logins (
  client_id  text NOT NULL,
  app        text NOT NULL,
  secret_id  uuid NOT NULL,
  saved_at   timestamptz NOT NULL DEFAULT now(),
  saved_by   text,
  PRIMARY KEY (client_id, app)
);
ALTER TABLE public.ke_portal_logins ENABLE ROW LEVEL SECURITY;

-- Read-only from the pages. Every write goes through the functions below, so a row and its
-- vault secret are always created and deleted together.
DROP POLICY IF EXISTS staff_read ON public.ke_portal_logins;
CREATE POLICY staff_read ON public.ke_portal_logins FOR SELECT TO authenticated
  USING (public.is_staff());
DROP POLICY IF EXISTS client_read_self ON public.ke_portal_logins;
CREATE POLICY client_read_self ON public.ke_portal_logins FOR SELECT TO authenticated
  USING (client_id = public.portal_client_id());

-- RLS cannot hide columns, so column grants do: the pages may read which apps have a login
-- and when it was saved, never the secret_id.
REVOKE ALL ON public.ke_portal_logins FROM public, anon, authenticated;
GRANT SELECT (client_id, app, saved_at) ON public.ke_portal_logins TO authenticated;

-- Deletes every login saved more than 14 days ago, secret first. Not callable from the pages.
CREATE OR REPLACE FUNCTION public.portal_login_purge()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
begin
  delete from vault.secrets s using public.ke_portal_logins l
   where s.id = l.secret_id and l.saved_at < now() - interval '14 days';
  delete from public.ke_portal_logins where saved_at < now() - interval '14 days';
  get diagnostics n = row_count;
  return n;
end $function$;

REVOKE ALL ON FUNCTION public.portal_login_purge() FROM public, anon, authenticated;

-- The signed-in client saves (or replaces) the login for one app.
CREATE OR REPLACE FUNCTION public.portal_login_set(p_app text, p_user text, p_pass text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid  text := public.portal_client_id();
  em   text := lower(auth.jwt() ->> 'email');
  old  uuid;
  sid  uuid;
  ts   timestamptz := now();
begin
  if cid is null then raise exception 'Not signed in to a client space.'; end if;
  if p_app is null or not (p_app = any(array['tiktok','soundcloud','distributor','x'])) then
    raise exception 'That app does not take a login here.';
  end if;
  if p_user is null or length(btrim(p_user)) = 0 or length(p_user) > 200 then raise exception 'Add your username or email.'; end if;
  if p_pass is null or length(p_pass) = 0 or length(p_pass) > 200 then raise exception 'Add your password.'; end if;

  perform public.portal_login_purge();

  -- Replace, never stack: the old secret goes before the new one is made.
  select secret_id into old from public.ke_portal_logins where client_id = cid and app = p_app for update;
  if old is not null then delete from vault.secrets where id = old; end if;

  sid := vault.create_secret(
    jsonb_build_object('user', btrim(p_user), 'pass', p_pass)::text,
    'portal_login:' || cid || ':' || p_app || ':' || extract(epoch from ts)::bigint,
    'Client login for ' || p_app || ', saved from the portal');

  insert into public.ke_portal_logins (client_id, app, secret_id, saved_at, saved_by)
  values (cid, p_app, sid, ts, em)
  on conflict (client_id, app) do update set secret_id = excluded.secret_id, saved_at = excluded.saved_at, saved_by = excluded.saved_by;

  -- A client message, so the CRM card shows staff the unread marker it already shows for
  -- messages. It names the app only, never the login.
  insert into public.ke_portal_items (client_id, kind, author, title, body)
  values (cid, 'message', 'client', 'Login saved',
          'I have saved my ' || case p_app when 'tiktok' then 'TikTok' when 'soundcloud' then 'SoundCloud'
                                            when 'distributor' then 'distributor' else 'X' end
          || ' login in the portal.');

  return jsonb_build_object('app', p_app, 'saved_at', ts);
end $function$;

REVOKE ALL ON FUNCTION public.portal_login_set(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_login_set(text, text, text) TO authenticated;

-- Staff only: the login for one client and app, decrypted.
CREATE OR REPLACE FUNCTION public.portal_login_reveal(p_client_id text, p_app text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l   public.ke_portal_logins;
  sec text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  perform public.portal_login_purge();
  select * into l from public.ke_portal_logins where client_id = p_client_id and app = p_app;
  if not found or l.saved_at < now() - interval '14 days' then raise exception 'No saved login for that app.'; end if;
  select decrypted_secret into sec from vault.decrypted_secrets where id = l.secret_id;
  if sec is null then raise exception 'No saved login for that app.'; end if;
  return sec::jsonb || jsonb_build_object('saved_at', l.saved_at);
end $function$;

REVOKE ALL ON FUNCTION public.portal_login_reveal(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_login_reveal(text, text) TO authenticated;

-- Staff only: we are logged in, so delete the login and its row.
CREATE OR REPLACE FUNCTION public.portal_login_delete(p_client_id text, p_app text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  delete from public.ke_portal_logins where client_id = p_client_id and app = p_app returning secret_id into sid;
  if sid is null then return false; end if;
  delete from vault.secrets where id = sid;
  return true;
end $function$;

REVOKE ALL ON FUNCTION public.portal_login_delete(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_login_delete(text, text) TO authenticated;

-- Hourly purge, only if pg_cron is enabled (it was not on 2026-09-29; see the header).
DO $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('portal-login-purge', '17 * * * *', 'select public.portal_login_purge()');
  else
    raise notice 'pg_cron is not enabled: the hourly purge is not scheduled. Reveal and save still enforce 14 days.';
  end if;
end $cron$;
