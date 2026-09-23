-- Client portal: sign the services agreement inside the portal (2026-09-23).
--
-- Rahaid: the trial founding clients set up their login, log in, THEN sign. One row per
-- client holds the agreement text we issued. The client can read their own row; only
-- portal_sign() can write the signature, and it re-checks everything server-side:
-- who the caller is, that the text they read is the text on file (body_hash), that it
-- is not already signed, and that the particulars and signature are present.
--
-- body_hash is set by a trigger from body on every insert/update, so it cannot drift from
-- the text or be typed in. (A generated column is refused: convert_to is not immutable.)
-- signed_hash binds the text, the particulars as signed, the signer's name and the time.
-- task_id is the CRM checklist item to tick when it is signed (e.g. a5, m4).

CREATE TABLE IF NOT EXISTS public.ke_portal_agreements (
  client_id          text PRIMARY KEY,
  title              text NOT NULL DEFAULT 'Services Agreement',
  body               text NOT NULL,
  body_hash          text,
  particulars        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [[label, key, prefill], ...]
  task_id            text,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  signed_at          timestamptz,
  signed_name        text,
  signed_email       text,
  signed_image       text,
  signed_particulars jsonb,
  signed_hash        text
);

CREATE OR REPLACE FUNCTION public.ke_portal_agreements_hash() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO 'public' AS $f$
begin
  if tg_op = 'UPDATE' and old.signed_at is not null and new.body is distinct from old.body then
    raise exception 'This agreement is signed. Issue a new one instead of editing it.';
  end if;
  new.body_hash := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
  return new;
end $f$;
DROP TRIGGER IF EXISTS ke_portal_agreements_hash ON public.ke_portal_agreements;
CREATE TRIGGER ke_portal_agreements_hash BEFORE INSERT OR UPDATE ON public.ke_portal_agreements
  FOR EACH ROW EXECUTE FUNCTION public.ke_portal_agreements_hash();

ALTER TABLE public.ke_portal_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_all ON public.ke_portal_agreements;
CREATE POLICY staff_all ON public.ke_portal_agreements FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS client_read_self ON public.ke_portal_agreements;
CREATE POLICY client_read_self ON public.ke_portal_agreements FOR SELECT TO authenticated
  USING (client_id = public.portal_client_id());

CREATE OR REPLACE FUNCTION public.portal_sign(p_name text, p_image text, p_particulars jsonb, p_body_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid  text := public.portal_client_id();
  em   text := lower(auth.jwt() ->> 'email');
  ag   public.ke_portal_agreements;
  part jsonb := '{}'::jsonb;
  p    jsonb;
  v    text;
  lines text := '';
  now_ts timestamptz := now();
begin
  if cid is null then raise exception 'Not signed in to a client space.'; end if;
  select * into ag from public.ke_portal_agreements where client_id = cid for update;
  if not found then raise exception 'There is no agreement waiting for you.'; end if;
  if ag.signed_at is not null then
    return jsonb_build_object('signed_at', ag.signed_at, 'signed_name', ag.signed_name, 'already', true);
  end if;
  if p_body_hash is distinct from ag.body_hash then
    raise exception 'The agreement changed while you had it open. Reload the page and read it again.';
  end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(p_name) > 120 then
    raise exception 'Type your full name.';
  end if;
  if p_image is null or p_image !~ '^data:image/png;base64,[A-Za-z0-9+/=]{200,}$' or length(p_image) > 200000 then
    raise exception 'Draw your signature in the box.';
  end if;
  -- Every particular we asked for must be answered, except the date, which we set.
  for p in select * from jsonb_array_elements(ag.particulars) loop
    if p->>1 = 'date_signed' then
      v := to_char(now_ts at time zone 'Europe/London', 'FMDD FMMonth YYYY');
    else
      v := btrim(coalesce(p_particulars ->> (p->>1), ''));
      if v = '' or length(v) > 300 then raise exception 'Fill in: %', p->>0; end if;
    end if;
    part := part || jsonb_build_object(p->>1, v);
    lines := lines || (p->>0) || ': ' || v || E'\n';
  end loop;

  update public.ke_portal_agreements set
    signed_at = now_ts, signed_name = btrim(p_name), signed_email = em,
    signed_image = p_image, signed_particulars = part,
    signed_hash = encode(sha256(convert_to(
      ag.body || E'\n\nPARTICULARS\n' || lines || E'\nSigned by ' || btrim(p_name) || ' (' || em || ') at ' || now_ts::text,
      'UTF8')), 'hex')
  where client_id = cid;

  insert into public.ke_portal_items (client_id, kind, author, title, body)
  values (cid, 'update', 'agency', 'Agreement signed',
          'Signed by ' || btrim(p_name) || '. Your copy is under "Your agreement".');

  -- Tick the matching item on the CRM checklist.
  if ag.task_id is not null then
    update public.app_data set
      data = jsonb_set(data, array['clientTasks', cid],
               coalesce(data->'clientTasks'->cid, '{}'::jsonb) || jsonb_build_object(ag.task_id, true), true),
      updated_at = now()
    where id = 'ke_data';
  end if;

  return jsonb_build_object('signed_at', now_ts, 'signed_name', btrim(p_name), 'already', false);
end $function$;

REVOKE ALL ON FUNCTION public.portal_sign(text, text, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_sign(text, text, jsonb, text) TO authenticated;
