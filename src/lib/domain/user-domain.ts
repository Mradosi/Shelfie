import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeRoutineSchedule,
  type RoutineRole,
  type RoutineSchedule,
  type RoutineScheduleEntry,
} from "@/lib/domain/routine-schedule";

type UserDomainClient = SupabaseClient;

const USER_PROFILE_COLUMNS = "user_id, skin_type, skin_aspects, concerns, goals, notes, created_at, updated_at";
const USER_SHELF_ITEM_COLUMNS = "id, user_id, product_id, created_at, updated_at";
const USER_SHELF_CATALOG_COLUMNS =
  "id, user_id, product_id, created_at, updated_at, product:products!user_shelf_items_product_id_fkey(id, name, brand, category, source_image_url, stored_image_url)";
const USER_ROUTINE_CONFIG_COLUMNS = "user_id, schedule, created_at, updated_at";

export const SKIN_TYPE_OPTIONS = ["dry", "oily", "combination", "normal", "balanced", "not_sure"] as const;
export const SKIN_ASPECT_KEYS = ["sensitivity", "pigmentation", "firmness", "breakouts", "texture"] as const;
export const SKIN_ASPECT_LEVELS = ["none", "low", "medium", "high"] as const;

export type SkinType = (typeof SKIN_TYPE_OPTIONS)[number];
export type SkinAspectKey = (typeof SKIN_ASPECT_KEYS)[number];
export type SkinAspectLevel = (typeof SKIN_ASPECT_LEVELS)[number];

export const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  dry: "Sucha",
  oily: "Tłusta",
  combination: "Mieszana",
  normal: "Normalna",
  balanced: "Zrównoważona",
  not_sure: "Nie mam pewności",
};

export const SKIN_ASPECT_LABELS: Record<SkinAspectKey, string> = {
  sensitivity: "Wrażliwość",
  pigmentation: "Koloryt / przebarwienia",
  firmness: "Jędrność / sprężystość / linie",
  breakouts: "Niedoskonałości / zapychanie",
  texture: "Tekstura",
};

export const SKIN_ASPECT_LEVEL_LABELS: Record<SkinAspectLevel, string> = {
  none: "Brak",
  low: "Niskie",
  medium: "Średnie",
  high: "Wysokie",
};

export const SKIN_ASPECT_LEVEL_LABELS_BY_ASPECT: Record<SkinAspectKey, Record<SkinAspectLevel, string>> = {
  sensitivity: {
    none: "Brak wrażliwości",
    low: "Lekka wrażliwość",
    medium: "Wyraźna wrażliwość",
    high: "Bardzo wysoka wrażliwość",
  },
  pigmentation: {
    none: "Brak widocznego problemu",
    low: "Lekkie przebarwienia",
    medium: "Wyraźne przebarwienia",
    high: "Bardzo widoczne przebarwienia",
  },
  firmness: {
    none: "Skóra wygląda na jędrną",
    low: "Lekko widoczne oznaki",
    medium: "Wyraźnie widoczne oznaki",
    high: "Bardzo widoczne oznaki",
  },
  breakouts: {
    none: "Brak problemu",
    low: "Pojedyncze zmiany",
    medium: "Częste niedoskonałości",
    high: "Duże nasilenie zmian",
  },
  texture: {
    none: "Gładka powierzchnia",
    low: "Lekko nierówna tekstura",
    medium: "Wyraźnie nierówna tekstura",
    high: "Mocno nierówna tekstura",
  },
};

export function getSkinAspectLevelLabel(aspectKey: SkinAspectKey, level: SkinAspectLevel) {
  return SKIN_ASPECT_LEVEL_LABELS_BY_ASPECT[aspectKey][level];
}

interface UserProfileRow {
  user_id: string;
  skin_type: string | null;
  skin_aspects: unknown;
  concerns: string[] | null;
  goals: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UserShelfItemRow {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
  updated_at: string;
}

interface UserRoutineConfigRow {
  user_id: string;
  schedule: unknown;
  created_at: string;
  updated_at: string;
}

interface UserShelfCatalogProductRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  source_image_url: string | null;
  stored_image_url: string | null;
}

interface UserShelfCatalogRow extends UserShelfItemRow {
  product: UserShelfCatalogProductRow | UserShelfCatalogProductRow[] | null;
}

export interface SkinAspects {
  sensitivity: SkinAspectLevel;
  pigmentation: SkinAspectLevel;
  firmness: SkinAspectLevel;
  breakouts: SkinAspectLevel;
  texture: SkinAspectLevel;
}

