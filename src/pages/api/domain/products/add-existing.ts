import type { APIRoute } from "astro";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { addUserShelfItem, listUserShelfItems } from "@/lib/domain/user-domain";
import { setFlashMessage } from "@/lib/flash-message";
import { createClient } from "@/lib/supabase";

function parseRedirectPath(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new Error("Ścieżka przekierowania musi prowadzić wewnątrz aplikacji");
  }

  return new URL(trimmed, "https://shelfie.local").pathname;
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

  let successRedirectTo = "/shelf";
  let errorRedirectTo = "/products/intake";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect("/products/intake");
  }

  let productId: string;
  try {
    productId = parseRequiredProductId(form.get("productId"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać produktu";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect(errorRedirectTo);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    setFlashMessage(context.cookies, { kind: "error", message: "Supabase nie jest skonfigurowane" });
    return context.redirect(errorRedirectTo);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    setFlashMessage(context.cookies, { kind: "error", message: authError.message });
    return context.redirect(errorRedirectTo);
  }

  if (!user) {
    return context.redirect("/auth/signin");
  }

  try {
    const product = await getSharedProductById(supabase, productId);
    if (!product) {
      throw new Error("Nie udało się odnaleźć produktu w shared bazie");
    }

    const { alreadyExisted } = await ensureShelfItem(supabase, user.id, product.id);
    setFlashMessage(context.cookies, {
      kind: "success",
      message: alreadyExisted ? "Ten produkt był już na Twojej półce." : "Produkt został dodany do Twojej półki.",
    });
    return context.redirect(successRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się dodać produktu na półkę";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect(errorRedirectTo);
  }
};
