alter table public.user_shelf_items
  add column note text,
  add column exclude_from_ai_routines boolean not null default false,
  add constraint user_shelf_items_note_check check (
    note is null
    or (char_length(note) between 1 and 500 and note = btrim(note))
  );

comment on column public.user_shelf_items.note is
  'Optional private product note supplied by the shelf owner.';
comment on column public.user_shelf_items.exclude_from_ai_routines is
  'When true, this shelf item is never sent to AI routine generation.';
