import { OPENROUTER_API_KEY } from "astro:env/server";
import type { IngredientGlossaryDefinition, IngredientGlossaryRequest } from "@/lib/domain/ingredient-glossary";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
export const INGREDIENT_GLOSSARY_MODEL_VERSION = "openai/gpt-4.1";
export const INGREDIENT_GLOSSARY_PROMPT_VERSION = "ingredient-glossary-v1";
const MAX_INGREDIENTS_PER_REQUEST = 12;

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

export interface IngredientGlossaryGenerationResult {
  definitions: IngredientGlossaryDefinition[];
  rejectedKeys: string[];
}

class IngredientGlossaryAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngredientGlossaryAiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new IngredientGlossaryAiError(`Model nie zwrócił poprawnego pola ${fieldName}.`);
  }

  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTextArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new IngredientGlossaryAiError(`Model nie zwrócił tablicy ${fieldName}.`);
  }

  return Array.from(new Set(value.map((item) => requiredText(item, fieldName))));
}

function parseModelResponse(content: string, requestedKeys: Set<string>): IngredientGlossaryGenerationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new IngredientGlossaryAiError("Model nie zwrócił poprawnego JSON-a opisów składników.");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    throw new IngredientGlossaryAiError("Model zwrócił nieprawidłowy format opisów składników.");
  }

  const definitionsByKey = new Map<string, IngredientGlossaryDefinition>();
  const rejectedKeys = new Set<string>();

  for (const candidate of parsed.entries) {
    if (!isRecord(candidate) || typeof candidate.inci_key !== "string") {
      continue;
    }

    const inciKey = candidate.inci_key.trim();
    if (!requestedKeys.has(inciKey) || definitionsByKey.has(inciKey)) {
      continue;
    }

    try {
      definitionsByKey.set(inciKey, {
        inciKey,
        cosmeticRole: optionalText(candidate.cosmetic_role),
        summary: requiredText(candidate.summary, "summary"),
        likelyBenefits: parseTextArray(candidate.likely_benefits, "likely_benefits"),
        caveats: parseTextArray(candidate.caveats, "caveats"),
      });
    } catch {
      rejectedKeys.add(inciKey);
    }
  }

  for (const requestedKey of requestedKeys) {
    if (!definitionsByKey.has(requestedKey)) {
      rejectedKeys.add(requestedKey);
    }
  }

  return { definitions: [...definitionsByKey.values()], rejectedKeys: [...rejectedKeys] };
}

function buildMessages(requests: IngredientGlossaryRequest[]) {
  return [
    {
      role: "system" as const,
      content:
        "You create concise, educational ingredient glossary entries for a Polish skincare app. Return only strict JSON with one key, entries. entries must be an array of {inci_key, cosmetic_role, summary, likely_benefits, caveats}. Echo only the inci_key values supplied by the user and include every supplied key exactly once. cosmetic_role may be null; summary must be a short non-empty Polish explanation; likely_benefits and caveats must be arrays of short Polish strings and may be empty. Explain the typical cosmetic role of the isolated INCI ingredient only. Do not assess a finished cosmetic formula, a user's skin, comedogenicity, safety, irritation, efficacy, concentrations, routines, timing, frequency, diagnoses, treatment or guaranteed outcomes. Do not assume ingredient concentration or invent facts. Use cautious language such as 'może' or 'zwykle' where appropriate. Do not add citations, markdown, prose outside JSON, or ingredients that were not requested.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "Create one educational Polish glossary entry for every supplied INCI ingredient.",
        ingredients: requests.map((request) => ({ inci_key: request.inciKey, display_name: request.displayName })),
      }),
    },
  ];
}

export async function generateIngredientGlossaryDefinitions(
  requests: IngredientGlossaryRequest[],
): Promise<IngredientGlossaryGenerationResult> {
  if (requests.length === 0) {
    return { definitions: [], rejectedKeys: [] };
  }

  if (requests.length > MAX_INGREDIENTS_PER_REQUEST) {
    throw new IngredientGlossaryAiError(
      `Jedno zapytanie może zawierać maksymalnie ${MAX_INGREDIENTS_PER_REQUEST} składników.`,
    );
  }

  if (!OPENROUTER_API_KEY) {
    throw new IngredientGlossaryAiError("OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: INGREDIENT_GLOSSARY_MODEL_VERSION,
      temperature: 0.2,
      messages: buildMessages(requests),
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new IngredientGlossaryAiError(`OpenRouter nie zwrócił opisów składników (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new IngredientGlossaryAiError("OpenRouter nie zwrócił treści opisów składników.");
  }

  return parseModelResponse(content, new Set(requests.map((request) => request.inciKey)));
}
