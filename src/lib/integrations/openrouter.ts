import { OPENROUTER_API_KEY } from "astro:env/server";
import { PRODUCT_CATEGORY_OPTIONS, type ProductCategory } from "@/lib/domain/product-domain";
import { lookupIncidecoderProduct } from "@/lib/integrations/incidecoder";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openai/gpt-4.1";
const MAX_SOURCE_VALIDATION_RETRIES = 2;

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterChoice {
  message?: {
    content?: string;
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: {
    server_tool_use?: {
      web_search_requests?: number;
    };
  };
}

export interface AiWebSearchDraft {
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  sourceImageUrl: string;
  storedImageUrl: string;
  inciText: string;
  inciSource: "ai_web_search";
  inciConfidence: "medium";
}

export interface AiWebSearchInput {
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode?: string | null;
}

export interface AiWebSearchResult {
  status: "resolved";
  draft: AiWebSearchDraft;
  metadata: {
    provider: "OpenRouter";
    model: string;
    supportingSource: string | null;
    sourceUrl: string | null;
    sourceType: "manufacturer" | "incidecoder" | "retailer" | "other";
    matchConfidence: "high" | "medium" | "low";
    exactVariantMatch: boolean;
    sourceTitle: string;
    quotedEvidence: string;
    reasoning: string;
    debugTraceId: string;
  };
}

export interface AiWebSearchAmbiguityVariant {
  id: string;
  label: string;
  description: string;
  refinedName: string;
  refinedBrand: string;
}

export interface AiWebSearchAmbiguousResult {
  status: "ambiguous";
  ambiguity: {
    question: string;
    refinementHint: string;
    variants: AiWebSearchAmbiguityVariant[];
  };
  metadata: {
    provider: "OpenRouter";
    model: string;
    supportingSource: string | null;
    sourceUrl: null;
    sourceType: "other";
    matchConfidence: "high" | "medium" | "low";
    exactVariantMatch: false;
    sourceTitle: string;
    quotedEvidence: string;
    reasoning: string;
    debugTraceId: string;
  };
}

export type AiWebSearchOutcome = AiWebSearchResult | AiWebSearchAmbiguousResult;

function logAiWebSearch(level: "info" | "warn" | "error", message: string, payload: Record<string, unknown>) {
  // eslint-disable-next-line no-console -- deliberate server-side trace for AI fallback debugging
  console[level](`[ai-web-search] ${message}`, payload);
}

class AiWebSearchError extends Error {
  constructor(
    readonly traceId: string,
    message: string,
  ) {
    super(`[trace ${traceId}] ${message}`);
    this.name = "AiWebSearchError";
  }
}

class SourceValidationError extends AiWebSearchError {
  constructor(
    traceId: string,
    readonly sourceUrl: string | null,
    readonly reason: string,
  ) {
    super(traceId, reason);
    this.name = "SourceValidationError";
  }
}

interface RejectedSource {
  sourceUrl: string | null;
  reason: string;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ?? "";
}

function normalizeCategory(value: string): ProductCategory {
  return (PRODUCT_CATEGORY_OPTIONS as readonly string[]).includes(value) ? (value as ProductCategory) : "other";
}

function normalizeSearchText(value: string | null | undefined) {
  return normalizeOptionalText(value)
    .toLocaleLowerCase("pl-PL")
    .replace(/[®™+()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBrandSlug(brand: string | null | undefined) {
  const normalized = normalizeSearchText(brand);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s+/g, "");
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return match ? stripHtml(match[1]) : "";
}

function extractImageUrlFromHtml(html: string) {
  const ogImageMatch = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (ogImageMatch?.[1]) {
    return ogImageMatch[1].trim();
  }

  const twitterImageMatch = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(html);
  if (twitterImageMatch?.[1]) {
    return twitterImageMatch[1].trim();
  }

  const imageMatch = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html);
  return imageMatch?.[1]?.trim() ?? "";
}

function looksLikeImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

async function resolveWorkingImageUrl(candidateUrl: string | null | undefined, baseUrl?: string) {
  if (!candidateUrl) {
    return null;
  }

  let resolvedUrl: URL;
  try {
    resolvedUrl = baseUrl ? new URL(candidateUrl, baseUrl) : new URL(candidateUrl);
  } catch {
    return null;
  }

  const href = resolvedUrl.toString();
  if (!looksLikeImageUrl(href)) {
    return null;
  }

  try {
    const response = await fetch(href, {
      method: "GET",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "ShelfieBot/1.0 (+https://shelfie.local)",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      return null;
    }

    return href;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getSearchTokens(value: string | null | undefined) {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function inferSourceTypeFromHostname(
  hostname: string,
  brand: string | null | undefined,
): AiWebSearchResult["metadata"]["sourceType"] {
  if (hostname.includes("incidecoder.com")) {
    return "incidecoder";
  }

  if (
    hostname.includes("sephora") ||
    hostname.includes("douglas") ||
    hostname.includes("notino") ||
    hostname.includes("rossmann") ||
    hostname.includes("gemini")
  ) {
    return "retailer";
  }

  if (
    hostname.includes("nivea") ||
    hostname.includes("cerave") ||
    hostname.includes("laroche-posay") ||
    hostname.includes("loreal")
  ) {
    return "manufacturer";
  }

  const brandSlug = inferBrandSlug(brand);
  if (brandSlug && hostname.replace(/[-.]/g, "").includes(brandSlug)) {
    return "manufacturer";
  }

  return "other";
}

function normalizeSourceTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/\s+[|-]\s+[^|-]+$/, "")
    .replace(/\s+-\s+cena$/i, "")
    .trim();
}

async function fetchSourcePage(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ShelfieBot/1.0 (+https://shelfie.local)",
    },
  });

  const html = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    html,
    title: extractTitle(html),
    text: stripHtml(html),
    imageUrl: extractImageUrlFromHtml(html),
  };
}

function computeIncidecoderMatch(
  input: AiWebSearchInput,
  supportingLookup: Awaited<ReturnType<typeof lookupIncidecoderProduct>>,
) {
  if (!supportingLookup) {
    return {
      exactVariantMatch: false,
      matchConfidence: "low" as const,
      reasoning: "Brak pomocniczego trafienia z INCIDecoder.",
    };
  }

  const inputTokens = getSearchTokens([input.brand, input.name, input.category].filter(Boolean).join(" "));
  const resultTokens = new Set(
    getSearchTokens([supportingLookup.brand, supportingLookup.name].filter(Boolean).join(" ")),
  );
  const matchedTokenCount = inputTokens.filter((token) => resultTokens.has(token)).length;
  const tokenCoverage = inputTokens.length > 0 ? matchedTokenCount / inputTokens.length : 0;

  const brandMatches =
    !normalizeSearchText(input.brand) ||
    normalizeSearchText(supportingLookup.brand).includes(normalizeSearchText(input.brand));
  const nameMatches =
    normalizeSearchText(supportingLookup.name).includes(normalizeSearchText(input.name)) || tokenCoverage >= 0.75;
  const hasInci = supportingLookup.inciList.length > 0;

  if (brandMatches && nameMatches && hasInci) {
    return {
      exactVariantMatch: true,
      matchConfidence: tokenCoverage >= 0.9 ? ("high" as const) : ("medium" as const),
      reasoning: `INCIDecoder match accepted with token coverage ${tokenCoverage.toFixed(2)} and a populated INCI list.`,
    };
  }

  return {
    exactVariantMatch: false,
    matchConfidence: "low" as const,
    reasoning: `INCIDecoder match rejected because brand/name coverage is too weak (${tokenCoverage.toFixed(2)}) or INCI is missing.`,
  };
}

function buildMessages(input: AiWebSearchInput, supportingContext: string, rejectedSources: RejectedSource[] = []) {
  const allowedCategories = [
    { slug: "cleanser", label: "Produkt myjący", when: "cleanser, wash, foam, gel cleanser" },
    { slug: "makeup_remover", label: "Demakijaż", when: "micellar water, balm, oil cleanser used for makeup removal" },
    { slug: "toner", label: "Tonik", when: "toner / tonik" },
    { slug: "mist", label: "Mgiełka", when: "mist / mgiełka / face mist" },
    { slug: "essence", label: "Esencja", when: "essence / esencja" },
    { slug: "serum", label: "Serum", when: "serum unless a more specific category clearly fits better" },
    { slug: "ampoule", label: "Ampułka", when: "ampoule / ampułka" },
    {
      slug: "treatment",
      label: "Kuracja",
      when: "specialized treatment product that is not better classified as serum or spot_treatment",
    },
    { slug: "spot_treatment", label: "Punktowo", when: "spot treatment / punktowy produkt" },
    { slug: "exfoliant", label: "Eksfoliant", when: "acid peel, peeling, exfoliating toner or pads" },
    { slug: "mask", label: "Maska", when: "mask / sheet mask / wash-off mask" },
    { slug: "eye_cream", label: "Krem pod oczy", when: "eye cream / eye serum" },
    { slug: "moisturizer", label: "Krem", when: "day cream or night cream without SPF as primary category" },
    { slug: "face_oil", label: "Olejek do twarzy", when: "face oil" },
    {
      slug: "sunscreen",
      label: "Filtr SPF",
      when: "any face sunscreen or day cream where SPF/protection is a primary identity",
    },
    { slug: "lip_care", label: "Pielęgnacja ust", when: "lip balm / lip mask" },
    { slug: "body_care", label: "Pielęgnacja ciała", when: "body lotion / body treatment" },
    { slug: "other", label: "Inne", when: "only when nothing else clearly fits" },
  ];

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content:
        "You are helping a Polish skincare app recover a cosmetic product INCI list for human review. You MUST use web search for this task and you must issue at least one web search tool call before answering. Search the web yourself and first try to find the official manufacturer product page by searching for the brand name and product name together, not by inventing or inferring a domain pattern. If a manufacturer result appears in search, prefer it over any retailer, marketplace, or INCIDecoder page. Only if you cannot find a credible manufacturer page after searching may you use INCIDecoder or retailer pages, and you must explain that downgrade explicitly. Prefer Polish-market manufacturer pages when available, but do not fabricate .pl URLs or any URL structure. Never guess or synthesize a likely ingredient list from general knowledge. If supporting context already contains a strong exact-match ingredient list, preserve it exactly rather than paraphrasing, shortening, or substituting a similar product. The category field MUST be exactly one of the provided category slugs. Do not invent free-text categories. Use other only when no listed category clearly fits. Always try to return an imageUrl from the same accepted source page when one is available, and it must be a direct image asset URL, not an HTML page URL. Before returning imageUrl, make sure it looks like the main product photo / packshot and not an icon, logo, badge, SVG marker, decorative asset, or placeholder. If you cannot find a reliable direct product image URL, return an empty string for imageUrl. If rejectedSources are supplied, they were already validated as unusable: do not return any of them again and search for another live source. If the query is too broad or multiple plausible variants exist that differ by concentration, SPF, size, line, generation, day/night, or another identity-defining discriminator, DO NOT pick one arbitrarily. In that case return status='ambiguous' with 2 to 5 most likely variants and a short refinement question. For very broad searches like brand+category families, still return only up to 5 likely variants and let the user refine manually. Only return status='resolved' when you can verify an exact or very strong product-variant match. All user-facing text in question, refinementHint, variant label, and variant description MUST be in Polish. Return only strict JSON with keys: status, question, refinementHint, variants, name, brand, category, barcode, imageUrl, inciText, sourceUrl, sourceType, sourceTitle, quotedEvidence, matchConfidence, exactVariantMatch, reasoning. For ambiguous results, variants must be an array of objects with keys: id, label, description, refinedName, refinedBrand. For resolved results, variants should be an empty array and question/refinementHint empty strings. quotedEvidence must be a short verbatim fragment copied from the same source page that proves the exact product or INCI match. Use empty strings for unknown scalar fields, sourceType limited to manufacturer|incidecoder|retailer|other, matchConfidence limited to high|medium|low, exactVariantMatch as true/false, and status limited to resolved|ambiguous. Do not include markdown fences or commentary.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Find the most likely cosmetic product identity and ingredient list for human review.",
        market: "Poland / Polish language preference",
        searchStrategy:
          "Use web search first for the official manufacturer page by brand name plus product name. Only if no credible manufacturer page can be found may you fall back to INCIDecoder or retailers.",
        allowedCategories,
        product: {
          name: input.name,
          brand: normalizeOptionalText(input.brand),
          category: normalizeOptionalText(input.category),
          barcode: normalizeOptionalText(input.barcode),
        },
        supportingContext,
        rejectedSources,
      }),
    },
  ];

  return messages;
}

