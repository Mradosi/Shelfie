import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProductInterpretationBasis,
  getSharedProductById,
  type SharedProduct,
  type SharedProductInterpretationBasis,
} from "@/lib/domain/product-domain";
import {
  createUserProfileInterpretationBasis,
  getUserProfile,
  isUserProfileComplete,
  type UserProfile,
  type UserProfileInterpretationBasis,
} from "@/lib/domain/user-domain";
import {
  analyzeProductFit,
  PRODUCT_FIT_MODEL_VERSION,
  PRODUCT_FIT_PROMPT_VERSION,
} from "@/lib/integrations/openrouter-product-fit";

type ProductInterpretationClient = SupabaseClient;

const USER_PRODUCT_INTERPRETATION_COLUMNS = [
  "id",
  "user_id",
  "product_id",
  "status",
  "fit_status",
  "fit_score",
  "confidence",
  "summary_short",
  "reasoning_short",
  "recommended_for",
  "caution_for",
  "warnings",
  "profile_basis",
  "product_basis",
  "model_version",
  "prompt_version",
  "generated_at",
  "stale_at",
  "stale_reason",
  "last_error",
  "created_at",
  "updated_at",
].join(", ");

export const INTERPRETATION_STATUS_OPTIONS = ["pending", "ready", "failed", "stale"] as const;
export const FIT_STATUS_OPTIONS = ["recommended", "mixed", "not_recommended", "insufficient_data"] as const;
export const INTERPRETATION_CONFIDENCE_OPTIONS = ["high", "medium", "low"] as const;
export const INTERPRETATION_WARNING_SEVERITY_OPTIONS = ["low", "medium", "high"] as const;

export type InterpretationStatus = (typeof INTERPRETATION_STATUS_OPTIONS)[number];
export type FitStatus = (typeof FIT_STATUS_OPTIONS)[number];
export type InterpretationConfidence = (typeof INTERPRETATION_CONFIDENCE_OPTIONS)[number];
export type InterpretationWarningSeverity = (typeof INTERPRETATION_WARNING_SEVERITY_OPTIONS)[number];

interface UserProductInterpretationRow {
  id: string;
  user_id: string;
  product_id: string;
  status: string;
  fit_status: string | null;
  fit_score: number | null;
  confidence: string | null;
  summary_short: string | null;
  reasoning_short: string | null;
  recommended_for: unknown;
  caution_for: unknown;
  warnings: unknown;
  profile_basis: unknown;
  product_basis: unknown;
  model_version: string | null;
  prompt_version: string | null;
  generated_at: string | null;
  stale_at: string | null;
  stale_reason: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterpretationTag {
  code: string;
  label: string;
  reason: string;
}

export interface InterpretationWarning {
  code: string;
  severity: InterpretationWarningSeverity;
  message: string;
}

export interface UserProductInterpretation {
  id: string;
  userId: string;
  productId: string;
  status: InterpretationStatus;
  fitStatus: FitStatus | null;
  fitScore: number | null;
  confidence: InterpretationConfidence | null;
  summaryShort: string | null;
  reasoningShort: string | null;
  recommendedFor: InterpretationTag[];
  cautionFor: InterpretationTag[];
  warnings: InterpretationWarning[];
  profileBasis: UserProfileInterpretationBasis;
  productBasis: SharedProductInterpretationBasis;
  modelVersion: string | null;
  promptVersion: string | null;
  generatedAt: string | null;
  staleAt: string | null;
  staleReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReadyUserProductInterpretationInput {
  userId: string;
  productId: string;
  fitStatus: FitStatus;
  fitScore: number | null;
  confidence: InterpretationConfidence | null;
  summaryShort: string | null;
  reasoningShort: string | null;
  recommendedFor: InterpretationTag[];
  cautionFor: InterpretationTag[];
  warnings: InterpretationWarning[];
  profileBasis: UserProfileInterpretationBasis;
  productBasis: SharedProductInterpretationBasis;
  modelVersion: string | null;
  promptVersion: string | null;
  generatedAt?: string | null;
}

export interface FailedUserProductInterpretationInput {
  userId: string;
  productId: string;
  errorMessage: string;
  profileBasis?: UserProfileInterpretationBasis;
  productBasis?: SharedProductInterpretationBasis;
  modelVersion?: string | null;
  promptVersion?: string | null;
}

export interface InterpretationStaleCheckInput {
  interpretation: Pick<
    UserProductInterpretation,
    "status" | "profileBasis" | "productBasis" | "promptVersion" | "modelVersion"
  >;
  profileBasis: UserProfileInterpretationBasis;
  productBasis: SharedProductInterpretationBasis;
  promptVersion?: string | null;
  modelVersion?: string | null;
}

export interface UserScopedProductDetails {
  product: SharedProduct;
  profile: UserProfile;
  interpretation: UserProductInterpretation;
}

export type InterpretationGenerationAction = "start" | "retry" | "refresh";

export interface ProductInterpretationPreparationFailure {
  productId: string;
  message: string;
}

export interface ProductInterpretationPreparationResult {
  ready: UserProductInterpretation[];
  failures: ProductInterpretationPreparationFailure[];
}

function isInterpretationStatus(value: unknown): value is InterpretationStatus {
  return typeof value === "string" && (INTERPRETATION_STATUS_OPTIONS as readonly string[]).includes(value);
}

function isFitStatus(value: unknown): value is FitStatus {
  return typeof value === "string" && (FIT_STATUS_OPTIONS as readonly string[]).includes(value);
}

function isInterpretationConfidence(value: unknown): value is InterpretationConfidence {
  return typeof value === "string" && (INTERPRETATION_CONFIDENCE_OPTIONS as readonly string[]).includes(value);
}

function isInterpretationWarningSeverity(value: unknown): value is InterpretationWarningSeverity {
  return typeof value === "string" && (INTERPRETATION_WARNING_SEVERITY_OPTIONS as readonly string[]).includes(value);
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInterpretationTagArray(value: unknown): InterpretationTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const code = normalizeOptionalText(typeof item.code === "string" ? item.code : null);
    const label = normalizeOptionalText(typeof item.label === "string" ? item.label : null);
    const reason = normalizeOptionalText(typeof item.reason === "string" ? item.reason : null);
    if (!code || !label || !reason) {
      return [];
    }

    return [{ code, label, reason }];
  });
}

