-- View-only links expire: 30 days after they are made or last renewed, so
-- old links do not pile up or stay open for ever. Links that already exist
-- get 30 days from the day this runs. Renewing keeps the link's address.

alter table public.fp_share_links
  add column expires_at timestamptz not null default (now() + interval '30 days');

-- Only links that still work are listed.
create or replace function public.fp_list_links(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('token', l.token, 'created_at', l.created_at,
                                        'created_by_email', l.created_by_email, 'expires_at', l.expires_at)
                     order by l.created_at desc)
    from public.fp_share_links l
    where l.project_id = p_id and l.revoked_at is null and l.expires_at > now()
  ), '[]'::jsonb);
end
$$;

-- Owners and editors give a link 30 more days, counted from now.
create function public.fp_renew_link(p_token text) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pid uuid := (select project_id from public.fp_share_links where token = p_token and revoked_at is null);
  until timestamptz := now() + interval '30 days';
begin
  if pid is null then
    raise exception 'Link not found.' using errcode = 'P0002';
  end if;
  perform public.fp_require(pid, array['owner', 'editor']);
  update public.fp_share_links set expires_at = until where token = p_token;
  return until;
end
$$;

-- Signed-out visitors: an expired link says so instead of showing the plan.
create or replace function public.fp_get_shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when l.expires_at <= now() then jsonb_build_object('expired', true)
    else jsonb_build_object('name', p.name, 'data', p.data, 'updated_at', p.updated_at, 'owner_email', p.owner_email)
  end
  from public.fp_share_links l
  join public.fp_projects p on p.id = l.project_id
  where l.token = p_token and l.revoked_at is null
$$;

-- Comments through a link follow the link.
create or replace function public.fp_link_project(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  pid uuid := (
    select project_id from public.fp_share_links
    where token = p_token and revoked_at is null and expires_at > now()
  );
begin
  if pid is null then
    raise exception 'This link no longer works.' using errcode = 'P0002';
  end if;
  return pid;
end
$$;

revoke execute on function public.fp_renew_link(text) from public, anon, authenticated;
grant execute on function public.fp_renew_link(text) to authenticated;
