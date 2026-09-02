import type { APIRoute } from "astro";
import {
  createAiErrorResponse,
  createAiErrorResponseFromException,
} from "@/lib/domain/ai-error-contract";
import {
  getUserScopedProductDetails,
  refreshStaleInterpretation,
  retryFailedInterpretation,
  startInterpretationGeneration,
  type InterpretationGenerationAction,
} from "@/lib/domain/product-interpretation";
import { createClient } from "@/lib/supabase";

function parseProductId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Brakuje identyfikatora produktu");
  }

  return value.trim();
}

function parseAction(value: unknown): InterpretationGenerationAction {
  if (value === "start" || value === "retry" || value === "refresh") {
    return value;
  }

  throw new Error("Akcja analizy musi być jedną z: start, retry, refresh");
}

function serializeInterpretation(interpretation: Awaited<ReturnType<typeof startInterpretationGeneration>>) {
  return interpretation;
}

export const GET: APIRoute = async (context) => {
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
    const details = await getUserScopedProductDetails(
      supabase,
      user.id,
      parseProductId(context.url.searchParams.get("productId")),
    );
    return Response.json({ product: details.product, interpretation: details.interpretation });
  } catch (error) {
    return createAiErrorResponseFromException(error);
  }
};

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
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Payload analizy produktu musi być obiektem");
    }
    payload = body as Record<string, unknown>;
  } catch (error) {
    return createAiErrorResponse("invalid_request", 400);
  }

  try {
    const productId = parseProductId(payload.productId);
    const action = parseAction(payload.action);
    const interpretation =
      action === "start"
        ? await startInterpretationGeneration(supabase, user.id, productId)
        : action === "retry"
          ? await retryFailedInterpretation(supabase, user.id, productId)
          : await refreshStaleInterpretation(supabase, user.id, productId);

    return Response.json({ interpretation: serializeInterpretation(interpretation) });
  } catch (error) {
    return createAiErrorResponseFromException(error);
  }
};