function normalizeInterpretationWarnings(value: unknown): InterpretationWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const code = normalizeOptionalText(typeof item.code === "string" ? item.code : null);
    const message = normalizeOptionalText(typeof item.message === "string" ? item.message : null);
    if (!code || !message || !isInterpretationWarningSeverity(item.severity)) {
      return [];
    }

    return [{ code, severity: item.severity, message }];
  });
}

function normalizeFitScore(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapUserProductInterpretation(row: UserProductInterpretationRow): UserProductInterpretation {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    status: isInterpretationStatus(row.status) ? row.status : "pending",
    fitStatus: isFitStatus(row.fit_status) ? row.fit_status : null,
    fitScore: normalizeFitScore(row.fit_score),
    confidence: isInterpretationConfidence(row.confidence) ? row.confidence : null,
    summaryShort: normalizeOptionalText(row.summary_short),
    reasoningShort: normalizeOptionalText(row.reasoning_short),
    recommendedFor: normalizeInterpretationTagArray(row.recommended_for),
    cautionFor: normalizeInterpretationTagArray(row.caution_for),
    warnings: normalizeInterpretationWarnings(row.warnings),
    profileBasis: createUserProfileInterpretationBasis(row.profile_basis),
    productBasis: createProductInterpretationBasis(row.product_basis),
    modelVersion: normalizeOptionalText(row.model_version),
    promptVersion: normalizeOptionalText(row.prompt_version),
    generatedAt: row.generated_at,
    staleAt: row.stale_at,
    staleReason: normalizeOptionalText(row.stale_reason),
    lastError: normalizeOptionalText(row.last_error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areProfileBasesEqual(left: UserProfileInterpretationBasis, right: UserProfileInterpretationBasis) {
  return (
    left.skinType === right.skinType &&
    left.skinAspects.sensitivity === right.skinAspects.sensitivity &&
    left.skinAspects.pigmentation === right.skinAspects.pigmentation &&
    left.skinAspects.firmness === right.skinAspects.firmness &&
    left.skinAspects.breakouts === right.skinAspects.breakouts &&
    left.skinAspects.texture === right.skinAspects.texture &&
    areStringArraysEqual(left.concerns, right.concerns) &&
    areStringArraysEqual(left.goals, right.goals)
  );
}

function areProductBasesEqual(left: SharedProductInterpretationBasis, right: SharedProductInterpretationBasis) {
  return (
    left.category === right.category &&
    left.inciConfidence === right.inciConfidence &&
    left.inciUpdatedAt === right.inciUpdatedAt &&
    areStringArraysEqual(left.inciList, right.inciList)
  );
}

function buildPendingInterpretationPayload(userId: string, productId: string) {
  return {
    user_id: userId,
    product_id: productId,
    status: "pending" satisfies InterpretationStatus,
  };
}

export function getInterpretationStaleReason(input: InterpretationStaleCheckInput) {
  if (input.interpretation.status !== "ready") {
    return null;
  }

  if (!areProfileBasesEqual(input.interpretation.profileBasis, input.profileBasis)) {
    return "profile_basis_changed";
  }

  if (!areProductBasesEqual(input.interpretation.productBasis, input.productBasis)) {
    return "product_basis_changed";
  }

  const nextPromptVersion = normalizeOptionalText(input.promptVersion);
  if (nextPromptVersion && nextPromptVersion !== input.interpretation.promptVersion) {
    return "prompt_version_changed";
  }

  const nextModelVersion = normalizeOptionalText(input.modelVersion);
  if (nextModelVersion && nextModelVersion !== input.interpretation.modelVersion) {
    return "model_version_changed";
  }

  return null;
}

export function shouldMarkInterpretationStale(input: InterpretationStaleCheckInput) {
  return getInterpretationStaleReason(input) !== null;
}

export async function getUserProductInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
) {
  const { data, error } = await supabase
    .from("user_product_interpretations")
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wczytać interpretacji produktu: ${error.message}`);
  }

  return data ? mapUserProductInterpretation(data as UserProductInterpretationRow) : null;
}

export async function listUserProductInterpretations(
  supabase: ProductInterpretationClient,
  userId: string,
  productIds: string[],
) {
  const uniqueProductIds = Array.from(new Set(productIds.map((productId) => productId.trim()).filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_product_interpretations")
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .eq("user_id", userId)
    .in("product_id", uniqueProductIds);

  if (error) {
    throw new Error(`Nie udało się wczytać interpretacji produktów: ${error.message}`);
  }

  return data.map((row) => mapUserProductInterpretation(row as UserProductInterpretationRow));
}

export async function ensurePendingUserProductInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
) {
  const existing = await getUserProductInterpretation(supabase, userId, productId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("user_product_interpretations")
    .insert(buildPendingInterpretationPayload(userId, productId))
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate key")) {
      const concurrentRecord = await getUserProductInterpretation(supabase, userId, productId);
      if (concurrentRecord) {
        return concurrentRecord;
      }
    }

    throw new Error(`Nie udało się utworzyć oczekującej interpretacji produktu: ${error.message}`);
  }

  return mapUserProductInterpretation(data as UserProductInterpretationRow);
}

export async function markInterpretationStale(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
  staleReason: string,
) {
  const { data, error } = await supabase
    .from("user_product_interpretations")
    .update({
      status: "stale" satisfies InterpretationStatus,
      stale_at: new Date().toISOString(),
      stale_reason: staleReason.trim(),
    })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się oznaczyć interpretacji jako nieaktualnej: ${error.message}`);
  }

  return mapUserProductInterpretation(data as UserProductInterpretationRow);
}

