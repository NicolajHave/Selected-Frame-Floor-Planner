-- Shop Planner (fp_) cloud projects, in the shared SELECTED database.
--
-- The tables are closed to clients (RLS on, no policies, no grants). All
-- access goes through the security-definer functions below, which check
-- the caller's role on each call:
--   owner  — created the project; can edit, share and delete it
--   editor — invited; can edit and create share links
--   viewer — invited; can open it read-only
-- Only confirmed @bestseller.com accounts take part. Anyone holding an
-- unrevoked share link can read that one project, without signing in.
--
-- Nothing outside the fp_ objects is touched: no changes to auth, existing
-- tables or other apps' functions.

create table public.fp_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  name text not null check (char_length(name) between 1 and 200),
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_email text not null
);
create index fp_projects_owner_idx on public.fp_projects (owner_id);

create table public.fp_project_members (
  project_id uuid not null references public.fp_projects (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%@bestseller.com'),
  role text not null check (role in ('editor', 'viewer')),
  invited_by_email text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);
create index fp_project_members_email_idx on public.fp_project_members (email);

create table public.fp_share_links (
  token text primary key,
  project_id uuid not null references public.fp_projects (id) on delete cascade,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index fp_share_links_project_idx on public.fp_share_links (project_id);

alter table public.fp_projects enable row level security;
alter table public.fp_project_members enable row level security;
alter table public.fp_share_links enable row level security;
revoke all on public.fp_projects, public.fp_project_members, public.fp_share_links from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers

-- The caller's email if they may use the planner's cloud features, else null.
create function public.fp_current_email() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and lower(u.email) like '%@bestseller.com'
$$;

-- 'owner' | 'editor' | 'viewer' | null for the caller on a project.
create function public.fp_role(p_project uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.fp_current_email() is null then null
    when exists (select 1 from public.fp_projects p where p.id = p_project and p.owner_id = auth.uid()) then 'owner'
    else (
      select m.role from public.fp_project_members m
      where m.project_id = p_project and m.email = public.fp_current_email()
    )
  end
$$;

create function public.fp_require(p_project uuid, p_roles text[]) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r text := public.fp_role(p_project);
begin
  if public.fp_current_email() is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  if r is null then
    raise exception 'Plan not found, or you have no access to it.' using errcode = 'P0002';
  end if;
  if not r = any (p_roles) then
    raise exception 'Your role on this plan (%) does not allow that.', r using errcode = '42501';
  end if;
  return r;
end
$$;

create function public.fp_check_size(p_data jsonb) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if octet_length(p_data::text) > 8000000 then
    raise exception 'The plan is too large to save (over 8 MB). Try a smaller plan image.' using errcode = '54000';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Projects

create function public.fp_list_projects() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me text := public.fp_current_email();
begin
  if me is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'owner_email', p.owner_email, 'version', p.version,
      'updated_at', p.updated_at, 'updated_by_email', p.updated_by_email,
      'role', public.fp_role(p.id)
    ) order by p.updated_at desc)
    from public.fp_projects p
    where p.owner_id = auth.uid()
       or exists (select 1 from public.fp_project_members m where m.project_id = p.id and m.email = me)
  ), '[]'::jsonb);
end
$$;

