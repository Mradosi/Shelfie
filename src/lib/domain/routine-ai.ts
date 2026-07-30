import type { ProductCategory, SharedProduct } from "@/lib/domain/product-domain";
import type { UserProductInterpretation } from "@/lib/domain/product-interpretation";
import {
  BASE_ROUTINE_SECTION_KEYS,
  hasNonEmptyBaseRoutine,
  isRoutineRole,
  parseBaseRoutineDraft,
  type BaseRoutineDraft,
  type BaseRoutineSectionKey,
  type RoutineRole,
} from "@/lib/domain/routine-schedule";
import type { UserProfileInterpretationBasis, UserShelfCatalogItem } from "@/lib/domain/user-domain";

export const MAX_ROUTINE_AI_MISSING_STEPS = 3;
export const MAX_ROUTINE_AI_CANDIDATES_PER_STEP = 4;
export const MAX_ROUTINE_AI_CANDIDATES_TOTAL = 12;
export const MAX_ROUTINE_AI_RECOMMENDATIONS_PER_STEP = 3;

export interface RoutineAiEntryReason {
  section: BaseRoutineSectionKey;
  shelfItemId: string;
  routineRole: RoutineRole;
  reason: string;
}

export interface RoutineAiMissingStep {
  section: BaseRoutineSectionKey;
  routineRole: Exclude<RoutineRole, "other">;
  reason: string;
}

export interface RoutineAiProposal {
  summary: string;
  routine: BaseRoutineDraft;
  entryReasons: RoutineAiEntryReason[];
  missingSteps: RoutineAiMissingStep[];
}

export interface RoutineAiShelfInput {
  shelfItem: UserShelfCatalogItem;
  interpretation: UserProductInterpretation;
}

