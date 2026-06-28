import type { SupabaseClient } from "@supabase/supabase-js";

type ProductDomainClient = SupabaseClient;

const PRODUCT_COLUMNS =
  "id, name, brand, category, barcode, normalized_name, normalized_brand, inci_list, image_url, inci_source, inci_confidence, inci_updated_at, created_at, updated_at";

export const PRODUCT_SOURCES = ["open_beauty_facts", "photo_vision", "manual", "ai_web_search"] as const;
export const PRODUCT_CONFIDENCE_LEVELS = ["high", "medium"] as const;

export type ProductSource = (typeof PRODUCT_SOURCES)[number];
export type ProductConfidence = (typeof PRODUCT_CONFIDENCE_LEVELS)[number];

interface SharedProductRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  normalized_name: string;
  normalized_brand: string;
  inci_list: string[] | null;
  image_url: string | null;
  inci_source: string | null;
  inci_confidence: string | null;
  inci_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SharedProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  normalizedName: string;
  normalizedBrand: string;
  inciList: string[];
  imageUrl: string | null;
  inciSource: ProductSource | null;
  inciConfidence: ProductConfidence | null;
  inciUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedProductLookupInput {
  barcode?: string | null;
  name?: string | null;
  brand?: string | null;
}

export interface ConfirmedProductInput {
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  inciList: string[];
  imageUrl: string | null;
  inciSource: ProductSource;
  inciConfidence: ProductConfidence;
  inciUpdatedAt: string | null;
}

export interface ConfirmedProductSaveResult {
  product: SharedProduct;
  reusedExistingProduct: boolean;
}

interface SupabaseRpcResult {
  data: unknown;
  error: { message: string } | null;
}

function isProductSource(value: unknown): value is ProductSource {
  return typeof value === "string" && (PRODUCT_SOURCES as readonly string[]).includes(value);
}

function isProductConfidence(value: unknown): value is ProductConfidence {
  return typeof value === "string" && (PRODUCT_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? null;
}

export function normalizeProductIdentityText(value: string | null | undefined) {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) {
    return null;
  }

  return trimmed.toLocaleLowerCase("pl-PL").replace(/\s+/g, " ");
}

export function normalizeProductBarcode(value: string | null | undefined) {
  const normalized = value?.replace(/\D+/g, "") ?? "";
  return normalized ? normalized : null;
}

function normalizeInciList(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function mapSharedProduct(row: SharedProductRow): SharedProduct {
  return {
    id: row.id,
    name: row.name,
    brand: normalizeOptionalText(row.brand),
    category: normalizeOptionalText(row.category),
    barcode: normalizeProductBarcode(row.barcode),
    normalizedName: row.normalized_name,
    normalizedBrand: row.normalized_brand,
    inciList: normalizeInciList(row.inci_list),
    imageUrl: normalizeOptionalText(row.image_url),
    inciSource: isProductSource(row.inci_source) ? row.inci_source : null,
    inciConfidence: isProductConfidence(row.inci_confidence) ? row.inci_confidence : null,
    inciUpdatedAt: row.inci_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isSharedProductRow(value: unknown): value is SharedProductRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.normalized_name === "string" &&
    typeof row.normalized_brand === "string" &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}

export async function findSharedProductMatch(supabase: ProductDomainClient, lookup: SharedProductLookupInput) {
  const normalizedBarcode = normalizeProductBarcode(lookup.barcode);
  if (normalizedBarcode) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("barcode", normalizedBarcode)
      .maybeSingle();

    if (error) {
      throw new Error(`Nie udało się wyszukać produktu po barcode: ${error.message}`);
    }

    if (data) {
      return mapSharedProduct(data);
    }
  }

  const normalizedName = normalizeProductIdentityText(lookup.name);
  if (!normalizedName) {
    return null;
  }

  const normalizedBrand = normalizeProductIdentityText(lookup.brand) ?? "";
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("normalized_name", normalizedName)
    .eq("normalized_brand", normalizedBrand)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wyszukać produktu po nazwie: ${error.message}`);
  }

  return data ? mapSharedProduct(data) : null;
}

export async function saveConfirmedSharedProduct(
  supabase: ProductDomainClient,
  input: ConfirmedProductInput,
): Promise<ConfirmedProductSaveResult> {
  const existingMatch = await findSharedProductMatch(supabase, {
    barcode: input.barcode,
    name: input.name,
    brand: input.brand,
  });

  const rpcResult = (await supabase.rpc("upsert_confirmed_product", {
    p_name: input.name,
    p_brand: input.brand,
    p_category: input.category,
    p_barcode: input.barcode,
    p_inci_list: input.inciList,
    p_image_url: input.imageUrl,
    p_inci_source: input.inciSource,
    p_inci_confidence: input.inciConfidence,
    p_inci_updated_at: input.inciUpdatedAt,
  })) as SupabaseRpcResult;
  const { data, error } = rpcResult;

  if (error) {
    throw new Error(`Nie udało się zapisać potwierdzonego produktu: ${error.message}`);
  }

  const candidateRow: unknown = Array.isArray(data) ? data[0] : data;
  if (!candidateRow || !isSharedProductRow(candidateRow)) {
    throw new Error("Nie udało się zwrócić zapisanego produktu z bazy");
  }

  const product = mapSharedProduct(candidateRow);
  return {
    product,
    reusedExistingProduct: existingMatch?.id === product.id,
  };
}
