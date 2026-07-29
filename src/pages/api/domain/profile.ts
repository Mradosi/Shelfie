import type { APIRoute } from "astro";
import {
  getMissingUserDomainContractMessage,
  isMissingUserDomainContractError,
  SKIN_ASPECT_KEYS,
  SKIN_ASPECT_LEVELS,
  SKIN_TYPE_OPTIONS,
  upsertUserProfile,
  type SkinAspectKey,
  type SkinAspectLevel,
  type SkinAspects,
  type SkinType,
  type UserProfileInput,
} from "@/lib/domain/user-domain";
import {
  isValidQuestionnaireAnswers,
  mapQuestionnaireAnswersToSkinAspects,
} from "@/lib/domain/skin-profile-questionnaire";
import { setFlashMessage } from "@/lib/flash-message";
import { createClient } from "@/lib/supabase";

const MAX_TEXT_LENGTH = 80;
const MAX_LIST_ITEMS = 8;
const MAX_NOTES_LENGTH = 500;

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

function parseNotes(value: FormDataEntryValue | null) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Notatki muszą być tekstem");
  }

  const notes = value.trim();
  if (!notes) {
    return null;
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notatki muszą mieć maksymalnie ${MAX_NOTES_LENGTH} znaków`);
  }

  return notes;
}

function parseSkinType(value: FormDataEntryValue | null): SkinType | null {
  const skinType = parseOptionalText(value, "Typ skóry");
  if (skinType === null) {
    return null;
  }

  if (!(SKIN_TYPE_OPTIONS as readonly string[]).includes(skinType)) {
    throw new Error("Typ skóry musi być jedną z dostępnych opcji");
  }

  return skinType as SkinType;
}

function parseSkinAspectLevel(value: FormDataEntryValue | null, aspectKey: SkinAspectKey): SkinAspectLevel {
  if (typeof value !== "string") {
    throw new Error(`${aspectKey} must be selected`);
  }

  if (!(SKIN_ASPECT_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`${aspectKey} must use a supported level`);
  }

  return value as SkinAspectLevel;
}

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

function parseList(values: FormDataEntryValue[], fieldName: string, options?: { splitCommas?: boolean }) {
  if (values.length === 0) {
    return [];
  }

  const entries = values.flatMap((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`${fieldName} musi być tekstem`);
    }

    return (options?.splitCommas ? entry.split(",") : [entry]).map((item) => item.trim()).filter(Boolean);
  });

  if (entries.length > MAX_LIST_ITEMS) {
    throw new Error(`${fieldName} musi zawierać maksymalnie ${MAX_LIST_ITEMS} pozycji`);
  }

  const tooLongEntry = entries.find((entry) => entry.length > MAX_TEXT_LENGTH);
  if (tooLongEntry) {
    throw new Error(`${fieldName} muszą mieć maksymalnie ${MAX_TEXT_LENGTH} znaków`);
  }

  return Array.from(new Set(entries));
}

function parseSkinAspects(form: FormData): SkinAspects {
  return {
    sensitivity: parseSkinAspectLevel(form.get("skinAspect_sensitivity"), "sensitivity"),
    pigmentation: parseSkinAspectLevel(form.get("skinAspect_pigmentation"), "pigmentation"),
    firmness: parseSkinAspectLevel(form.get("skinAspect_firmness"), "firmness"),
    breakouts: parseSkinAspectLevel(form.get("skinAspect_breakouts"), "breakouts"),
    texture: parseSkinAspectLevel(form.get("skinAspect_texture"), "texture"),
  };
}

function parseQuestionnaireAnswers(form: FormData) {
  const rawValue = form.get("questionnaireAnswers");
  if (typeof rawValue !== "string") {
    throw new Error("Odpowiedzi z ankiety są wymagane");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("Odpowiedzi z ankiety muszą być poprawnym JSON-em");
  }

  if (!isValidQuestionnaireAnswers(parsed)) {
    throw new Error("Uzupełnij wszystkie odpowiedzi w ankiecie przed zapisem");
  }

  return parsed;
}

function parseProfileForm(form: FormData): UserProfileInput {
  const mode = form.get("mode");
  const submittedAspectKeys = SKIN_ASPECT_KEYS.filter((aspectKey) => form.has(`skinAspect_${aspectKey}`));
  const shouldSplitCommaSeparatedLists = mode !== "onboarding" && mode !== "edit";

  const skinAspects =
    mode === "onboarding"
      ? mapQuestionnaireAnswersToSkinAspects(parseQuestionnaireAnswers(form))
      : submittedAspectKeys.length === SKIN_ASPECT_KEYS.length
        ? parseSkinAspects(form)
        : (() => {
            throw new Error("Wszystkie obszary skóry muszą zostać uzupełnione");
          })();

  return {
    skinType: parseSkinType(form.get("skinType")),
    skinAspects,
    concerns: parseList(form.getAll("concerns"), "Potrzeby skóry", { splitCommas: shouldSplitCommaSeparatedLists }),
    goals: parseList(form.getAll("goals"), "Cele", { splitCommas: shouldSplitCommaSeparatedLists }),
    notes: parseNotes(form.get("notes")),
  };
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  let successRedirectTo = "/dashboard";
  let errorRedirectTo = "/dashboard";

  try {
    successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
    errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowa ścieżka przekierowania";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect("/dashboard");
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

  let profileInput: UserProfileInput;

  try {
    profileInput = parseProfileForm(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowe dane profilu";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect(errorRedirectTo);
  }

  try {
    await upsertUserProfile(supabase, user.id, profileInput);
  } catch (error) {
    if (isMissingUserDomainContractError(error)) {
      setFlashMessage(context.cookies, { kind: "error", message: getMissingUserDomainContractMessage() });
      return context.redirect(errorRedirectTo);
    }

    const message = error instanceof Error ? error.message : "Nie udało się zapisać profilu";
    setFlashMessage(context.cookies, { kind: "error", message });
    return context.redirect(errorRedirectTo);
  }

  const successMessage =
    successRedirectTo === "/onboarding/skin-profile/complete" ? "Profil został zapisany" : "Zmiany zostały zapisane";
  setFlashMessage(context.cookies, { kind: "success", message: successMessage });
  return context.redirect(successRedirectTo);
};
