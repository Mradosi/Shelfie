import type { APIRoute } from "astro";
import { removeUserShelfItem } from "@/lib/domain/user-domain";
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
    return context.redirect(encodeMessage("/shelf", "error", message));
  }

  let shelfItemId: string;
  try {
    shelfItemId = parseRequiredShelfItemId(form.get("shelfItemId"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać produktu z półki";
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
    const removedShelfItem = await removeUserShelfItem(supabase, user.id, shelfItemId);
    if (!removedShelfItem) {
      throw new Error("Nie znaleziono produktu na Twojej półce");
    }

    const successUrl = new URL(successRedirectTo, "https://shelfie.local");
    successUrl.searchParams.set("shelf", "removed");
    successUrl.searchParams.set("success", "Produkt został usunięty z Twojej półki.");

    return context.redirect(`${successUrl.pathname}${successUrl.search}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się usunąć produktu z półki";
    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }
};
