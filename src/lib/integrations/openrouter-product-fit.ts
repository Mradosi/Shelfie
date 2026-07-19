import { OPENROUTER_API_KEY } from "astro:env/server";
import type { SharedProduct } from "@/lib/domain/product-domain";
import type {
  FitStatus,
  InterpretationConfidence,
  InterpretationTag,
  InterpretationWarning,
} from "@/lib/domain/product-interpretation";
import type { UserProfileInterpretationBasis } from "@/lib/domain/user-domain";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
export const PRODUCT_FIT_MODEL_VERSION = "openai/gpt-4.1";
export const PRODUCT_FIT_PROMPT_VERSION = "product-fit-v1";
const FIT_STATUSES = ["recommended", "mixed", "not_recommended", "insufficient_data"] as const;
const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
const WARNING_SEVERITIES = ["low", "medium", "high"] as const;

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

export interface ProductFitAnalysis {
  fitStatus: FitStatus;
  fitScore: number;
  confidence: InterpretationConfidence;
  summaryShort: string;
  reasoningShort: string;
  recommendedFor: InterpretationTag[];
  cautionFor: InterpretationTag[];
  warnings: InterpretationWarning[];
}

class ProductFitAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductFitAiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProductFitAiError(`Model nie zwrócił poprawnego pola ${fieldName}`);
  }

  return value.trim();
}

function parseFitStatus(value: unknown): FitStatus {
  if (typeof value === "string" && (FIT_STATUSES as readonly string[]).includes(value)) {
    return value as FitStatus;
  }

  throw new ProductFitAiError("Model zwrócił nieobsługiwany werdykt dopasowania");
}

function parseConfidence(value: unknown): InterpretationConfidence {
  if (typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value)) {
    return value as InterpretationConfidence;
  }

  throw new ProductFitAiError("Model zwrócił nieobsługiwany poziom pewności");
}

function parseFitScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProductFitAiError("Model nie zwrócił poprawnego wyniku dopasowania");
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseTags(value: unknown, fieldName: string): InterpretationTag[] {
  if (!Array.isArray(value)) {
    throw new ProductFitAiError(`Model nie zwrócił tablicy ${fieldName}`);
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ProductFitAiError(`Model zwrócił nieprawidłową pozycję ${fieldName}`);
    }

    return {
      code: requiredText(item.code, `${fieldName}.code`),
      label: requiredText(item.label, `${fieldName}.label`),
      reason: requiredText(item.reason, `${fieldName}.reason`),
    };
  });
}

function parseWarnings(value: unknown): InterpretationWarning[] {
  if (!Array.isArray(value)) {
    throw new ProductFitAiError("Model nie zwrócił tablicy warnings");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ProductFitAiError("Model zwrócił nieprawidłowe ostrzeżenie");
    }

    if (typeof item.severity !== "string" || !(WARNING_SEVERITIES as readonly string[]).includes(item.severity)) {
      throw new ProductFitAiError("Model zwrócił nieobsługiwany poziom ostrzeżenia");
    }

    return {
      code: requiredText(item.code, "warnings.code"),
      severity: item.severity as InterpretationWarning["severity"],
      message: requiredText(item.message, "warnings.message"),
    };
  });
}

function parseModelResponse(content: string): ProductFitAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ProductFitAiError("Model nie zwrócił poprawnego JSON-a analizy produktu");
  }

  if (!isRecord(parsed)) {
    throw new ProductFitAiError("Model zwrócił nieprawidłowy format analizy produktu");
  }

  return {
    fitStatus: parseFitStatus(parsed.fit_status),
    fitScore: parseFitScore(parsed.fit_score),
    confidence: parseConfidence(parsed.confidence),
    summaryShort: requiredText(parsed.summary_short, "summary_short"),
    reasoningShort: requiredText(parsed.reasoning_short, "reasoning_short"),
    recommendedFor: parseTags(parsed.recommended_for, "recommended_for"),
    cautionFor: parseTags(parsed.caution_for, "caution_for"),
    warnings: parseWarnings(parsed.warnings),
  };
}

function buildMessages(product: SharedProduct, profile: UserProfileInterpretationBasis) {
  return [
    {
      role: "system" as const,
      content:
        "You create a concise, personalized cosmetic product-fit analysis for a Polish skincare app. Return only strict JSON with these exact keys: fit_status, fit_score, confidence, summary_short, reasoning_short, recommended_for, caution_for, warnings. fit_status must be recommended|mixed|not_recommended|insufficient_data. fit_score must be an integer 0-100. confidence must be high|medium|low. recommended_for and caution_for must be arrays of {code,label,reason}; warnings must be an array of {code,severity,message}, with severity low|medium|high. Write all user-facing text in Polish. Do not diagnose, make medical claims, prescribe treatment, recommend AM/PM timing, frequency, routine order, or compare other products. Base claims only on the supplied profile and product data. Keep texts short, practical, and explainable. If data is insufficient, use fit_status insufficient_data and explain the limitation.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "Assess whether this cosmetic product fits this user's skin profile.",
        profile,
        product: {
          name: product.name,
          brand: product.brand,
          category: product.category,
          inciList: product.inciList,
          inciConfidence: product.inciConfidence,
        },
      }),
    },
  ];
}

export async function analyzeProductFit(
  product: SharedProduct,
  profile: UserProfileInterpretationBasis,
): Promise<ProductFitAnalysis> {
  if (!OPENROUTER_API_KEY) {
    throw new ProductFitAiError("OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: PRODUCT_FIT_MODEL_VERSION,
      temperature: 0.2,
      messages: buildMessages(product, profile),
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new ProductFitAiError(`OpenRouter nie zwrócił analizy produktu (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new ProductFitAiError("OpenRouter nie zwrócił treści analizy produktu");
  }

  return parseModelResponse(content);
}
