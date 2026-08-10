import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INGREDIENT_GLOSSARY_MODEL_VERSION,
  INGREDIENT_GLOSSARY_PROMPT_VERSION,
  generateIngredientGlossaryDefinitions,
} from "@/lib/integrations/openrouter-ingredient-glossary";

export const INGREDIENT_GLOSSARY_STATUS_OPTIONS = ["pending", "ready", "failed", "stale"] as const;
export const INGREDIENT_GLOSSARY_ACTION_OPTIONS = ["prepare", "retry", "refresh"] as const;

export type IngredientGlossaryStatus = (typeof INGREDIENT_GLOSSARY_STATUS_OPTIONS)[number];
export type IngredientGlossaryAction = (typeof INGREDIENT_GLOSSARY_ACTION_OPTIONS)[number];

type IngredientGlossaryClient = SupabaseClient;

const INGREDIENT_GLOSSARY_COLUMNS = [
  "id",
  "inci_key",
  "display_name",
  "status",
  "cosmetic_role",
  "summary",
  "likely_benefits",
  "caveats",
  "source_kind",
  "source_reference",
  "model_version",
  "prompt_version",
  "generated_at",
  "stale_at",
  "stale_reason",
  "last_error",
  "created_at",
  "updated_at",
].join(", ");

interface IngredientGlossaryRow {
  id: string;
  inci_key: string;
  display_name: string;
  status: string;
  cosmetic_role: string | null;
  summary: string | null;
  likely_benefits: unknown;
  caveats: unknown;
  source_kind: string;
  source_reference: string | null;
  model_version: string | null;
  prompt_version: string | null;
  generated_at: string | null;
  stale_at: string | null;
  stale_reason: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngredientGlossaryRequest {
  inciKey: string;
  displayName: string;
}

export interface IngredientGlossaryDefinition {
  inciKey: string;
  cosmeticRole: string | null;
  summary: string;
  likelyBenefits: string[];
  caveats: string[];
}

export interface IngredientGlossaryEntry {
  id: string;
  inciKey: string;
  displayName: string;
  status: IngredientGlossaryStatus;
  cosmeticRole: string | null;
  summary: string | null;
  likelyBenefits: string[];
  caveats: string[];
  sourceKind: string;
  sourceReference: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  generatedAt: string | null;
  staleAt: string | null;
  staleReason: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientGlossaryItem extends IngredientGlossaryRequest {
  index: number;
  entry: IngredientGlossaryEntry | null;
}

export interface IngredientGlossaryPreparationResult {
  entries: IngredientGlossaryEntry[];
  readyCount: number;
  failedCount: number;
  pendingCount: number;
  missingCount: number;
  remainingCount: number;
}

const MAX_INGREDIENT_GLOSSARY_ENTRIES_PER_OPERATION = 48;
const INGREDIENT_GLOSSARY_PROVIDER_CHUNK_SIZE = 12;

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : null;
}

function normalizeDisplayName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function isIngredientGlossaryStatus(value: unknown): value is IngredientGlossaryStatus {
  return typeof value === "string" && (INGREDIENT_GLOSSARY_STATUS_OPTIONS as readonly string[]).includes(value);
}

function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.flatMap((item) => (typeof item === "string" ? [item.trim()] : [])).filter((item) => item.length > 0)),
  );
}

