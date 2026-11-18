-- The plan drawing (underlay) of a cloud plan, kept next to the plan rather
-- than inside it.
--
-- A drawing is a picture of a megabyte or so. Inside fp_projects.data it was
-- sent again with every save and copied into every saved version. Here it is
-- stored once; the plan refers to it as `asset:<id>` in data.underlay.src,
-- where the id is made from the picture itself.
--
-- Same rules as the rest of the fp_ API: the table is closed to clients and
-- all access goes through the security-definer functions below. Members read
-- a plan's drawings, owners and editors add them, and someone with a working
-- view-only link reads them through the link.

create table public.fp_project_assets (
  project_id uuid not null references public.fp_projects (id) on delete cascade,
  id text not null check (id ~ '^a[0-9a-f]{28}$'),
  -- The picture as a data URL (JPEG or PNG).
  data text not null check (octet_length(data) <= 6000000),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);
-- JPEG and PNG are compressed already: store as is, without trying again.
alter table public.fp_project_assets alter column data set storage external;
alter table public.fp_project_assets enable row level security;

create function public.fp_has_asset(p_id uuid, p_asset text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return exists (select 1 from public.fp_project_assets where project_id = p_id and id = p_asset);
end
$$;

create function public.fp_get_asset(p_id uuid, p_asset text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return (select data from public.fp_project_assets where project_id = p_id and id = p_asset);
end
$$;

-- People with a working view-only link see the plan's drawing through it.
create function public.fp_get_shared_asset(p_token text, p_asset text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return (
    select data from public.fp_project_assets
    where project_id = public.fp_link_project(p_token) and id = p_asset
  );
end
$$;

create function public.fp_put_asset(p_id uuid, p_asset text, p_data text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  if p_asset is null or p_asset !~ '^a[0-9a-f]{28}$' then
    raise exception 'That is not a drawing id.' using errcode = '22023';
  end if;
  if p_data is null or left(p_data, 23) !~ '^data:image/(jpeg|png);base64,' then
    raise exception 'Only JPEG or PNG drawings can be stored.' using errcode = '22023';
  end if;
  if octet_length(p_data) > 6000000 then
    raise exception 'The drawing is too large to store (over 6 MB). Try a smaller plan image.' using errcode = '54000';
  end if;

  insert into public.fp_project_assets (project_id, id, data, created_by_email)
  values (p_id, p_asset, p_data, public.fp_current_email())
  on conflict (project_id, id) do nothing;

  -- Tidy up: drawings that neither the plan nor any of its saved versions
  -- uses any more go, once they are a day old (so one that was just stored
  -- is safe until the plan that refers to it has been saved).
  delete from public.fp_project_assets a
  where a.project_id = p_id
    and a.id <> p_asset
    and a.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.fp_projects p
      where p.id = p_id and p.data -> 'underlay' ->> 'src' = 'asset:' || a.id
    )
    and not exists (
      select 1 from public.fp_project_versions v
      where v.project_id = p_id and v.data -> 'underlay' ->> 'src' = 'asset:' || a.id
    );
end
$$;

revoke execute on function
  public.fp_has_asset(uuid, text), public.fp_get_asset(uuid, text),
  public.fp_get_shared_asset(text, text), public.fp_put_asset(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.fp_has_asset(uuid, text), public.fp_get_asset(uuid, text), public.fp_put_asset(uuid, text, text)
to authenticated;

grant execute on function public.fp_get_shared_asset(text, text) to anon, authenticated;