export async function saveReadyUserProductInterpretation(
  supabase: ProductInterpretationClient,
  input: ReadyUserProductInterpretationInput,
) {
  const payload = {
    user_id: input.userId,
    product_id: input.productId,
    status: "ready" satisfies InterpretationStatus,
    fit_status: input.fitStatus,
    fit_score: normalizeFitScore(input.fitScore),
    confidence: input.confidence,
    summary_short: normalizeOptionalText(input.summaryShort),
    reasoning_short: normalizeOptionalText(input.reasoningShort),
    recommended_for: normalizeInterpretationTagArray(input.recommendedFor),
    caution_for: normalizeInterpretationTagArray(input.cautionFor),
    warnings: normalizeInterpretationWarnings(input.warnings),
    profile_basis: createUserProfileInterpretationBasis(input.profileBasis),
    product_basis: createProductInterpretationBasis(input.productBasis),
    model_version: normalizeOptionalText(input.modelVersion),
    prompt_version: normalizeOptionalText(input.promptVersion),
    generated_at: input.generatedAt ?? new Date().toISOString(),
    stale_at: null,
    stale_reason: null,
    last_error: null,
  };

  const { data, error } = await supabase
    .from("user_product_interpretations")
    .upsert(payload, { onConflict: "user_id,product_id" })
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać gotowej interpretacji produktu: ${error.message}`);
  }

  return mapUserProductInterpretation(data as UserProductInterpretationRow);
}

export async function markFailedUserProductInterpretation(
  supabase: ProductInterpretationClient,
  input: FailedUserProductInterpretationInput,
) {
  const payload = {
    user_id: input.userId,
    product_id: input.productId,
    status: "failed" satisfies InterpretationStatus,
    profile_basis: createUserProfileInterpretationBasis(input.profileBasis),
    product_basis: createProductInterpretationBasis(input.productBasis),
    model_version: normalizeOptionalText(input.modelVersion),
    prompt_version: normalizeOptionalText(input.promptVersion),
    last_error: normalizeOptionalText(input.errorMessage) ?? "Nieznany błąd generowania analizy",
  };

  const { data, error } = await supabase
    .from("user_product_interpretations")
    .upsert(payload, { onConflict: "user_id,product_id" })
    .select(USER_PRODUCT_INTERPRETATION_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać błędu interpretacji produktu: ${error.message}`);
  }

  return mapUserProductInterpretation(data as UserProductInterpretationRow);
}

