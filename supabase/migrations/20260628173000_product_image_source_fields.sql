alter table public.products
  add column source_image_url text,
  add column stored_image_url text;

update public.products
set source_image_url = coalesce(source_image_url, image_url)
where image_url is not null;

comment on column public.products.source_image_url is 'Original external image URL discovered during product intake or lookup.';
comment on column public.products.stored_image_url is 'First-party stored product image URL captured or cached by Shelfie.';

drop function if exists public.upsert_confirmed_product(text, text, text, text, text[], text, text, text, timestamptz);

create or replace function public.upsert_confirmed_product(
  p_name text,
  p_brand text,
  p_category text,
  p_barcode text,
  p_inci_list text[],
  p_source_image_url text,
  p_stored_image_url text,
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
      source_image_url,
      stored_image_url,
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
      nullif(trim(coalesce(p_source_image_url, '')), ''),
      nullif(trim(coalesce(p_stored_image_url, '')), ''),
      coalesce(
        nullif(trim(coalesce(p_stored_image_url, '')), ''),
        nullif(trim(coalesce(p_source_image_url, '')), '')
      ),
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
      source_image_url = coalesce(nullif(trim(coalesce(p_source_image_url, '')), ''), public.products.source_image_url),
      stored_image_url = coalesce(nullif(trim(coalesce(p_stored_image_url, '')), ''), public.products.stored_image_url),
      image_url = coalesce(
        nullif(trim(coalesce(p_stored_image_url, '')), ''),
        public.products.stored_image_url,
        nullif(trim(coalesce(p_source_image_url, '')), ''),
        public.products.source_image_url,
        public.products.image_url
      ),
      inci_source = p_inci_source,
      inci_confidence = p_inci_confidence,
      inci_updated_at = final_inci_updated_at
    where id = matched_product.id
    returning * into matched_product;
  end if;

  return matched_product;
end;
$$;

revoke all on function public.upsert_confirmed_product(text, text, text, text, text[], text, text, text, text, timestamptz) from public;
grant execute on function public.upsert_confirmed_product(text, text, text, text, text[], text, text, text, text, timestamptz) to authenticated;
