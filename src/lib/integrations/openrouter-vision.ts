import { OPENROUTER_API_KEY } from "astro:env/server";
import { PRODUCT_CATEGORY_OPTIONS, type ProductCategory } from "@/lib/domain/product-domain";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_VISION_MODEL = "openai/gpt-4.1";

interface OpenRouterVisionChoice {
  message?: {
    content?: string;
  };
}

interface OpenRouterVisionResponse {
  choices?: OpenRouterVisionChoice[];
}

export interface PhotoVisionDraft {
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  sourceImageUrl: string;
  storedImageUrl: string;
  inciText: string;
  inciSource: "photo_vision";
  inciConfidence: "high";
}

export interface PhotoVisionResult {
  draft: PhotoVisionDraft;
  needsWebSearchFallback: boolean;
}

export interface PhotoVisionInput {
  frontFileName?: string | null;
  frontMimeType?: string | null;
  frontImageDataUrl?: string | null;
  backFileName?: string | null;
  backMimeType?: string | null;
  backImageDataUrl?: string | null;
  sourceImageUrl?: string | null;
  storedImageUrl: string;
  suggestedName?: string | null;
  suggestedBrand?: string | null;
  suggestedCategory?: ProductCategory | null;
  suggestedBarcode?: string | null;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? "";
}

function normalizeCategory(value: string): ProductCategory {
  return (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value) ? (value as ProductCategory) : "other";
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  const jsonMatch = /\{[\s\S]*\}$/.exec(trimmed);
  if (!jsonMatch) {
    throw new Error("OpenRouter vision did not return a JSON object");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("OpenRouter vision returned invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("OpenRouter vision returned an unexpected payload shape");
  }

  return parsed as Record<string, unknown>;
}

function parseField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function resolvePhotoVisionDraft(input: PhotoVisionInput): Promise<PhotoVisionResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  if (!input.frontImageDataUrl && !input.backImageDataUrl) {
    throw new Error("Photo extraction wymaga co najmniej jednego zdjęcia.");
  }

  const visionContent: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [
    {
      type: "text",
      text: JSON.stringify({
        task: "Read the cosmetic product images and extract the product draft for review. If the INCI list is unreadable or only partially readable, extract as much product identity as possible (name, brand, barcode, category hints) so the system can continue with web search fallback.",
        allowedCategories: PRODUCT_CATEGORY_OPTIONS,
        imageHints: {
          front: input.frontFileName
            ? {
                fileName: input.frontFileName,
                mimeType: input.frontMimeType ?? "",
                purpose: "front of product - best source for product name, brand, and visible product identity",
              }
            : null,
          back: input.backFileName
            ? {
                fileName: input.backFileName,
                mimeType: input.backMimeType ?? "",
                purpose: "back / label - best source for ingredient list, barcode, and instructions",
              }
            : null,
        },
        hints: {
          suggestedName: normalizeOptionalText(input.suggestedName),
          suggestedBrand: normalizeOptionalText(input.suggestedBrand),
          suggestedCategory: input.suggestedCategory ?? "",
          suggestedBarcode: normalizeOptionalText(input.suggestedBarcode),
        },
      }),
    },
  ];

  if (input.frontImageDataUrl) {
    visionContent.push({
      type: "image_url",
      image_url: {
        url: input.frontImageDataUrl,
      },
    });
  }

  if (input.backImageDataUrl) {
    visionContent.push({
      type: "image_url",
      image_url: {
        url: input.backImageDataUrl,
      },
    });
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_VISION_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are helping a skincare app read cosmetic product photos for human review. You may receive a front photo, a back photo, or both. Use the front photo primarily for product identity (brand, product name, product type) and the back photo primarily for INCI and barcode. Combine both images when both are present. Return only strict JSON with keys: name, brand, category, barcode, inciText, reasoning. The category field MUST be exactly one of the provided category slugs. Use other only if no category clearly fits. If the INCI text is not readable, return an empty inciText but still try to extract product identity for web-search fallback. Do not include markdown fences or commentary.",
        },
        {
          role: "user",
          content: visionContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter vision request failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenRouterVisionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter vision did not return any draft content");
  }

  const parsed = parseJsonObject(content);
  const draft: PhotoVisionDraft = {
    name: parseField(parsed, "name") || normalizeOptionalText(input.suggestedName),
    brand: parseField(parsed, "brand") || normalizeOptionalText(input.suggestedBrand),
    category: normalizeCategory(parseField(parsed, "category") || (input.suggestedCategory ?? "other")),
    barcode: parseField(parsed, "barcode") || normalizeOptionalText(input.suggestedBarcode),
    sourceImageUrl: normalizeOptionalText(input.sourceImageUrl),
    storedImageUrl: input.storedImageUrl,
    inciText: parseField(parsed, "inciText"),
    inciSource: "photo_vision",
    inciConfidence: "high",
  };

  return {
    draft,
    needsWebSearchFallback:
      !draft.inciText ||
      draft.inciText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length < 5,
  };
}
