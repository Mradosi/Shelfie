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
import { createClient } from "@/lib/supabase";

const DASHBOARD_ERROR_PATH = "/dashboard?error=";
const DASHBOARD_SUCCESS_PATH = "/dashboard?success=";
const MAX_TEXT_LENGTH = 80;
const MAX_LIST_ITEMS = 8;
const MAX_NOTES_LENGTH = 500;

function encodeMessage(path: string, message: string) {
  return `${path}${encodeURIComponent(message)}`;
}

function parseOptionalText(value: FormDataEntryValue | null, fieldName: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be text`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(`${fieldName} must be ${MAX_TEXT_LENGTH} characters or less`);
  }

  return trimmed;
}

function parseNotes(value: FormDataEntryValue | null) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Notes must be text");
  }

  const notes = value.trim();
  if (!notes) {
    return null;
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes must be ${MAX_NOTES_LENGTH} characters or less`);
  }

  return notes;
}

function parseSkinType(value: FormDataEntryValue | null): SkinType | null {
  const skinType = parseOptionalText(value, "Skin type");
  if (skinType === null) {
    return null;
  }

  if (!(SKIN_TYPE_OPTIONS as readonly string[]).includes(skinType)) {
    throw new Error("Skin type must be one of the supported options");
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

function parseList(value: FormDataEntryValue | null, fieldName: string) {
  if (value === null) {
    return [];
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be text`);
  }

  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length > MAX_LIST_ITEMS) {
    throw new Error(`${fieldName} must contain ${MAX_LIST_ITEMS} items or fewer`);
  }

  const tooLongEntry = values.find((entry) => entry.length > MAX_TEXT_LENGTH);
  if (tooLongEntry) {
    throw new Error(`${fieldName} entries must be ${MAX_TEXT_LENGTH} characters or less`);
  }

  return Array.from(new Set(values));
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

function parseProfileForm(form: FormData): UserProfileInput {
  const submittedAspectKeys = SKIN_ASPECT_KEYS.filter((aspectKey) => form.has(`skinAspect_${aspectKey}`));
  if (submittedAspectKeys.length !== SKIN_ASPECT_KEYS.length) {
    throw new Error("All skin aspects must be provided");
  }

  return {
    skinType: parseSkinType(form.get("skinType")),
    skinAspects: parseSkinAspects(form),
    concerns: parseList(form.get("concerns"), "Concerns"),
    goals: parseList(form.get("goals"), "Goals"),
    notes: parseNotes(form.get("notes")),
  };
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(encodeMessage(DASHBOARD_ERROR_PATH, "Supabase is not configured"));
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return context.redirect(encodeMessage(DASHBOARD_ERROR_PATH, authError.message));
  }

  if (!user) {
    return context.redirect("/auth/signin");
  }

  let profileInput: UserProfileInput;

  try {
    profileInput = parseProfileForm(await context.request.formData());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid profile payload";
    return context.redirect(encodeMessage(DASHBOARD_ERROR_PATH, message));
  }

  try {
    await upsertUserProfile(supabase, user.id, profileInput);
  } catch (error) {
    if (isMissingUserDomainContractError(error)) {
      return context.redirect(encodeMessage(DASHBOARD_ERROR_PATH, getMissingUserDomainContractMessage()));
    }

    const message = error instanceof Error ? error.message : "Could not save profile";
    return context.redirect(encodeMessage(DASHBOARD_ERROR_PATH, message));
  }

  return context.redirect(encodeMessage(DASHBOARD_SUCCESS_PATH, "Profile saved"));
};
