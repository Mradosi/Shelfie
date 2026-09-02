import type { APIRoute } from "astro";
import {
  createAiErrorResponse,
  createAiErrorResponseFromException,
} from "@/lib/domain/ai-error-contract";
import {
  isIngredientGlossaryAction,
  prepareIngredientGlossaryEntries,
  type IngredientGlossaryAction,
} from "@/lib/domain/ingredient-glossary";
import { getSharedProductById } from "@/lib/domain/product-domain";
import { createClient, createServiceRoleClient } from "@/lib/supabase";

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
    return createAiErrorResponse("invalid_request", 400);
  }

  try {
    const product = await getSharedProductById(supabase, productId);
    if (!product) {
      return createAiErrorResponse("not_found", 404);
    }
    if (product.inciList.length === 0) {
      return createAiErrorResponse("conflict", 409);
    }

    const serviceRoleClient = createServiceRoleClient();
    if (!serviceRoleClient) {
      return createAiErrorResponse("provider_unavailable");
    }

    const result = await prepareIngredientGlossaryEntries(serviceRoleClient, product.inciList, action);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przygotować opisów składników.";
    // eslint-disable-next-line no-console -- deliberate server-side trace for shared AI generation failures
    console.error("[ingredient-glossary] Request failed", { userId: user.id, productId, action, message });
    return createAiErrorResponseFromException(error);
  }
};
