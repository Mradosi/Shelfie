create table public.user_routine_assessments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  input_fingerprint text not null,
  assessment jsonb not null,
  model_version text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_routine_assessments_assessment_object_check check (jsonb_typeof(assessment) = 'object')
);

comment on table public.user_routine_assessments is
  'Latest AI assessment for one user base routine, scoped to a versioned routine, profile, and INCI input.';
comment on column public.user_routine_assessments.input_fingerprint is
  'SHA-256 fingerprint of the evaluated base routine, skin profile, product INCI, and product-fit analysis versions.';

create trigger set_user_routine_assessments_updated_at
before update on public.user_routine_assessments
for each row
execute function public.set_updated_at();

revoke all on table public.user_routine_assessments from anon;
revoke all on table public.user_routine_assessments from authenticated;
grant select, insert, update, delete on table public.user_routine_assessments to authenticated;

alter table public.user_routine_assessments enable row level security;

create policy "Users can select their own routine assessment"
on public.user_routine_assessments
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own routine assessment"
on public.user_routine_assessments
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own routine assessment"
on public.user_routine_assessments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own routine assessment"
on public.user_routine_assessments
for delete
to authenticated
using ((select auth.uid()) = user_id);
