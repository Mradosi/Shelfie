import { parseIngredientText } from "@/lib/integrations/product-intake-fallbacks";

const INCIDECODER_BASE_URL = "https://incidecoder.com";

export interface IncidecoderLookupResult {
  url: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  inciList: string[];
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? null;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ShelfieBot/1.0 (+https://shelfie.local)",
    },
  });

  if (!response.ok) {
    throw new Error(`INCIDecoder request failed with ${response.status}`);
  }

  return response.text();
}

function extractFirstProductUrl(searchHtml: string) {
  const matches = searchHtml.matchAll(/href="(\/products\/[^"]+)"/gi);

  for (const match of matches) {
    const path = match[1];
    if (!path || path === "/products/create") {
      continue;
    }

    return `${INCIDECODER_BASE_URL}${path}`;
  }

  return null;
}

function extractImageUrl(productHtml: string) {
  const match = /https:\/\/incidecoder-content[^"'\s>]+/i.exec(productHtml);
  return normalizeOptionalText(match?.[0]);
}

function extractBrandAndName(productText: string) {
  const uploadedByIndex = productText.indexOf("Uploaded by:");
  const beforeUploaded = uploadedByIndex >= 0 ? productText.slice(0, uploadedByIndex) : productText;

  const compact = beforeUploaded.replace(/\s+/g, " ").trim();
  const overviewIndex = compact.indexOf("Ingredients overview");
  const headingSection = overviewIndex >= 0 ? compact.slice(0, overviewIndex).trim() : compact;
  const lines = headingSection
    .split(/ (?=[A-Z][^ ]+ )/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      brand: normalizeOptionalText(lines[lines.length - 2]),
      name: normalizeOptionalText(lines[lines.length - 1]),
    };
  }

  return {
    brand: null,
    name: null,
  };
}

function extractIngredients(productText: string) {
  const startMarker = "Ingredients overview";
  const endMarker = "Read more on how to read an ingredient list";
  const startIndex = productText.indexOf(startMarker);
  const endIndex = productText.indexOf(endMarker);

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return [];
  }

  const rawOverview = productText
    .slice(startIndex + startMarker.length, endIndex)
    .replace(/\[more\]|\[less\]/gi, " ")
    .replace(/Compare|INCI photo pending approval|Report Error|Embed/gi, " ")
    .trim();

  return parseIngredientText(rawOverview);
}

export async function lookupIncidecoderProduct(query: string): Promise<IncidecoderLookupResult | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const searchUrl = `${INCIDECODER_BASE_URL}/search?query=${encodeURIComponent(trimmedQuery)}`;
  const searchHtml = await fetchText(searchUrl);
  const productUrl = extractFirstProductUrl(searchHtml);
  if (!productUrl) {
    return null;
  }

  const productHtml = await fetchText(productUrl);
  const productText = stripHtml(productHtml);
  const { brand, name } = extractBrandAndName(productText);
  const inciList = extractIngredients(productText);

  return {
    url: productUrl,
    name,
    brand,
    imageUrl: extractImageUrl(productHtml),
    inciList,
  };
}
