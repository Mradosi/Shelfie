import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_CONFIDENCE_LEVELS,
  PRODUCT_SOURCES,
  type ProductCategory,
  type ProductConfidence,
  type ProductSource,
} from "@/lib/domain/product-domain";
import type { ProductReviewDraft } from "@/lib/integrations/product-intake-fallbacks";

const STORAGE_KEY = "shelfie:new-product-review-draft";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value);
}

function isProductSource(value: unknown): value is ProductSource {
  return typeof value === "string" && (PRODUCT_SOURCES as readonly string[]).includes(value);
}

function isProductConfidence(value: unknown): value is ProductConfidence {
  return typeof value === "string" && (PRODUCT_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function parseTextField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isReviewDraft(value: unknown): value is ProductReviewDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isProductCategory(value.category) &&
    isProductSource(value.inciSource) &&
    isProductConfidence(value.inciConfidence) &&
    typeof value.name === "string" &&
    typeof value.brand === "string" &&
    typeof value.barcode === "string" &&
    typeof value.sourceImageUrl === "string" &&
    typeof value.storedImageUrl === "string" &&
    typeof value.inciText === "string"
  );
}

export function saveNewProductReviewDraft(draft: ProductReviewDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadNewProductReviewDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isReviewDraft(parsed)) {
      return parsed;
    }

    if (isRecord(parsed)) {
      return {
        name: parseTextField(parsed, "name"),
        brand: parseTextField(parsed, "brand"),
        category: isProductCategory(parsed.category) ? parsed.category : "other",
        barcode: parseTextField(parsed, "barcode"),
        sourceImageUrl: parseTextField(parsed, "sourceImageUrl"),
        storedImageUrl: parseTextField(parsed, "storedImageUrl"),
        inciText: parseTextField(parsed, "inciText"),
        inciSource: isProductSource(parsed.inciSource) ? parsed.inciSource : "manual",
        inciConfidence: isProductConfidence(parsed.inciConfidence) ? parsed.inciConfidence : "high",
      } satisfies ProductReviewDraft;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearNewProductReviewDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
