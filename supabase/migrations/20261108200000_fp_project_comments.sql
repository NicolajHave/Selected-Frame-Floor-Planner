-- Shop Planner (fp_) comments on cloud plans, from colleagues and from
-- people with a view-only link (who give a name instead of signing in).
-- A comment can be pinned to a spot on the plan, and to one layout variant.
-- Owners and editors resolve (and reopen) comments; nothing is deleted
-- except together with the plan.
--
-- Same rules as the rest of the fp_ API: the table is closed to clients and
-- all access goes through the security-definer functions below.

create table public.fp_project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.fp_projects (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  author_email text,
  via_link boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  x double precision,
  y double precision,
  variant_id text check (variant_id is null or char_length(variant_id) <= 64),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_email text
);
create index fp_project_comments_project_idx on public.fp_project_comments (project_id, created_at);

alter table public.fp_project_comments enable row level security;
revoke all on public.fp_project_comments from anon, authenticated;

create function public.fp_comment_json(c public.fp_project_comments) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'author_name', c.author_name, 'author_email', c.author_email, 'via_link', c.via_link,
    'body', c.body, 'x', c.x, 'y', c.y, 'variant_id', c.variant_id, 'created_at', c.created_at,
    'resolved_at', c.resolved_at, 'resolved_by_email', c.resolved_by_email
  )
$$;

create function public.fp_comments_of(p_project uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select jsonb_agg(public.fp_comment_json(c) order by c.created_at)
     from public.fp_project_comments c where c.project_id = p_project),
    '[]'::jsonb)
$$;

-- Checks and stores a comment; the callers below decide who may.
create function public.fp_put_comment(
  p_project uuid, p_name text, p_email text, p_via_link boolean,
  p_body text, p_x double precision, p_y double precision, p_variant text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b text := trim(coalesce(p_body, ''));
  n text := trim(coalesce(p_name, ''));
  c public.fp_project_comments;
begin
  if b = '' then
    raise exception 'Write a comment first.' using errcode = '22023';
  end if;
  if char_length(b) > 2000 then
    raise exception 'Keep the comment under 2000 characters.' using errcode = '22023';
  end if;
  if n = '' or char_length(n) > 80 then
    raise exception 'Give your name (up to 80 characters).' using errcode = '22023';
  end if;
  if (select count(*) from public.fp_project_comments where project_id = p_project) >= 1000 then
    raise exception 'This plan has too many comments. Resolve some, or start a new plan.' using errcode = '54000';
  end if;
  if p_via_link and (
    select count(*) from public.fp_project_comments
    where project_id = p_project and via_link and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Too many comments at once. Try again in a minute.' using errcode = '54000';
  end if;
  insert into public.fp_project_comments (project_id, author_name, author_email, via_link, body, x, y, variant_id)
  values (
    p_project, n, p_email, p_via_link, b,
    case when p_x is not null and p_y is not null then p_x end,
    case when p_x is not null and p_y is not null then p_y end,
    nullif(left(coalesce(p_variant, ''), 64), '')
  )
  returning * into c;
  return public.fp_comment_json(c);
end
$$;

-- Colleagues on the plan (any role, viewers too).
create function public.fp_list_comments(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return public.fp_comments_of(p_id);
end
$$;

create function public.fp_add_comment(
  p_id uuid, p_body text, p_x double precision, p_y double precision, p_variant text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require(p_id, array['owner', 'editor', 'viewer']);
  return public.fp_put_comment(p_id, public.fp_current_email(), public.fp_current_email(), false, p_body, p_x, p_y, p_variant);
end
$$;

-- People with an unrevoked view-only link, signed in or not.
create function public.fp_link_project(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  pid uuid := (select project_id from public.fp_share_links where token = p_token and revoked_at is null);
begin
  if pid is null then
    raise exception 'This link no longer works.' using errcode = 'P0002';
  end if;
  return pid;
end
$$;

create function public.fp_list_shared_comments(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.fp_comments_of(public.fp_link_project(p_token));
end
$$;

create function public.fp_add_shared_comment(
  p_token text, p_name text, p_body text, p_x double precision, p_y double precision, p_variant text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.fp_put_comment(public.fp_link_project(p_token), p_name, null, true, p_body, p_x, p_y, p_variant);
end
$$;

-- Owners and editors mark a comment done (or open it again).
create function public.fp_set_comment_resolved(p_comment uuid, p_resolved boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.fp_project_comments;
begin
  select * into c from public.fp_project_comments where id = p_comment;
  if c.id is null then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  perform public.fp_require(c.project_id, array['owner', 'editor']);
  update public.fp_project_comments
  set resolved_at = case when p_resolved then now() end,
      resolved_by_email = case when p_resolved then public.fp_current_email() end
  where id = p_comment
  returning * into c;
  return public.fp_comment_json(c);
end
$$;

revoke execute on function
  public.fp_comment_json(public.fp_project_comments), public.fp_comments_of(uuid),
  public.fp_put_comment(uuid, text, text, boolean, text, double precision, double precision, text),
  public.fp_link_project(text),
  public.fp_list_comments(uuid), public.fp_add_comment(uuid, text, double precision, double precision, text),
  public.fp_list_shared_comments(text), public.fp_add_shared_comment(text, text, text, double precision, double precision, text),
  public.fp_set_comment_resolved(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.fp_list_comments(uuid), public.fp_add_comment(uuid, text, double precision, double precision, text),
  public.fp_set_comment_resolved(uuid, boolean)
to authenticated;

grant execute on function
  public.fp_list_shared_comments(text), public.fp_add_shared_comment(text, text, text, double precision, double precision, text)
to anon, authenticated;
