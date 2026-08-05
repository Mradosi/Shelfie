import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, CircleCheck, Sparkles } from "lucide-react";
import type { RoutineAiAssessment, RoutineAiAssessmentSeverity } from "@/lib/domain/routine-ai";
import type { UserShelfCatalogItem } from "@/lib/domain/user-domain";

interface RoutineAiAssessmentPanelProps {
  assessment: RoutineAiAssessment;
  generatedAt: string;
  shelfCatalog: UserShelfCatalogItem[];
}

const severityCopy: Record<RoutineAiAssessmentSeverity, { label: string; className: string }> = {
  high: {
    label: "Ważne",
    className: "border-rose-200/30 bg-rose-950/25 text-rose-100",
  },
  medium: {
    label: "Warto sprawdzić",
    className: "border-amber-200/30 bg-amber-950/25 text-amber-100",
  },
  low: {
    label: "Wskazówka",
    className: "border-cyan-200/25 bg-cyan-950/25 text-cyan-100",
  },
};

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "przed chwilą"
    : new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function RoutineAiAssessmentPanel({
  assessment,
  generatedAt,
  shelfCatalog,
}: RoutineAiAssessmentPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shelfById = new Map(shelfCatalog.map((item) => [item.id, item]));
  const hasFindings = assessment.findings.length > 0;

  return (
    <section className="rounded-[1.75rem] border border-violet-300/25 bg-violet-950/20 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm tracking-[0.24em] text-violet-100/65 uppercase">Ostatnia ocena AI</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {assessment.overallStatus === "requires_attention"
              ? "Są kwestie do świadomego sprawdzenia"
              : "Rutyna wygląda spójnie"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100/80">{assessment.summary}</p>
          <p className="mt-3 text-xs text-blue-100/55">Wygenerowano: {formatGeneratedAt(generatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsExpanded((current) => !current);
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-violet-100/25 bg-white/5 px-4 py-2 text-sm font-semibold text-violet-50 transition-colors hover:bg-white/10"
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {isExpanded ? "Zwiń szczegóły" : "Rozwiń szczegóły"}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-6 border-t border-white/10 pt-5">
          {!hasFindings ? (
            <div className="flex gap-3 rounded-2xl border border-emerald-200/20 bg-emerald-200/8 p-4 text-sm leading-6 text-emerald-50">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>Nie wykryto obecnie istotnej kwestii wynikającej z połączenia produktów w tej wersji rutyny.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assessment.findings.map((finding, index) => {
                const severity = severityCopy[finding.severity];
                const sectionLabel = finding.section === "morning" ? "Rutyna poranna" : "Rutyna wieczorna";
                return (
                  <article
                    key={`${finding.section}-${finding.shelfItemIds.join("-")}-${index}`}
                    className={`rounded-2xl border p-4 ${severity.className}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="size-4" aria-hidden="true" />
                      <span className="text-xs font-semibold tracking-[0.16em] uppercase">{sectionLabel}</span>
                      <span className="rounded-full border border-current/25 px-2.5 py-1 text-xs font-semibold">
                        {severity.label}
                      </span>
                    </div>
                    <p className="mt-3 font-semibold text-white">{finding.message}</p>
                    <p className="mt-2 text-sm leading-6 text-blue-100/80">{finding.recommendation}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {finding.shelfItemIds.map((shelfItemId) => {
                        const shelfItem = shelfById.get(shelfItemId);
                        return shelfItem ? (
                          <a
                            key={shelfItemId}
                            href={`/products/${shelfItem.productId}`}
                            className="rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                          >
                            {shelfItem.product.name}
                          </a>
                        ) : null;
                      })}
                    </div>

                    {finding.ingredientCitations.length > 0 && (
                      <p className="mt-4 text-xs leading-5 text-blue-100/65">
                        Składniki wskazane przez AI:{" "}
                        {finding.ingredientCitations.map((citation) => citation.ingredient).join(", ")}.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-blue-100/55">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Ocena ma charakter informacyjny. Nie zastępuje indywidualnej konsultacji dermatologicznej.
          </p>
        </div>
      )}
    </section>
  );
}
