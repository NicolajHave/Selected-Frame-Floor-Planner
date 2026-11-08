-- Shop Planner (fp_) version history: at most three earlier versions per
-- cloud plan, kept in three fixed slots (0–2) that are overwritten in turn,
-- so nothing is ever deleted except together with the plan.
--
--   manual — saved on purpose ("Save version"), optionally with a label;
--            when all slots are taken it replaces the oldest version.
--   auto   — the plan as it was before a new working session: kept when a
--            save comes more than 30 minutes after the previous one. It only
--            ever replaces an earlier automatic version (or fills a free
--            slot), so versions saved on purpose are never pushed out by it.
--
-- Same rules as the rest of the fp_ API: the table is closed to clients and
-- all access goes through the security-definer functions below.

create table public.fp_project_versions (
  project_id uuid not null references public.fp_projects (id) on delete cascade,
  slot smallint not null check (slot between 0 and 2),
  kind text not null check (kind in ('auto', 'manual')),
  label text check (label is null or char_length(label) <= 120),
  name text not null,
  data jsonb not null,
  source_version integer not null,
  saved_at timestamptz not null,
  saved_by_email text not null,
  primary key (project_id, slot)
);

alter table public.fp_project_versions enable row level security;
revoke all on public.fp_project_versions from anon, authenticated;

-- Stores a version in a free slot, else over the oldest one it may replace.
-- Returns false when there was no slot it may take (auto, all three manual).
create function public.fp_put_version(
  p_project uuid, p_kind text, p_label text, p_name text, p_data jsonb,
  p_source_version integer, p_saved_at timestamptz, p_saved_by text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s smallint;
begin
  select g.slot into s
  from generate_series(0, 2) as g(slot)
  where not exists (select 1 from public.fp_project_versions v where v.project_id = p_project and v.slot = g.slot)
  order by g.slot
  limit 1;
  if s is null then
    select v.slot into s
    from public.fp_project_versions v
    where v.project_id = p_project and (p_kind = 'manual' or v.kind = 'auto')
    order by v.saved_at
    limit 1;
  end if;
  if s is null then
    return false;
  end if;
  insert into public.fp_project_versions
    (project_id, slot, kind, label, name, data, source_version, saved_at, saved_by_email)
  values
    (p_project, s, p_kind, nullif(trim(p_label), ''), p_name, p_data, p_source_version, p_saved_at, p_saved_by)
  on conflict (project_id, slot) do update set
    kind = excluded.kind, label = excluded.label, name = excluded.name, data = excluded.data,
    source_version = excluded.source_version, saved_at = excluded.saved_at, saved_by_email = excluded.saved_by_email;
  return true;
end
$$;

-- As before, plus: the first save of a new working session keeps the plan
-- as it was as an automatic version.
create or replace function public.fp_save_project(p_id uuid, p_version integer, p_name text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.fp_projects;
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  perform public.fp_check_size(p_data);
  select * into p from public.fp_projects where id = p_id for update;
  if p.version <> p_version then
    return jsonb_build_object(
      'ok', false, 'version', p.version, 'updated_at', p.updated_at, 'updated_by_email', p.updated_by_email
    );
  end if;
  if p.updated_at < now() - interval '30 minutes'
     and not exists (select 1 from public.fp_project_versions v where v.project_id = p_id and v.source_version = p.version) then
    perform public.fp_put_version(p_id, 'auto', null, p.name, p.data, p.version, p.updated_at, p.updated_by_email);
  end if;
  update public.fp_projects
  set data = p_data,
      name = coalesce(nullif(trim(p_name), ''), name),
      version = version + 1,
      updated_at = now(),
      updated_by_email = public.fp_current_email()
  where id = p_id
  returning * into p;
  return jsonb_build_object(
    'ok', true, 'version', p.version, 'updated_at', p.updated_at, 'updated_by_email', p.updated_by_email
  );
end
$$;

-- The versions of a plan, newest first (without the plan data).
create function public.fp_list_versions(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slot', v.slot, 'kind', v.kind, 'label', v.label, 'name', v.name,
      'source_version', v.source_version, 'saved_at', v.saved_at, 'saved_by_email', v.saved_by_email
    ) order by v.saved_at desc)
    from public.fp_project_versions v where v.project_id = p_id
  ), '[]'::jsonb);
end
$$;

-- One version with its plan data.
create function public.fp_get_version(p_id uuid, p_slot integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.fp_project_versions;
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  select * into v from public.fp_project_versions where project_id = p_id and slot = p_slot;
  if v.project_id is null then
    raise exception 'That version is no longer there.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'slot', v.slot, 'kind', v.kind, 'label', v.label, 'name', v.name, 'data', v.data,
    'source_version', v.source_version, 'saved_at', v.saved_at, 'saved_by_email', v.saved_by_email
  );
end
$$;

-- Keeps the plan as it is saved now as a version, then lists the versions.
create function public.fp_save_version(p_id uuid, p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.fp_projects;
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  if char_length(coalesce(p_label, '')) > 120 then
    raise exception 'Keep the label under 120 characters.' using errcode = '22023';
  end if;
  select * into p from public.fp_projects where id = p_id for update;
  perform public.fp_put_version(p_id, 'manual', p_label, p.name, p.data, p.version, now(), public.fp_current_email());
  return public.fp_list_versions(p_id);
end
$$;

revoke execute on function
  public.fp_put_version(uuid, text, text, text, jsonb, integer, timestamptz, text),
  public.fp_list_versions(uuid), public.fp_get_version(uuid, integer), public.fp_save_version(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.fp_list_versions(uuid), public.fp_get_version(uuid, integer), public.fp_save_version(uuid, text)
to authenticated;
