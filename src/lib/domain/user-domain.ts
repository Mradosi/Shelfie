import { createClient } from "@/lib/supabase";

type UserDomainClient = NonNullable<ReturnType<typeof createClient>>;

const USER_PROFILE_COLUMNS = "user_id, skin_type, skin_aspects, concerns, goals, notes, created_at, updated_at";
const USER_SHELF_ITEM_COLUMNS = "id, user_id, product_id, created_at, updated_at";
const USER_ROUTINE_CONFIG_COLUMNS = "user_id, schedule, created_at, updated_at";

export const SKIN_TYPE_OPTIONS = ["dry", "oily", "combination", "normal", "balanced", "not_sure"] as const;
export const SKIN_ASPECT_KEYS = ["sensitivity", "pigmentation", "firmness", "breakouts", "texture"] as const;
export const SKIN_ASPECT_LEVELS = ["none", "low", "medium", "high"] as const;

export type SkinType = (typeof SKIN_TYPE_OPTIONS)[number];
export type SkinAspectKey = (typeof SKIN_ASPECT_KEYS)[number];
export type SkinAspectLevel = (typeof SKIN_ASPECT_LEVELS)[number];

export const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  dry: "Dry",
  oily: "Oily",
  combination: "Combination",
  normal: "Normal",
  balanced: "Balanced",
  not_sure: "Not sure",
};

export const SKIN_ASPECT_LABELS: Record<SkinAspectKey, string> = {
  sensitivity: "Sensitivity",
  pigmentation: "Tone / pigmentation",
  firmness: "Elasticity / firmness / lines",
  breakouts: "Breakouts / congestion",
  texture: "Texture",
};

export const SKIN_ASPECT_LEVEL_LABELS: Record<SkinAspectLevel, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

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

export interface UserShelfItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineScheduleEntry {
  shelf_item_id: string;
}

export type RoutineScheduleSection = Record<string, RoutineScheduleEntry[]>;
export type RoutineSchedule = Record<string, RoutineScheduleSection>;

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

function normalizeRoutineSchedule(schedule: unknown): RoutineSchedule {
  if (!isRecord(schedule)) {
    return {};
  }

  const normalized: RoutineSchedule = {};

  for (const [dayKey, dayValue] of Object.entries(schedule)) {
    if (!isRecord(dayValue)) {
      continue;
    }

    const sections: RoutineScheduleSection = {};

    for (const [sectionKey, sectionValue] of Object.entries(dayValue)) {
      if (!Array.isArray(sectionValue)) {
        continue;
      }

      sections[sectionKey] = sectionValue.flatMap((item) => {
        if (!isRecord(item) || typeof item.shelf_item_id !== "string" || !item.shelf_item_id.trim()) {
          return [];
        }

        return [{ shelf_item_id: item.shelf_item_id }];
      });
    }

    normalized[dayKey] = sections;
  }

  return normalized;
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
  return "User domain tables are not available yet. Run `supabase db reset` or apply the latest migrations, then reload the dashboard.";
}

export async function getUserProfile(supabase: UserDomainClient, userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(USER_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load user profile: ${error.message}`);
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
    throw new Error(`Could not save user profile: ${error.message}`);
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
    throw new Error(`Could not load shelf items: ${error.message}`);
  }

  return data.map((row) => mapUserShelfItem(row));
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
    throw new Error(`Could not add shelf item: ${error.message}`);
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
    throw new Error(`Could not remove shelf item: ${error.message}`);
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
    throw new Error(`Could not load routine config: ${error.message}`);
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
    throw new Error(`Could not save routine config: ${error.message}`);
  }

  return mapUserRoutineConfig(data);
}
