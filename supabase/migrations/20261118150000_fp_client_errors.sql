-- Error monitoring: what goes wrong in people's browsers.
--
-- The planner reports an error it could not handle, and every time it has
-- to show its error screen, with fp_report_error. Reports of the same
-- error — the same version of the planner, kind, message and place in the
-- code — are one row, counted, with the latest example of where and how it
-- happened. They are read and cleared in the planner (File → Error log…).
--
-- Anyone may report, signed in or not: most errors happen to people who are
-- not signed in, or who are looking at a shared link. So the function is
-- careful with what it takes: short fields, at most 300 rows (the ones not
-- seen for longest go first, and anything not seen for 90 days), at most
-- 300 reports an hour from everyone together, and nothing is returned to
-- the reporter.
--
-- A report holds no plan, no names and no addresses: the planner strips
-- those before it sends. Of the signed-in people an error happened to, only
-- their number is ever given out.
--
-- Reading and clearing is for signed-in @bestseller.com accounts. Same
-- rules as the rest of the fp_ API: the tables are closed to clients and
-- all access goes through the security-definer functions below.

create table public.fp_client_errors (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  kind text not null,
  message text not null,
  stack text not null default '',
  version text not null default '',
  context jsonb not null default '{}'::jsonb,
  hits integer not null default 1,
  -- The signed-in people it happened to: kept to count them, never given out.
  user_ids uuid[] not null default '{}',
  anonymous_hits integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index fp_client_errors_last_seen on public.fp_client_errors (last_seen desc);
alter table public.fp_client_errors enable row level security;
revoke all on public.fp_client_errors from anon, authenticated;

-- Reports taken in each hour, so a flood stops at the door.
create table public.fp_client_error_budget (
  slot timestamptz primary key,
  reports integer not null default 0
);
alter table public.fp_client_error_budget enable row level security;
revoke all on public.fp_client_error_budget from anon, authenticated;

create function public.fp_report_error(
  p_kind text, p_message text, p_stack text, p_top text, p_version text, p_context jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := coalesce(p_kind, '');
  v_message text := left(coalesce(nullif(trim(p_message), ''), 'Unknown error'), 500);
  v_stack text := left(coalesce(p_stack, ''), 6000);
  v_top text := left(coalesce(p_top, ''), 300);
  v_version text := left(coalesce(p_version, ''), 40);
  v_context jsonb := '{}'::jsonb;
  v_slot timestamptz := date_trunc('hour', now());
  v_reports integer;
  me uuid := auth.uid();
begin
  if v_kind !~ '^[a-z]{1,20}$' then
    return;
  end if;
  if p_context is not null and jsonb_typeof(p_context) = 'object' and octet_length(p_context::text) <= 4000 then
    v_context := p_context;
  end if;

  insert into public.fp_client_error_budget as b (slot, reports) values (v_slot, 1)
  on conflict (slot) do update set reports = b.reports + 1
  returning reports into v_reports;
  if v_reports > 300 then
    return;
  end if;
  if v_reports = 1 then
    delete from public.fp_client_error_budget where slot < now() - interval '2 days';
  end if;

  insert into public.fp_client_errors as e (fingerprint, kind, message, stack, version, context, user_ids, anonymous_hits)
  values (
    -- Long numbers (sizes, ids) do not make it a different error.
    md5(v_version || '|' || v_kind || '|' || regexp_replace(v_message, '\d{3,}', '#', 'g') || '|' || v_top),
    v_kind, v_message, v_stack, v_version, v_context,
    case when me is null then '{}'::uuid[] else array[me] end,
    case when me is null then 1 else 0 end
  )
  on conflict (fingerprint) do update set
    hits = e.hits + 1,
    last_seen = now(),
    stack = excluded.stack,
    context = excluded.context,
    anonymous_hits = e.anonymous_hits + excluded.anonymous_hits,
    user_ids = case
      when me is null or me = any (e.user_ids) or cardinality(e.user_ids) >= 50 then e.user_ids
      else e.user_ids || me
    end;

  delete from public.fp_client_errors
  where last_seen < now() - interval '90 days'
     or id not in (select id from public.fp_client_errors order by last_seen desc, id desc limit 300);
end
$$;

-- The errors, the one seen most recently first (up to 100).
create function public.fp_list_errors() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.fp_current_email() is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'message', e.message, 'stack', e.stack, 'version', e.version,
      'context', e.context, 'hits', e.hits, 'people', cardinality(e.user_ids),
      'anonymous_hits', e.anonymous_hits, 'first_seen', e.first_seen, 'last_seen', e.last_seen
    ) order by e.last_seen desc, e.id desc)
    from (select * from public.fp_client_errors order by last_seen desc, id desc limit 100) e
  ), '[]'::jsonb);
end
$$;

-- Clears one error from the log (it has been dealt with), or all of them when no id is given.
-- An error that happens again is simply listed again.
create function public.fp_clear_errors(p_id bigint default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.fp_current_email() is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  delete from public.fp_client_errors where p_id is null or id = p_id;
end
$$;

revoke execute on function
  public.fp_report_error(text, text, text, text, text, jsonb), public.fp_list_errors(), public.fp_clear_errors(bigint)
from public, anon, authenticated;

grant execute on function public.fp_report_error(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.fp_list_errors(), public.fp_clear_errors(bigint) to authenticated;
