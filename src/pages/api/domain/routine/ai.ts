import type { APIRoute } from "astro";
import { createAiErrorResponse, createAiErrorResponseFromException } from "@/lib/domain/ai-error-contract";
import {
  getSharedProductsByIds,
  listSharedProductsByCategories,
  type SharedProduct,
} from "@/lib/domain/product-domain";
import {
  createRoutineAiAssessmentFingerprint,
  createRoutineAiShelfInputs,
  saveUserRoutineAiAssessment,
} from "@/lib/domain/routine-ai-assessment";
import {
  getProductCategoriesForRoutineRole,
  MAX_ROUTINE_AI_CANDIDATES_PER_STEP,
  MAX_ROUTINE_AI_CANDIDATES_TOTAL,
  MAX_ROUTINE_AI_RECOMMENDATIONS_PER_STEP,
  parseRoutineAiMissingSteps,
  type RoutineAiMissingStep,
} from "@/lib/domain/routine-ai";
import {
  collapseWeeklyScheduleToBaseRoutine,
  createEmptyBaseRoutine,
  parseBaseRoutineDraft,
  type BaseRoutineDraft,
} from "@/lib/domain/routine-schedule";
import {
  getUserProductInterpretation,
  prepareUserProductInterpretations,
  type UserProductInterpretation,
} from "@/lib/domain/product-interpretation";
import {
  generateRoutineDraft,
  ROUTINE_DRAFT_MODEL_VERSION,
  ROUTINE_DRAFT_PROMPT_VERSION,
} from "@/lib/integrations/openrouter-routine-draft";
import { createClient } from "@/lib/supabase";
import {
  createUserProfileInterpretationBasis,
  getUserProfile,
  getUserRoutineConfig,
  isUserProfileComplete,
  listUserShelfCatalog,
} from "@/lib/domain/user-domain";

type RoutineAiAction = "prepare_shelf" | "generate_proposal" | "evaluate_candidates";

function logRoutineAiRoute(message: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line no-console -- deliberate server-side trace for routine AI debugging
  console.error(`[routine-ai-route] ${message}`, payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): RoutineAiAction {
  if (value === "prepare_shelf" || value === "generate_proposal" || value === "evaluate_candidates") {
    return value;
  }

  throw new Error("Akcja AI rutyny jest nieobsługiwana.");
}

function parseCurrentDraft(value: unknown): BaseRoutineDraft {
  return parseBaseRoutineDraft(value);
}

async function isSavedRoutineDraft(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  draft: BaseRoutineDraft,
) {
  const routineConfig = await getUserRoutineConfig(supabase, userId);
  const savedDraft = routineConfig
    ? collapseWeeklyScheduleToBaseRoutine(routineConfig.schedule)
    : createEmptyBaseRoutine();
  return JSON.stringify(savedDraft) === JSON.stringify(draft);
}

function getFailurePayload(
  failures: Awaited<ReturnType<typeof prepareUserProductInterpretations>>["failures"],
  shelf: Awaited<ReturnType<typeof listUserShelfCatalog>>,
) {
  const shelfByProductId = new Map(shelf.map((item) => [item.productId, item]));
  return failures.map((failure) => {
    const shelfItem = shelfByProductId.get(failure.productId);
    return {
      productId: failure.productId,
      label: shelfItem
        ? `${shelfItem.product.brand ? `${shelfItem.product.brand} · ` : ""}${shelfItem.product.name}`
        : "Produkt",
      message: failure.message,
    };
  });
}

function getEligibleShelf(shelf: Awaited<ReturnType<typeof listUserShelfCatalog>>) {
  return shelf.filter((item) => !item.excludeFromAiRoutines);
}

function assertDraftCanUseAi(draft: BaseRoutineDraft, shelf: Awaited<ReturnType<typeof listUserShelfCatalog>>) {
  const shelfById = new Map(shelf.map((item) => [item.id, item]));
  for (const section of ["morning", "evening"] as const) {
    for (const entry of draft[section]) {
      const shelfItem = shelfById.get(entry.shelfItemId);
      if (!shelfItem) {
        throw new Error("Bieżący draft odwołuje się do produktu spoza Twojej półki.");
      }
      if (shelfItem.excludeFromAiRoutines) {
        throw new Error("Twoja rutyna zawiera produkt wykluczony z AI.");
      }
    }
  }
}

async function loadReadyShelfInputs(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  draft: BaseRoutineDraft,
) {
  const [profile, shelf] = await Promise.all([
    getUserProfile(supabase, userId),
    listUserShelfCatalog(supabase, userId),
  ]);
  if (!isUserProfileComplete(profile)) {
    throw new Error("Uzupełnij profil skóry przed użyciem AI do rutyny.");
  }
  if (shelf.length === 0) {
    throw new Error("Dodaj co najmniej jeden produkt do półki przed użyciem AI do rutyny.");
  }
  assertDraftCanUseAi(draft, shelf);
  const eligibleShelf = getEligibleShelf(shelf);
  if (eligibleShelf.length === 0) {
    throw new Error("AI nie ma obecnie produktów do użycia.");
  }

  const [products, interpretations] = await Promise.all([
    getSharedProductsByIds(
      supabase,
      eligibleShelf.map((item) => item.productId),
    ),
    Promise.all(
      eligibleShelf.map(async (item) => ({
        shelfItem: item,
        interpretation: await getUserProductInterpretation(supabase, userId, item.productId),
      })),
    ),
  ]);
  const pendingItems = interpretations.filter((item) => item.interpretation?.status !== "ready");
  if (pendingItems.length > 0) {
    throw new Error("Najpierw przygotuj aktualne analizy wszystkich produktów z półki.");
  }

  const readyInterpretations = interpretations.flatMap((item) =>
    item.interpretation?.status === "ready" ? [item.interpretation] : [],
  );
  const readyShelf = createRoutineAiShelfInputs(eligibleShelf, products, readyInterpretations);
  if (readyShelf.length !== eligibleShelf.length) {
    throw new Error("Brakuje aktualnych danych produktu potrzebnych do oceny rutyny.");
  }

  return {
    profileBasis: createUserProfileInterpretationBasis(profile),
    shelf: readyShelf,
  };
}

function serializeCandidate(product: SharedProduct, interpretation: UserProductInterpretation) {
  return {
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
    },
    fit: {
      status: interpretation.fitStatus,
      score: interpretation.fitScore,
      summary: interpretation.summaryShort,
      confidence: interpretation.confidence,
    },
  };
}

