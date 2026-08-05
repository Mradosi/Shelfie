-- Product-fit v2 stops treating generic emollient presence as a formula-level risk.
-- Preserve prior results for reference while requiring an explicit per-product refresh.
update public.user_product_interpretations
set
  status = 'stale',
  stale_at = now(),
  stale_reason = 'prompt_version_changed'
where status = 'ready'
  and prompt_version is distinct from 'product-fit-v2';
