create or replace function public.user_product_interpretation_tag_items_are_valid(items_input jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when items_input is null or jsonb_typeof(items_input) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(items_input) as item(value)
      where jsonb_typeof(item.value) <> 'object'
        or jsonb_typeof(item.value -> 'code') <> 'string'
        or jsonb_typeof(item.value -> 'label') <> 'string'
        or jsonb_typeof(item.value -> 'reason') <> 'string'
        or btrim(item.value ->> 'code') = ''
        or btrim(item.value ->> 'label') = ''
        or btrim(item.value ->> 'reason') = ''
    )
  end;
$$;

create or replace function public.user_product_interpretation_warnings_are_valid(warnings_input jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when warnings_input is null or jsonb_typeof(warnings_input) <> 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements(warnings_input) as warning(value)
      where jsonb_typeof(warning.value) <> 'object'
        or jsonb_typeof(warning.value -> 'code') <> 'string'
        or jsonb_typeof(warning.value -> 'severity') <> 'string'
        or jsonb_typeof(warning.value -> 'message') <> 'string'
        or btrim(warning.value ->> 'code') = ''
        or btrim(warning.value ->> 'message') = ''
        or not (warning.value ->> 'severity' in ('low', 'medium', 'high'))
    )
  end;
$$;

create table public.user_product_interpretations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status text not null default 'pending',
  fit_status text,
  fit_score smallint,
  confidence text,
  summary_short text,
  reasoning_short text,
  recommended_for jsonb not null default '[]'::jsonb,
  caution_for jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  profile_basis jsonb not null default '{}'::jsonb,
  product_basis jsonb not null default '{}'::jsonb,
  model_version text,
  prompt_version text,
  generated_at timestamptz,
  stale_at timestamptz,
  stale_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_product_interpretations_user_id_product_id_key unique (user_id, product_id),
  constraint user_product_interpretations_status_check check (
    status in ('pending', 'ready', 'failed', 'stale')
  ),
  constraint user_product_interpretations_fit_status_check check (
    fit_status is null or fit_status in ('recommended', 'mixed', 'not_recommended', 'insufficient_data')
  ),
  constraint user_product_interpretations_fit_score_check check (
    fit_score is null or fit_score between 0 and 100
  ),
  constraint user_product_interpretations_confidence_check check (
    confidence is null or confidence in ('high', 'medium', 'low')
  ),
  constraint user_product_interpretations_recommended_for_array_check check (
    public.user_product_interpretation_tag_items_are_valid(recommended_for)
  ),
  constraint user_product_interpretations_caution_for_array_check check (
    public.user_product_interpretation_tag_items_are_valid(caution_for)
  ),
  constraint user_product_interpretations_warnings_array_check check (
    public.user_product_interpretation_warnings_are_valid(warnings)
  ),
  constraint user_product_interpretations_profile_basis_object_check check (
    jsonb_typeof(profile_basis) = 'object'
  ),
  constraint user_product_interpretations_product_basis_object_check check (
    jsonb_typeof(product_basis) = 'object'
  )
);

comment on table public.user_product_interpretations is 'Per-user cached AI interpretation for a shared product keyed by (user_id, product_id).';
comment on column public.user_product_interpretations.status is 'Lifecycle state of the interpretation record: pending, ready, failed, or stale.';
comment on column public.user_product_interpretations.fit_status is 'Personalized verdict describing how well the product fits the user profile.';
comment on column public.user_product_interpretations.fit_score is 'Optional secondary 0-100 score used as a ranking hint, never as the sole UI verdict.';
comment on column public.user_product_interpretations.recommended_for is 'Structured benefits this product may offer to this user.';
comment on column public.user_product_interpretations.caution_for is 'Structured caveats describing where the product may need caution for this user.';
comment on column public.user_product_interpretations.warnings is 'Operational warnings with explicit severity for this user-product pair.';
comment on column public.user_product_interpretations.profile_basis is 'Snapshot of structured profile inputs used for the latest interpretation.';
comment on column public.user_product_interpretations.product_basis is 'Snapshot of product inputs used for the latest interpretation.';
comment on column public.user_product_interpretations.stale_reason is 'Why a previously ready interpretation needs refresh.';
comment on column public.user_product_interpretations.last_error is 'Last generation failure message safe to surface in logs or debug tooling.';

create trigger set_user_product_interpretations_updated_at
before update on public.user_product_interpretations
for each row
execute function public.set_updated_at();

revoke all on table public.user_product_interpretations from anon;
revoke all on table public.user_product_interpretations from authenticated;
grant select, insert, update, delete on table public.user_product_interpretations to authenticated;

alter table public.user_product_interpretations enable row level security;

create policy "Users can select their own product interpretations"
on public.user_product_interpretations
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own product interpretations"
on public.user_product_interpretations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own product interpretations"
on public.user_product_interpretations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own product interpretations"
on public.user_product_interpretations
for delete
to authenticated
using (auth.uid() = user_id);