async function evaluateCandidates(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  missingSteps: RoutineAiMissingStep[],
) {
  const [profile, shelf] = await Promise.all([
    getUserProfile(supabase, userId),
    listUserShelfCatalog(supabase, userId),
  ]);
  if (!isUserProfileComplete(profile)) {
    throw new Error("Uzupełnij profil skóry przed sprawdzeniem rekomendacji z katalogu.");
  }
  const excludedProductIds = new Set(shelf.map((item) => item.productId));
  const evaluatedProductIds = new Set<string>();
  let remainingBudget = MAX_ROUTINE_AI_CANDIDATES_TOTAL;

  const recommendations = [];
  for (const missingStep of missingSteps) {
    const categories = getProductCategoriesForRoutineRole(missingStep.routineRole);
    const limit = Math.min(MAX_ROUTINE_AI_CANDIDATES_PER_STEP, remainingBudget);
    if (categories.length === 0 || limit === 0) {
      recommendations.push({ missingStep, candidates: [] });
      continue;
    }

    const products = await listSharedProductsByCategories(supabase, {
      categories,
      excludeProductIds: [...excludedProductIds, ...evaluatedProductIds],
      limit,
    });
    products.forEach((product) => evaluatedProductIds.add(product.id));
    remainingBudget -= products.length;

    const preparation = await prepareUserProductInterpretations(
      supabase,
      userId,
      products.map((product) => product.id),
    );
    const interpretations = new Map(
      preparation.ready.map((interpretation) => [interpretation.productId, interpretation]),
    );
    const candidates = products
      .flatMap((product) => {
        const interpretation = interpretations.get(product.id);
        return interpretation?.fitStatus === "recommended" ? [serializeCandidate(product, interpretation)] : [];
      })
      .sort((left, right) => (right.fit.score ?? -1) - (left.fit.score ?? -1))
      .slice(0, MAX_ROUTINE_AI_RECOMMENDATIONS_PER_STEP);

    recommendations.push({ missingStep, candidates });
  }

  return recommendations;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return createAiErrorResponse("provider_unavailable");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return createAiErrorResponse("unauthorized", 401);
  }
  if (!user) {
    return createAiErrorResponse("unauthorized", 401);
  }

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await context.request.json();
    if (!isRecord(body)) {
      throw new Error("Payload AI rutyny musi być obiektem.");
    }
    payload = body;
  } catch (_error) {
    return createAiErrorResponse("invalid_request", 400);
  }

  let action: RoutineAiAction | null = null;
  try {
    action = parseAction(payload.action);
    if (action === "prepare_shelf") {
      const [profile, shelf] = await Promise.all([
        getUserProfile(supabase, user.id),
        listUserShelfCatalog(supabase, user.id),
      ]);
      if (!isUserProfileComplete(profile)) {
        throw new Error("Uzupełnij profil skóry przed użyciem AI do rutyny.");
      }
      if (shelf.length === 0) {
        throw new Error("Dodaj co najmniej jeden produkt do półki przed użyciem AI do rutyny.");
      }
      const eligibleShelf = getEligibleShelf(shelf);
      if (eligibleShelf.length === 0) {
        throw new Error("AI nie ma obecnie produktów do użycia.");
      }

      const preparation = await prepareUserProductInterpretations(
        supabase,
        user.id,
        eligibleShelf.map((item) => item.productId),
      );
      if (preparation.failures.length > 0) {
        return Response.json({
          status: "blocked",
          failedProducts: getFailurePayload(preparation.failures, eligibleShelf),
        });
      }

      return Response.json({ status: "ready" });
    }

    if (action === "generate_proposal") {
      const currentDraft = parseCurrentDraft(payload.currentDraft);
      const input = await loadReadyShelfInputs(supabase, user.id, currentDraft);
      const proposal = await generateRoutineDraft(input.profileBasis, currentDraft, input.shelf);
      let assessment = null;
      if (proposal.assessment && (await isSavedRoutineDraft(supabase, user.id, currentDraft))) {
        assessment = await saveUserRoutineAiAssessment(supabase, {
          userId: user.id,
          inputFingerprint: await createRoutineAiAssessmentFingerprint(input.profileBasis, currentDraft, input.shelf),
          assessment: proposal.assessment,
          modelVersion: ROUTINE_DRAFT_MODEL_VERSION,
          promptVersion: ROUTINE_DRAFT_PROMPT_VERSION,
        });
      }
      return Response.json({
        proposal,
        assessment: assessment
          ? {
              assessment: proposal.assessment,
              generatedAt: assessment.generatedAt,
            }
          : null,
      });
    }

    const missingSteps = parseRoutineAiMissingSteps(payload.missingSteps);
    const recommendations = await evaluateCandidates(supabase, user.id, missingSteps);
    return Response.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przygotować propozycji AI.";
    logRoutineAiRoute("Routine AI action failed", {
      action,
      userId: user.id,
      message,
      error,
    });
    return createAiErrorResponseFromException(error);
  }
};
