import { OPENROUTER_API_KEY } from "astro:env/server";
import type { SharedProduct } from "@/lib/domain/product-domain";
import type { UserProductInterpretation } from "@/lib/domain/product-interpretation";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const ROUTINE_GUIDANCE_MODEL_VERSION = "openai/gpt-4.1";

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

export interface RoutineGuidanceExplanation {
  summary: string;
  ingredients: {
    name: string;
    reason: string;
  }[];
}

export interface RoutineGuidanceContextItem {
  section: "morning" | "evening";
  routineRole: string;
  productName: string;
  category: string | null;
  inciList: string[];
}

class RoutineGuidanceAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineGuidanceAiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RoutineGuidanceAiError(`Model nie zwrócił poprawnego pola ${fieldName}.`);
  }

  return value.trim();
}

function parseExplanation(content: string, inciList: string[]): RoutineGuidanceExplanation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RoutineGuidanceAiError("Model nie zwrócił poprawnego JSON-a wyjaśnienia.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.ingredients)) {
    throw new RoutineGuidanceAiError("Model nie zwrócił poprawnego formatu wyjaśnienia.");
  }

  const inciByName = new Map(inciList.map((ingredient) => [ingredient.toLocaleLowerCase("en-US"), ingredient]));
  return {
    summary: requiredText(parsed.summary, "summary"),
    ingredients: parsed.ingredients.flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      const requestedName = requiredText(item.name, "ingredients.name");
      const name = inciByName.get(requestedName.toLocaleLowerCase("en-US"));
      if (!name) {
        return [];
      }
      return [{ name, reason: requiredText(item.reason, "ingredients.reason") }];
    }),
  };
}

export async function explainRoutineGuidance(
  product: SharedProduct,
  interpretation: Pick<UserProductInterpretation, "profileBasis" | "cautionFor" | "warnings">,
  routineContext: RoutineGuidanceContextItem[],
): Promise<RoutineGuidanceExplanation> {
  if (!OPENROUTER_API_KEY) {
    throw new RoutineGuidanceAiError("OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: ROUTINE_GUIDANCE_MODEL_VERSION,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You explain existing personalized skincare cautions for a Polish app. Return only strict JSON with exactly these keys: summary, ingredients. ingredients must be an array of {name,reason}. Write all user-facing text in Polish. Use only ingredient names exactly present in the supplied target-product INCI list; never invent or infer ingredients. Explain only the supplied stored cautions and warnings in the context of the supplied profile basis and optional routine context. A signal about an ingredient is not evidence that the finished formula causes clogged pores, oiliness, or another outcome. Do not claim that oils, esters, squalane, fatty alcohols, or emollients are comedogenic or unsuitable solely because they are present. State clearly when concentration, full formulation, and individual response prevent a firm conclusion. Use the routine context only to explain a balanced, non-prescriptive perspective, for example that a barrier-supporting product can have a different role alongside products with potentially intensive actives when those actives are explicitly evidenced by the supplied INCI. Do not infer actives from product names or categories. Do not diagnose, make medical claims, prescribe treatment, advise stopping use, or change the routine. If the supplied signals cannot be tied to a specific target-product INCI ingredient, return an empty ingredients array and say this plainly in summary. Keep the answer concise and practical.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Explain why this product has its existing personalized cautions and warnings.",
            profileBasis: interpretation.profileBasis,
            product: {
              name: product.name,
              brand: product.brand,
              category: product.category,
              inciList: product.inciList,
            },
            cautions: interpretation.cautionFor,
            warnings: interpretation.warnings,
            routineContext,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new RoutineGuidanceAiError(`OpenRouter nie zwrócił wyjaśnienia (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new RoutineGuidanceAiError("OpenRouter nie zwrócił treści wyjaśnienia.");
  }

  return parseExplanation(content, product.inciList);
}
