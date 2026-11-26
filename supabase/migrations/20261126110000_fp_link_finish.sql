-- Shop Planner (fp_): the floor and the wall colour picked on a view-only
-- link. A partner who opens the link can say what the shop's floor and
-- walls are, if the plan does not; it is optional and changes nothing in
-- the plan itself. The choice is kept next to the plan, one for each plan:
-- the link shows it laid over the plan, and the plan's owner sees it as a
-- suggestion to take over or to dismiss.
--
-- Same rules as the rest of the fp_ API: the table is closed to clients and
-- all access goes through the security-definer functions below.

create table public.fp_link_finishes (
  project_id uuid primary key references public.fp_projects (id) on delete cascade,
  finish jsonb not null,
  chosen_by text not null check (char_length(chosen_by) between 1 and 80),
  chosen_at timestamptz not null default now(),
  -- How often it was changed in the minute that began at window_start (a brake on runaway writes).
  changes integer not null default 1,
  window_start timestamptz not null default now()
);

alter table public.fp_link_finishes enable row level security;
revoke all on public.fp_link_finishes from anon, authenticated;

-- Only what a finish may hold is kept: a kind of floor with a tone (a name
-- or a colour) and whether it is laid the other way, and a wall colour.
create function public.fp_clean_finish(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  f jsonb := case when jsonb_typeof(p -> 'floor') = 'object' then p -> 'floor' end;
  floor jsonb := '{}'::jsonb;
  clean jsonb := '{}'::jsonb;
begin
  if f is not null and jsonb_typeof(f -> 'kind') = 'string' and (f ->> 'kind') ~ '^[a-z][a-z-]{0,31}$' then
    floor := jsonb_build_object('kind', f ->> 'kind');
    if jsonb_typeof(f -> 'tone') = 'string' and (f ->> 'tone') ~ '^([a-z0-9][a-z0-9-]{0,31}|#[0-9A-Fa-f]{6})$' then
      floor := floor || jsonb_build_object('tone', f ->> 'tone');
    end if;
    if f -> 'turned' = 'true'::jsonb then
      floor := floor || jsonb_build_object('turned', true);
    end if;
    clean := clean || jsonb_build_object('floor', floor);
  end if;
  if jsonb_typeof(p -> 'wall') = 'string' and (p ->> 'wall') ~ '^#[0-9A-Fa-f]{6}$' then
    clean := clean || jsonb_build_object('wall', p ->> 'wall');
  end if;
  return clean;
end
$$;

-- The choice kept for a plan, or null.
create function public.fp_link_finish_of(p_project uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('finish', f.finish, 'chosen_by', f.chosen_by, 'chosen_at', f.chosen_at)
  from public.fp_link_finishes f
  where f.project_id = p_project
$$;

-- People with a link that still works, signed in or not.
create function public.fp_get_shared_finish(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.fp_link_finish_of(public.fp_link_project(p_token));
end
$$;

-- Sets the choice; an empty one takes it away again (back to what the plan says).
create function public.fp_set_shared_finish(p_token text, p_name text, p_finish jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pid uuid := public.fp_link_project(p_token);
  clean jsonb := public.fp_clean_finish(coalesce(p_finish, '{}'::jsonb));
  n text := left(trim(coalesce(p_name, '')), 80);
  was public.fp_link_finishes;
begin
  if clean = '{}'::jsonb then
    delete from public.fp_link_finishes where project_id = pid;
    return null;
  end if;
  if n = '' then
    n := 'Someone with the link';
  end if;
  select * into was from public.fp_link_finishes where project_id = pid;
  if was.project_id is not null and was.window_start > now() - interval '1 minute' and was.changes >= 60 then
    raise exception 'Too many changes at once. Try again in a minute.' using errcode = '54000';
  end if;
  insert into public.fp_link_finishes as f (project_id, finish, chosen_by)
  values (pid, clean, n)
  on conflict (project_id) do update
  set finish = excluded.finish,
      chosen_by = excluded.chosen_by,
      chosen_at = now(),
      changes = case when f.window_start > now() - interval '1 minute' then f.changes + 1 else 1 end,
      window_start = case when f.window_start > now() - interval '1 minute' then f.window_start else now() end;
  return public.fp_link_finish_of(pid);
end
$$;

-- Colleagues on the plan (any role) see what was chosen on the link.
create function public.fp_get_link_finish(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return public.fp_link_finish_of(p_id);
end
$$;

-- Owners and editors take it away: once it is in the plan, or not wanted.
create function public.fp_clear_link_finish(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  delete from public.fp_link_finishes where project_id = p_id;
end
$$;

revoke execute on function
  public.fp_clean_finish(jsonb), public.fp_link_finish_of(uuid),
  public.fp_get_shared_finish(text), public.fp_set_shared_finish(text, text, jsonb),
  public.fp_get_link_finish(uuid), public.fp_clear_link_finish(uuid)
from public, anon, authenticated;

grant execute on function public.fp_get_link_finish(uuid), public.fp_clear_link_finish(uuid) to authenticated;

grant execute on function public.fp_get_shared_finish(text), public.fp_set_shared_finish(text, text, jsonb) to anon, authenticated;
