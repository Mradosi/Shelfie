import type { APIRoute } from "astro";
import { MAX_SHELF_ITEM_NOTE_LENGTH, updateUserShelfItemPreferences } from "@/lib/domain/user-domain";
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

function parseRequiredShelfItemId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Nie znaleziono produktu na Twojej półce");
  }

  return value.trim();
}

function parseNote(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length > MAX_SHELF_ITEM_NOTE_LENGTH) {
    throw new Error(`Notatka produktu musi mieć maksymalnie ${MAX_SHELF_ITEM_NOTE_LENGTH} znaków`);
  }

  return value;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  let successRedirectTo = "/shelf";
  let errorRedirectTo = "/shelf";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    setFlashMessage(context.cookies, {
      kind: "error",
      message: error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania",
    });
    return context.redirect("/shelf");
  }

  let shelfItemId: string;
  let note: string | null;
  try {
    shelfItemId = parseRequiredShelfItemId(form.get("shelfItemId"));
    note = parseNote(form.get("note"));
  } catch (error) {
    setFlashMessage(context.cookies, {
      kind: "error",
      message: error instanceof Error ? error.message : "Nie udało się odczytać preferencji produktu",
    });
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
    const shelfItem = await updateUserShelfItemPreferences(supabase, user.id, shelfItemId, {
      note,
      excludeFromAiRoutines: form.has("excludeFromAiRoutines"),
    });
    if (!shelfItem) {
      throw new Error("Nie znaleziono produktu na Twojej półce");
    }

    setFlashMessage(context.cookies, { kind: "success", message: "Preferencje produktu zostały zapisane." });
    return context.redirect(successRedirectTo);
  } catch (error) {
    setFlashMessage(context.cookies, {
      kind: "error",
      message: error instanceof Error ? error.message : "Nie udało się zapisać preferencji produktu",
    });
    return context.redirect(errorRedirectTo);
  }
};
