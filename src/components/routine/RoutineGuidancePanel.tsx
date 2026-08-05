import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { InterpretationWarningSeverity } from "@/lib/domain/product-interpretation";
import type { RoutineGuidance, RoutineGuidanceIssue, RoutineGuidanceProduct } from "@/lib/domain/routine-guidance";
import type { BaseRoutineDraft } from "@/lib/domain/routine-schedule";

interface RoutineGuidancePanelProps {
  guidance: RoutineGuidance | null;
  variant?: "full" | "compact" | "dialog";
  editHref?: string;
  routineContext?: BaseRoutineDraft;
  onPrepareAnalysis?: (product: RoutineGuidanceProduct) => Promise<void>;
}

const SEVERITY_COPY: Record<
  InterpretationWarningSeverity,
  { label: string; className: string; iconClassName: string }
> = {
  high: {
    label: "Ważna uwaga",
    className: "border-rose-300/25 bg-rose-950/25",
    iconClassName: "text-rose-200",
  },
  medium: {
    label: "Warto sprawdzić",
    className: "border-amber-300/25 bg-amber-950/20",
    iconClassName: "text-amber-100",
  },
  low: {
    label: "Dodatkowa uwaga",
    className: "border-cyan-200/20 bg-cyan-200/8",
    iconClassName: "text-cyan-100",
  },
};

const SECTION_LABELS = {
  morning: "Rutyna poranna",
  evening: "Rutyna wieczorna",
} as const;

function getSectionLabel(sections: RoutineGuidanceIssue["sections"]) {
  return sections.map((section) => SECTION_LABELS[section]).join(" i ");
}

interface RoutineGuidanceExplanation {
  summary: string;
  ingredients: {
    name: string;
    reason: string;
  }[];
}

function getProductExplanationTarget(issue: RoutineGuidanceIssue) {
  return issue.kind === "product_signals" && issue.products.length === 1 ? issue.products[0] : null;
}

