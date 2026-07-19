import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Clock3, RefreshCw, Sparkles } from "lucide-react";
import type { UserProductInterpretation } from "@/lib/domain/product-interpretation";

interface ProductInterpretationPanelProps {
  initialInterpretation: UserProductInterpretation;
}

const FIT_STATUS_LABELS = {
  recommended: "Polecany dla Ciebie",
  mixed: "Wymaga rozważenia",
  not_recommended: "Raczej nie dla Ciebie",
  insufficient_data: "Za mało danych",
} as const;

const CONFIDENCE_LABELS = {
  high: "wysoka pewność",
  medium: "średnia pewność",
  low: "niska pewność",
} as const;

const WARNING_SEVERITY_LABELS = {
  low: "Niska uwaga",
  medium: "Warto uważać",
  high: "Ważne ostrzeżenie",
} as const;

function getErrorMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return "Nie udało się połączyć z analizą produktu.";
}

function FitBadge({ interpretation }: { interpretation: UserProductInterpretation }) {
  if (!interpretation.fitStatus) {
    return null;
  }

  const classes = {
    recommended: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
    mixed: "border-amber-300/35 bg-amber-300/12 text-amber-100",
    not_recommended: "border-rose-300/35 bg-rose-300/12 text-rose-100",
    insufficient_data: "border-blue-200/30 bg-blue-200/10 text-blue-100",
  }[interpretation.fitStatus];

  return (
    <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${classes}`}>
      {FIT_STATUS_LABELS[interpretation.fitStatus]}
      {interpretation.fitScore !== null ? ` · ${interpretation.fitScore}/100` : ""}
    </span>
  );
}

function TagList({
  title,
  items,
  tone,
}: {
  title: string;
  items: UserProductInterpretation["recommendedFor"];
  tone: "good" | "caution";
}) {
  if (items.length === 0) {
    return null;
  }

  const classes = tone === "good" ? "border-emerald-300/20 bg-emerald-300/6" : "border-amber-300/20 bg-amber-300/6";

  return (
    <section className={`rounded-2xl border p-4 ${classes}`}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={`${item.code}-${item.label}`}>
            <p className="text-sm font-medium text-white">{item.label}</p>
            <p className="mt-1 text-sm leading-6 text-blue-100/70">{item.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarningList({ warnings }: { warnings: UserProductInterpretation["warnings"] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-rose-300/20 bg-rose-300/6 p-4">
      <h3 className="text-sm font-semibold text-white">Ostrzeżenia</h3>
      <ul className="mt-3 space-y-3">
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.message}`} className="flex gap-3 text-sm leading-6 text-blue-100/75">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-rose-200" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-rose-100">{WARNING_SEVERITY_LABELS[warning.severity]}.</strong>{" "}
              {warning.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ProductInterpretationPanel({ initialInterpretation }: ProductInterpretationPanelProps) {
  const [interpretation, setInterpretation] = useState(initialInterpretation);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const pendingAutoStart = useRef<string | null>(null);

  async function requestAnalysis(action: "start" | "retry" | "refresh") {
    setIsRequesting(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/domain/products/interpretation", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId: interpretation.productId, action }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== "object" || payload === null || !("interpretation" in payload)) {
        throw new Error(getErrorMessage(payload));
      }

      setInterpretation(payload.interpretation as UserProductInterpretation);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Nie udało się uruchomić analizy produktu.");
    } finally {
      setIsRequesting(false);
    }
  }

  const startPendingAnalysis = useEffectEvent(() => {
    void requestAnalysis("start");
  });

  useEffect(() => {
    if (interpretation.status !== "pending" || pendingAutoStart.current === interpretation.id) {
      return;
    }

    pendingAutoStart.current = interpretation.id;
    startPendingAnalysis();
  }, [interpretation.id, interpretation.status]);

  const hasPreviousResult = [
    interpretation.summaryShort !== null,
    interpretation.reasoningShort !== null,
    interpretation.recommendedFor.length > 0,
    interpretation.cautionFor.length > 0,
    interpretation.warnings.length > 0,
  ].some(Boolean);

  return (
    <section className="rounded-[1.75rem] border border-cyan-200/15 bg-slate-950/35 p-5 shadow-2xl shadow-slate-950/20 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm tracking-[0.2em] text-cyan-100/60 uppercase">
            <Sparkles className="size-4" aria-hidden="true" /> Dopasowanie do Ciebie
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Analiza produktu względem Twojego profilu</h2>
        </div>
        <FitBadge interpretation={interpretation} />
      </div>

      {requestError && (
        <p className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-950/30 px-4 py-3 text-sm leading-6 text-rose-100">
          {requestError}
        </p>
      )}

      {interpretation.status === "pending" && (
        <div className="mt-6 flex gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4 text-blue-100/75">
          <Clock3 className="mt-0.5 size-5 shrink-0 animate-pulse text-cyan-200" aria-hidden="true" />
          <div>
            <p className="font-semibold text-white">Przygotowujemy analizę</p>
            <p className="mt-1 text-sm leading-6">
              Produkt jest już dostępny. Analiza pojawi się tutaj po zakończeniu generowania.
            </p>
          </div>
        </div>
      )}

      {interpretation.status === "failed" && (
        <div className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-950/25 p-4">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-200" aria-hidden="true" />
            <div>
              <p className="font-semibold text-white">Analiza nie została ukończona</p>
              <p className="mt-1 text-sm leading-6 text-blue-100/75">
                {interpretation.lastError ?? "Spróbuj ponownie. Produkt i Twoje dane profilu pozostają bez zmian."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void requestAnalysis("retry");
            }}
            disabled={isRequesting}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200/35 bg-rose-200/10 px-4 py-2 text-sm font-semibold text-rose-50 transition-colors hover:bg-rose-200/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isRequesting ? "animate-spin" : ""}`} aria-hidden="true" />
            Spróbuj ponownie
          </button>
        </div>
      )}

      {interpretation.status === "stale" && (
        <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/8 p-4">
          <p className="font-semibold text-amber-50">Ta analiza wymaga odświeżenia</p>
          <p className="mt-1 text-sm leading-6 text-blue-100/75">
            Zmieniły się dane produktu albo profilu użyte do poprzedniej analizy. Poniżej nadal pokazujemy ostatni
            dostępny wynik.
          </p>
          <button
            type="button"
            onClick={() => {
              void requestAnalysis("refresh");
            }}
            disabled={isRequesting}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200/35 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isRequesting ? "animate-spin" : ""}`} aria-hidden="true" />
            Odśwież analizę
          </button>
        </div>
      )}

      {interpretation.status === "ready" && (
        <p className="mt-5 flex items-center gap-2 text-sm text-emerald-100/80">
          <CheckCircle2 className="size-4 text-emerald-200" aria-hidden="true" />
          Analiza jest aktualna{interpretation.confidence ? ` · ${CONFIDENCE_LABELS[interpretation.confidence]}` : ""}
        </p>
      )}

      {hasPreviousResult && (
        <div className="mt-6 space-y-5">
          {interpretation.summaryShort && (
            <p className="text-base leading-7 text-white">{interpretation.summaryShort}</p>
          )}
          {interpretation.reasoningShort && (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-blue-100/75">
              {interpretation.reasoningShort}
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <TagList title="Może wspierać" items={interpretation.recommendedFor} tone="good" />
            <TagList title="Wymaga ostrożności przy" items={interpretation.cautionFor} tone="caution" />
          </div>
          <WarningList warnings={interpretation.warnings} />
        </div>
      )}
    </section>
  );
}
