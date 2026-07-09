import type { APIRoute } from "astro";
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_CONFIDENCE_LEVELS,
  PRODUCT_SOURCES,
  isProductCategory,
  saveConfirmedSharedProduct,
  type ProductCategory,
  type ConfirmedProductInput,
  type ProductConfidence,
  type ProductSource,
} from "@/lib/domain/product-domain";
import { addUserShelfItem, listUserShelfItems } from "@/lib/domain/user-domain";
import { createClient } from "@/lib/supabase";

const MAX_TEXT_LENGTH = 160;
const MAX_LIST_ITEMS = 256;
const MAX_IMAGE_URL_LENGTH = 2000;

function encodeMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "https://shelfie.local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function expectsJson(request: Request) {
  const accept = request.headers.get("Accept") ?? "";
  const requestedWith = request.headers.get("X-Shelfie-Request") ?? "";
  return accept.includes("application/json") || requestedWith === "product-intake";
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function parseRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new Error("Ścieżka przekierowania musi prowadzić wewnątrz aplikacji");
  }

  return trimmed;
}

function parseRequiredText(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} jest wymagane`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} jest wymagane`);
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(`${fieldName} musi mieć maksymalnie ${MAX_TEXT_LENGTH} znaków`);
  }

  return trimmed;
}

function parseOptionalText(value: FormDataEntryValue | null, fieldName: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} musi być tekstem`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(`${fieldName} musi mieć maksymalnie ${MAX_TEXT_LENGTH} znaków`);
  }

  return trimmed;
}

function parseImageUrl(value: FormDataEntryValue | null, fieldName: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} musi być tekstem`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_IMAGE_URL_LENGTH) {
    throw new Error(`${fieldName} musi mieć maksymalnie ${MAX_IMAGE_URL_LENGTH} znaków`);
  }

  try {
    const parsedUrl = new URL(trimmed);
    if (!parsedUrl.protocol.startsWith("http")) {
      throw new Error(`${fieldName} musi być poprawnym adresem HTTP lub HTTPS`);
    }
  } catch {
    throw new Error(`${fieldName} musi być poprawnym adresem HTTP lub HTTPS`);
  }

  return trimmed;
}

function parseProductSource(value: FormDataEntryValue | null): ProductSource {
  if (typeof value !== "string" || !(PRODUCT_SOURCES as readonly string[]).includes(value)) {
    throw new Error("Źródło składu musi być jedną z obsługiwanych opcji");
  }

  return value as ProductSource;
}

function parseProductConfidence(value: FormDataEntryValue | null): ProductConfidence {
  if (typeof value !== "string" || !(PRODUCT_CONFIDENCE_LEVELS as readonly string[]).includes(value)) {
    throw new Error("Poziom pewności musi być jedną z obsługiwanych opcji");
  }

  return value as ProductConfidence;
}

function parseProductCategory(value: FormDataEntryValue | null): ProductCategory {
  if (typeof value !== "string" || !isProductCategory(value)) {
    throw new Error(`Kategoria musi być jedną z dostępnych opcji: ${PRODUCT_CATEGORY_OPTIONS.join(", ")}`);
  }

  return value;
}

function parseInciList(form: FormData) {
  const values = form.getAll("inciList");
  if (values.length === 0) {
    throw new Error("Lista INCI jest wymagana");
  }

  const entries = values.flatMap((entry) => {
    if (typeof entry !== "string") {
      throw new Error("Lista INCI musi być tekstem");
    }

    const trimmed = entry.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new Error("Lista INCI musi być poprawnym JSON-em albo listą wartości");
      }

      if (!Array.isArray(parsed)) {
        throw new Error("Lista INCI musi być tablicą");
      }

      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }

    return trimmed
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  });

  if (entries.length === 0) {
    throw new Error("Lista INCI nie może być pusta");
  }

  if (entries.length > MAX_LIST_ITEMS) {
    throw new Error(`Lista INCI może zawierać maksymalnie ${MAX_LIST_ITEMS} składników`);
  }

  return Array.from(new Set(entries));
}

function parseConfirmedProductForm(form: FormData): ConfirmedProductInput {
  return {
    name: parseRequiredText(form.get("name"), "Nazwa produktu"),
    brand: parseOptionalText(form.get("brand"), "Marka"),
    category: parseProductCategory(form.get("category")),
    barcode: parseOptionalText(form.get("barcode"), "Barcode"),
    inciList: parseInciList(form),
    sourceImageUrl: parseImageUrl(form.get("sourceImageUrl"), "Źródłowe zdjęcie produktu"),
    storedImageUrl: parseImageUrl(form.get("storedImageUrl"), "Zapisane zdjęcie produktu"),
    inciSource: parseProductSource(form.get("inciSource")),
    inciConfidence: parseProductConfidence(form.get("inciConfidence")),
    inciUpdatedAt: parseOptionalText(form.get("inciUpdatedAt"), "Data aktualizacji INCI"),
  };
}

async function ensureShelfItem(supabase: ReturnType<typeof createClient>, userId: string, productId: string) {
  const existingItems = await listUserShelfItems(supabase, userId);
  const existingItem = existingItems.find((item) => item.productId === productId);
  if (existingItem) {
    return { shelfItem: existingItem, alreadyExisted: true };
  }

  const shelfItem = await addUserShelfItem(supabase, userId, productId);
  return { shelfItem, alreadyExisted: false };
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const wantsJson = expectsJson(context.request);

  let successRedirectTo = "/dashboard";
  let errorRedirectTo = "/dashboard";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania";
    if (wantsJson) {
      return jsonError(message);
    }

    return context.redirect(encodeMessage("/dashboard", "error", message));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    if (wantsJson) {
      return jsonError("Supabase nie jest skonfigurowane", 500);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", "Supabase nie jest skonfigurowane"));
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    if (wantsJson) {
      return jsonError(authError.message, 401);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", authError.message));
  }

  if (!user) {
    if (wantsJson) {
      return jsonError("Musisz być zalogowany, żeby zapisać produkt", 401);
    }

    return context.redirect("/auth/signin");
  }

  let confirmedProduct: ConfirmedProductInput;

  try {
    confirmedProduct = parseConfirmedProductForm(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowe dane produktu";
    if (wantsJson) {
      return jsonError(message);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }

  try {
    const { product, reusedExistingProduct } = await saveConfirmedSharedProduct(supabase, confirmedProduct);
    const { shelfItem, alreadyExisted } = await ensureShelfItem(supabase, user.id, product.id);

    const successUrl = new URL(successRedirectTo, "https://shelfie.local");
    successUrl.searchParams.set("productId", product.id);
    successUrl.searchParams.set("shelfItemId", shelfItem.id);
    successUrl.searchParams.set("reusedProduct", reusedExistingProduct ? "1" : "0");
    successUrl.searchParams.set("existingShelfItem", alreadyExisted ? "1" : "0");

    if (wantsJson) {
      return new Response(JSON.stringify({ redirectTo: `${successUrl.pathname}${successUrl.search}` }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return context.redirect(`${successUrl.pathname}${successUrl.search}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się zapisać produktu";
    if (wantsJson) {
      return jsonError(message, 500);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }
};