export interface UserProfile {
  userId: string;
  skinType: SkinType | null;
  skinAspects: SkinAspects;
  concerns: string[];
  goals: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  skinType: SkinType | null;
  skinAspects: SkinAspects;
  concerns: string[];
  goals: string[];
  notes: string | null;
}

export interface UserProfileInterpretationBasis {
  skinType: SkinType | null;
  skinAspects: SkinAspects;
  concerns: string[];
  goals: string[];
}

export interface UserShelfItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserShelfCatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
}

export interface UserShelfCatalogItem extends UserShelfItem {
  product: UserShelfCatalogProduct;
}

export interface UserRoutineConfig {
  userId: string;
  schedule: RoutineSchedule;
  createdAt: string;
  updatedAt: string;
}

const MISSING_DOMAIN_CONTRACT_PATTERNS = [
  "could not find the table 'public.user_profiles' in the schema cache",
  "could not find the table 'public.user_shelf_items' in the schema cache",
  "could not find the table 'public.user_routine_configs' in the schema cache",
  'relation "public.user_profiles" does not exist',
  'relation "public.user_shelf_items" does not exist',
  'relation "public.user_routine_configs" does not exist',
];

export function createDefaultSkinAspects(): SkinAspects {
  return {
    sensitivity: "none",
    pigmentation: "none",
    firmness: "none",
    breakouts: "none",
    texture: "none",
  };
}

export function createEmptyUserProfile(): UserProfileInput {
  return {
    skinType: null,
    skinAspects: createDefaultSkinAspects(),
    concerns: [],
    goals: [],
    notes: null,
  };
}

export function createUserProfileInterpretationBasis(profile: unknown): UserProfileInterpretationBasis {
  const candidate = isRecord(profile) ? profile : {};

  return {
    skinType: normalizeSkinType(candidate.skinType),
    skinAspects: normalizeSkinAspects(candidate.skinAspects),
    concerns: normalizeDistinctStringArray(candidate.concerns),
    goals: normalizeDistinctStringArray(candidate.goals),
  };
}

export function isUserProfileComplete(profile: Pick<UserProfile, "skinType" | "skinAspects"> | null) {
  if (!profile?.skinType) {
    return false;
  }

  return SKIN_ASPECT_KEYS.every((aspectKey) => isSkinAspectLevel(profile.skinAspects[aspectKey]));
}

function isSkinType(value: unknown): value is SkinType {
  return typeof value === "string" && (SKIN_TYPE_OPTIONS as readonly string[]).includes(value);
}

