import type { APIRoute } from "astro";
import { setFlashMessage } from "@/lib/flash-message";
import { removeUserShelfItem } from "@/lib/domain/user-domain";
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

function parseRequiredShelfItemId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Brakuje identyfikatora produktu na półce");
  }

  return value.trim();
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  let successRedirectTo = "/shelf";
  let errorRedirectTo = "/shelf";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect("/shelf");
  }

  let shelfItemId: string;
  try {
    shelfItemId = parseRequiredShelfItemId(form.get("shelfItemId"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać produktu z półki";
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
    const removedShelfItem = await removeUserShelfItem(supabase, user.id, shelfItemId);
    if (!removedShelfItem) {
      throw new Error("Nie znaleziono produktu na Twojej półce");
    }

    setFlashMessage(context.cookies, { kind: "success", message: "Produkt został usunięty z Twojej półki." });
    return context.redirect(successRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się usunąć produktu z półki";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect(errorRedirectTo);
  }
};
