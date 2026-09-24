-- Client portal: the artist setup questions (2026-09-24).
--
-- Rahaid: FulaFalu's portal "is for ecom, it's not asking him the questions an artist gave".
-- SKN answered a setup form on 2026-09-11 ("SKN × KAIZENEVOL — What we need from you", one of
-- the documents Diego's deck build produces). That form lived outside the portal, so the next
-- artist got nothing. The questions are rebuilt from SKN's recorded answers
-- (KaizenEvol clients/skn.md) and live in portal.html (SETUP_QS).
--
-- Answers hold personal data (legal name, date of birth, phone), so they are kept OUT of
-- app_data.ke_data, which the whole CRM reads and caches in the browser. They go in their own
-- table: the client reads and rewrites their own row, staff read all.
--
-- On save: the answers are also posted to the client's portal thread as a client message, which
-- is what the CRM card already shows staff (with an unread marker), and the client's
-- "Onboarding form..." checklist item is ticked (a4 for the artists). It is never unticked.

CREATE TABLE IF NOT EXISTS public.ke_portal_forms (
  client_id    text PRIMARY KEY,
  answers      jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by text
);
ALTER TABLE public.ke_portal_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_all ON public.ke_portal_forms;
CREATE POLICY staff_all ON public.ke_portal_forms FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS client_read_self ON public.ke_portal_forms;
CREATE POLICY client_read_self ON public.ke_portal_forms FOR SELECT TO authenticated
  USING (client_id = public.portal_client_id());

CREATE OR REPLACE FUNCTION public.portal_form_submit(p_answers jsonb, p_summary text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid  text := public.portal_client_id();
  em   text := lower(auth.jwt() ->> 'email');
  d    jsonb;
  c    jsonb;
  task text;
  first_time boolean;
begin
  if cid is null then raise exception 'Not signed in to a client space.'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'No answers.'; end if;
  if length(p_answers::text) > 40000 or length(coalesce(p_summary,'')) > 40000 then raise exception 'Too long.'; end if;

  first_time := not exists (select 1 from public.ke_portal_forms where client_id = cid);
  insert into public.ke_portal_forms (client_id, answers, submitted_at, submitted_by)
  values (cid, p_answers, now(), em)
  on conflict (client_id) do update set answers = excluded.answers, submitted_at = now(), submitted_by = em;

  insert into public.ke_portal_items (client_id, kind, author, title, body)
  values (cid, 'message', 'client', case when first_time then 'Setup questions answered' else 'Setup answers updated' end,
          coalesce(p_summary, ''));

  select data into d from public.app_data where id = 'ke_data' for update;
  select x into c from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) x where x->>'id' = cid limit 1;
  select x->>'id' into task from jsonb_array_elements(coalesce(nullif(c->'checklist','null'::jsonb),'[]'::jsonb)) x
   where x->>'text' ilike 'onboarding form%' limit 1;
  if task is not null and not coalesce((d->'clientTasks'->cid->>task)::boolean, false) then
    d := jsonb_set(d, array['clientTasks'], coalesce(d->'clientTasks','{}'::jsonb), true);
    d := jsonb_set(d, array['clientTasks', cid], coalesce(d->'clientTasks'->cid,'{}'::jsonb) || jsonb_build_object(task, true), true);
    update public.app_data set data = d, updated_at = now() where id = 'ke_data';
  end if;

  return jsonb_build_object('saved', true, 'first', first_time);
end $function$;

REVOKE ALL ON FUNCTION public.portal_form_submit(jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_form_submit(jsonb, text) TO authenticated;
