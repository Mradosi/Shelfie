alter table public.products
  add column name text,
  add column brand text,
  add column category text,
  add column barcode text,
  add column normalized_name text,
  add column normalized_brand text not null default '',
  add column inci_list text[] not null default '{}'::text[],
  add column image_url text,
  add column inci_source text,
  add column inci_confidence text,
  add column inci_updated_at timestamptz;

create or replace function public.normalize_product_identity(raw_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(raw_value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function public.normalize_product_barcode(raw_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(trim(coalesce(raw_value, '')), '\D', '', 'g'), '');
$$;

update public.products
set
  name = coalesce(name, id::text),
  normalized_name = coalesce(normalized_name, id::text),
  normalized_brand = coalesce(normalized_brand, '');

alter table public.products
  alter column name set not null,
  alter column normalized_name set not null,
  add constraint products_inci_source_check check (
    inci_source is null or inci_source in ('open_beauty_facts', 'photo_vision', 'manual', 'ai_web_search')
  ),
  add constraint products_inci_confidence_check check (
    inci_confidence is null or inci_confidence in ('high', 'medium')
  ),
  add constraint products_barcode_normalized_check check (
    barcode is null or barcode = public.normalize_product_barcode(barcode)
  ),
  add constraint products_normalized_name_check check (
    normalized_name = public.normalize_product_identity(name)
  ),
  add constraint products_normalized_brand_check check (
    normalized_brand = coalesce(public.normalize_product_identity(brand), '')
  );

create unique index products_barcode_key
  on public.products (barcode)
  where barcode is not null;

create index products_normalized_identity_idx
  on public.products (normalized_name, normalized_brand);

comment on table public.products is 'Shared skincare product catalog with minimal confirmed intake metadata and provenance.';
comment on column public.products.barcode is 'Normalized digits-only barcode used as the strongest shared-product identity key when present.';
comment on column public.products.normalized_name is 'Lowercased, whitespace-normalized product name used for canonical fallback matching.';
comment on column public.products.normalized_brand is 'Lowercased, whitespace-normalized brand used together with normalized_name for canonical fallback matching.';
comment on column public.products.inci_list is 'Confirmed raw INCI list stored as an ordered text array.';
comment on column public.products.inci_source is 'Source of the current confirmed INCI payload.';
comment on column public.products.inci_confidence is 'Confidence level associated with the current INCI source.';

create or replace function public.upsert_confirmed_product(
  p_name text,
  p_brand text,
  p_category text,
  p_barcode text,
  p_inci_list text[],
  p_image_url text,
  p_inci_source text,
  p_inci_confidence text,
  p_inci_updated_at timestamptz
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_product public.products;
  normalized_name_value text := public.normalize_product_identity(p_name);
  normalized_brand_value text := coalesce(public.normalize_product_identity(p_brand), '');
  normalized_barcode_value text := public.normalize_product_barcode(p_barcode);
  final_inci_updated_at timestamptz := coalesce(p_inci_updated_at, now());
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;

  if normalized_name_value is null then
    raise exception 'Confirmed products require a name';
  end if;

  if coalesce(array_length(p_inci_list, 1), 0) = 0 then
    raise exception 'Confirmed products require at least one INCI item';
  end if;

  if normalized_barcode_value is not null then
    select *
    into matched_product
    from public.products
    where barcode = normalized_barcode_value
    limit 1;
  end if;

  if matched_product.id is null then
    select *
    into matched_product
    from public.products
    where normalized_name = normalized_name_value
      and normalized_brand = normalized_brand_value
    limit 1;
  end if;

  if matched_product.id is null then
    insert into public.products (
      name,
      brand,
      category,
      barcode,
      normalized_name,
      normalized_brand,
      inci_list,
      image_url,
      inci_source,
      inci_confidence,
      inci_updated_at
    )
    values (
      trim(p_name),
      nullif(trim(coalesce(p_brand, '')), ''),
      nullif(trim(coalesce(p_category, '')), ''),
      normalized_barcode_value,
      normalized_name_value,
      normalized_brand_value,
      p_inci_list,
      nullif(trim(coalesce(p_image_url, '')), ''),
      p_inci_source,
      p_inci_confidence,
      final_inci_updated_at
    )
    returning * into matched_product;
  else
    update public.products
    set
      name = trim(p_name),
      brand = nullif(trim(coalesce(p_brand, '')), ''),
      category = coalesce(nullif(trim(coalesce(p_category, '')), ''), public.products.category),
      barcode = coalesce(normalized_barcode_value, public.products.barcode),
      normalized_name = normalized_name_value,
      normalized_brand = normalized_brand_value,
      inci_list = p_inci_list,
      image_url = coalesce(nullif(trim(coalesce(p_image_url, '')), ''), public.products.image_url),
      inci_source = p_inci_source,
      inci_confidence = p_inci_confidence,
      inci_updated_at = final_inci_updated_at
    where id = matched_product.id
    returning * into matched_product;
  end if;

  return matched_product;
end;
$$;

revoke all on function public.upsert_confirmed_product(text, text, text, text, text[], text, text, text, timestamptz) from public;
grant execute on function public.upsert_confirmed_product(text, text, text, text, text[], text, text, text, timestamptz) to authenticated;
