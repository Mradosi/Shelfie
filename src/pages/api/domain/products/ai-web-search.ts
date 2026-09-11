import type { APIRoute } from "astro";
import { createAiErrorResponse, createAiErrorResponseFromException } from "@/lib/domain/ai-error-contract";
import { resolveAiWebSearchDraft } from "@/lib/integrations/openrouter";
import { createClient } from "@/lib/supabase";

function parseOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function logAiWebSearchRoute(message: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line no-console -- deliberate server-side trace for AI fallback debugging
  console.error(`[ai-web-search-route] ${message}`, payload);
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

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return createAiErrorResponse("invalid_request", 400);
  }

  const record = typeof payload === "object" && payload !== null ? payload : {};
  const name = parseOptionalText((record as Record<string, unknown>).name);
  const brand = parseOptionalText((record as Record<string, unknown>).brand);
  const category = parseOptionalText((record as Record<string, unknown>).category);
  const barcode = parseOptionalText((record as Record<string, unknown>).barcode);

  if (!name) {
    return createAiErrorResponse("invalid_request", 400);
  }

  try {
    const result = await resolveAiWebSearchDraft({
      name,
      brand,
      category,
      barcode,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI web search nie powiódł się";
    logAiWebSearchRoute("Route failed", {
      input: { name, brand, category, barcode },
      message,
      error,
    });
    return createAiErrorResponseFromException(error);
  }
};
