import {
  PRODUCT_CATEGORY_OPTIONS,
  type ProductCategory,
  type ProductConfidence,
  type ProductSource,
} from "@/lib/domain/product-domain";

export interface ProductIntakeCandidate {
  id?: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  inciList: string[];
  source: ProductSource;
  confidence: ProductConfidence;
  incompleteInci: boolean;
  origin: "shared" | "external" | "fallback";
  originLabel: string;
}

export interface ProductReviewDraft {
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  sourceImageUrl: string;
  storedImageUrl: string;
  inciText: string;
  inciSource: ProductSource;
  inciConfidence: ProductConfidence;
}

export interface FallbackDraftInput {
  name?: string | null;
  brand?: string | null;
  category?: ProductCategory | null;
  barcode?: string | null;
  sourceImageUrl?: string | null;
  storedImageUrl?: string | null;
  inciText: string;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? "";
}

function normalizeCategory(value: ProductCategory | null | undefined): ProductCategory {
  if (value && (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value)) {
    return value;
  }

  return "other";
}

export function parseIngredientText(rawIngredients: string) {
  return Array.from(
    new Set(
      rawIngredients
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function createReviewDraftFromCandidate(candidate: ProductIntakeCandidate): ProductReviewDraft {
  return {
    name: candidate.name ?? "",
    brand: candidate.brand ?? "",
    category: normalizeCategory(candidate.category),
    barcode: candidate.barcode ?? "",
    sourceImageUrl: candidate.imageUrl ?? "",
    storedImageUrl: "",
    inciText: candidate.inciList.join(", "),
    inciSource: candidate.source,
    inciConfidence: candidate.confidence,
  };
}

function createFallbackDraft(
  source: ProductSource,
  confidence: ProductConfidence,
  input: FallbackDraftInput,
): ProductReviewDraft {
  return {
    name: normalizeOptionalText(input.name),
    brand: normalizeOptionalText(input.brand),
    category: normalizeCategory(input.category),
    barcode: normalizeOptionalText(input.barcode),
    sourceImageUrl: normalizeOptionalText(input.sourceImageUrl),
    storedImageUrl: normalizeOptionalText(input.storedImageUrl),
    inciText: parseIngredientText(input.inciText).join(", "),
    inciSource: source,
    inciConfidence: confidence,
  };
}

export function buildAiWebSearchDraft(input: FallbackDraftInput) {
  return createFallbackDraft("ai_web_search", "medium", input);
}

export function buildPhotoVisionDraft(input: FallbackDraftInput) {
  return createFallbackDraft("photo_vision", "high", input);
}

export function buildManualDraft(input: FallbackDraftInput) {
  return createFallbackDraft("manual", "high", input);
}