async function loadProductAndCompleteProfile(supabase: ProductInterpretationClient, userId: string, productId: string) {
  const [product, profile] = await Promise.all([
    getSharedProductById(supabase, productId),
    getUserProfile(supabase, userId),
  ]);
  if (!product) {
    throw new Error("Nie znaleziono produktu w shared bazie");
  }

  if (!isUserProfileComplete(profile)) {
    throw new Error("Uzupełnij profil skóry przed uruchomieniem analizy produktu");
  }

  return { product, profile };
}

async function getFreshInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  product: SharedProduct,
  profile: UserProfile,
) {
  const profileBasis = createUserProfileInterpretationBasis(profile);
  const productBasis = createProductInterpretationBasis(product);
  const current = await getUserProductInterpretation(supabase, userId, product.id);

  if (!current) {
    return ensurePendingUserProductInterpretation(supabase, userId, product.id);
  }

  const staleReason = getInterpretationStaleReason({
    interpretation: current,
    profileBasis,
    productBasis,
    promptVersion: PRODUCT_FIT_PROMPT_VERSION,
    modelVersion: PRODUCT_FIT_MODEL_VERSION,
  });

  return staleReason ? markInterpretationStale(supabase, userId, product.id, staleReason) : current;
}

export async function getUserScopedProductDetails(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
): Promise<UserScopedProductDetails> {
  const { product, profile } = await loadProductAndCompleteProfile(supabase, userId, productId);
  const interpretation = await getFreshInterpretation(supabase, userId, product, profile);

  return { product, profile, interpretation };
}

export async function startInterpretationGeneration(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
) {
  return generateInterpretation(supabase, userId, productId, "start");
}

export async function refreshStaleInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
) {
  return generateInterpretation(supabase, userId, productId, "refresh");
}

export async function retryFailedInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
) {
  return generateInterpretation(supabase, userId, productId, "retry");
}

export async function prepareUserProductInterpretations(
  supabase: ProductInterpretationClient,
  userId: string,
  productIds: string[],
): Promise<ProductInterpretationPreparationResult> {
  const uniqueProductIds = Array.from(new Set(productIds.map((productId) => productId.trim()).filter(Boolean)));
  const result: ProductInterpretationPreparationResult = { ready: [], failures: [] };

  // Keep provider work bounded even when a user has a large shelf.
  for (const productId of uniqueProductIds) {
    try {
      const { interpretation } = await getUserScopedProductDetails(supabase, userId, productId);
      const nextInterpretation =
        interpretation.status === "ready"
          ? interpretation
          : interpretation.status === "failed"
            ? await retryFailedInterpretation(supabase, userId, productId)
            : interpretation.status === "stale"
              ? await refreshStaleInterpretation(supabase, userId, productId)
              : await startInterpretationGeneration(supabase, userId, productId);

      if (nextInterpretation.status === "ready") {
        result.ready.push(nextInterpretation);
      } else {
        result.failures.push({
          productId,
          message: nextInterpretation.lastError ?? "Analiza produktu nie została ukończona.",
        });
      }
    } catch (error) {
      result.failures.push({
        productId,
        message: error instanceof Error ? error.message : "Nie udało się przygotować analizy produktu.",
      });
    }
  }

  return result;
}

async function generateInterpretation(
  supabase: ProductInterpretationClient,
  userId: string,
  productId: string,
  action: InterpretationGenerationAction,
) {
  const { product, profile } = await loadProductAndCompleteProfile(supabase, userId, productId);
  const interpretation = await getFreshInterpretation(supabase, userId, product, profile);

  if (interpretation.status === "ready") {
    return interpretation;
  }

  if (action === "retry" && interpretation.status !== "failed") {
    throw new Error("Ponowienie jest dostępne tylko dla nieudanej analizy");
  }

  if (action === "refresh" && interpretation.status !== "stale") {
    throw new Error("Odświeżenie jest dostępne tylko dla nieaktualnej analizy");
  }

  const profileBasis = createUserProfileInterpretationBasis(profile);
  const productBasis = createProductInterpretationBasis(product);

  try {
    const analysis = await analyzeProductFit(product, profileBasis);
    return await saveReadyUserProductInterpretation(supabase, {
      userId,
      productId,
      ...analysis,
      profileBasis,
      productBasis,
      modelVersion: PRODUCT_FIT_MODEL_VERSION,
      promptVersion: PRODUCT_FIT_PROMPT_VERSION,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Nie udało się wygenerować analizy produktu";
    return markFailedUserProductInterpretation(supabase, {
      userId,
      productId,
      errorMessage,
      profileBasis,
      productBasis,
      modelVersion: PRODUCT_FIT_MODEL_VERSION,
      promptVersion: PRODUCT_FIT_PROMPT_VERSION,
    });
  }
}