export default function RoutineGuidancePanel({
  guidance,
  variant = "full",
  editHref,
  routineContext,
  onPrepareAnalysis,
}: RoutineGuidancePanelProps) {
  const isCompact = variant === "compact";
  const isDialog = variant === "dialog";
  const hasGuidance = guidance && (guidance.issues.length > 0 || guidance.incompleteAnalyses.length > 0);
  const [explanations, setExplanations] = useState<Partial<Record<string, RoutineGuidanceExplanation>>>({});
  const [explanationErrors, setExplanationErrors] = useState<Partial<Record<string, string>>>({});
  const [explainingIssueId, setExplainingIssueId] = useState<string | null>(null);
  const [preparingProductId, setPreparingProductId] = useState<string | null>(null);
  const [preparationErrors, setPreparationErrors] = useState<Partial<Record<string, string>>>({});
  const [isExpanded, setIsExpanded] = useState(isDialog);

  async function handlePrepareAnalysis(product: RoutineGuidanceProduct) {
    if (!onPrepareAnalysis) {
      return;
    }

    setPreparingProductId(product.productId);
    setPreparationErrors((current) => {
      const { [product.productId]: _ignored, ...remaining } = current;
      return remaining;
    });
    try {
      await onPrepareAnalysis(product);
    } catch (error) {
      setPreparationErrors((current) => ({
        ...current,
        [product.productId]: error instanceof Error ? error.message : "Nie udało się przygotować analizy produktu.",
      }));
    } finally {
      setPreparingProductId(null);
    }
  }

  async function handleExplain(issue: RoutineGuidanceIssue) {
    const product = getProductExplanationTarget(issue);
    if (!product) {
      return;
    }

    setExplainingIssueId(issue.id);
    setExplanationErrors((current) => {
      const { [issue.id]: _ignored, ...remaining } = current;
      return remaining;
    });
    try {
      const response = await fetch("/api/domain/routine/guidance-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.productId, routineContext }),
      });
      const payload = (await response.json()) as { explanation?: RoutineGuidanceExplanation; error?: string };
      if (!response.ok || !payload.explanation) {
        throw new Error(payload.error ?? "Nie udało się przygotować wyjaśnienia AI.");
      }
      setExplanations((current) => ({ ...current, [issue.id]: payload.explanation }));
    } catch (error) {
      setExplanationErrors((current) => ({
        ...current,
        [issue.id]: error instanceof Error ? error.message : "Nie udało się przygotować wyjaśnienia AI.",
      }));
    } finally {
      setExplainingIssueId(null);
    }
  }

  if (!guidance) {
    return (
      <section className="rounded-[1.5rem] border border-amber-300/25 bg-amber-950/20 p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-amber-100" aria-hidden="true" />
          <div>
            <p className="font-semibold text-white">Wskazówki są chwilowo niedostępne</p>
            <p className="mt-2 text-sm leading-6 text-blue-100/75">
              Twoja rutyna pozostaje dostępna. Spróbuj odświeżyć stronę później, aby zobaczyć aktualne wskazówki.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!hasGuidance) {
    return (
      <section className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/8 p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-100" aria-hidden="true" />
          <div>
            <p className="font-semibold text-white">Nie widzimy teraz dodatkowych wskazówek do tej rutyny</p>
            <p className="mt-2 text-sm leading-6 text-blue-100/75">
              To nie jest ocena medyczna. W razie wątpliwości możesz sprawdzić analizę każdego produktu osobno.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!isDialog && !isCompact && !isExpanded) {
    return (
      <section className="rounded-[1.5rem] border border-amber-200/18 bg-amber-200/6 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
          }}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded="false"
        >
          <span>
            <span className="block text-sm font-semibold tracking-[0.18em] text-amber-100/75 uppercase">
              Wskazówki do rutyny
            </span>
            <span className="mt-1 block text-sm leading-6 text-blue-100/75">
              {guidance.issues.length > 0
                ? `${guidance.issues.length} ${guidance.issues.length === 1 ? "uwaga" : "uwagi"} do sprawdzenia`
                : "Sprawdź status analiz produktów"}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-100/25 bg-white/8 px-3 py-1.5 text-sm font-semibold text-white">
            Rozwiń
            <ChevronDown className="size-4" aria-hidden="true" />
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className={isDialog ? "" : "rounded-[1.75rem] border border-amber-200/18 bg-amber-200/6 p-5 sm:p-6"}>
      {!isDialog && (
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm tracking-[0.22em] text-amber-100/65 uppercase">Wskazówki do rutyny</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {isCompact ? "Na dzisiejsze kroki" : "Sprawdź, co warto mieć na uwadze"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/75">
              To wskazówki oparte na aktualnie zapisanych analizach produktów. Nie blokują użycia ani zapisu rutyny.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!isCompact && (
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-amber-100/25 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/14"
              >
                Zwiń
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
            )}
            {editHref && (
              <a
                href={editHref}
                className="inline-flex items-center gap-2 rounded-full border border-amber-100/25 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/14"
              >
                Edytuj rutynę
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}

      {guidance.issues.length > 0 && (
        <div className={isDialog ? "space-y-3" : "mt-5 space-y-3"}>
          {guidance.issues.map((issue) => {
            const severity = SEVERITY_COPY[issue.severity];
            const product = getProductExplanationTarget(issue);
            const explanation = explanations[issue.id];
            const explanationError = explanationErrors[issue.id];
            const isExplaining = explainingIssueId === issue.id;
            return (
              <article key={issue.id} className={`rounded-2xl border p-4 ${severity.className}`}>
                <div className="flex gap-3">
                  <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${severity.iconClassName}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold tracking-[0.12em] text-blue-100/65 uppercase">
                        {getSectionLabel(issue.sections)}
                      </span>
                      <span className="rounded-full border border-white/12 bg-slate-950/20 px-2.5 py-1 text-xs font-semibold text-white">
                        {severity.label}
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold text-white">{issue.title}</h3>
                    {issue.signals.length > 1 ? (
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-blue-100/80">
                        {issue.signals.map((signal) => (
                          <li key={signal.code} className="flex gap-2">
                            <span aria-hidden="true">•</span>
                            <span>{signal.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-blue-100/80">{issue.message}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {issue.products.map((product) => (
                        <a
                          key={`${issue.id}-${product.shelfItemId}`}
                          href={`/products/${product.productId}`}
                          className="rounded-full border border-white/15 bg-slate-950/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          {product.productName}
                        </a>
                      ))}
                    </div>
                    {product && (
                      <button
                        type="button"
                        onClick={() => void handleExplain(issue)}
                        disabled={isExplaining}
                        className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-100/25 bg-slate-950/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-65"
                      >
                        {isExplaining ? (
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="size-3.5" aria-hidden="true" />
                        )}
                        {isExplaining ? "AI wyjaśnia..." : explanation ? "Wyjaśnij ponownie z AI" : "Wyjaśnij z AI"}
                      </button>
                    )}
                    {explanation && (
                      <div className="mt-3 rounded-xl border border-white/12 bg-slate-950/25 p-3" aria-live="polite">
                        <p className="text-xs font-semibold tracking-[0.12em] text-amber-100/70 uppercase">
                          Wyjaśnienie AI
                        </p>
                        <p className="mt-2 text-sm leading-6 text-blue-100/85">{explanation.summary}</p>
                        {explanation.ingredients.length > 0 && (
                          <ul className="mt-3 space-y-2">
                            {explanation.ingredients.map((ingredient) => (
                              <li key={ingredient.name} className="text-sm leading-6 text-blue-100/80">
                                <span className="font-semibold text-white">{ingredient.name}:</span> {ingredient.reason}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {explanationError && (
                      <p className="mt-3 text-sm leading-6 text-rose-100" role="alert">
                        {explanationError}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {guidance.incompleteAnalyses.length > 0 && (
        <div className="mt-5 rounded-2xl border border-cyan-200/20 bg-slate-950/25 p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-cyan-100" aria-hidden="true" />
            <div>
              <p className="font-semibold text-white">Nie możemy jeszcze w pełni ocenić tej rutyny</p>
              <p className="mt-2 text-sm leading-6 text-blue-100/75">
                Aby ocenić tę rutynę, przygotuj analizę dopasowania dla wskazanych produktów. Nie oznacza to ryzyka,
                tylko brak pełnych danych.
              </p>
              <div className="mt-3 space-y-3">
                {Array.from(
                  new Map(
                    guidance.incompleteAnalyses.flatMap((analysis) =>
                      analysis.products.map((product) => [product.productId, product] as const),
                    ),
                  ).values(),
                ).map((product) => {
                  const isPreparing = preparingProductId === product.productId;
                  const preparationError = preparationErrors[product.productId];
                  return (
                    <div key={product.productId} className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/products/${product.productId}`}
                        className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-200/18"
                      >
                        {product.productName}
                      </a>
                      {onPrepareAnalysis && (
                        <button
                          type="button"
                          onClick={() => {
                            void handlePrepareAnalysis(product);
                          }}
                          disabled={isPreparing}
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-white/6 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/12 disabled:cursor-wait disabled:opacity-65"
                        >
                          {isPreparing && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                          {isPreparing ? "Przygotowuję..." : "Przygotuj analizę"}
                        </button>
                      )}
                      {preparationError && (
                        <p className="basis-full text-sm leading-6 text-rose-100" role="alert">
                          {preparationError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
