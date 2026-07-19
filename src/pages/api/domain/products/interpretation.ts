import type { APIRoute } from "astro";
import {
  getUserScopedProductDetails,
  refreshStaleInterpretation,
  retryFailedInterpretation,
  startInterpretationGeneration,
  type InterpretationGenerationAction,
} from "@/lib/domain/product-interpretation";
import { createClient } from "@/lib/supabase";

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
    return jsonError("Musisz być zalogowany, żeby odczytać analizę produktu", 401);
  }

  try {
    const details = await getUserScopedProductDetails(
      supabase,
      user.id,
      parseProductId(context.url.searchParams.get("productId")),
    );
    return Response.json({ product: details.product, interpretation: details.interpretation });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Nie udało się wczytać analizy produktu", 500);
  }
};

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
    return jsonError("Musisz być zalogowany, żeby uruchomić analizę produktu", 401);
  }

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await context.request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Payload analizy produktu musi być obiektem");
    }
    payload = body as Record<string, unknown>;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Nieprawidłowy payload analizy produktu");
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
    return jsonError(error instanceof Error ? error.message : "Nie udało się uruchomić analizy produktu", 500);
  }
};
