import type { ProductConfidence, ProductSource } from "@/lib/domain/product-domain";

const OPEN_BEAUTY_FACTS_API_BASE = "https://world.openbeautyfacts.org";
const OPEN_BEAUTY_FACTS_FIELDS = [
  "code",
  "product_name",
  "brands",
  "categories",
  "ingredients_text",
  "ingredients_text_en",
  "ingredients_tags",
  "image_url",
].join(",");

interface OpenBeautyFactsProductPayload {
  code?: string;
  product_name?: string;
  brands?: string;
  categories?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  ingredients_tags?: string[];
  image_url?: string;
}

interface OpenBeautyFactsBarcodeResponse {
  product?: OpenBeautyFactsProductPayload;
}

interface OpenBeautyFactsSearchResponse {
  products?: OpenBeautyFactsProductPayload[];
}

export interface OpenBeautyFactsProductResult {
  source: ProductSource;
  confidence: ProductConfidence;
  barcode: string | null;
  name: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  inciList: string[];
  incompleteInci: boolean;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? null;
}

function normalizeBarcode(value: string | null | undefined) {
  const digits = value?.replace(/\D+/g, "") ?? "";
  return digits ? digits : null;
}

function splitIngredients(rawIngredients: string | null | undefined) {
  const ingredients = rawIngredients
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return ingredients ? Array.from(new Set(ingredients)) : [];
}

function mapOpenBeautyFactsProduct(product: OpenBeautyFactsProductPayload): OpenBeautyFactsProductResult {
  const rawIngredients =
    normalizeOptionalText(product.ingredients_text) ?? normalizeOptionalText(product.ingredients_text_en);
  const inciList = splitIngredients(rawIngredients);

  return {
    source: "open_beauty_facts",
    confidence: "high",
    barcode: normalizeBarcode(product.code),
    name: normalizeOptionalText(product.product_name),
    brand: normalizeOptionalText(product.brands),
    category: normalizeOptionalText(product.categories),
    imageUrl: normalizeOptionalText(product.image_url),
    inciList,
    incompleteInci: inciList.length === 0,
  };
}

async function fetchJson<T>(input: string) {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Open Beauty Facts request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function lookupOpenBeautyFactsByBarcode(barcode: string) {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode) {
    return null;
  }

  const url = new URL(`${OPEN_BEAUTY_FACTS_API_BASE}/api/v2/product/${normalizedBarcode}.json`);
  url.searchParams.set("fields", OPEN_BEAUTY_FACTS_FIELDS);

  const payload = await fetchJson<OpenBeautyFactsBarcodeResponse>(url.toString());
  return payload.product ? mapOpenBeautyFactsProduct(payload.product) : null;
}

export async function searchOpenBeautyFactsByName(query: string, pageSize = 10) {
  const trimmedQuery = normalizeOptionalText(query);
  if (!trimmedQuery) {
    return [];
  }

  const url = new URL(`${OPEN_BEAUTY_FACTS_API_BASE}/cgi/search.pl`);
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("search_terms", trimmedQuery);
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("fields", OPEN_BEAUTY_FACTS_FIELDS);

  const payload = await fetchJson<OpenBeautyFactsSearchResponse>(url.toString());
  return (payload.products ?? []).map(mapOpenBeautyFactsProduct);
}
