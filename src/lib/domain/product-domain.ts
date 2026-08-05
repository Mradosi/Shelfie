import type { SupabaseClient } from "@supabase/supabase-js";

type ProductDomainClient = SupabaseClient;

const PRODUCT_COLUMNS =
  "id, name, brand, category, barcode, normalized_name, normalized_brand, inci_list, source_image_url, stored_image_url, inci_source, inci_confidence, inci_updated_at, created_at, updated_at";

export const PRODUCT_SOURCES = ["open_beauty_facts", "photo_vision", "manual", "ai_web_search"] as const;
export const PRODUCT_CONFIDENCE_LEVELS = ["high", "medium"] as const;
export const PRODUCT_CATEGORY_OPTIONS = [
  "cleanser",
  "makeup_remover",
  "toner",
  "mist",
  "essence",
  "serum",
  "ampoule",
  "treatment",
  "spot_treatment",
  "exfoliant",
  "mask",
  "eye_cream",
  "moisturizer",
  "face_oil",
  "sunscreen",
  "lip_care",
  "body_care",
  "other",
] as const;

export type ProductSource = (typeof PRODUCT_SOURCES)[number];
export type ProductConfidence = (typeof PRODUCT_CONFIDENCE_LEVELS)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORY_OPTIONS)[number];
const PRODUCT_SEARCH_STOPWORDS = new Set(["a", "i", "na", "o", "oraz", "the", "with", "w", "z"]);

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  cleanser: "Produkt myjący",
  makeup_remover: "Demakijaż",
  toner: "Tonik",
  mist: "Mgiełka",
  essence: "Esencja",
  serum: "Serum",
  ampoule: "Ampułka",
  treatment: "Kuracja",
  spot_treatment: "Punktowo",
  exfoliant: "Eksfoliant",
  mask: "Maska",
  eye_cream: "Krem pod oczy",
  moisturizer: "Krem",
  face_oil: "Olejek do twarzy",
  sunscreen: "Filtr SPF",
  lip_care: "Pielęgnacja ust",
  body_care: "Pielęgnacja ciała",
  other: "Inne",
};

interface SharedProductRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  normalized_name: string;
  normalized_brand: string;
  inci_list: string[] | null;
  source_image_url: string | null;
  stored_image_url: string | null;
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
  sourceImageUrl: string | null;
  storedImageUrl: string | null;
  inciSource: ProductSource | null;
  inciConfidence: ProductConfidence | null;
  inciUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedProductInterpretationBasis {
  category: ProductCategory | null;
  inciList: string[];
  inciConfidence: ProductConfidence | null;
  inciUpdatedAt: string | null;
}

