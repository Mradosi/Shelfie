alter table public.products
  add constraint products_category_check check (
    category is null
    or category in (
      'cleanser',
      'makeup_remover',
      'toner',
      'mist',
      'essence',
      'serum',
      'ampoule',
      'treatment',
      'spot_treatment',
      'exfoliant',
      'mask',
      'eye_cream',
      'moisturizer',
      'face_oil',
      'sunscreen',
      'lip_care',
      'body_care',
      'other'
    )
  );

drop index if exists public.products_normalized_identity_idx;

create unique index if not exists products_normalized_identity_key
  on public.products (normalized_name, normalized_brand);
