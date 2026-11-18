-- The price list the planner uses, kept here so a new one does not need a
-- release: it is edited in the planner (File → Price list…).
--
-- Each save is a new row; the newest is the list in use and the 20 newest
-- are kept as history. Prices are internal: only signed-in @bestseller.com
-- accounts read them, and any of them may save a new list (who and when is
-- kept with it).
--
-- `prices` maps a catalog id — or 'column:left' | 'column:mid' |
-- 'column:right' — to a price in euro, or to null for "no price".
--
-- Same rules as the rest of the fp_ API: the table is closed to clients and
-- all access goes through the security-definer functions below.

create table public.fp_price_lists (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 120),
  valid_from date not null,
  prices jsonb not null check (jsonb_typeof(prices) = 'object'),
  saved_by_email text not null,
  saved_at timestamptz not null default now()
);
alter table public.fp_price_lists enable row level security;
revoke all on public.fp_price_lists from anon, authenticated;

create function public.fp_price_list_json(l public.fp_price_lists) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', l.id, 'name', l.name, 'valid_from', l.valid_from, 'prices', l.prices,
    'saved_by_email', l.saved_by_email, 'saved_at', l.saved_at
  )
$$;

-- The list in use, or null while none has been saved (the planner then uses the one built into it).
create function public.fp_get_price_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.fp_current_email() is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  return (select public.fp_price_list_json(l) from public.fp_price_lists l order by l.id desc limit 1);
end
$$;

-- The ten newest, newest first.
create function public.fp_list_price_lists() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.fp_current_email() is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.fp_price_list_json(l) order by l.id desc)
    from (select * from public.fp_price_lists order by id desc limit 10) l
  ), '[]'::jsonb);
end
$$;

create function public.fp_save_price_list(p_name text, p_valid_from date, p_prices jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me text := public.fp_current_email();
  k text;
  v jsonb;
  n integer := 0;
  l public.fp_price_lists;
begin
  if me is null then
    raise exception 'Sign in with a confirmed @bestseller.com account.' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_name), '')) not between 1 and 120 then
    raise exception 'Give the price list a name (up to 120 characters).' using errcode = '22023';
  end if;
  if p_valid_from is null then
    raise exception 'Give the day the prices are from.' using errcode = '22023';
  end if;
  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'That is not a price list.' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_prices) loop
    n := n + 1;
    if n > 300 or k !~ '^[A-Za-z0-9:_.-]{1,40}$' then
      raise exception 'That is not a price list.' using errcode = '22023';
    end if;
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 1000000 then
      raise exception 'A price is a number between 0 and 1,000,000, or empty.' using errcode = '22023';
    end if;
  end loop;

  insert into public.fp_price_lists (name, valid_from, prices, saved_by_email)
  values (trim(p_name), p_valid_from, p_prices, me)
  returning * into l;

  -- Keep the 20 newest as history.
  delete from public.fp_price_lists
  where id not in (select id from public.fp_price_lists order by id desc limit 20);

  return public.fp_price_list_json(l);
end
$$;

revoke execute on function
  public.fp_price_list_json(public.fp_price_lists), public.fp_get_price_list(),
  public.fp_list_price_lists(), public.fp_save_price_list(text, date, jsonb)
from public, anon, authenticated;

grant execute on function
  public.fp_get_price_list(), public.fp_list_price_lists(), public.fp_save_price_list(text, date, jsonb)
to authenticated;
