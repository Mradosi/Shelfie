import type { APIRoute } from "astro";
import {
  createAiErrorResponse,
  createAiErrorResponseFromException,
} from "@/lib/domain/ai-error-contract";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { getUserProductInterpretation } from "@/lib/domain/product-interpretation";
import {
  explainRoutineGuidance,
  type RoutineGuidanceContextItem,
} from "@/lib/integrations/openrouter-routine-guidance";
import {
  parseBaseRoutineDraft,
  type BaseRoutineDraft,
  type BaseRoutineSectionKey,
} from "@/lib/domain/routine-schedule";
import { createClient } from "@/lib/supabase";
import { listUserShelfCatalog, type UserShelfCatalogItem } from "@/lib/domain/user-domain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProductId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Wybierz produkt, dla którego chcesz uzyskać wyjaśnienie.");
  }
  return value.trim();
}

function parseRoutineContext(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Brakuje aktualnego układu rutyny do wyjaśnienia.");
  }
  return parseBaseRoutineDraft(value);
}

async function loadRoutineContext(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  productId: string,
  shelf: UserShelfCatalogItem[],
  routineContext: BaseRoutineDraft,
): Promise<RoutineGuidanceContextItem[]> {
  const shelfById = new Map(shelf.map((item) => [item.id, item]));
  const contextEntries = new Map<
    string,
    { section: BaseRoutineSectionKey; shelfItem: UserShelfCatalogItem; routineRole: string }
  >();
  for (const section of ["morning", "evening"] as const) {
    const sectionEntries = routineContext[section];
    const targetIsUsedInSection = sectionEntries.some(
      (entry) => shelfById.get(entry.shelfItemId)?.productId === productId,
    );
    if (!targetIsUsedInSection) {
      continue;
    }

    for (const entry of sectionEntries) {
      const shelfItem = shelfById.get(entry.shelfItemId);
      if (!shelfItem || shelfItem.productId === productId) {
        continue;
      }
      const key = `${section}:${shelfItem.productId}:${entry.routineRole}`;
      contextEntries.set(key, { section, shelfItem, routineRole: entry.routineRole });
    }
  }

  const products = await Promise.all(
    [...contextEntries.values()].map(async (entry) => ({
      entry,
      product: await getSharedProductById(supabase, entry.shelfItem.productId),
    })),
  );
  return products.flatMap(({ entry, product }) =>
    product
      ? [
          {
            section: entry.section,
            routineRole: entry.routineRole,
            productName: product.name,
            category: product.category,
            inciList: product.inciList,
          },
        ]
      : [],
  );
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

  try {
    const body: unknown = await context.request.json();
    if (!isRecord(body)) {
      throw new Error("Payload wyjaśnienia musi być obiektem.");
    }
    const productId = parseProductId(body.productId);
    const routineContext = parseRoutineContext(body.routineContext);
    const shelf = await listUserShelfCatalog(supabase, user.id);
    if (!shelf.some((item) => item.productId === productId)) {
      return createAiErrorResponse("not_found", 404);
    }
    const ownedShelfItemIds = new Set(shelf.map((item) => item.id));
    for (const section of ["morning", "evening"] as const) {
      if (routineContext[section].some((entry) => !ownedShelfItemIds.has(entry.shelfItemId))) {
        return createAiErrorResponse("invalid_request", 403);
      }
    }

    const [product, interpretation] = await Promise.all([
      getSharedProductById(supabase, productId),
      getUserProductInterpretation(supabase, user.id, productId),
    ]);
    if (!product || interpretation?.status !== "ready") {
      return createAiErrorResponse("conflict", 409);
    }
    if (interpretation.cautionFor.length === 0 && interpretation.warnings.length === 0) {
      return createAiErrorResponse("conflict", 409);
    }

    const contextItems = await loadRoutineContext(supabase, productId, shelf, routineContext);
    const explanation = await explainRoutineGuidance(product, interpretation, contextItems);
    return Response.json({ explanation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przygotować wyjaśnienia AI.";
    // eslint-disable-next-line no-console -- deliberate server-side trace for AI explanation failures
    console.error("[routine-guidance-explanation] Request failed", { userId: user.id, message, error });
    return createAiErrorResponseFromException(error);
  }
};
