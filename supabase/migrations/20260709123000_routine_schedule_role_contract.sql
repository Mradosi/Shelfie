create or replace function public.backfill_user_routine_schedule_role(schedule_input jsonb)
returns jsonb
language plpgsql
as $$
declare
  allowed_roles text[] := array[
    'cleanse',
    'moisturize',
    'protect',
    'tone',
    'treat',
    'exfoliate',
    'remove_makeup',
    'care_mask',
    'eye_care',
    'other'
  ];
  normalized_schedule jsonb := '{}'::jsonb;
  normalized_day jsonb;
  normalized_items jsonb;
  day_entry record;
  section_entry record;
begin
  if schedule_input is null or schedule_input = '{}'::jsonb then
    return '{}'::jsonb;
  end if;

  if jsonb_typeof(schedule_input) <> 'object' then
    return schedule_input;
  end if;

  for day_entry in
    select key, value
    from jsonb_each(schedule_input)
  loop
    if jsonb_typeof(day_entry.value) <> 'object' then
      normalized_schedule := jsonb_set(normalized_schedule, array[day_entry.key], day_entry.value, true);
      continue;
    end if;

    normalized_day := '{}'::jsonb;

    for section_entry in
      select key, value
      from jsonb_each(day_entry.value)
    loop
      if jsonb_typeof(section_entry.value) <> 'array' then
        normalized_day := jsonb_set(normalized_day, array[section_entry.key], section_entry.value, true);
        continue;
      end if;

      select coalesce(
        jsonb_agg(
          case
            when jsonb_typeof(item.value) <> 'object' then item.value
            when coalesce(btrim(item.value ->> 'routine_role'), '') = '' then
              jsonb_set(item.value, '{routine_role}', to_jsonb('other'::text), true)
            when btrim(item.value ->> 'routine_role') = 'prep' then
              jsonb_set(item.value, '{routine_role}', to_jsonb('tone'::text), true)
            when btrim(item.value ->> 'routine_role') = 'seal' then
              jsonb_set(item.value, '{routine_role}', to_jsonb('moisturize'::text), true)
            when btrim(item.value ->> 'routine_role') = 'spot' then
              jsonb_set(item.value, '{routine_role}', to_jsonb('treat'::text), true)
            when btrim(item.value ->> 'routine_role') = 'mask' then
              jsonb_set(item.value, '{routine_role}', to_jsonb('care_mask'::text), true)
            when not (btrim(item.value ->> 'routine_role') = any(allowed_roles)) then
              jsonb_set(item.value, '{routine_role}', to_jsonb('other'::text), true)
            else item.value
          end
        ),
        '[]'::jsonb
      )
      into normalized_items
      from jsonb_array_elements(section_entry.value) as item(value);

      normalized_day := jsonb_set(normalized_day, array[section_entry.key], normalized_items, true);
    end loop;

    normalized_schedule := jsonb_set(normalized_schedule, array[day_entry.key], normalized_day, true);
  end loop;

  return normalized_schedule;
end;
$$;

create or replace function public.validate_user_routine_schedule()
returns trigger
language plpgsql
as $$
declare
  allowed_roles text[] := array[
    'cleanse',
    'moisturize',
    'protect',
    'tone',
    'treat',
    'exfoliate',
    'remove_makeup',
    'care_mask',
    'eye_care',
    'other'
  ];
  day_entry record;
  section_entry record;
  item_entry jsonb;
  shelf_item_id uuid;
  routine_role text;
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

        if not (item_entry ? 'routine_role') then
          raise exception 'user_routine_configs.schedule entry in "%.%" must define routine_role',
            day_entry.key,
            section_entry.key;
        end if;

        if jsonb_typeof(item_entry -> 'routine_role') <> 'string' then
          raise exception 'user_routine_configs.schedule entry in "%.%" must use a string routine_role',
            day_entry.key,
            section_entry.key;
        end if;

        routine_role := btrim(item_entry ->> 'routine_role');
        if routine_role = '' then
          raise exception 'user_routine_configs.schedule entry in "%.%" must not use an empty routine_role',
            day_entry.key,
            section_entry.key;
        end if;

        if not (routine_role = any(allowed_roles)) then
          raise exception 'user_routine_configs.schedule entry in "%.%" has unsupported routine_role "%"',
            day_entry.key,
            section_entry.key,
            routine_role;
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

update public.user_routine_configs
set schedule = public.backfill_user_routine_schedule_role(schedule)
where schedule is not null
  and schedule <> '{}'::jsonb;

drop function if exists public.backfill_user_routine_schedule_role(jsonb);
