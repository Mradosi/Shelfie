create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  skin_type text,
  sensitivity text,
  concerns text[] not null default '{}'::text[],
  goals text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_shelf_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_shelf_items_user_id_product_id_key unique (user_id, product_id)
);

create table public.user_routine_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_routine_configs_schedule_object_check check (jsonb_typeof(schedule) = 'object')
);

comment on table public.products is 'Shared product identity stub for future shared product metadata.';
comment on table public.user_profiles is 'Per-user skincare profile persisted alongside auth.users.';
comment on table public.user_shelf_items is 'Per-user shelf membership keyed to shared product identities.';
comment on table public.user_routine_configs is 'Per-user base routine configuration referencing owned shelf items.';
comment on column public.user_routine_configs.schedule is 'JSON schedule whose entries reference user_shelf_items.id via shelf_item_id.';

create or replace function public.validate_user_routine_schedule()
returns trigger
language plpgsql
as $$
declare
  day_entry record;
  section_entry record;
  item_entry jsonb;
  shelf_item_id uuid;
begin
  if new.schedule is null then
    new.schedule = '{}'::jsonb;
  end if;

  if jsonb_typeof(new.schedule) <> 'object' then
    raise exception 'user_routine_configs.schedule must be a JSON object';
  end if;

  for day_entry in
    select key, value
    from jsonb_each(new.schedule)
  loop
    if jsonb_typeof(day_entry.value) <> 'object' then
      raise exception 'user_routine_configs.schedule day "%" must map to an object', day_entry.key;
    end if;

    for section_entry in
      select key, value
      from jsonb_each(day_entry.value)
    loop
      if jsonb_typeof(section_entry.value) <> 'array' then
        raise exception 'user_routine_configs.schedule section "%.%" must be an array', day_entry.key, section_entry.key;
      end if;

      for item_entry in
        select value
        from jsonb_array_elements(section_entry.value)
      loop
        if jsonb_typeof(item_entry) <> 'object' or not (item_entry ? 'shelf_item_id') then
          raise exception 'user_routine_configs.schedule entry in "%.%" must be an object with shelf_item_id',
            day_entry.key,
            section_entry.key;
        end if;

        begin
          shelf_item_id := (item_entry ->> 'shelf_item_id')::uuid;
        exception
          when invalid_text_representation then
            raise exception 'user_routine_configs.schedule entry in "%.%" has invalid shelf_item_id "%"',
              day_entry.key,
              section_entry.key,
              item_entry ->> 'shelf_item_id';
        end;

        if not exists (
          select 1
          from public.user_shelf_items
          where id = shelf_item_id
            and user_id = new.user_id
        ) then
          raise exception 'user_routine_configs.schedule entry in "%.%" references shelf item "%" outside user ownership',
            day_entry.key,
            section_entry.key,
            shelf_item_id;
        end if;
      end loop;
    end loop;
  end loop;

  return new;
end;
$$;

create or replace function public.prune_schedule_shelf_item(
  schedule_input jsonb,
  target_shelf_item_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  cleaned_schedule jsonb := '{}'::jsonb;
  cleaned_day jsonb;
  cleaned_items jsonb;
  day_entry record;
  section_entry record;
begin
  if schedule_input is null or schedule_input = '{}'::jsonb then
    return '{}'::jsonb;
  end if;

  for day_entry in
    select key, value
    from jsonb_each(schedule_input)
  loop
    if jsonb_typeof(day_entry.value) <> 'object' then
      cleaned_schedule := jsonb_set(cleaned_schedule, array[day_entry.key], day_entry.value, true);
      continue;
    end if;

    cleaned_day := '{}'::jsonb;

    for section_entry in
      select key, value
      from jsonb_each(day_entry.value)
    loop
      if jsonb_typeof(section_entry.value) <> 'array' then
        cleaned_day := jsonb_set(cleaned_day, array[section_entry.key], section_entry.value, true);
        continue;
      end if;

      select coalesce(jsonb_agg(item.value), '[]'::jsonb)
      into cleaned_items
      from jsonb_array_elements(section_entry.value) as item(value)
      where coalesce(item.value ->> 'shelf_item_id', '') <> target_shelf_item_id::text;

      cleaned_day := jsonb_set(cleaned_day, array[section_entry.key], cleaned_items, true);
    end loop;

    cleaned_schedule := jsonb_set(cleaned_schedule, array[day_entry.key], cleaned_day, true);
  end loop;

  return cleaned_schedule;
end;
$$;

create or replace function public.remove_deleted_shelf_item_from_routine_schedule()
returns trigger
language plpgsql
as $$
begin
  update public.user_routine_configs
  set schedule = public.prune_schedule_shelf_item(schedule, old.id)
  where user_id = old.user_id;

  return old;
end;
$$;

create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create trigger set_user_shelf_items_updated_at
before update on public.user_shelf_items
for each row
execute function public.set_updated_at();

create trigger set_user_routine_configs_updated_at
before update on public.user_routine_configs
for each row
execute function public.set_updated_at();

create trigger validate_user_routine_configs_schedule
before insert or update on public.user_routine_configs
for each row
execute function public.validate_user_routine_schedule();

create trigger remove_deleted_shelf_item_from_routine_schedule
after delete on public.user_shelf_items
for each row
execute function public.remove_deleted_shelf_item_from_routine_schedule();

revoke all on table public.products from anon;
revoke all on table public.products from authenticated;
grant select on table public.products to authenticated;

revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select, insert, update, delete on table public.user_profiles to authenticated;

revoke all on table public.user_shelf_items from anon;
revoke all on table public.user_shelf_items from authenticated;
grant select, insert, update, delete on table public.user_shelf_items to authenticated;

revoke all on table public.user_routine_configs from anon;
revoke all on table public.user_routine_configs from authenticated;
grant select, insert, update, delete on table public.user_routine_configs to authenticated;

alter table public.products enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_shelf_items enable row level security;
alter table public.user_routine_configs enable row level security;

create policy "Authenticated users can read product anchors"
on public.products
for select
to authenticated
using (true);

create policy "Users can select their own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own profile"
on public.user_profiles
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can select their own shelf items"
on public.user_shelf_items
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own shelf items"
on public.user_shelf_items
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own shelf items"
on public.user_shelf_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own shelf items"
on public.user_shelf_items
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can select their own routine config"
on public.user_routine_configs
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own routine config"
on public.user_routine_configs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own routine config"
on public.user_routine_configs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own routine config"
on public.user_routine_configs
for delete
to authenticated
using (auth.uid() = user_id);
