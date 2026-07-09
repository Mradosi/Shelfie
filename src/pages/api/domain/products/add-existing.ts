import type { APIRoute } from "astro";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { addUserShelfItem, listUserShelfItems } from "@/lib/domain/user-domain";
import { createClient } from "@/lib/supabase";

function encodeMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "https://shelfie.local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
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

function parseRequiredProductId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Brakuje identyfikatora produktu do dodania na półkę");
  }

  return value.trim();
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

  let successRedirectTo = "/products/intake/complete";
  let errorRedirectTo = "/products/intake";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania";
    return context.redirect(encodeMessage("/products/intake", "error", message));
  }

  let productId: string;
  try {
    productId = parseRequiredProductId(form.get("productId"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać produktu";
    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(encodeMessage(errorRedirectTo, "error", "Supabase nie jest skonfigurowane"));
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return context.redirect(encodeMessage(errorRedirectTo, "error", authError.message));
  }

  if (!user) {
    return context.redirect("/auth/signin");
  }

  try {
    const product = await getSharedProductById(supabase, productId);
    if (!product) {
      throw new Error("Nie udało się odnaleźć produktu w shared bazie");
    }

    const { shelfItem, alreadyExisted } = await ensureShelfItem(supabase, user.id, product.id);
    const successUrl = new URL(successRedirectTo, "https://shelfie.local");
    successUrl.searchParams.set("productId", product.id);
    successUrl.searchParams.set("shelfItemId", shelfItem.id);
    successUrl.searchParams.set("reusedProduct", "1");
    successUrl.searchParams.set("existingShelfItem", alreadyExisted ? "1" : "0");

    return context.redirect(`${successUrl.pathname}${successUrl.search}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się dodać produktu na półkę";
    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }
};
