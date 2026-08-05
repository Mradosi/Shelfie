import type { APIRoute } from "astro";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { isProductCategoryAllowedForRoutineRole, type RoutineAiMissingStep } from "@/lib/domain/routine-ai";
import { createRoutineGuidanceInput } from "@/lib/domain/routine-guidance";
import { isRoutineRole } from "@/lib/domain/routine-schedule";
import { getUserScopedProductDetails } from "@/lib/domain/product-interpretation";
import { createClient } from "@/lib/supabase";
import { addUserShelfItem, listUserShelfCatalog, listUserShelfItems } from "@/lib/domain/user-domain";

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Payload kandydata musi być obiektem.");
  }
  if (typeof value.productId !== "string" || !value.productId.trim()) {
    throw new Error("Brakuje produktu do dodania.");
  }
  if (value.section !== "morning" && value.section !== "evening") {
    throw new Error("Sekcja propozycji musi być morning albo evening.");
  }
  if (!isRoutineRole(value.routineRole) || value.routineRole === "other") {
    throw new Error("Kandydat musi mieć konkretną rolę rutyny.");
  }

  return {
    productId: value.productId.trim(),
    section: value.section,
    routineRole: value.routineRole,
  } satisfies Pick<RoutineAiMissingStep, "section" | "routineRole"> & { productId: string };
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
    return jsonError("Musisz być zalogowany, żeby dodać rekomendowany produkt.", 401);
  }

  try {
    const payload = parsePayload(await context.request.json());
    const [product, shelfItems] = await Promise.all([
      getSharedProductById(supabase, payload.productId),
      listUserShelfItems(supabase, user.id),
    ]);
    if (!product || !isProductCategoryAllowedForRoutineRole(payload.routineRole, product.category)) {
      throw new Error("Ten produkt nie jest prawidłowym kandydatem dla wskazanego kroku.");
    }

    const { interpretation } = await getUserScopedProductDetails(supabase, user.id, product.id);
    if (interpretation.status !== "ready" || interpretation.fitStatus !== "recommended") {
      throw new Error("Ten produkt nie ma aktualnej, pozytywnej analizy dopasowania.");
    }

    if (!shelfItems.some((item) => item.productId === product.id)) {
      await addUserShelfItem(supabase, user.id, product.id);
    }
    const catalog = await listUserShelfCatalog(supabase, user.id);
    const shelfItem = catalog.find((item) => item.productId === product.id);
    if (!shelfItem) {
      throw new Error("Nie udało się odczytać produktu dodanego do półki.");
    }

    return Response.json({
      shelfItem,
      section: payload.section,
      routineRole: payload.routineRole,
      guidanceInput: createRoutineGuidanceInput(shelfItem, interpretation),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Nie udało się dodać rekomendowanego produktu.", 500);
  }
};