export async function listSharedProducts(supabase: ProductDomainClient) {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nie udało się wczytać współdzielonych produktów: ${error.message}`);
  }

  return data.map((row) => mapSharedProduct(row));
}

export async function listSharedProductsByCategories(
  supabase: ProductDomainClient,
  input: SharedProductCategoryLookupInput,
) {
  const categories = Array.from(new Set(input.categories.filter(isProductCategory)));
  if (categories.length === 0) {
    return [];
  }

  const excludedProductIds = Array.from(
    new Set((input.excludeProductIds ?? []).map((productId) => productId.trim()).filter(Boolean)),
  );
  const limit = Math.max(1, Math.min(input.limit, 24));
  const query = supabase.from("products").select(PRODUCT_COLUMNS).in("category", categories).order("updated_at", {
    ascending: false,
  });

  if (excludedProductIds.length > 0) {
    query.not("id", "in", `(${excludedProductIds.join(",")})`);
  }

  const { data, error } = await query.limit(limit);
  if (error) {
    throw new Error(`Nie udało się wczytać kandydatów z katalogu: ${error.message}`);
  }

  return data.map((row) => mapSharedProduct(row));
}

export interface SharedProductLookupInput {
  barcode?: string | null;
  name?: string | null;
  brand?: string | null;
}

export interface SharedProductSearchInput {
  query: string;
  limit?: number;
}

export interface SharedProductCategoryLookupInput {
  categories: ProductCategory[];
  excludeProductIds?: string[];
  limit: number;
}

export interface ConfirmedProductInput {
  name: string;
  brand: string | null;
  category: ProductCategory;
  barcode: string | null;
  inciList: string[];
  sourceImageUrl: string | null;
  storedImageUrl: string | null;
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

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value);
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

function tokenizeProductSearchQuery(value: string) {
  const normalized = normalizeProductIdentityText(value);
  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(/[^a-z0-9ąćęłńóśźż]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !PRODUCT_SEARCH_STOPWORDS.has(token)),
    ),
  );
}

function escapePostgrestLikeValue(value: string) {
  return value.replace(/[,%]/g, "");
}

function buildProductSearchHaystack(product: SharedProduct) {
  return normalizeProductIdentityText([product.name, product.brand, product.category].filter(Boolean).join(" ")) ?? "";
}

function scoreSharedProductSearch(product: SharedProduct, normalizedQuery: string, queryTokens: string[]) {
  const normalizedName = normalizeProductIdentityText(product.name) ?? "";
  const normalizedBrand = normalizeProductIdentityText(product.brand) ?? "";
  const haystack = buildProductSearchHaystack(product);
  let score = 0;
  let matchedTokens = 0;

  if (haystack.includes(normalizedQuery)) {
    score += 120;
  }

  if (normalizedName.includes(normalizedQuery)) {
    score += 90;
  }

  if (normalizedBrand && normalizedQuery.includes(normalizedBrand)) {
    score += 25;
  }

  for (const token of queryTokens) {
    if (normalizedBrand === token) {
      score += 35;
      matchedTokens += 1;
      continue;
    }

    if (normalizedBrand.includes(token)) {
      score += 20;
      matchedTokens += 1;
      continue;
    }

    if (normalizedName.includes(token)) {
      score += token.length >= 5 ? 14 : 10;
      matchedTokens += 1;
      continue;
    }

    if (haystack.includes(token)) {
      score += 6;
      matchedTokens += 1;
    }
  }

  if (queryTokens.length > 1 && matchedTokens === 0) {
    return -1;
  }

  return score + matchedTokens * 4;
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

export function createProductInterpretationBasis(value: unknown): SharedProductInterpretationBasis {
  const candidate: Record<string, unknown> =
    typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const category = isProductCategory(candidate.category) ? candidate.category : null;
  const inciList = normalizeInciList(Array.isArray(candidate.inciList) ? candidate.inciList : undefined);
  const inciConfidence = isProductConfidence(candidate.inciConfidence) ? candidate.inciConfidence : null;
  const inciUpdatedAt = typeof candidate.inciUpdatedAt === "string" ? candidate.inciUpdatedAt : null;

  return {
    category,
    inciList,
    inciConfidence,
    inciUpdatedAt,
  };
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
    imageUrl: normalizeOptionalText(row.stored_image_url) ?? normalizeOptionalText(row.source_image_url),
    sourceImageUrl: normalizeOptionalText(row.source_image_url),
    storedImageUrl: normalizeOptionalText(row.stored_image_url),
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
      .limit(1);

    if (error) {
      throw new Error(`Nie udało się wyszukać produktu po barcode: ${error.message}`);
    }

    if (data.length > 0) {
      return mapSharedProduct(data[0]);
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
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Nie udało się wyszukać produktu po nazwie: ${error.message}`);
  }

  return data.length > 0 ? mapSharedProduct(data[0]) : null;
}

export async function searchSharedProductsByName(supabase: ProductDomainClient, input: SharedProductSearchInput) {
  const normalizedQuery = normalizeProductIdentityText(input.query);
  if (!normalizedQuery) {
    return [];
  }

  const queryTokens = tokenizeProductSearchQuery(input.query);
  const searchTerms = queryTokens.length > 0 ? queryTokens : [normalizedQuery];
  const searchClauses = searchTerms.flatMap((term) => {
    const escapedTerm = escapePostgrestLikeValue(term);
    return [
      `name.ilike.%${escapedTerm}%`,
      `brand.ilike.%${escapedTerm}%`,
      `normalized_name.ilike.%${escapedTerm}%`,
      `normalized_brand.ilike.%${escapedTerm}%`,
    ];
  });

  const limit = input.limit ?? 10;
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .or(searchClauses.join(","))
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 5, 20));

  if (error) {
    throw new Error(`Nie udało się wyszukać produktów w lokalnej bazie: ${error.message}`);
  }

  return data
    .map((row) => mapSharedProduct(row))
    .map((product) => ({
      product,
      score: scoreSharedProductSearch(product, normalizedQuery, searchTerms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.product.updatedAt.localeCompare(left.product.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.product);
}

export async function getSharedProductById(supabase: ProductDomainClient, productId: string) {
  const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).eq("id", productId).maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wczytać produktu współdzielonego: ${error.message}`);
  }

  return data ? mapSharedProduct(data) : null;
}

export async function getSharedProductsByIds(supabase: ProductDomainClient, productIds: string[]) {
  const uniqueProductIds = Array.from(new Set(productIds.map((productId) => productId.trim()).filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).in("id", uniqueProductIds);

  if (error) {
    throw new Error(`Nie udało się wczytać współdzielonych produktów: ${error.message}`);
  }

  return data.map((row) => mapSharedProduct(row));
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
    p_source_image_url: input.sourceImageUrl,
    p_stored_image_url: input.storedImageUrl,
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
