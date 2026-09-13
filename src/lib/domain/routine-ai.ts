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
import {
  MAX_SHELF_ITEM_NOTE_LENGTH,
  type UserProfileInterpretationBasis,
  type UserShelfCatalogItem,
} from "@/lib/domain/user-domain";

export const MAX_ROUTINE_AI_MISSING_STEPS = 3;
export const MAX_ROUTINE_AI_CANDIDATES_PER_STEP = 4;
export const MAX_ROUTINE_AI_CANDIDATES_TOTAL = 12;
export const MAX_ROUTINE_AI_RECOMMENDATIONS_PER_STEP = 3;
export const ROUTINE_AI_ASSESSMENT_INPUT_VERSION = "routine-assessment-v5";

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
  assessment: RoutineAiAssessment | null;
}

export interface RoutineAiShelfInput {
  shelfItem: UserShelfCatalogItem;
  product: SharedProduct;
  interpretation: UserProductInterpretation;
}

export const ROUTINE_AI_ASSESSMENT_SEVERITIES = ["high", "medium", "low"] as const;
export const ROUTINE_AI_ASSESSMENT_STATUSES = ["requires_attention", "considered"] as const;
export const ROUTINE_AI_PAIR_ASSESSMENT_VERDICTS = [
  "no_material_interaction",
  "potential_compatibility_issue",
  "potential_tolerance_burden",
  "uncertain",
] as const;

export type RoutineAiAssessmentSeverity = (typeof ROUTINE_AI_ASSESSMENT_SEVERITIES)[number];
export type RoutineAiAssessmentStatus = (typeof ROUTINE_AI_ASSESSMENT_STATUSES)[number];
export type RoutineAiPairAssessmentVerdict = (typeof ROUTINE_AI_PAIR_ASSESSMENT_VERDICTS)[number];

export interface RoutineAiAssessmentIngredientCitation {
  shelfItemId: string;
  ingredient: string;
}

export interface RoutineAiAssessmentFinding {
  severity: RoutineAiAssessmentSeverity;
  section: BaseRoutineSectionKey;
  shelfItemIds: string[];
  ingredientCitations: RoutineAiAssessmentIngredientCitation[];
  message: string;
  recommendation: string;
}

export interface RoutineAiCompatibilityAudit {
  section: BaseRoutineSectionKey;
  shelfItemIds: [string, string];
  verdict: RoutineAiPairAssessmentVerdict;
  reason: string;
  ingredientCitations: RoutineAiAssessmentIngredientCitation[];
}

