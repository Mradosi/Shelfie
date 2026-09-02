import { useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/client/api-error";
import type {
  IngredientGlossaryAction,
  IngredientGlossaryEntry,
  IngredientGlossaryItem,
  IngredientGlossaryPreparationResult,
} from "@/lib/domain/ingredient-glossary";

interface IngredientGlossaryPanelProps {
  productId: string;
  initialItems: IngredientGlossaryItem[];
  initialError?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStatusLabel(item: IngredientGlossaryItem) {
  if (!item.entry) {
    return "Brak opisu";
  }

  return {
    pending: "W przygotowaniu",
    ready: "Gotowe",
    failed: "Spróbuj ponownie",
    stale: "Wymaga odświeżenia",
  }[item.entry.status];
}

function getStatusClasses(item: IngredientGlossaryItem) {
  if (!item.entry) {
    return "border-white/12 bg-white/5 text-blue-100/60";
  }

  return {
    pending: "border-cyan-200/25 bg-cyan-200/10 text-cyan-100",
    ready: "border-emerald-200/25 bg-emerald-200/10 text-emerald-100",
    failed: "border-rose-200/25 bg-rose-200/10 text-rose-100",
    stale: "border-amber-200/25 bg-amber-200/10 text-amber-100",
  }[item.entry.status];
}

function getActionSummary(result: IngredientGlossaryPreparationResult) {
  if (result.readyCount === 0 && result.failedCount > 0) {
    return "Nie udało się przygotować żadnego opisu. Możesz ponowić tylko brakujące pozycje.";
  }

  const parts = [`Gotowe opisy: ${result.readyCount}.`];
  if (result.failedCount > 0) {
    parts.push(`Do ponowienia: ${result.failedCount}.`);
  }
  if (result.remainingCount > 0 || result.missingCount > 0) {
    parts.push("Pozostałe składniki możesz przygotować w kolejnym kroku.");
  }
  return parts.join(" ");
}

function EntryContent({ entry }: { entry: IngredientGlossaryEntry | null }) {
  if (!entry) {
    return (
      <p className="mt-3 text-sm leading-6 text-blue-100/70">Opis tego składnika nie jest jeszcze przygotowany.</p>
    );
  }

  if (entry.status === "pending") {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm leading-6 text-cyan-100/80">
        <Clock3 className="size-4 animate-pulse" aria-hidden="true" /> Opis jest przygotowywany w innej operacji.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-4 text-sm leading-6 text-blue-100/80">
      {entry.status === "stale" && (
        <p className="rounded-xl border border-amber-200/20 bg-amber-200/8 px-3 py-2 text-amber-50">
          Pokazujemy poprzedni opis. Możesz odświeżyć go z użyciem aktualnej wersji asystenta.
        </p>
      )}
      {entry.status === "failed" && entry.lastError && (
        <p className="rounded-xl border border-rose-200/20 bg-rose-200/8 px-3 py-2 text-rose-100">{entry.lastError}</p>
      )}
      {entry.cosmeticRole && (
        <p>
          <span className="font-semibold text-white">Rola kosmetyczna:</span> {entry.cosmeticRole}
        </p>
      )}
      {entry.summary && <p className="text-white">{entry.summary}</p>}
      {entry.likelyBenefits.length > 0 && (
        <div>
          <h3 className="font-semibold text-white">Może wspierać</h3>
          <ul className="mt-2 space-y-1.5">
            {entry.likelyBenefits.map((benefit) => (
              <li key={benefit} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.caveats.length > 0 && (
        <div>
          <h3 className="font-semibold text-white">Warto wiedzieć</h3>
          <ul className="mt-2 space-y-1.5">
            {entry.caveats.map((caveat) => (
              <li key={caveat} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!entry.summary && entry.status === "failed" && (
        <p>Opis nie został zapisany. Użyj przycisku ponowienia dla brakujących pozycji.</p>
      )}
    </div>
  );
}

export default function IngredientGlossaryPanel({
  productId,
  initialItems,
  initialError = null,
}: IngredientGlossaryPanelProps) {
  const [items, setItems] = useState(initialItems);
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);
  const [requestError, setRequestError] = useState(initialError);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  const missingCount = items.filter((item) => !item.entry).length;
  const failedCount = items.filter((item) => item.entry?.status === "failed").length;
  const staleCount = items.filter((item) => item.entry?.status === "stale").length;
  const pendingCount = items.filter((item) => item.entry?.status === "pending").length;

  async function requestPreparation(action: IngredientGlossaryAction) {
    setIsRequesting(true);
    setRequestError(null);
    setRequestMessage(null);

    try {
      const response = await fetch("/api/domain/products/ingredient-glossary", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId, action }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.entries)) {
        throw new Error(getApiErrorMessage(payload, "Nie udało się przygotować opisów składników."));
      }

      const result = payload as unknown as IngredientGlossaryPreparationResult;
      const entriesByKey = new Map(result.entries.map((entry) => [entry.inciKey, entry]));
      setItems((currentItems) =>
        currentItems.map((item) => ({
          ...item,
          entry: entriesByKey.get(item.inciKey) ?? item.entry,
        })),
      );
      setRequestMessage(getActionSummary(result));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Nie udało się przygotować opisów składników.");
    } finally {
      setIsRequesting(false);
    }
  }

  if (items.length === 0) {
    return <p className="mt-5 text-sm leading-6 text-blue-100/65">Brak listy składników dla tego produktu.</p>;
  }

  return (
    <section className="rounded-[1.75rem] border border-white/12 bg-slate-950/30 p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm tracking-[0.2em] text-cyan-100/55 uppercase">
            <BookOpenText className="size-4" aria-hidden="true" /> Skład produktu
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">INCI</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/65">
            Opisy są edukacyjnym objaśnieniem pojedynczych składników. Nie oceniają całej formuły ani dopasowania
            produktu do Twojej skóry.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {missingCount > 0 && (
            <button
              type="button"
              onClick={() => void requestPreparation("prepare")}
              disabled={isRequesting}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
            >
              {isRequesting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              Przygotuj opisy składników
            </button>
          )}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => void requestPreparation("retry")}
              disabled={isRequesting}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200/30 bg-rose-200/10 px-4 py-2 text-sm font-semibold text-rose-50 transition-colors hover:bg-rose-200/20 disabled:cursor-wait disabled:opacity-60"
            >
              {isRequesting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              Ponów dla brakujących ({failedCount})
            </button>
          )}
          {staleCount > 0 && (
            <button
              type="button"
              onClick={() => void requestPreparation("refresh")}
              disabled={isRequesting}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-200/20 disabled:cursor-wait disabled:opacity-60"
            >
              {isRequesting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              Odśwież opisy ({staleCount})
            </button>
          )}
        </div>
      </div>

      {pendingCount > 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm leading-6 text-cyan-100/80">
          <Clock3 className="size-4 animate-pulse" aria-hidden="true" /> {pendingCount} opisów jest już
          przygotowywanych.
        </p>
      )}
      {requestMessage && (
        <p
          className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200/20 bg-emerald-200/8 px-4 py-3 text-sm leading-6 text-emerald-50"
          aria-live="polite"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> {requestMessage}
        </p>
      )}
      {requestError && (
        <p
          className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200/25 bg-rose-950/30 px-4 py-3 text-sm leading-6 text-rose-100"
          role="alert"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" /> {requestError}
        </p>
      )}

      <ol className="mt-5 space-y-3">
        {items.map((item) => {
          const isOpen = openItemIndex === item.index;
          const panelId = `ingredient-glossary-${item.index}`;

          return (
            <li
              key={`${item.inciKey}-${item.index}`}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/4"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenItemIndex((currentIndex) => (currentIndex === item.index ? null : item.index));
                }}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-200"
              >
                <span className="text-sm font-semibold text-cyan-100/45">{item.index + 1}.</span>
                <span className="min-w-0 flex-1 font-medium text-white">{item.displayName}</span>
                <span
                  className={`hidden rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${getStatusClasses(item)}`}
                >
                  {getStatusLabel(item)}
                </span>
                <ChevronDown
                  className={`size-5 shrink-0 text-cyan-100/65 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div id={panelId} className="border-t border-white/10 px-4 pb-4" aria-live="polite">
                  <span
                    className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold sm:hidden ${getStatusClasses(item)}`}
                  >
                    {getStatusLabel(item)}
                  </span>
                  <EntryContent entry={item.entry} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
