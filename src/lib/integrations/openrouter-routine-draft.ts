import { OPENROUTER_API_KEY } from "astro:env/server";
import {
  createRoutineAiPromptInput,
  parseRoutineAiProposal,
  type RoutineAiProposal,
  type RoutineAiShelfInput,
} from "@/lib/domain/routine-ai";
import { ROUTINE_ROLE_OPTIONS, type BaseRoutineDraft } from "@/lib/domain/routine-schedule";
import type { UserProfileInterpretationBasis } from "@/lib/domain/user-domain";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
export const ROUTINE_DRAFT_MODEL_VERSION = "openai/gpt-4.1";
export const ROUTINE_DRAFT_PROMPT_VERSION = "routine-draft-v1";

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

class RoutineDraftAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineDraftAiError";
  }
}

function logRoutineDraft(level: "info" | "warn" | "error", message: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line no-console -- deliberate server-side trace for routine AI debugging
  console[level](`[routine-ai] ${message}`, payload);
}

export async function generateRoutineDraft(
  profile: UserProfileInterpretationBasis,
  currentDraft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
): Promise<RoutineAiProposal> {
  const traceId = crypto.randomUUID();

  if (!OPENROUTER_API_KEY) {
    logRoutineDraft("error", "OpenRouter key missing", { traceId });
    throw new RoutineDraftAiError("OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  logRoutineDraft("info", "Starting routine proposal generation", {
    traceId,
    model: ROUTINE_DRAFT_MODEL_VERSION,
    shelfItemCount: shelf.length,
    currentDraftEntryCount: currentDraft.morning.length + currentDraft.evening.length,
  });

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: ROUTINE_DRAFT_MODEL_VERSION,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a careful skincare routine assistant for a Polish app. Return only strict JSON with exactly these keys: summary, routine, entry_reasons, missing_steps. routine must have morning and evening arrays of {shelf_item_id,routine_role}. entry_reasons must contain one {section,shelf_item_id,routine_role,reason} for every proposed entry. missing_steps may contain at most three {section,routine_role,reason}. routine_role must be exactly one of these technical values: ${ROUTINE_ROLE_OPTIONS.join(", ")}. Never use a Polish display label as routine_role. Use only shelf_item_id values supplied in the user payload. Write all user-facing text in Polish. Use the supplied personalized fit interpretations, not raw INCI analysis. Suggest only a base AM/PM routine. Do not diagnose, make medical claims, advise frequency, weekday schedules, product rotation, catalog products, prices, availability, or routine-level conflict warnings. Keep reasons concise and practical.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a first AM/PM base routine when currentDraft is empty, or review and improve currentDraft when it has entries.",
            input: createRoutineAiPromptInput(profile, currentDraft, shelf),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logRoutineDraft("error", "OpenRouter request failed", {
      traceId,
      model: ROUTINE_DRAFT_MODEL_VERSION,
      status: response.status,
      responseBody,
    });
    throw new RoutineDraftAiError(`OpenRouter nie zwrócił propozycji rutyny (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    logRoutineDraft("error", "OpenRouter returned no content", {
      traceId,
      model: ROUTINE_DRAFT_MODEL_VERSION,
      payload,
    });
    throw new RoutineDraftAiError("OpenRouter nie zwrócił treści propozycji rutyny.");
  }

  logRoutineDraft("info", "Raw routine proposal response", {
    traceId,
    model: ROUTINE_DRAFT_MODEL_VERSION,
    content,
  });

  try {
    const parsed = JSON.parse(content) as unknown;
    const proposal = parseRoutineAiProposal(
      parsed,
      shelf.map((item) => item.shelfItem.id),
    );
    logRoutineDraft("info", "Routine proposal validated", {
      traceId,
      morningEntryCount: proposal.routine.morning.length,
      eveningEntryCount: proposal.routine.evening.length,
      missingStepCount: proposal.missingSteps.length,
    });
    return proposal;
  } catch (error) {
    logRoutineDraft("warn", "Routine proposal rejected by validation", {
      traceId,
      model: ROUTINE_DRAFT_MODEL_VERSION,
      allowedRoutineRoles: ROUTINE_ROLE_OPTIONS,
      content,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new RoutineDraftAiError(
      error instanceof Error
        ? `Model zwrócił nieprawidłową propozycję: ${error.message}`
        : "Model zwrócił nieprawidłową propozycję.",
    );
  }
}
