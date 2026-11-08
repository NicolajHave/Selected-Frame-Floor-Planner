-- Shop Planner (fp_) cloud drive: a shared place for store drawings (PDF,
-- DWG, DXF, images), so anyone planning can import a plan without having
-- it on their own disk.
--
--   fp-drawings  — private Storage bucket holding the files (≤ 50 MB each),
--                  under <random uuid>/<file name>.
--   fp_drawings  — what each file is: its name, the shop it belongs to, who
--                  uploaded it and when. Closed to clients like the other
--                  fp_ tables; read and written through the functions below.
--
-- Every confirmed @bestseller.com planner can see, download and upload
-- drawings; only the uploader can delete one. The storage policies apply
-- to the fp-drawings bucket only — other buckets are not affected.

insert into storage.buckets (id, name, public, file_size_limit)
values ('fp-drawings', 'fp-drawings', false, 52428800);

create table public.fp_drawings (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  shop text check (shop is null or char_length(shop) <= 120),
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_by_email text not null,
  uploaded_at timestamptz not null default now()
);
create index fp_drawings_uploaded_at_idx on public.fp_drawings (uploaded_at desc);

alter table public.fp_drawings enable row level security;
revoke all on public.fp_drawings from anon, authenticated;

-- Whether the caller may use the drive (used by the storage policies).
create function public.fp_drive_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.fp_current_email() is not null
$$;

create policy fp_drawings_read on storage.objects for select to authenticated
  using (bucket_id = 'fp-drawings' and public.fp_drive_user());

create policy fp_drawings_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fp-drawings'
    and public.fp_drive_user()
    and lower(name) ~ '^[0-9a-f-]{36}/[^/]+\.(pdf|dwg|dxf|png|jpe?g|webp)$'
  );

create policy fp_drawings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fp-drawings' and owner_id = (select auth.uid())::text);

create function public.fp_require_drive() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me text := public.fp_current_email();
begin
  if me is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  return me;
end
$$;

create function public.fp_drawing_json(d public.fp_drawings) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', d.id, 'path', d.path, 'file_name', d.file_name, 'shop', d.shop, 'size_bytes', d.size_bytes,
    'uploaded_by_email', d.uploaded_by_email, 'uploaded_at', d.uploaded_at,
    'mine', d.uploaded_by = auth.uid()
  )
$$;

-- All drawings on the drive, newest first.
create function public.fp_list_drawings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.fp_require_drive();
  return coalesce((
    select jsonb_agg(public.fp_drawing_json(d) order by d.uploaded_at desc) from public.fp_drawings d
  ), '[]'::jsonb);
end
$$;

-- Records a file the caller has just uploaded to the bucket.
create function public.fp_add_drawing(p_path text, p_file_name text, p_shop text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me text := public.fp_require_drive();
  o storage.objects;
  d public.fp_drawings;
begin
  select * into o from storage.objects
  where bucket_id = 'fp-drawings' and name = p_path and owner_id = auth.uid()::text;
  if o.id is null then
    raise exception 'The upload did not arrive. Try again.' using errcode = 'P0002';
  end if;
  insert into public.fp_drawings (path, file_name, shop, size_bytes, uploaded_by, uploaded_by_email)
  values (
    p_path,
    left(coalesce(nullif(trim(p_file_name), ''), split_part(p_path, '/', 2)), 200),
    nullif(left(trim(coalesce(p_shop, '')), 120), ''),
    coalesce((o.metadata ->> 'size')::bigint, 0),
    auth.uid(),
    me
  )
  returning * into d;
  return public.fp_drawing_json(d);
end
$$;

-- Forgets a drawing the caller uploaded (the client removes the file itself first).
create function public.fp_delete_drawing(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.fp_drawings;
begin
  perform public.fp_require_drive();
  select * into d from public.fp_drawings where id = p_id;
  if d.id is null then
    raise exception 'That drawing is no longer on the drive.' using errcode = 'P0002';
  end if;
  if d.uploaded_by is distinct from auth.uid() then
    raise exception 'Only % can delete this drawing.', d.uploaded_by_email using errcode = '42501';
  end if;
  delete from public.fp_drawings where id = p_id;
end
$$;

revoke execute on function
  public.fp_drive_user(), public.fp_require_drive(), public.fp_drawing_json(public.fp_drawings),
  public.fp_list_drawings(), public.fp_add_drawing(text, text, text), public.fp_delete_drawing(uuid)
from public, anon, authenticated;

-- fp_drive_user is evaluated inside the storage policies, as the caller.
grant execute on function
  public.fp_drive_user(), public.fp_list_drawings(), public.fp_add_drawing(text, text, text), public.fp_delete_drawing(uuid)
to authenticated;
