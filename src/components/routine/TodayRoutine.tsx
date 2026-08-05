import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import RoutineGuidancePanel from "@/components/routine/RoutineGuidancePanel";
import type { RoutineGuidance, RoutineGuidanceIssue } from "@/lib/domain/routine-guidance";
import { ROUTINE_ROLE_LABELS, type RoutineDaySchedule, type RoutineScheduleEntry } from "@/lib/domain/routine-schedule";
import type { UserShelfCatalogItem } from "@/lib/domain/user-domain";

interface TodayRoutineProps {
  daySchedule: RoutineDaySchedule;
  shelfCatalog: UserShelfCatalogItem[];
  guidance: RoutineGuidance | null;
}

const sections = [
  {
    key: "morning",
    eyebrow: "AM",
    title: "Rano",
    description: "Kroki, które masz zaplanowane na początek dnia.",
  },
  {
    key: "evening",
    eyebrow: "PM",
    title: "Wieczorem",
    description: "Kroki, które masz zaplanowane na zakończenie dnia.",
  },
] as const;

function getProductIssue(guidance: RoutineGuidance | null, productId: string) {
  return guidance?.issues.find(
    (issue) => issue.kind === "product_signals" && issue.products.some((product) => product.productId === productId),
  );
}

function getEntries(entries: RoutineScheduleEntry[], shelfItemsById: Map<string, UserShelfCatalogItem>) {
  return entries.flatMap((entry) => {
    const shelfItem = shelfItemsById.get(entry.shelf_item_id);
    return shelfItem ? [{ entry, shelfItem }] : [];
  });
}

export default function TodayRoutine({ daySchedule, shelfCatalog, guidance }: TodayRoutineProps) {
  const [selectedIssue, setSelectedIssue] = useState<RoutineGuidanceIssue | null>(null);
  const shelfItemsById = new Map(shelfCatalog.map((item) => [item.id, item]));
  const routineContext = {
    morning: daySchedule.morning.map((entry) => ({
      shelfItemId: entry.shelf_item_id,
      routineRole: entry.routine_role,
    })),
    evening: daySchedule.evening.map((entry) => ({
      shelfItemId: entry.shelf_item_id,
      routineRole: entry.routine_role,
    })),
  };

  useEffect(() => {
    if (!selectedIssue) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIssue(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedIssue]);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        {sections.map((section) => {
          const entries = getEntries(daySchedule[section.key], shelfItemsById);
          return (
            <section key={section.key} className="rounded-[1.75rem] border border-white/10 bg-slate-950/30 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-sm tracking-[0.24em] text-cyan-100/55 uppercase">{section.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{section.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-blue-100/70">{section.description}</p>
                </div>
                <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-sm text-blue-100/75">
                  {entries.length} {entries.length === 1 ? "krok" : "kroki"}
                </span>
              </div>

              {entries.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/4 px-4 py-5 text-sm leading-6 text-blue-100/65">
                  Na tę porę dnia nie masz jeszcze zaplanowanych kroków.
                </div>
              ) : (
                <ol className="mt-5 space-y-3">
                  {entries.map(({ entry, shelfItem }, index) => {
                    const issue = getProductIssue(guidance, shelfItem.product.id);
                    return (
                      <li key={`${section.key}-${entry.shelf_item_id}-${entry.routine_role}-${index}`}>
                        <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-cyan-200/35 hover:bg-cyan-200/8">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-sm font-semibold text-cyan-100">
                            {index + 1}
                          </span>
                          <a
                            href={`/products/${shelfItem.product.id}`}
                            className="group flex min-w-0 flex-1 items-center gap-3"
                          >
                            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950/35">
                              {shelfItem.product.imageUrl ? (
                                <img
                                  src={shelfItem.product.imageUrl}
                                  alt={shelfItem.product.name}
                                  className="size-full object-contain p-1"
                                />
                              ) : (
                                <span className="px-1 text-center text-[0.65rem] leading-4 text-blue-100/50">
                                  Brak zdjęcia
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="inline-flex rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
                                {ROUTINE_ROLE_LABELS[entry.routine_role]}
                              </span>
                              {shelfItem.product.brand && (
                                <p className="mt-2 truncate text-xs text-blue-100/55">{shelfItem.product.brand}</p>
                              )}
                              <h3 className="mt-1 truncate text-base font-semibold text-white transition-colors group-hover:text-cyan-100">
                                {shelfItem.product.name}
                              </h3>
                            </div>
                          </a>
                          <div className="flex shrink-0 flex-col items-end justify-center gap-2">
                            {issue && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIssue(issue);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-200/18"
                                aria-label={`Pokaż wskazówki dla produktu ${shelfItem.product.name}`}
                              >
                                <AlertTriangle className="size-3.5" aria-hidden="true" />
                                Uwaga
                              </button>
                            )}
                            <span className="text-sm text-cyan-100/60">Szczegóły</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      {selectedIssue && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm sm:py-10"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedIssue(null);
            }
          }}
        >
          <section
            className="my-auto w-full max-w-2xl rounded-[1.75rem] border border-amber-200/25 bg-[#10182d] p-5 shadow-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-guidance-modal-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm tracking-[0.22em] text-amber-100/65 uppercase">Wskazówka do produktu</p>
                <h2 id="today-guidance-modal-title" className="mt-2 text-2xl font-semibold text-white">
                  {selectedIssue.products[0]?.productName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedIssue(null);
                }}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
                aria-label="Zamknij wskazówkę"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5">
              <RoutineGuidancePanel
                guidance={{ issues: [selectedIssue], incompleteAnalyses: [] }}
                variant="dialog"
                routineContext={routineContext}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
