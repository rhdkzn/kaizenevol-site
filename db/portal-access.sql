-- Client portal: give us access, app by app (2026-09-24).
--
-- Rahaid: the access steps lived in a PDF (SKN_Artist_Access_KaizenEvol.pdf) whose buttons and
-- tick boxes did nothing on paper, while the portal's checklist had an "Access in" line with
-- nothing behind it. This moves the steps into the portal. The client marks each app done (or
-- "not relevant", e.g. no Apple Music for Artists yet); the state lives in
-- app_data.ke_data.clientAccess[<client_id>][<app>] = {state, at}, next to clientTasks, so the
-- CRM sees it through the same realtime channel it already listens on.
--
-- When every app for the client has a state, the client's "Access" checklist item is ticked:
-- the first checklist item whose text starts with "Access" (a7 for the artists, m6 for
-- Marauder, ob6 on the standard list). It is only ever ticked here, never unticked, so a
-- staff tick is never undone by a client changing their mind.
--
-- The app list per segment is duplicated in portal.html (ACCESS_APPS). If you add an app,
-- add it in both places: this function refuses an app it does not know.
--
-- updated_at is bumped on every write, because the CRM's saves are guarded on it; a write
-- that left it alone would be silently overwritten by the next CRM save.

CREATE OR REPLACE FUNCTION public.portal_access_set(p_app text, p_state text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid   text := public.portal_client_id();
  d     jsonb;
  c     jsonb;
  apps  text[];
  acc   jsonb;
  was_complete boolean;
  now_complete boolean;
  task  text;
begin
  if cid is null then raise exception 'Not signed in to a client space.'; end if;
  if p_state is not null and p_state not in ('done', 'na') then raise exception 'Unknown state.'; end if;

  select data into d from public.app_data where id = 'ke_data' for update;
  select x into c from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) x where x->>'id' = cid limit 1;

  if coalesce(c->>'segment', '') = 'Artist' then
    apps := array['instagram','youtube','spotify','apple','drive','tiktok','x'];
  else
    apps := array['meta','shopify','klaviyo','drive','tiktok'];
  end if;
  if not (p_app = any(apps)) then raise exception 'Unknown app.'; end if;

  acc := coalesce(d->'clientAccess'->cid, '{}'::jsonb);
  was_complete := (select bool_and(acc ? a) from unnest(apps) a);
  if p_state is null then
    acc := acc - p_app;
  else
    acc := acc || jsonb_build_object(p_app, jsonb_build_object('state', p_state, 'at', now()));
  end if;
  now_complete := (select bool_and(acc ? a) from unnest(apps) a);

  d := jsonb_set(d, array['clientAccess'], coalesce(d->'clientAccess', '{}'::jsonb), true);
  d := jsonb_set(d, array['clientAccess', cid], acc, true);

  if now_complete and not was_complete then
    select x->>'id' into task
      from jsonb_array_elements(coalesce(nullif(c->'checklist', 'null'::jsonb), '[]'::jsonb)) x
     where x->>'text' ilike 'access%' limit 1;
    if task is null and (c->'checklist' is null or jsonb_array_length(c->'checklist') = 0) then task := 'ob6'; end if;
    if task is not null then
      d := jsonb_set(d, array['clientTasks'], coalesce(d->'clientTasks', '{}'::jsonb), true);
      d := jsonb_set(d, array['clientTasks', cid],
             coalesce(d->'clientTasks'->cid, '{}'::jsonb) || jsonb_build_object(task, true), true);
    end if;
    insert into public.ke_portal_items (client_id, kind, author, title, body)
    values (cid, 'update', 'agency', 'Access steps done',
            'You have marked every app. We accept each invite and confirm within one working day.');
  end if;

  update public.app_data set data = d, updated_at = now() where id = 'ke_data';
  return acc;
end $function$;

REVOKE ALL ON FUNCTION public.portal_access_set(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_access_set(text, text) TO authenticated;

-- portal_me: identical to db/portal.sql except for the one added 'access' key.
CREATE OR REPLACE FUNCTION public.portal_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  em text := lower(auth.jwt() ->> 'email');
  pu public.ke_portal_users;
  d jsonb;
  c jsonb;
  snaps jsonb;
  tasks jsonb;
  boards jsonb;
begin
  if em is null then return null; end if;
  select * into pu from public.ke_portal_users where email = em;
  if not found then return null; end if;
  select data into d from public.app_data where id = 'ke_data';
  select x into c from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) x where x->>'id' = pu.client_id limit 1;
  if c is null then c := jsonb_build_object('id', pu.client_id, 'name', pu.client_name); end if;
  select coalesce(jsonb_agg(x order by x->>'date'), '[]'::jsonb) into snaps
    from jsonb_array_elements(coalesce(d->'growth'->'snapshots','[]'::jsonb)) x where x->>'clientId' = pu.client_id;
  tasks := coalesce(d->'clientTasks'->pu.client_id, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b->>'id', 'name', b->>'name', 'columns', coalesce(b->'columns','[]'::jsonb),
      'cards', (select coalesce(jsonb_agg(k - 'notes'), '[]'::jsonb) from jsonb_array_elements(coalesce(b->'cards','[]'::jsonb)) k)
    )), '[]'::jsonb) into boards
    from jsonb_array_elements(coalesce(d->'boards','[]'::jsonb)) b where b->>'clientId' = pu.client_id;
  return jsonb_build_object(
    'email', em,
    'client', c - 'stripeCustomer' - 'stripeSubscription' - 'onboardingToken',
    'snapshots', snaps,
    'tasks', tasks,
    'access', coalesce(d->'clientAccess'->pu.client_id, '{}'::jsonb),
    'boards', boards,
    'settings', jsonb_build_object('retainerValue', coalesce((d->'settings'->>'retainerValue')::numeric, 2000), 'stepValue', 1000, 'stepTrigger', 1.5)
  );
end $function$;
