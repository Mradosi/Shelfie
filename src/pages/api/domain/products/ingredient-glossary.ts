import type { APIRoute } from "astro";
import {
  isIngredientGlossaryAction,
  prepareIngredientGlossaryEntries,
  type IngredientGlossaryAction,
} from "@/lib/domain/ingredient-glossary";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { createClient, createServiceRoleClient } from "@/lib/supabase";

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProductId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Brakuje identyfikatora produktu.");
  }

  return value.trim();
}

function parseAction(value: unknown): IngredientGlossaryAction {
  if (!isIngredientGlossaryAction(value)) {
    throw new Error("Akcja słownika musi być jedną z: prepare, retry, refresh.");
  }

  return value;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase nie jest skonfigurowane.", 500);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return jsonError(authError.message, 401);
  }
  if (!user) {
    return jsonError("Musisz być zalogowany, żeby przygotować opisy składników.", 401);
  }

  let productId: string;
  let action: IngredientGlossaryAction;
  try {
    const body: unknown = await context.request.json();
    if (!isRecord(body)) {
      throw new Error("Payload słownika składników musi być obiektem.");
    }
    productId = parseProductId(body.productId);
    action = parseAction(body.action);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Nieprawidłowy payload słownika składników.");
  }

  try {
    const product = await getSharedProductById(supabase, productId);
    if (!product) {
      return jsonError("Nie znaleziono produktu w shared bazie.", 404);
    }
    if (product.inciList.length === 0) {
      return jsonError("Ten produkt nie ma listy składników do opisania.", 409);
    }

    const serviceRoleClient = createServiceRoleClient();
    if (!serviceRoleClient) {
      return jsonError("Brakuje server-only konfiguracji SUPABASE_SERVICE_ROLE_KEY.", 500);
    }

    const result = await prepareIngredientGlossaryEntries(serviceRoleClient, product.inciList, action);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przygotować opisów składników.";
    // eslint-disable-next-line no-console -- deliberate server-side trace for shared AI generation failures
    console.error("[ingredient-glossary] Request failed", { userId: user.id, productId, action, message });
    return jsonError(message, 500);
  }
};