function buildAmbiguityMessages(input: AiWebSearchInput, supportingContext: string, reason: string) {
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content:
        "You are helping a Polish skincare app disambiguate a cosmetic product query before building a final review draft. You MUST use web search for this task and you must issue at least one web search tool call before answering. Search for the official manufacturer naming first. Do not return a final resolved product. Instead, return only a strict JSON object with keys: question, refinementHint, variants. All user-facing text, including question, refinementHint, variant label, and variant description, MUST be in Polish. Do not add prose before or after the JSON and do not wrap it in Markdown code fences. variants must be an array of 2 to 5 objects with keys: id, label, description, refinedName, refinedBrand. Each variant should be a plausible product the user may have meant, using concise human-facing labels and descriptions that emphasize the distinguishing feature such as concentration, SPF, size, line, or generation. Prefer manufacturer wording for refinedName. If the search space is huge, still return at most 5 likely variants and rely on refinementHint to tell the user to type a more specific name.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Disambiguate a broad or risky cosmetic search query before final product review.",
        reason,
        product: {
          name: input.name,
          brand: normalizeOptionalText(input.brand),
          category: normalizeOptionalText(input.category),
          barcode: normalizeOptionalText(input.barcode),
        },
        supportingContext,
      }),
    },
  ];

  return messages;
}

function tryParseJsonObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value.trim());
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(content: string) {
  for (let start = content.indexOf("{"); start !== -1; start = content.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < content.length; index += 1) {
      const character = content[index];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (character === "\\") {
          isEscaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParseJsonObject(content.slice(start, index + 1));
          if (parsed) {
            return parsed;
          }
          break;
        }
      }
    }
  }

  return null;
}

function parseJsonObject(content: string) {
  const fencedCandidates = Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]);
  for (const candidate of fencedCandidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const parsed = tryParseJsonObject(content) ?? extractFirstJsonObject(content);
  if (!parsed) {
    throw new Error("OpenRouter did not return a JSON object");
  }

  return parsed;
}

function parseDraftField(record: Record<string, unknown>, fieldName: string) {
  const value = record[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function parseMatchConfidence(value: unknown): AiWebSearchResult["metadata"]["matchConfidence"] {
  return value === "high" || value === "medium" ? value : "low";
}

function parseStatus(value: unknown) {
  return value === "ambiguous" ? "ambiguous" : "resolved";
}

function parseBooleanField(record: Record<string, unknown>, fieldName: string) {
  const value = record[fieldName];
  return typeof value === "boolean" ? value : false;
}

function parseAmbiguityVariants(record: Record<string, unknown>) {
  const variantsValue = record.variants;
  if (!Array.isArray(variantsValue)) {
    return [];
  }

  return variantsValue
    .map((variant, index) => {
      if (typeof variant !== "object" || variant === null || Array.isArray(variant)) {
        return null;
      }

      const variantRecord = variant as Record<string, unknown>;
      const label = parseDraftField(variantRecord, "label");
      const refinedName = parseDraftField(variantRecord, "refinedName");
      if (!label || !refinedName) {
        return null;
      }

      return {
        id: parseDraftField(variantRecord, "id") || `variant-${index + 1}`,
        label,
        description: parseDraftField(variantRecord, "description"),
        refinedName,
        refinedBrand: parseDraftField(variantRecord, "refinedBrand"),
      } satisfies AiWebSearchAmbiguityVariant;
    })
    .filter((variant): variant is AiWebSearchAmbiguityVariant => Boolean(variant))
    .slice(0, 5);
}

function normalizeDiscriminator(value: string) {
  return value.replace(/\s+/g, "").toLocaleLowerCase("pl-PL");
}

function extractIdentityDiscriminators(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const matches =
    value.match(/\bspf\s*\d+\b|\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*ml\b|\b\d+(?:[.,]\d+)+\b/gi) ?? [];
  return Array.from(new Set(matches.map((match) => normalizeDiscriminator(match))));
}

function hasSharedDiscriminator(left: string[], right: string[]) {
  return left.some((token) => right.includes(token));
}

function shouldForceVariantClarification(
  input: AiWebSearchInput,
  resolvedName: string,
  sourceTitle: string,
  quotedEvidence: string,
) {
  const inputDiscriminators = extractIdentityDiscriminators([input.name, input.brand].filter(Boolean).join(" "));
  const nameDiscriminators = extractIdentityDiscriminators(resolvedName);
  const titleDiscriminators = extractIdentityDiscriminators(sourceTitle);
  const evidenceDiscriminators = extractIdentityDiscriminators(quotedEvidence);
  const resolvedDiscriminators = Array.from(
    new Set([...nameDiscriminators, ...titleDiscriminators, ...evidenceDiscriminators]),
  );

  const hasResolvedDiscriminator = resolvedDiscriminators.length > 0;
  const inputIsBroadAgainstResolved = hasResolvedDiscriminator && inputDiscriminators.length === 0;
  const fieldsConflict =
    nameDiscriminators.length > 0 &&
    titleDiscriminators.length > 0 &&
    !hasSharedDiscriminator(nameDiscriminators, titleDiscriminators);

  return {
    shouldClarify: inputIsBroadAgainstResolved || fieldsConflict,
    reason: fieldsConflict
      ? "Resolved fields disagree on a key discriminator such as concentration, SPF, size, or version."
      : inputIsBroadAgainstResolved
        ? "Resolved product contains identity discriminators that were not present in the user query."
        : "",
  };
}

async function requestOpenRouter(
  messages: OpenRouterMessage[],
  traceId: string,
  stage: "resolve" | "resolve_retry" | "ambiguity",
) {
  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      messages,
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            engine: "auto",
            max_results: 5,
            search_context_size: "medium",
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logAiWebSearch("error", "OpenRouter request failed", {
      traceId,
      stage,
      status: response.status,
      errorBody,
    });
    throw new AiWebSearchError(traceId, `OpenRouter request failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    logAiWebSearch("error", "OpenRouter returned no content", {
      traceId,
      stage,
      payload,
    });
    throw new AiWebSearchError(traceId, "OpenRouter did not return any draft content");
  }

  logAiWebSearch("info", "Raw model content", {
    traceId,
    stage,
    content,
    webSearchRequests: payload.usage?.server_tool_use?.web_search_requests ?? 0,
  });

  return parseJsonObject(content);
}

async function resolveAmbiguityResult(
  input: AiWebSearchInput,
  supportingContext: string,
  supportingSource: string | null,
  traceId: string,
  reason: string,
): Promise<AiWebSearchAmbiguousResult> {
  const parsed = await requestOpenRouter(
    buildAmbiguityMessages(input, supportingContext, reason),
    traceId,
    "ambiguity",
  );
  const variants = parseAmbiguityVariants(parsed);
  if (variants.length === 0) {
    throw new AiWebSearchError(traceId, "AI web search nie podał wariantów do doprecyzowania.");
  }

  const reasoning = parseDraftField(parsed, "reasoning") || reason;

  return {
    status: "ambiguous",
    ambiguity: {
      question:
        parseDraftField(parsed, "question") || "Znaleźliśmy kilka podobnych wariantów. Który produkt masz na myśli?",
      refinementHint:
        parseDraftField(parsed, "refinementHint") ||
        "Jeśli nie widzisz swojego wariantu, wpisz dokładniejszą nazwę, np. ze stężeniem, SPF albo pojemnością.",
      variants,
    },
    metadata: {
      provider: "OpenRouter",
      model: OPENROUTER_MODEL,
      supportingSource,
      sourceUrl: null,
      sourceType: "other",
      matchConfidence: "medium",
      exactVariantMatch: false,
      sourceTitle: "",
      quotedEvidence: "",
      reasoning,
      debugTraceId: traceId,
    },
  };
}

async function validateModelSource(input: AiWebSearchInput, parsed: Record<string, unknown>, traceId: string) {
  const sourceUrl = parseDraftField(parsed, "sourceUrl");
  const quotedEvidence = parseDraftField(parsed, "quotedEvidence");

  if (!sourceUrl) {
    throw new SourceValidationError(traceId, null, "Model nie zwrócił adresu źródła do weryfikacji.");
  }

  const normalizedUrl = normalizeUrl(sourceUrl);
  if (!normalizedUrl) {
    throw new SourceValidationError(traceId, sourceUrl, "Model zwrócił nieprawidłowy adres źródła.");
  }

  let page: Awaited<ReturnType<typeof fetchSourcePage>>;
  try {
    page = await fetchSourcePage(normalizedUrl.toString());
  } catch (error) {
    throw new SourceValidationError(
      traceId,
      normalizedUrl.toString(),
      `Nie udało się połączyć ze stroną źródłową: ${error instanceof Error ? error.message : "nieznany błąd"}.`,
    );
  }
  logAiWebSearch("info", "Fetched source page for validation", {
    traceId,
    sourceUrl: normalizedUrl.toString(),
    status: page.status,
    title: page.title,
  });

  if (!page.ok) {
    throw new SourceValidationError(traceId, normalizedUrl.toString(), `Strona źródłowa zwróciła HTTP ${page.status}.`);
  }

  const sourceType = inferSourceTypeFromHostname(normalizedUrl.hostname, input.brand);

  logAiWebSearch("info", "Validated source page evidence", {
    traceId,
    sourceType,
    title: page.title,
    quotedEvidence,
  });

  return {
    sourceUrl: normalizedUrl.toString(),
    sourceTitle: normalizeSourceTitle(page.title),
    sourceType,
    quotedEvidence,
    imageUrl: page.imageUrl,
  };
}

export async function resolveAiWebSearchDraft(input: AiWebSearchInput): Promise<AiWebSearchOutcome> {
  const traceId = crypto.randomUUID();

  if (!OPENROUTER_API_KEY) {
    logAiWebSearch("error", "OpenRouter key missing", {
      traceId,
    });
    throw new AiWebSearchError(traceId, "OpenRouter nie jest skonfigurowany. Uzupełnij OPENROUTER_API_KEY.");
  }

  logAiWebSearch("info", "Starting AI web search", {
    traceId,
    input,
  });

  const supportingLookup = await lookupIncidecoderProduct(
    [normalizeOptionalText(input.brand), input.name, normalizeOptionalText(input.category)].filter(Boolean).join(" "),
  );
  const supportingMatch = computeIncidecoderMatch(input, supportingLookup);

  logAiWebSearch("info", "Supporting lookup resolved", {
    traceId,
    supportingLookup: supportingLookup
      ? {
          url: supportingLookup.url,
          name: supportingLookup.name,
          brand: supportingLookup.brand,
          imageUrl: supportingLookup.imageUrl,
          inciCount: supportingLookup.inciList.length,
        }
      : null,
    supportingMatch,
  });

  const supportingContext = supportingLookup
    ? JSON.stringify({
        source: "INCIDecoder",
        url: supportingLookup.url,
        suggestedName: supportingLookup.name,
        suggestedBrand: supportingLookup.brand,
        suggestedImageUrl: supportingLookup.imageUrl,
        suggestedInciText: supportingLookup.inciList.join(", "),
        supportingMatch,
      })
    : JSON.stringify({
        source: null,
        supportingMatch,
      });

  const rejectedSources: RejectedSource[] = [];
  let parsed: Record<string, unknown> | null = null;
  let sourceValidation: Awaited<ReturnType<typeof validateModelSource>> | null = null;

  for (let attempt = 0; attempt <= MAX_SOURCE_VALIDATION_RETRIES; attempt += 1) {
    const nextParsed = await requestOpenRouter(
      buildMessages(input, supportingContext, rejectedSources),
      traceId,
      attempt === 0 ? "resolve" : "resolve_retry",
    );
    const status = parseStatus(nextParsed.status);
    const reasoning = parseDraftField(nextParsed, "reasoning");
    const matchConfidence = parseMatchConfidence(nextParsed.matchConfidence);

    if (status === "ambiguous") {
      logAiWebSearch("info", "Model returned ambiguous result", {
        traceId,
        reasoning,
        matchConfidence,
      });
      return resolveAmbiguityResult(input, supportingContext, supportingLookup?.url ?? null, traceId, reasoning);
    }

    try {
      sourceValidation = await validateModelSource(input, nextParsed, traceId);
      parsed = nextParsed;
      break;
    } catch (error) {
      if (!(error instanceof SourceValidationError) || attempt === MAX_SOURCE_VALIDATION_RETRIES) {
        throw error;
      }
      rejectedSources.push({ sourceUrl: error.sourceUrl, reason: error.reason });
      logAiWebSearch("warn", "Source validation failed; retrying AI search", {
        traceId,
        attempt: attempt + 1,
        maxRetries: MAX_SOURCE_VALIDATION_RETRIES,
        rejectedSource: error.sourceUrl,
        reason: error.reason,
      });
    }
  }

  if (!parsed || !sourceValidation) {
    throw new AiWebSearchError(traceId, "Nie udało się znaleźć działającej strony źródłowej produktu.");
  }

  const reasoning = parseDraftField(parsed, "reasoning");
  const matchConfidence = parseMatchConfidence(parsed.matchConfidence);
  const parsedImageUrl = parseDraftField(parsed, "imageUrl");
  const exactVariantMatch = parseBooleanField(parsed, "exactVariantMatch");
  const parsedName = parseDraftField(parsed, "name");
  const sourceTitle = normalizeSourceTitle(parseDraftField(parsed, "sourceTitle") || sourceValidation.sourceTitle);
  const quotedEvidence = sourceValidation.quotedEvidence;
  const clarificationCheck = shouldForceVariantClarification(
    input,
    parsedName || input.name,
    sourceTitle,
    quotedEvidence,
  );

  logAiWebSearch("info", "Parsed model payload", {
    traceId,
    parsed,
    sourceUrl: sourceValidation.sourceUrl,
    sourceType: sourceValidation.sourceType,
    matchConfidence,
    exactVariantMatch,
    sourceTitle,
    quotedEvidence,
    clarificationCheck,
  });
  const finalName = parsedName || (supportingLookup?.name ?? input.name);

  const validatedImageUrl =
    (await resolveWorkingImageUrl(parsedImageUrl, sourceValidation.sourceUrl)) ??
    (await resolveWorkingImageUrl(sourceValidation.imageUrl, sourceValidation.sourceUrl)) ??
    (await resolveWorkingImageUrl(supportingLookup?.imageUrl));

  const draft: AiWebSearchDraft = {
    name: finalName,
    brand: parseDraftField(parsed, "brand") || normalizeOptionalText(input.brand),
    category: normalizeCategory(parseDraftField(parsed, "category") || normalizeOptionalText(input.category)),
    barcode: parseDraftField(parsed, "barcode") || normalizeOptionalText(input.barcode),
    sourceImageUrl: validatedImageUrl ?? "",
    storedImageUrl: "",
    inciText: parseDraftField(parsed, "inciText"),
    inciSource: "ai_web_search",
    inciConfidence: "medium",
  };

  if (!draft.name || !draft.inciText) {
    logAiWebSearch("warn", "Draft rejected because required fields are missing", {
      traceId,
      draft,
      reasoning,
      sourceTitle,
      quotedEvidence,
      validatedImageUrl,
    });
    throw new AiWebSearchError(traceId, "OpenRouter nie zwrócił wystarczająco kompletnego draftu produktu");
  }

  if (!exactVariantMatch || matchConfidence === "low") {
    logAiWebSearch("warn", "Draft rejected because variant match is not strong enough", {
      traceId,
      draft,
      sourceUrl: sourceValidation.sourceUrl,
      sourceType: sourceValidation.sourceType,
      matchConfidence,
      exactVariantMatch,
      reasoning,
      sourceTitle,
      quotedEvidence,
    });
    throw new AiWebSearchError(
      traceId,
      "AI web search nie potwierdził wystarczająco pewnego dopasowania wariantu produktu",
    );
  }

  if (clarificationCheck.shouldClarify) {
    logAiWebSearch("warn", "Resolved result downgraded to ambiguity", {
      traceId,
      draft,
      clarificationCheck,
      sourceUrl: sourceValidation.sourceUrl,
      sourceTitle,
    });
    return resolveAmbiguityResult(
      input,
      supportingContext,
      supportingLookup?.url ?? null,
      traceId,
      clarificationCheck.reason,
    );
  }

  logAiWebSearch("info", "Draft accepted", {
    traceId,
    draft,
    sourceUrl: sourceValidation.sourceUrl,
    sourceType: sourceValidation.sourceType,
    matchConfidence,
    exactVariantMatch,
    reasoning,
    sourceTitle,
    quotedEvidence,
  });

  return {
    status: "resolved",
    draft,
    metadata: {
      provider: "OpenRouter",
      model: OPENROUTER_MODEL,
      supportingSource: supportingLookup?.url ?? null,
      sourceUrl: sourceValidation.sourceUrl,
      sourceType: sourceValidation.sourceType,
      matchConfidence,
      exactVariantMatch,
      sourceTitle,
      quotedEvidence,
      reasoning,
      debugTraceId: traceId,
    },
  };
}
