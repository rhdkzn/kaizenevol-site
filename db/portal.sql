-- ============================================================================
-- The Owners Portal — database layer.  Recorded 2026-09-22.
--
-- WHY THIS FILE EXISTS.  It did not, and that is what let the bug through.
-- portal.html has called `sb.rpc('portal_touch')` since it was built; the
-- function had NEVER been created in Supabase.  The call fails silently — it is
-- not awaited and its error is not read — so `ke_portal_users.last_seen` stayed
-- null forever, and the CRM, which renders that column, told us every client had
-- "not yet signed in".  It said that about an account that signed in on
-- 2026-09-08, thirteen seconds after it was created.
--
-- The schema, policies and functions lived ONLY in the Supabase project, so
-- nothing in the repo could notice a front end calling a function the database
-- did not have.  This file is now the source of truth, and
-- `test-rpc-contract.mjs` fails the build if any rpc() in our HTML is missing
-- from it.  Dumped from the live project with pg_get_functiondef, not written
-- from memory.
--
-- Applying a change: edit here, apply the same SQL to Supabase, commit both.
-- ============================================================================

-- ─── Tables ────────────────────────────────────────────────────────────────
-- ke_portal_users : one row per invited client contact. RLS on.
--   email text | client_id text | client_name text
--   invited_at timestamptz | last_seen timestamptz
-- ke_portal_items : everything the portal shows. RLS on.
--   id bigint | client_id text | kind text | title text | body text
--   on_date date | url text | author text | created_at timestamptz
--   read_by_staff boolean | amount integer | status text
--   kind is one of: event · update · invoice · message · file
-- storage bucket 'portal' : private, 50MB limit, files under <client_id>/ and
--   <client_id>/from-client/

-- ─── Functions ─────────────────────────────────────────────────────────────

-- Who is staff. Used by every staff_all policy.
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.ke_staff s where s.email = (auth.jwt() ->> 'email'));
$function$;

-- The caller's client id. Used by the storage policies to scope a folder.
CREATE OR REPLACE FUNCTION public.portal_client_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select client_id from public.ke_portal_users where email = lower(auth.jwt() ->> 'email') limit 1 $function$;

-- Everything the signed-in client may see, assembled server-side.
-- NOTE the subtractions: stripeCustomer, stripeSubscription, onboardingToken and
-- every card's notes are stripped before the payload leaves the database. Keep
-- them stripped — this is the only thing standing between a client and our
-- internal fields.
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
    'boards', boards,
    'settings', jsonb_build_object('retainerValue', coalesce((d->'settings'->>'retainerValue')::numeric, 2000), 'stepValue', 1000, 'stepTrigger', 1.5)
  );
end $function$;

-- Records that the client opened their portal.  ADDED 2026-09-22.
--
-- It is a function and not an UPDATE policy on purpose.  RLS cannot restrict
-- COLUMNS, so a policy permissive enough to let a client write last_seen would
-- also let them rewrite their own client_id — and client_id is what every other
-- policy scopes on, so that is a straight read of another client's portal.
-- This takes no arguments and can only ever set last_seen for the caller.
CREATE OR REPLACE FUNCTION public.portal_touch()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update ke_portal_users
     set last_seen = now()
   where email = lower(auth.jwt() ->> 'email');
$function$;

REVOKE ALL ON FUNCTION public.portal_touch() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_touch() TO authenticated;

-- ─── Row level security ────────────────────────────────────────────────────
-- ke_portal_users
--   client_read_self  SELECT authenticated  using: email = lower(auth.jwt()->>'email')
--   staff_all         ALL    authenticated  using/check: is_staff()
--   (no client UPDATE or DELETE policy — deliberate, see portal_touch above)
--
-- ke_portal_items
--   client_read_own     SELECT authenticated
--       using: client_id in (select client_id from ke_portal_users
--                            where email = lower(auth.jwt()->>'email'))
--   client_write_message INSERT authenticated
--       check: kind = 'message' AND author = 'client' AND client_id in (…same…)
--       — so a client can post a message and cannot forge an invoice or an update
--   staff_all            ALL   authenticated  using/check: is_staff()
--
-- storage.objects (bucket 'portal')
--   portal_client_read   SELECT authenticated
--       using: bucket_id='portal' AND (storage.foldername(name))[1] = portal_client_id()
--   portal_client_upload INSERT authenticated
--       check: bucket_id='portal' AND (storage.foldername(name))[1] = portal_client_id()
--              AND (storage.foldername(name))[2] = 'from-client'
--              AND array_length(storage.foldername(name),1) = 2
--   portal_staff_all     ALL   authenticated  using/check: bucket_id='portal' AND is_staff()