export interface RoutineAiCatalogCandidate {
  product: SharedProduct;
  interpretation: UserProductInterpretation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} musi być niepustym tekstem.`);
  }

  return value.trim();
}

function parseSection(value: unknown, fieldName: string): BaseRoutineSectionKey {
  if (typeof value === "string" && (BASE_ROUTINE_SECTION_KEYS as readonly string[]).includes(value)) {
    return value as BaseRoutineSectionKey;
  }

  throw new Error(`${fieldName} musi wskazywać sekcję morning albo evening.`);
}

function parseMissingStep(value: unknown, index: number): RoutineAiMissingStep {
  if (!isRecord(value)) {
    throw new Error(`Brakujący krok ${index + 1} musi być obiektem.`);
  }

  const routineRole = value.routine_role ?? value.routineRole;
  if (!isRoutineRole(routineRole) || routineRole === "other") {
    throw new Error("Brakujący krok musi używać konkretnej obsługiwanej roli rutyny.");
  }

  return {
    section: parseSection(value.section, "Sekcja brakującego kroku"),
    routineRole,
    reason: requiredText(value.reason, "Uzasadnienie brakującego kroku"),
  };
}

function parseEntryReason(value: unknown, index: number): RoutineAiEntryReason {
  if (!isRecord(value)) {
    throw new Error(`Uzasadnienie wpisu ${index + 1} musi być obiektem.`);
  }

  const routineRole = value.routine_role ?? value.routineRole;
  if (!isRoutineRole(routineRole)) {
    throw new Error("Uzasadnienie wpisu używa nieobsługiwanej roli rutyny.");
  }

  return {
    section: parseSection(value.section, "Sekcja uzasadnienia"),
    shelfItemId: requiredText(value.shelf_item_id ?? value.shelfItemId, "Produkt uzasadnienia"),
    routineRole,
    reason: requiredText(value.reason, "Uzasadnienie wpisu"),
  };
}

export function parseRoutineAiProposal(input: unknown, ownedShelfItemIds: Iterable<string>): RoutineAiProposal {
  if (!isRecord(input)) {
    throw new Error("Propozycja AI musi być obiektem.");
  }

  const routine = parseBaseRoutineDraft(input.routine);
  if (!hasNonEmptyBaseRoutine(routine)) {
    throw new Error("Propozycja AI musi zawierać co najmniej jeden krok rutyny.");
  }

  const ownedIds = new Set(ownedShelfItemIds);
  for (const section of BASE_ROUTINE_SECTION_KEYS) {
    for (const entry of routine[section]) {
      if (!ownedIds.has(entry.shelfItemId)) {
        throw new Error("Propozycja AI odwołuje się do produktu spoza Twojej półki.");
      }
    }
  }

  const entryReasonsRaw = input.entry_reasons ?? input.entryReasons;
  if (!Array.isArray(entryReasonsRaw)) {
    throw new Error("Propozycja AI musi zawierać listę uzasadnień wpisów.");
  }
  const entryReasons = entryReasonsRaw.map(parseEntryReason);
  const proposedEntries = new Set(
    BASE_ROUTINE_SECTION_KEYS.flatMap((section) =>
      routine[section].map((entry) => `${section}:${entry.shelfItemId}:${entry.routineRole}`),
    ),
  );
  const reasonEntries = new Set<string>();
  for (const entryReason of entryReasons) {
    const key = `${entryReason.section}:${entryReason.shelfItemId}:${entryReason.routineRole}`;
    if (!ownedIds.has(entryReason.shelfItemId) || !proposedEntries.has(key) || reasonEntries.has(key)) {
      throw new Error("Uzasadnienia propozycji AI nie odpowiadają wpisom rutyny.");
    }
    reasonEntries.add(key);
  }
  if (Array.from(proposedEntries).some((entry) => !reasonEntries.has(entry))) {
    throw new Error("Każdy wpis propozycji AI musi mieć krótkie uzasadnienie.");
  }

  const missingRaw = input.missing_steps ?? input.missingSteps ?? [];
  if (!Array.isArray(missingRaw) || missingRaw.length > MAX_ROUTINE_AI_MISSING_STEPS) {
    throw new Error(`Propozycja AI może wskazać maksymalnie ${MAX_ROUTINE_AI_MISSING_STEPS} brakujące kroki.`);
  }
  const missingSteps = missingRaw.map(parseMissingStep);
  const missingKeys = new Set<string>();
  for (const missingStep of missingSteps) {
    const key = `${missingStep.section}:${missingStep.routineRole}`;
    if (missingKeys.has(key)) {
      throw new Error("Propozycja AI powtarza ten sam brakujący krok.");
    }
    missingKeys.add(key);
  }

  return {
    summary: requiredText(input.summary, "Podsumowanie propozycji"),
    routine,
    entryReasons,
    missingSteps,
  };
}

export function parseRoutineAiMissingSteps(input: unknown): RoutineAiMissingStep[] {
  if (!Array.isArray(input) || input.length > MAX_ROUTINE_AI_MISSING_STEPS) {
    throw new Error(`Możesz sprawdzić maksymalnie ${MAX_ROUTINE_AI_MISSING_STEPS} brakujące kroki.`);
  }

  const missingSteps = input.map(parseMissingStep);
  const uniqueKeys = new Set(missingSteps.map((step) => `${step.section}:${step.routineRole}`));
  if (uniqueKeys.size !== missingSteps.length) {
    throw new Error("Brakujące kroki nie mogą się powtarzać.");
  }

  return missingSteps;
}

const ROUTINE_ROLE_PRODUCT_CATEGORIES: Record<RoutineRole, ProductCategory[]> = {
  cleanse: ["cleanser"],
  moisturize: ["moisturizer", "face_oil"],
  protect: ["sunscreen"],
  tone: ["toner", "mist", "essence"],
  treat: ["serum", "ampoule", "treatment", "spot_treatment"],
  exfoliate: ["exfoliant"],
  remove_makeup: ["makeup_remover"],
  care_mask: ["mask"],
  eye_care: ["eye_cream"],
  other: [],
};

export function getProductCategoriesForRoutineRole(role: RoutineRole) {
  return ROUTINE_ROLE_PRODUCT_CATEGORIES[role];
}

export function isProductCategoryAllowedForRoutineRole(role: RoutineRole, category: string | null) {
  return category !== null && getProductCategoriesForRoutineRole(role).includes(category as ProductCategory);
}

export function createRoutineAiPromptInput(
  profile: UserProfileInterpretationBasis,
  currentDraft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
) {
  return {
    profile,
    currentDraft,
    shelf: shelf.map(({ shelfItem, interpretation }) => ({
      shelfItemId: shelfItem.id,
      product: {
        name: shelfItem.product.name,
        brand: shelfItem.product.brand,
        category: shelfItem.product.category,
      },
      fit: {
        status: interpretation.fitStatus,
        score: interpretation.fitScore,
        confidence: interpretation.confidence,
        summary: interpretation.summaryShort,
        reasoning: interpretation.reasoningShort,
        recommendedFor: interpretation.recommendedFor,
        cautionFor: interpretation.cautionFor,
        warnings: interpretation.warnings,
      },
    })),
  };
}
