create or replace function public.ingredient_glossary_text_items_are_valid(items_input jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when items_input is null or jsonb_typeof(items_input) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(items_input) as item(value)
      where jsonb_typeof(item.value) <> 'string'
        or btrim(item.value #>> '{}') = ''
    )
  end;
$$;

create table public.ingredient_glossary_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  inci_key text not null unique,
  display_name text not null,
  status text not null default 'pending',
  cosmetic_role text,
  summary text,
  likely_benefits jsonb not null default '[]'::jsonb,
  caveats jsonb not null default '[]'::jsonb,
  source_kind text not null default 'ai_generated',
  source_reference text,
  model_version text,
  prompt_version text,
  generated_at timestamptz,
  stale_at timestamptz,
  stale_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_glossary_entries_inci_key_check check (btrim(inci_key) <> ''),
  constraint ingredient_glossary_entries_display_name_check check (btrim(display_name) <> ''),
  constraint ingredient_glossary_entries_status_check check (
    status in ('pending', 'ready', 'failed', 'stale')
  ),
  constraint ingredient_glossary_entries_source_kind_check check (
    source_kind in ('ai_generated')
  ),
  constraint ingredient_glossary_entries_likely_benefits_check check (
    public.ingredient_glossary_text_items_are_valid(likely_benefits)
  ),
  constraint ingredient_glossary_entries_caveats_check check (
    public.ingredient_glossary_text_items_are_valid(caveats)
  ),
  constraint ingredient_glossary_entries_ready_content_check check (
    status <> 'ready'
    or (
      summary is not null
      and btrim(summary) <> ''
      and model_version is not null
      and btrim(model_version) <> ''
      and prompt_version is not null
      and btrim(prompt_version) <> ''
      and generated_at is not null
    )
  )
);

comment on table public.ingredient_glossary_entries is
  'Shared, cacheable educational glossary entries keyed by conservatively normalized INCI names.';
comment on column public.ingredient_glossary_entries.inci_key is
  'Stable normalized key for cross-product glossary reuse; original spelling remains in display_name.';
comment on column public.ingredient_glossary_entries.status is
  'Lifecycle state: pending, ready, failed, or stale. Ready entries remain visible when stale.';
comment on column public.ingredient_glossary_entries.source_kind is
  'Origin of the explanatory copy. MVP uses a server-generated AI explanation only.';
comment on column public.ingredient_glossary_entries.last_error is
  'Last safe-to-display generation failure for retryable glossary work.';

create trigger set_ingredient_glossary_entries_updated_at
before update on public.ingredient_glossary_entries
for each row
execute function public.set_updated_at();

revoke all on table public.ingredient_glossary_entries from anon;
revoke all on table public.ingredient_glossary_entries from authenticated;
grant select on table public.ingredient_glossary_entries to authenticated;

alter table public.ingredient_glossary_entries enable row level security;

create policy "Authenticated users can read ingredient glossary entries"
on public.ingredient_glossary_entries
for select
to authenticated
using (true);