function mapIngredientGlossaryRow(row: IngredientGlossaryRow): IngredientGlossaryEntry {
  return {
    id: row.id,
    inciKey: row.inci_key,
    displayName: row.display_name,
    status: isIngredientGlossaryStatus(row.status) ? row.status : "failed",
    cosmeticRole: normalizeOptionalText(row.cosmetic_role),
    summary: normalizeOptionalText(row.summary),
    likelyBenefits: normalizeTextArray(row.likely_benefits),
    caveats: normalizeTextArray(row.caveats),
    sourceKind: row.source_kind,
    sourceReference: normalizeOptionalText(row.source_reference),
    modelVersion: normalizeOptionalText(row.model_version),
    promptVersion: normalizeOptionalText(row.prompt_version),
    generatedAt: row.generated_at,
    staleAt: row.stale_at,
    staleReason: normalizeOptionalText(row.stale_reason),
    lastError: normalizeOptionalText(row.last_error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeIngredientInciKey(value: string) {
  return normalizeDisplayName(value).toLocaleLowerCase("en-US");
}

export function createIngredientGlossaryRequests(inciList: string[]): IngredientGlossaryRequest[] {
  const requestsByKey = new Map<string, IngredientGlossaryRequest>();

  for (const ingredient of inciList) {
    const displayName = normalizeDisplayName(ingredient);
    const inciKey = normalizeIngredientInciKey(displayName);
    if (!displayName || !inciKey || requestsByKey.has(inciKey)) {
      continue;
    }

    requestsByKey.set(inciKey, { inciKey, displayName });
  }

  return [...requestsByKey.values()];
}

export function isIngredientGlossaryAction(value: unknown): value is IngredientGlossaryAction {
  return typeof value === "string" && (INGREDIENT_GLOSSARY_ACTION_OPTIONS as readonly string[]).includes(value);
}

export function getIngredientGlossaryStaleReason(
  entry: IngredientGlossaryEntry,
  versions: { modelVersion: string; promptVersion: string },
) {
  if (entry.status !== "ready") {
    return entry.status === "stale" ? (entry.staleReason ?? "version_changed") : null;
  }

  if (entry.promptVersion !== versions.promptVersion) {
    return "prompt_version_changed";
  }

  if (entry.modelVersion !== versions.modelVersion) {
    return "model_version_changed";
  }

  return null;
}

export function applyIngredientGlossaryFreshness(
  entry: IngredientGlossaryEntry,
  versions: { modelVersion: string; promptVersion: string },
): IngredientGlossaryEntry {
  const staleReason = getIngredientGlossaryStaleReason(entry, versions);
  if (!staleReason || entry.status === "stale") {
    return entry;
  }

  return {
    ...entry,
    status: "stale",
    staleReason,
  };
}

export async function listIngredientGlossaryEntries(
  supabase: IngredientGlossaryClient,
  requests: IngredientGlossaryRequest[],
  versions?: { modelVersion: string; promptVersion: string },
) {
  const keys = Array.from(new Set(requests.map((request) => request.inciKey).filter(Boolean)));
  if (keys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("ingredient_glossary_entries")
    .select(INGREDIENT_GLOSSARY_COLUMNS)
    .in("inci_key", keys);

  if (error) {
    throw new Error(`Nie udało się wczytać słownika składników: ${error.message}`);
  }

  const entries = data.map((row) => mapIngredientGlossaryRow(row as IngredientGlossaryRow));
  return versions ? entries.map((entry) => applyIngredientGlossaryFreshness(entry, versions)) : entries;
}

export function createIngredientGlossaryItems(
  inciList: string[],
  entries: IngredientGlossaryEntry[],
): IngredientGlossaryItem[] {
  const entriesByKey = new Map(entries.map((entry) => [entry.inciKey, entry]));

  return inciList.flatMap((ingredient, index) => {
    const displayName = normalizeDisplayName(ingredient);
    const inciKey = normalizeIngredientInciKey(displayName);
    if (!displayName || !inciKey) {
      return [];
    }

    return [
      {
        inciKey,
        displayName,
        index,
        entry: entriesByKey.get(inciKey) ?? null,
      },
    ];
  });
}

export async function insertPendingIngredientGlossaryEntries(
  supabase: IngredientGlossaryClient,
  requests: IngredientGlossaryRequest[],
) {
  if (requests.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("ingredient_glossary_entries")
    .upsert(
      requests.map((request) => ({
        inci_key: request.inciKey,
        display_name: request.displayName,
        status: "pending" satisfies IngredientGlossaryStatus,
      })),
      { onConflict: "inci_key", ignoreDuplicates: true },
    )
    .select(INGREDIENT_GLOSSARY_COLUMNS);

  if (error) {
    throw new Error(`Nie udało się przygotować wpisów słownika: ${error.message}`);
  }

  return data.map((row) => mapIngredientGlossaryRow(row as IngredientGlossaryRow));
}

export async function claimIngredientGlossaryEntries(
  supabase: IngredientGlossaryClient,
  entries: IngredientGlossaryEntry[],
  action: Extract<IngredientGlossaryAction, "retry" | "refresh">,
) {
  const claimableEntries = entries.filter((entry) => entry.status === "failed" || entry.status === "stale");
  if (claimableEntries.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("ingredient_glossary_entries")
    .update({
      status: "pending" satisfies IngredientGlossaryStatus,
      stale_at: null,
      stale_reason: null,
      last_error: null,
    })
    .in(
      "inci_key",
      claimableEntries.map((entry) => entry.inciKey),
    )
    .in("status", action === "refresh" ? ["stale", "ready"] : ["failed"])
    .select(INGREDIENT_GLOSSARY_COLUMNS);

  if (error) {
    throw new Error(`Nie udało się przygotować ponowienia słownika: ${error.message}`);
  }

  return data.map((row) => mapIngredientGlossaryRow(row as IngredientGlossaryRow));
}

export async function saveReadyIngredientGlossaryEntry(
  supabase: IngredientGlossaryClient,
  definition: IngredientGlossaryDefinition,
  versions: { modelVersion: string; promptVersion: string },
) {
  const { data, error } = await supabase
    .from("ingredient_glossary_entries")
    .update({
      status: "ready" satisfies IngredientGlossaryStatus,
      cosmetic_role: normalizeOptionalText(definition.cosmeticRole),
      summary: definition.summary.trim(),
      likely_benefits: normalizeTextArray(definition.likelyBenefits),
      caveats: normalizeTextArray(definition.caveats),
      source_kind: "ai_generated",
      source_reference: null,
      model_version: versions.modelVersion,
      prompt_version: versions.promptVersion,
      generated_at: new Date().toISOString(),
      stale_at: null,
      stale_reason: null,
      last_error: null,
    })
    .eq("inci_key", definition.inciKey)
    .select(INGREDIENT_GLOSSARY_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Nie udało się zapisać opisu składnika: ${error.message}`);
  }

  return mapIngredientGlossaryRow(data as IngredientGlossaryRow);
}

export async function markIngredientGlossaryEntriesFailed(
  supabase: IngredientGlossaryClient,
  entries: IngredientGlossaryRequest[],
  errorMessage: string,
) {
  const keys = entries.map((entry) => entry.inciKey);
  if (keys.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("ingredient_glossary_entries")
    .update({
      status: "failed" satisfies IngredientGlossaryStatus,
      last_error: errorMessage.trim() || "Nie udało się przygotować opisu składnika.",
    })
    .in("inci_key", keys)
    .eq("status", "pending")
    .select(INGREDIENT_GLOSSARY_COLUMNS);

  if (error) {
    throw new Error(`Nie udało się oznaczyć błędu słownika: ${error.message}`);
  }

  return data.map((row) => mapIngredientGlossaryRow(row as IngredientGlossaryRow));
}

function chunkRequests(requests: IngredientGlossaryRequest[]) {
  const chunks: IngredientGlossaryRequest[][] = [];
  for (let index = 0; index < requests.length; index += INGREDIENT_GLOSSARY_PROVIDER_CHUNK_SIZE) {
    chunks.push(requests.slice(index, index + INGREDIENT_GLOSSARY_PROVIDER_CHUNK_SIZE));
  }
  return chunks;
}

function getPreparationCandidates(
  requests: IngredientGlossaryRequest[],
  entries: IngredientGlossaryEntry[],
  action: IngredientGlossaryAction,
) {
  const entriesByKey = new Map(entries.map((entry) => [entry.inciKey, entry]));

  return requests.filter((request) => {
    const entry = entriesByKey.get(request.inciKey);
    if (action === "prepare") {
      return !entry;
    }

    return action === "retry" ? entry?.status === "failed" : entry?.status === "stale";
  });
}

function summarizePreparation(
  requests: IngredientGlossaryRequest[],
  entries: IngredientGlossaryEntry[],
  action: IngredientGlossaryAction,
): IngredientGlossaryPreparationResult {
  const entriesByKey = new Map(entries.map((entry) => [entry.inciKey, entry]));
  const readyCount = entries.filter((entry) => entry.status === "ready").length;
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const pendingCount = entries.filter((entry) => entry.status === "pending").length;
  const missingCount = requests.filter((request) => !entriesByKey.has(request.inciKey)).length;

  return {
    entries,
    readyCount,
    failedCount,
    pendingCount,
    missingCount,
    remainingCount: getPreparationCandidates(requests, entries, action).length,
  };
}

export async function prepareIngredientGlossaryEntries(
  supabase: IngredientGlossaryClient,
  inciList: string[],
  action: IngredientGlossaryAction,
): Promise<IngredientGlossaryPreparationResult> {
  const requests = createIngredientGlossaryRequests(inciList);
  const versions = {
    modelVersion: INGREDIENT_GLOSSARY_MODEL_VERSION,
    promptVersion: INGREDIENT_GLOSSARY_PROMPT_VERSION,
  };
  const currentEntries = await listIngredientGlossaryEntries(supabase, requests, versions);
  const candidateRequests = getPreparationCandidates(requests, currentEntries, action).slice(
    0,
    MAX_INGREDIENT_GLOSSARY_ENTRIES_PER_OPERATION,
  );

  if (candidateRequests.length === 0) {
    return summarizePreparation(requests, currentEntries, action);
  }

  let claimedEntries: IngredientGlossaryEntry[];
  if (action === "prepare") {
    claimedEntries = await insertPendingIngredientGlossaryEntries(supabase, candidateRequests);
  } else {
    const candidatesByKey = new Set(candidateRequests.map((request) => request.inciKey));
    claimedEntries = await claimIngredientGlossaryEntries(
      supabase,
      currentEntries.filter((entry) => candidatesByKey.has(entry.inciKey)),
      action,
    );
  }

  const claimedKeys = new Set(claimedEntries.map((entry) => entry.inciKey));
  const claimedRequests = candidateRequests.filter((request) => claimedKeys.has(request.inciKey));

  for (const requestChunk of chunkRequests(claimedRequests)) {
    try {
      const generated = await generateIngredientGlossaryDefinitions(requestChunk);
      const definitionsByKey = new Map(generated.definitions.map((definition) => [definition.inciKey, definition]));

      for (const definition of generated.definitions) {
        await saveReadyIngredientGlossaryEntry(supabase, definition, versions);
      }

      const rejectedRequests = requestChunk.filter(
        (request) => !definitionsByKey.has(request.inciKey) || generated.rejectedKeys.includes(request.inciKey),
      );
      await markIngredientGlossaryEntriesFailed(
        supabase,
        rejectedRequests,
        "Model nie zwrócił poprawnego opisu dla tego składnika. Spróbuj ponownie.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nie udało się przygotować opisów składników.";
      await markIngredientGlossaryEntriesFailed(supabase, requestChunk, message);
    }
  }

  const finalEntries = await listIngredientGlossaryEntries(supabase, requests, versions);
  return summarizePreparation(requests, finalEntries, action);
}
