import type {
  InterpretationStatus,
  InterpretationTag,
  InterpretationWarning,
  InterpretationWarningSeverity,
  UserProductInterpretation,
} from "@/lib/domain/product-interpretation";
import {
  ROUTINE_ROLE_LABELS,
  type BaseRoutineDraft,
  type BaseRoutineSectionKey,
  type RoutineRole,
} from "@/lib/domain/routine-schedule";
import type { UserShelfCatalogItem } from "@/lib/domain/user-domain";

export interface RoutineGuidanceInput {
  shelfItemId: string;
  productId: string;
  productName: string;
  interpretationStatus: InterpretationStatus | null;
  cautions: InterpretationTag[];
  warnings: InterpretationWarning[];
}

export interface RoutineGuidanceProduct {
  shelfItemId: string;
  productId: string;
  productName: string;
}

export interface RoutineGuidanceSignal {
  code: string;
  message: string;
  severity: InterpretationWarningSeverity;
}

export type RoutineGuidanceIssueKind = "product_signals" | "role_accumulation";

export interface RoutineGuidanceIssue {
  id: string;
  kind: RoutineGuidanceIssueKind;
  sections: BaseRoutineSectionKey[];
  severity: InterpretationWarningSeverity;
  title: string;
  message: string;
  products: RoutineGuidanceProduct[];
  signals: RoutineGuidanceSignal[];
}

export interface RoutineGuidanceIncompleteAnalysis {
  section: BaseRoutineSectionKey;
  products: RoutineGuidanceProduct[];
}

export interface RoutineGuidance {
  issues: RoutineGuidanceIssue[];
  incompleteAnalyses: RoutineGuidanceIncompleteAnalysis[];
}

const GUIDANCE_SEVERITY_ORDER: Record<InterpretationWarningSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const ACCUMULATION_ROLES: RoutineRole[] = ["treat", "exfoliate"];

function createProductReference(input: RoutineGuidanceInput): RoutineGuidanceProduct {
  return {
    shelfItemId: input.shelfItemId,
    productId: input.productId,
    productName: input.productName,
  };
}

function getSectionTitle(section: BaseRoutineSectionKey) {
  return section === "morning" ? "rutynie porannej" : "rutynie wieczornej";
}

function getAccumulationMessage(role: RoutineRole, count: number, section: BaseRoutineSectionKey) {
  const roleLabel = ROUTINE_ROLE_LABELS[role].toLowerCase();
  return `W ${getSectionTitle(section)} są ${count} kroki typu ${roleLabel}. Sprawdź je przed zapisaniem, aby świadomie zdecydować, czy chcesz używać ich razem.`;
}

export function createRoutineGuidanceInput(
  shelfItem: UserShelfCatalogItem,
  interpretation: Pick<UserProductInterpretation, "status" | "cautionFor" | "warnings"> | null,
): RoutineGuidanceInput {
  return {
    shelfItemId: shelfItem.id,
    productId: shelfItem.productId,
    productName: shelfItem.product.name,
    interpretationStatus: interpretation?.status ?? null,
    cautions: interpretation?.cautionFor ?? [],
    warnings: interpretation?.warnings ?? [],
  };
}

export function createRoutineGuidanceInputs(
  shelfCatalog: UserShelfCatalogItem[],
  interpretations: UserProductInterpretation[],
) {
  const interpretationsByProductId = new Map(
    interpretations.map((interpretation) => [interpretation.productId, interpretation]),
  );
  return shelfCatalog.map((shelfItem) =>
    createRoutineGuidanceInput(shelfItem, interpretationsByProductId.get(shelfItem.productId) ?? null),
  );
}

export function createRoutineGuidance(routine: BaseRoutineDraft, inputs: RoutineGuidanceInput[]): RoutineGuidance {
  const inputsByShelfItemId = new Map(inputs.map((input) => [input.shelfItemId, input]));
  const issues: RoutineGuidanceIssue[] = [];
  const incompleteAnalyses: RoutineGuidanceIncompleteAnalysis[] = [];
  const productSignals = new Map<
    string,
    {
      input: RoutineGuidanceInput;
      sections: Set<BaseRoutineSectionKey>;
      signals: RoutineGuidanceSignal[];
    }
  >();

  for (const section of ["morning", "evening"] as const) {
    const incompleteByShelfItemId = new Map<string, RoutineGuidanceProduct>();
    const inputsByRole = new Map<RoutineRole, RoutineGuidanceInput[]>();

    for (const entry of routine[section]) {
      const input = inputsByShelfItemId.get(entry.shelfItemId);
      if (input) {
        const roleInputs = inputsByRole.get(entry.routineRole) ?? [];
        roleInputs.push(input);
        inputsByRole.set(entry.routineRole, roleInputs);
      }

      if (input?.interpretationStatus !== "ready") {
        if (input) {
          incompleteByShelfItemId.set(input.shelfItemId, createProductReference(input));
        }
        continue;
      }

      const signals = [
        ...input.warnings.map((warning) => ({
          code: `warning:${warning.code}`,
          message: warning.message,
          severity: warning.severity,
        })),
        ...input.cautions.map((caution) => ({
          code: `caution:${caution.code}`,
          message: caution.reason,
          severity: "medium" as const,
        })),
      ];
      if (signals.length > 0) {
        const groupedSignals = productSignals.get(input.shelfItemId) ?? { input, sections: new Set(), signals: [] };
        groupedSignals.sections.add(section);
        const knownSignalCodes = new Set(groupedSignals.signals.map((signal) => signal.code));
        groupedSignals.signals.push(...signals.filter((signal) => !knownSignalCodes.has(signal.code)));
        productSignals.set(input.shelfItemId, groupedSignals);
      }
    }

    for (const role of ACCUMULATION_ROLES) {
      const roleInputs = inputsByRole.get(role) ?? [];
      const uniqueRoleInputs = Array.from(new Map(roleInputs.map((input) => [input.shelfItemId, input])).values());
      if (roleInputs.length < 2) {
        continue;
      }
      issues.push({
        id: `role-accumulation:${section}:${role}`,
        kind: "role_accumulation",
        sections: [section],
        severity: "medium",
        title: `Kilka kroków ${ROUTINE_ROLE_LABELS[role].toLowerCase()} w jednej sekcji`,
        message: getAccumulationMessage(role, roleInputs.length, section),
        products: uniqueRoleInputs.map(createProductReference),
        signals: [],
      });
    }

    if (incompleteByShelfItemId.size > 0) {
      incompleteAnalyses.push({
        section,
        products: [...incompleteByShelfItemId.values()],
      });
    }
  }

  for (const { input, sections, signals } of productSignals.values()) {
    const severity = signals.reduce<InterpretationWarningSeverity>(
      (currentSeverity, signal) =>
        GUIDANCE_SEVERITY_ORDER[signal.severity] < GUIDANCE_SEVERITY_ORDER[currentSeverity]
          ? signal.severity
          : currentSeverity,
      "low",
    );
    issues.push({
      id: `product-signals:${input.shelfItemId}`,
      kind: "product_signals",
      sections: Array.from(sections),
      severity,
      title: `Warto uważać przy produkcie ${input.productName}`,
      message: signals.length === 1 ? signals[0].message : "Ten produkt ma kilka wskazówek do świadomego użycia.",
      products: [createProductReference(input)],
      signals,
    });
  }

  issues.sort((left, right) => {
    const severityDifference = GUIDANCE_SEVERITY_ORDER[left.severity] - GUIDANCE_SEVERITY_ORDER[right.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }
    return left.id.localeCompare(right.id, "pl");
  });

  return { issues, incompleteAnalyses };
}