create function public.fp_get_project(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r text := public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  p public.fp_projects;
begin
  select * into p from public.fp_projects where id = p_id;
  return jsonb_build_object(
    'id', p.id, 'name', p.name, 'data', p.data, 'version', p.version, 'role', r,
    'owner_email', p.owner_email, 'updated_at', p.updated_at, 'updated_by_email', p.updated_by_email
  );
end
$$;

create function public.fp_create_project(p_name text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me text := public.fp_current_email();
  p public.fp_projects;
begin
  if me is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  perform public.fp_check_size(p_data);
  insert into public.fp_projects (owner_id, owner_email, name, data, updated_by_email)
  values (auth.uid(), me, coalesce(nullif(trim(p_name), ''), 'Untitled plan'), p_data, me)
  returning * into p;
  return jsonb_build_object('id', p.id, 'version', p.version, 'updated_at', p.updated_at, 'role', 'owner');
end
$$;

-- Saves only if p_version is the version the caller last loaded; otherwise
-- returns ok = false with who saved the newer version and when.
create function public.fp_save_project(p_id uuid, p_version integer, p_name text, p_data jsonb) returns jsonb
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

create function public.fp_delete_project(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner']);
  delete from public.fp_projects where id = p_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Sharing with colleagues

create function public.fp_list_members(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return jsonb_build_object(
    'owner_email', (select owner_email from public.fp_projects where id = p_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('email', m.email, 'role', m.role) order by m.email)
      from public.fp_project_members m where m.project_id = p_id
    ), '[]'::jsonb)
  );
end
$$;

create function public.fp_set_member(p_id uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e text := lower(trim(p_email));
begin
  perform public.fp_require(p_id, array['owner']);
  if e not like '%@bestseller.com' then
    raise exception 'Only @bestseller.com addresses can be invited.' using errcode = '22023';
  end if;
  if e = (select owner_email from public.fp_projects where id = p_id) then
    raise exception 'That is the owner of the plan.' using errcode = '22023';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer.' using errcode = '22023';
  end if;
  insert into public.fp_project_members (project_id, email, role, invited_by_email)
  values (p_id, e, p_role, public.fp_current_email())
  on conflict (project_id, email) do update set role = excluded.role;
end
$$;

create function public.fp_remove_member(p_id uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner']);
  delete from public.fp_project_members where project_id = p_id and email = lower(trim(p_email));
end
$$;

-- ---------------------------------------------------------------------------
-- Read-only links for people without an account

create function public.fp_list_links(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('token', l.token, 'created_at', l.created_at, 'created_by_email', l.created_by_email)
                     order by l.created_at desc)
    from public.fp_share_links l where l.project_id = p_id and l.revoked_at is null
  ), '[]'::jsonb);
end
$$;

create function public.fp_create_link(p_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t text := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  insert into public.fp_share_links (token, project_id, created_by_email)
  values (t, p_id, public.fp_current_email());
  return t;
end
$$;

create function public.fp_revoke_link(p_token text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pid uuid := (select project_id from public.fp_share_links where token = p_token);
begin
  if pid is null then
    raise exception 'Link not found.' using errcode = 'P0002';
  end if;
  perform public.fp_require(pid, array['owner', 'editor']);
  update public.fp_share_links set revoked_at = now() where token = p_token and revoked_at is null;
end
$$;

-- The only function open to signed-out visitors.
create function public.fp_get_shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', p.name, 'data', p.data, 'updated_at', p.updated_at, 'owner_email', p.owner_email)
  from public.fp_share_links l
  join public.fp_projects p on p.id = l.project_id
  where l.token = p_token and l.revoked_at is null
$$;

-- ---------------------------------------------------------------------------
-- Grants: nothing by default, then exactly the API.

revoke execute on function
  public.fp_current_email(), public.fp_role(uuid), public.fp_require(uuid, text[]), public.fp_check_size(jsonb),
  public.fp_list_projects(), public.fp_get_project(uuid), public.fp_create_project(text, jsonb),
  public.fp_save_project(uuid, integer, text, jsonb), public.fp_delete_project(uuid),
  public.fp_list_members(uuid), public.fp_set_member(uuid, text, text), public.fp_remove_member(uuid, text),
  public.fp_list_links(uuid), public.fp_create_link(uuid), public.fp_revoke_link(text),
  public.fp_get_shared_project(text)
from public, anon, authenticated;

grant execute on function
  public.fp_list_projects(), public.fp_get_project(uuid), public.fp_create_project(text, jsonb),
  public.fp_save_project(uuid, integer, text, jsonb), public.fp_delete_project(uuid),
  public.fp_list_members(uuid), public.fp_set_member(uuid, text, text), public.fp_remove_member(uuid, text),
  public.fp_list_links(uuid), public.fp_create_link(uuid), public.fp_revoke_link(text)
to authenticated;

grant execute on function public.fp_get_shared_project(text) to anon, authenticated;
