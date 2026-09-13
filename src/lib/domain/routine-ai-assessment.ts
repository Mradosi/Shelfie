import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedProduct } from "@/lib/domain/product-domain";
import type { UserProductInterpretation } from "@/lib/domain/product-interpretation";
import {
  ROUTINE_AI_ASSESSMENT_INPUT_VERSION,
  type RoutineAiAssessment,
  type RoutineAiShelfInput,
} from "@/lib/domain/routine-ai";
import { BASE_ROUTINE_SECTION_KEYS, type BaseRoutineDraft } from "@/lib/domain/routine-schedule";
import type { UserProfileInterpretationBasis, UserShelfCatalogItem } from "@/lib/domain/user-domain";

type RoutineAiAssessmentClient = SupabaseClient;

const USER_ROUTINE_ASSESSMENT_COLUMNS =
  "id, user_id, input_fingerprint, assessment, model_version, prompt_version, generated_at, created_at, updated_at";

interface UserRoutineAssessmentRow {
  id: string;
  user_id: string;
  input_fingerprint: string;
  assessment: unknown;
  model_version: string | null;
  prompt_version: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface UserRoutineAiAssessment {
  id: string;
  userId: string;
  inputFingerprint: string;
  assessment: unknown;
  modelVersion: string | null;
  promptVersion: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

function normalizeText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : null;
}

function mapUserRoutineAiAssessment(row: UserRoutineAssessmentRow): UserRoutineAiAssessment {
  return {
    id: row.id,
    userId: row.user_id,
    inputFingerprint: row.input_fingerprint,
    assessment: row.assessment,
    modelVersion: normalizeText(row.model_version),
    promptVersion: normalizeText(row.prompt_version),
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRoutineAiShelfInputs(
  shelfCatalog: UserShelfCatalogItem[],
  products: SharedProduct[],
  interpretations: UserProductInterpretation[],
): RoutineAiShelfInput[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const interpretationsByProductId = new Map(
    interpretations.map((interpretation) => [interpretation.productId, interpretation]),
  );

  return shelfCatalog.flatMap((shelfItem) => {
    const product = productsById.get(shelfItem.productId);
    const interpretation = interpretationsByProductId.get(shelfItem.productId);
    return product && interpretation ? [{ shelfItem, product, interpretation }] : [];
  });
}

function serializeAssessmentInput(
  profile: UserProfileInterpretationBasis,
  draft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
) {
  const shelfById = new Map(shelf.map((item) => [item.shelfItem.id, item]));
  return {
    assessmentContractVersion: ROUTINE_AI_ASSESSMENT_INPUT_VERSION,
    profile,
    routine: BASE_ROUTINE_SECTION_KEYS.map((section) => ({
      section,
      entries: draft[section].map((entry) => {
        const input = shelfById.get(entry.shelfItemId);
        if (!input) {
          throw new Error("Brakuje aktualnych danych produktu użytego w rutynie.");
        }

        return {
          shelfItemId: entry.shelfItemId,
          routineRole: entry.routineRole,
          productId: input.product.id,
          inciList: input.product.inciList,
          inciConfidence: input.product.inciConfidence,
          inciUpdatedAt: input.product.inciUpdatedAt,
          productFit: {
            status: input.interpretation.status,
            updatedAt: input.interpretation.updatedAt,
            promptVersion: input.interpretation.promptVersion,
            modelVersion: input.interpretation.modelVersion,
          },
        };
      }),
    })),
  };
}

export async function createRoutineAiAssessmentFingerprint(
  profile: UserProfileInterpretationBasis,
  draft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
) {
  const encoder = new TextEncoder();
  const source = JSON.stringify(serializeAssessmentInput(profile, draft, shelf));
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getUserRoutineAiAssessment(
  supabase: RoutineAiAssessmentClient,
  userId: string,
): Promise<UserRoutineAiAssessment | null> {
  const { data, error } = await supabase
    .from("user_routine_assessments")
    .select(USER_ROUTINE_ASSESSMENT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udało się wczytać oceny AI rutyny: ${error.message}`);
  }

  return data ? mapUserRoutineAiAssessment(data) : null;
}

export async function saveUserRoutineAiAssessment(
  supabase: RoutineAiAssessmentClient,
  input: {
    userId: string;
    inputFingerprint: string;
    assessment: RoutineAiAssessment;
    modelVersion: string;
    promptVersion: string;
  },
) {
  const { data, error } = await supabase
    .from("user_routine_assessments")
    .upsert(
      {
        user_id: input.userId,
        input_fingerprint: input.inputFingerprint,
        assessment: input.assessment,
        model_version: input.modelVersion,
        prompt_version: input.promptVersion,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(USER_ROUTINE_ASSESSMENT_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać oceny AI rutyny: ${error.message}`);
  }

  return mapUserRoutineAiAssessment(data);
}