function isSkinAspectLevel(value: unknown): value is SkinAspectLevel {
  return typeof value === "string" && (SKIN_ASPECT_LEVELS as readonly string[]).includes(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeDistinctStringArray(value: unknown) {
  return Array.from(
    new Set(
      asStringArray(value)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "pl"));
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSkinType(value: unknown): SkinType | null {
  return isSkinType(value) ? value : null;
}

function normalizeSkinAspects(value: unknown): SkinAspects {
  const defaults = createDefaultSkinAspects();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    sensitivity: isSkinAspectLevel(value.sensitivity) ? value.sensitivity : defaults.sensitivity,
    pigmentation: isSkinAspectLevel(value.pigmentation) ? value.pigmentation : defaults.pigmentation,
    firmness: isSkinAspectLevel(value.firmness) ? value.firmness : defaults.firmness,
    breakouts: isSkinAspectLevel(value.breakouts) ? value.breakouts : defaults.breakouts,
    texture: isSkinAspectLevel(value.texture) ? value.texture : defaults.texture,
  };
}

function mapUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    skinType: normalizeSkinType(row.skin_type),
    skinAspects: normalizeSkinAspects(row.skin_aspects),
    concerns: asStringArray(row.concerns),
    goals: asStringArray(row.goals),
    notes: normalizeOptionalText(row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserShelfItem(row: UserShelfItemRow): UserShelfItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoutineScheduleEntry(entry: RoutineScheduleEntry): RoutineScheduleEntry {
  return {
    shelf_item_id: entry.shelf_item_id,
    routine_role: entry.routine_role,
  };
}

export function createRoutineScheduleEntry(shelfItemId: string, routineRole: RoutineRole): RoutineScheduleEntry {
  return mapRoutineScheduleEntry({
    shelf_item_id: shelfItemId,
    routine_role: routineRole,
  });
}

function mapUserShelfCatalogProduct(row: UserShelfCatalogProductRow): UserShelfCatalogProduct {
  return {
    id: row.id,
    name: row.name,
    brand: normalizeOptionalText(row.brand),
    category: normalizeOptionalText(row.category),
    imageUrl: normalizeOptionalText(row.stored_image_url) ?? normalizeOptionalText(row.source_image_url),
  };
}

function mapUserShelfCatalogItem(row: UserShelfCatalogRow): UserShelfCatalogItem {
  const productRow = Array.isArray(row.product) ? row.product[0] : row.product;

  if (!productRow || typeof productRow.id !== "string" || typeof productRow.name !== "string") {
    throw new Error(`Nie udało się wczytać danych produktu dla shelf itemu ${row.id}`);
  }

  return {
    ...mapUserShelfItem(row),
    product: mapUserShelfCatalogProduct(productRow),
  };
}

function mapUserRoutineConfig(row: UserRoutineConfigRow): UserRoutineConfig {
  return {
    userId: row.user_id,
    schedule: normalizeRoutineSchedule(row.schedule),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isMissingUserDomainContractError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return MISSING_DOMAIN_CONTRACT_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

export function getMissingUserDomainContractMessage() {
  return "Tabele domeny użytkownika nie są jeszcze dostępne. Uruchom `npx supabase migration up`, a potem odśwież panel.";
}

export async function getUserProfile(supabase: UserDomainClient, userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(USER_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wczytać profilu użytkownika: ${error.message}`);
  }

  return data ? mapUserProfile(data) : null;
}

export async function upsertUserProfile(supabase: UserDomainClient, userId: string, profile: UserProfileInput) {
  const payload = {
    user_id: userId,
    skin_type: profile.skinType,
    skin_aspects: profile.skinAspects,
    concerns: profile.concerns,
    goals: profile.goals,
    notes: normalizeOptionalText(profile.notes),
  };

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(USER_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać profilu użytkownika: ${error.message}`);
  }

  return mapUserProfile(data);
}

export async function listUserShelfItems(supabase: UserDomainClient, userId: string) {
  const { data, error } = await supabase
    .from("user_shelf_items")
    .select(USER_SHELF_ITEM_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nie udało się wczytać produktów na półce: ${error.message}`);
  }

  return data.map((row) => mapUserShelfItem(row));
}

export async function listUserShelfCatalog(supabase: UserDomainClient, userId: string) {
  const { data, error } = await supabase
    .from("user_shelf_items")
    .select(USER_SHELF_CATALOG_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nie udało się wczytać katalogu produktów na półce: ${error.message}`);
  }

  return data.map((row) => mapUserShelfCatalogItem(row as UserShelfCatalogRow));
}

export async function addUserShelfItem(supabase: UserDomainClient, userId: string, productId: string) {
  const { data, error } = await supabase
    .from("user_shelf_items")
    .insert({
      user_id: userId,
      product_id: productId,
    })
    .select(USER_SHELF_ITEM_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się dodać produktu na półkę: ${error.message}`);
  }

  return mapUserShelfItem(data);
}

export async function removeUserShelfItem(supabase: UserDomainClient, userId: string, shelfItemId: string) {
  const { data, error } = await supabase
    .from("user_shelf_items")
    .delete()
    .eq("user_id", userId)
    .eq("id", shelfItemId)
    .select(USER_SHELF_ITEM_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się usunąć produktu z półki: ${error.message}`);
  }

  return data ? mapUserShelfItem(data) : null;
}

export async function getUserRoutineConfig(supabase: UserDomainClient, userId: string) {
  const { data, error } = await supabase
    .from("user_routine_configs")
    .select(USER_ROUTINE_CONFIG_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wczytać konfiguracji rutyny: ${error.message}`);
  }

  return data ? mapUserRoutineConfig(data) : null;
}

export async function upsertUserRoutineConfig(supabase: UserDomainClient, userId: string, schedule: RoutineSchedule) {
  const normalizedSchedule = normalizeRoutineSchedule(schedule);

  const { data, error } = await supabase
    .from("user_routine_configs")
    .upsert(
      {
        user_id: userId,
        schedule: normalizedSchedule,
      },
      { onConflict: "user_id" },
    )
    .select(USER_ROUTINE_CONFIG_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać konfiguracji rutyny: ${error.message}`);
  }

  return mapUserRoutineConfig(data);
}