export interface RoutineAiAssessment {
  overallStatus: RoutineAiAssessmentStatus;
  summary: string;
  findings: RoutineAiAssessmentFinding[];
  compatibilityAudit: RoutineAiCompatibilityAudit[];
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

function normalizeIngredient(value: string) {
  return value
    .normalize("NFKC")
    .replaceAll(/[‐‑‒–—−]/g, "-")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function parseAssessmentSeverity(value: unknown): RoutineAiAssessmentSeverity {
  if (typeof value === "string" && (ROUTINE_AI_ASSESSMENT_SEVERITIES as readonly string[]).includes(value)) {
    return value as RoutineAiAssessmentSeverity;
  }

  throw new Error("Poziom oceny rutyny musi być jedną z obsługiwanych opcji.");
}

function parseAssessmentStatus(value: unknown): RoutineAiAssessmentStatus {
  if (typeof value === "string" && (ROUTINE_AI_ASSESSMENT_STATUSES as readonly string[]).includes(value)) {
    return value as RoutineAiAssessmentStatus;
  }

  throw new Error("Status oceny rutyny musi być jedną z obsługiwanych opcji.");
}

function parsePairAssessmentVerdict(value: unknown): RoutineAiPairAssessmentVerdict {
  if (typeof value === "string" && (ROUTINE_AI_PAIR_ASSESSMENT_VERDICTS as readonly string[]).includes(value)) {
    return value as RoutineAiPairAssessmentVerdict;
  }

  throw new Error("Werdykt pary produktów musi być jedną z obsługiwanych opcji.");
}

export function parseRoutineAiAssessment(
  input: unknown,
  currentDraft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
): RoutineAiAssessment {
  if (!isRecord(input)) {
    throw new Error("Ocena rutyny musi być obiektem.");
  }

  const findingsRaw = input.findings;
  if (!Array.isArray(findingsRaw) || findingsRaw.length > 4) {
    throw new Error("Ocena rutyny może zawierać maksymalnie cztery ustalenia.");
  }

  const shelfById = new Map(shelf.map((item) => [item.shelfItem.id, item]));
  const draftShelfIdsBySection = new Map<BaseRoutineSectionKey, Set<string>>(
    BASE_ROUTINE_SECTION_KEYS.map((section) => [
      section,
      new Set(currentDraft[section].map((entry) => entry.shelfItemId)),
    ]),
  );
  const findings = findingsRaw.map((findingRaw, index) => {
    if (!isRecord(findingRaw)) {
      throw new Error(`Ustalenie oceny ${index + 1} musi być obiektem.`);
    }

    const section = parseSection(findingRaw.section, "Sekcja ustalenia oceny");
    const shelfItemIdsRaw = findingRaw.shelf_item_ids ?? findingRaw.shelfItemIds;
    if (!Array.isArray(shelfItemIdsRaw) || shelfItemIdsRaw.length > 4) {
      throw new Error("Ustalenie oceny może wskazać maksymalnie cztery produkty z tej sekcji.");
    }
    const shelfItemIds = shelfItemIdsRaw.map((value) => requiredText(value, "Produkt ustalenia oceny"));
    const uniqueShelfItemIds = Array.from(new Set(shelfItemIds));
    if (uniqueShelfItemIds.length !== shelfItemIds.length) {
      throw new Error("Ustalenie oceny nie może powtarzać produktu.");
    }
    const allowedSectionShelfItemIds = draftShelfIdsBySection.get(section) ?? new Set<string>();
    if (uniqueShelfItemIds.some((shelfItemId) => !allowedSectionShelfItemIds.has(shelfItemId))) {
      throw new Error("Ustalenie oceny odwołuje się do produktu spoza ocenianej sekcji rutyny.");
    }

    const citationsRaw = findingRaw.ingredient_citations ?? findingRaw.ingredientCitations ?? [];
    if (!Array.isArray(citationsRaw) || citationsRaw.length > 8) {
      throw new Error("Ustalenie oceny zawiera zbyt wiele cytowanych składników.");
    }
    if (uniqueShelfItemIds.length === 0 && citationsRaw.length > 0) {
      throw new Error("Ustalenie bez wskazanego produktu nie może cytować składników.");
    }
    const ingredientCitations = citationsRaw.map((citationRaw) => {
      if (!isRecord(citationRaw)) {
        throw new Error("Cytowany składnik musi być obiektem.");
      }
      const shelfItemId = requiredText(
        citationRaw.shelf_item_id ?? citationRaw.shelfItemId,
        "Produkt cytowanego składnika",
      );
      const modelIngredient = requiredText(citationRaw.ingredient, "Cytowany składnik");
      if (!uniqueShelfItemIds.includes(shelfItemId)) {
        throw new Error("Cytowany składnik musi należeć do produktu wskazanego w ustaleniu.");
      }
      const product = shelfById.get(shelfItemId)?.product;
      const storedIngredient = product?.inciList.find(
        (ingredient) => normalizeIngredient(ingredient) === normalizeIngredient(modelIngredient),
      );
      if (!storedIngredient) {
        throw new Error("Ocena AI wskazała składnik nieobecny w przekazanym INCI produktu.");
      }

      return { shelfItemId, ingredient: storedIngredient };
    });

    return {
      severity: parseAssessmentSeverity(findingRaw.severity),
      section,
      shelfItemIds: uniqueShelfItemIds,
      ingredientCitations,
      message: requiredText(findingRaw.message, "Opis ustalenia oceny"),
      recommendation: requiredText(findingRaw.recommendation, "Zalecenie do ustalenia oceny"),
    };
  });

  const expectedPairKeys = new Set<string>();
  for (const section of BASE_ROUTINE_SECTION_KEYS) {
    const sectionEntries = currentDraft[section];
    for (let leftIndex = 0; leftIndex < sectionEntries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sectionEntries.length; rightIndex += 1) {
        const pair = [sectionEntries[leftIndex].shelfItemId, sectionEntries[rightIndex].shelfItemId].sort();
        if (pair[0] !== pair[1]) {
          expectedPairKeys.add(`${section}:${pair.join(":")}`);
        }
      }
    }
  }

  const compatibilityAuditRaw = input.compatibility_audit ?? input.compatibilityAudit;
  if (!Array.isArray(compatibilityAuditRaw) || compatibilityAuditRaw.length !== expectedPairKeys.size) {
    throw new Error("Ocena rutyny musi zawierać werdykt dla każdej pary produktów.");
  }
  const compatibilityAudit: RoutineAiCompatibilityAudit[] = [];
  const reviewedPairKeys = new Set<string>();
  for (const auditRaw of compatibilityAuditRaw) {
    if (!isRecord(auditRaw)) {
      throw new Error("Przegląd zgodności musi zawierać obiekty par produktów.");
    }
    const section = parseSection(auditRaw.section, "Sekcja przeglądu zgodności");
    const pairRaw = auditRaw.shelf_item_ids ?? auditRaw.shelfItemIds;
    if (!Array.isArray(pairRaw) || pairRaw.length !== 2) {
      throw new Error("Każdy przegląd zgodności musi wskazać dokładnie dwa produkty.");
    }
    const shelfItemIds = [
      requiredText(pairRaw[0], "Pierwszy produkt sprawdzonej pary"),
      requiredText(pairRaw[1], "Drugi produkt sprawdzonej pary"),
    ].sort() as [string, string];
    const pairKey = `${section}:${shelfItemIds.join(":")}`;
    if (shelfItemIds[0] === shelfItemIds[1] || !expectedPairKeys.has(pairKey) || reviewedPairKeys.has(pairKey)) {
      throw new Error("Przegląd zgodności zawiera nieprawidłową lub powtórzoną parę produktów.");
    }

    const ingredientCitationsRaw = auditRaw.ingredient_citations ?? auditRaw.ingredientCitations ?? [];
    if (!Array.isArray(ingredientCitationsRaw) || ingredientCitationsRaw.length > 8) {
      throw new Error("Przegląd zgodności zawiera zbyt wiele cytowanych składników.");
    }
    const ingredientCitations = ingredientCitationsRaw.map((citationRaw) => {
      if (!isRecord(citationRaw)) {
        throw new Error("Cytowany składnik przeglądu zgodności musi być obiektem.");
      }
      const shelfItemId = requiredText(
        citationRaw.shelf_item_id ?? citationRaw.shelfItemId,
        "Produkt cytowanego składnika przeglądu zgodności",
      );
      if (!shelfItemIds.includes(shelfItemId)) {
        throw new Error("Cytowany składnik musi należeć do produktu z analizowanej pary.");
      }
      const modelIngredient = requiredText(citationRaw.ingredient, "Cytowany składnik przeglądu zgodności");
      const storedIngredient = shelfById
        .get(shelfItemId)
        ?.product.inciList.find(
          (ingredient) => normalizeIngredient(ingredient) === normalizeIngredient(modelIngredient),
        );
      if (!storedIngredient) {
        throw new Error("Przegląd zgodności wskazał składnik nieobecny w przekazanym INCI produktu.");
      }
      return { shelfItemId, ingredient: storedIngredient };
    });
    const verdict = parsePairAssessmentVerdict(auditRaw.verdict);
    if (verdict !== "no_material_interaction" && ingredientCitations.length === 0) {
      throw new Error("Istotny werdykt pary musi cytować składnik z przekazanego INCI.");
    }
    reviewedPairKeys.add(pairKey);
    compatibilityAudit.push({
      section,
      shelfItemIds,
      verdict,
      reason: requiredText(auditRaw.reason, "Uzasadnienie przeglądu zgodności"),
      ingredientCitations,
    });
  }
  if (reviewedPairKeys.size !== expectedPairKeys.size) {
    throw new Error("Przegląd zgodności musi objąć każdą parę produktów w sekcji.");
  }

  const materiallyConcerningPairs = compatibilityAudit.filter(
    (audit) => audit.verdict === "potential_compatibility_issue" || audit.verdict === "potential_tolerance_burden",
  );
  for (const audit of materiallyConcerningPairs) {
    const hasFinding = findings.some(
      (finding) =>
        finding.section === audit.section &&
        audit.shelfItemIds.every((shelfItemId) => finding.shelfItemIds.includes(shelfItemId)),
    );
    if (!hasFinding) {
      throw new Error("Istotny werdykt pary musi pojawić się także w ustaleniach oceny rutyny.");
    }
  }

  const overallStatus = parseAssessmentStatus(input.overall_status ?? input.overallStatus);
  if (materiallyConcerningPairs.length > 0 && overallStatus !== "requires_attention") {
    throw new Error("Istotny werdykt pary wymaga statusu requires_attention.");
  }

  return {
    overallStatus,
    summary: requiredText(input.summary, "Podsumowanie oceny rutyny"),
    findings,
    compatibilityAudit,
  };
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

export function parseRoutineAiProposal(
  input: unknown,
  currentDraft: BaseRoutineDraft,
  shelf: RoutineAiShelfInput[],
): RoutineAiProposal {
  if (!isRecord(input)) {
    throw new Error("Propozycja AI musi być obiektem.");
  }

  const routine = parseBaseRoutineDraft(input.routine);
  if (!hasNonEmptyBaseRoutine(routine)) {
    throw new Error("Propozycja AI musi zawierać co najmniej jeden krok rutyny.");
  }

  const eligibleShelf = shelf.filter((item) => !item.shelfItem.excludeFromAiRoutines);
  const ownedIds = new Set(eligibleShelf.map((item) => item.shelfItem.id));
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

  const assessmentRaw = input.assessment;
  const assessment =
    assessmentRaw === null || assessmentRaw === undefined
      ? null
      : parseRoutineAiAssessment(assessmentRaw, currentDraft, eligibleShelf);
  if (hasNonEmptyBaseRoutine(currentDraft) && !assessment) {
    throw new Error("Ocena istniejącej rutyny musi zawierać analizę całego układu.");
  }

  return {
    summary: requiredText(input.summary, "Podsumowanie propozycji"),
    routine,
    entryReasons,
    missingSteps,
    assessment,
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
  const shelfById = new Map(shelf.map((item) => [item.shelfItem.id, item]));
  const serializeNote = (note: string | null) => note?.slice(0, MAX_SHELF_ITEM_NOTE_LENGTH) ?? null;
  const routineProducts = BASE_ROUTINE_SECTION_KEYS.flatMap((section) =>
    currentDraft[section].flatMap((entry) => {
      const shelfInput = shelfById.get(entry.shelfItemId);
      if (!shelfInput) {
        return [];
      }

      return [
        {
          section,
          shelfItemId: entry.shelfItemId,
          routineRole: entry.routineRole,
          product: {
            name: shelfInput.product.name,
            brand: shelfInput.product.brand,
            category: shelfInput.product.category,
            inciList: shelfInput.product.inciList,
            inciConfidence: shelfInput.product.inciConfidence,
          },
          note: serializeNote(shelfInput.shelfItem.note),
          fit: {
            status: shelfInput.interpretation.fitStatus,
            score: shelfInput.interpretation.fitScore,
            confidence: shelfInput.interpretation.confidence,
            summary: shelfInput.interpretation.summaryShort,
            reasoning: shelfInput.interpretation.reasoningShort,
            recommendedFor: shelfInput.interpretation.recommendedFor,
            cautionFor: shelfInput.interpretation.cautionFor,
            warnings: shelfInput.interpretation.warnings,
          },
        },
      ];
    }),
  );

  return {
    profile,
    currentDraft,
    routineProducts,
    shelf: shelf.map(({ shelfItem, interpretation }) => ({
      shelfItemId: shelfItem.id,
      product: {
        name: shelfItem.product.name,
        brand: shelfItem.product.brand,
        category: shelfItem.product.category,
      },
      note: serializeNote(shelfItem.note),
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
