import type { APIRoute } from "astro";
import { listSharedProductsByCategories, type SharedProduct } from "@/lib/domain/product-domain";
import {
  getProductCategoriesForRoutineRole,
  MAX_ROUTINE_AI_CANDIDATES_PER_STEP,
  MAX_ROUTINE_AI_CANDIDATES_TOTAL,
  MAX_ROUTINE_AI_RECOMMENDATIONS_PER_STEP,
  parseRoutineAiMissingSteps,
  type RoutineAiMissingStep,
} from "@/lib/domain/routine-ai";
import { parseBaseRoutineDraft, type BaseRoutineDraft } from "@/lib/domain/routine-schedule";
import {
  getUserProductInterpretation,
  prepareUserProductInterpretations,
  type UserProductInterpretation,
} from "@/lib/domain/product-interpretation";
import { generateRoutineDraft } from "@/lib/integrations/openrouter-routine-draft";
import { createClient } from "@/lib/supabase";
import {
  createUserProfileInterpretationBasis,
  getUserProfile,
  isUserProfileComplete,
  listUserShelfCatalog,
} from "@/lib/domain/user-domain";

type RoutineAiAction = "prepare_shelf" | "generate_proposal" | "evaluate_candidates";

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

  const ownedShelfItemIds = new Set(shelf.map((item) => item.id));
  for (const section of ["morning", "evening"] as const) {
    for (const entry of draft[section]) {
      if (!ownedShelfItemIds.has(entry.shelfItemId)) {
        throw new Error("Bieżący draft odwołuje się do produktu spoza Twojej półki.");
      }
    }
  }

  const interpretations = await Promise.all(
    shelf.map(async (item) => ({
      shelfItem: item,
      interpretation: await getUserProductInterpretation(supabase, userId, item.productId),
    })),
  );
  const pendingItems = interpretations.filter((item) => item.interpretation?.status !== "ready");
  if (pendingItems.length > 0) {
    throw new Error("Najpierw przygotuj aktualne analizy wszystkich produktów z półki.");
  }

  const readyShelf = interpretations.flatMap((item) =>
    item.interpretation?.status === "ready" ? [{ shelfItem: item.shelfItem, interpretation: item.interpretation }] : [],
  );

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
    return jsonError("Supabase nie jest skonfigurowane", 500);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return jsonError(authError.message, 401);
  }
  if (!user) {
    return jsonError("Musisz być zalogowany, żeby użyć AI do rutyny.", 401);
  }

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await context.request.json();
    if (!isRecord(body)) {
      throw new Error("Payload AI rutyny musi być obiektem.");
    }
    payload = body;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Nieprawidłowy payload AI rutyny.");
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

      const preparation = await prepareUserProductInterpretations(
        supabase,
        user.id,
        shelf.map((item) => item.productId),
      );
      if (preparation.failures.length > 0) {
        return Response.json({ status: "blocked", failedProducts: getFailurePayload(preparation.failures, shelf) });
      }

      return Response.json({ status: "ready" });
    }

    if (action === "generate_proposal") {
      const currentDraft = parseCurrentDraft(payload.currentDraft);
      const input = await loadReadyShelfInputs(supabase, user.id, currentDraft);
      const proposal = await generateRoutineDraft(input.profileBasis, currentDraft, input.shelf);
      return Response.json({ proposal });
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
    return jsonError(message, 500);
  }
};
