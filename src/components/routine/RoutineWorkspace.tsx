import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";
import type { RoutineAiMissingStep, RoutineAiProposal } from "@/lib/domain/routine-ai";
import {
  hasNonEmptyBaseRoutine,
  ROUTINE_ROLE_LABELS,
  type BaseRoutineDraft,
  type BaseRoutineSectionKey,
  type RoutineRole,
} from "@/lib/domain/routine-schedule";
import type { UserShelfCatalogItem } from "@/lib/domain/user-domain";
import ManualRoutineEditor from "@/components/routine/ManualRoutineEditor";

type RoutineAiStage = "idle" | "preparing" | "generating" | "evaluating_candidates" | "ready" | "blocked" | "error";

interface FailedProduct {
  productId: string;
  label: string;
  message: string;
}

interface CatalogCandidate {
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
  };
  fit: {
    status: string | null;
    score: number | null;
    summary: string | null;
    confidence: string | null;
  };
}

interface MissingStepRecommendation {
  missingStep: RoutineAiMissingStep;
  candidates: CatalogCandidate[];
}

interface RoutineWorkspaceProps {
  initialDraft: BaseRoutineDraft;
  shelfCatalog: UserShelfCatalogItem[];
}

const SECTION_LABELS: Record<BaseRoutineSectionKey, string> = {
  morning: "Rutyna poranna",
  evening: "Rutyna wieczorna",
};

function getErrorMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return "Nie udało się połączyć z asystentem AI.";
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload as T;
}

function getEntryReason(
  proposal: RoutineAiProposal,
  section: BaseRoutineSectionKey,
  shelfItemId: string,
  routineRole: RoutineRole,
) {
  return proposal.entryReasons.find(
    (entry) => entry.section === section && entry.shelfItemId === shelfItemId && entry.routineRole === routineRole,
  )?.reason;
}

function appendCandidateToProposal(
  proposal: RoutineAiProposal,
  shelfItemId: string,
  section: BaseRoutineSectionKey,
  routineRole: RoutineRole,
) {
  if (
    proposal.routine[section].some((entry) => entry.shelfItemId === shelfItemId && entry.routineRole === routineRole)
  ) {
    return proposal;
  }

  return {
    ...proposal,
    routine: {
      ...proposal.routine,
      [section]: [...proposal.routine[section], { shelfItemId, routineRole }],
    },
    entryReasons: [
      ...proposal.entryReasons,
      {
        section,
        shelfItemId,
        routineRole,
        reason: "Dodano z rekomendacji katalogowej dopasowanej do Twojego profilu.",
      },
    ],
  };
}

export default function RoutineWorkspace({ initialDraft, shelfCatalog: initialShelfCatalog }: RoutineWorkspaceProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [editorRevision, setEditorRevision] = useState(0);
  const [shelfCatalog, setShelfCatalog] = useState(initialShelfCatalog);
  const [stage, setStage] = useState<RoutineAiStage>("idle");
  const [proposal, setProposal] = useState<RoutineAiProposal | null>(null);
  const [recommendations, setRecommendations] = useState<MissingStepRecommendation[]>([]);
  const [failedProducts, setFailedProducts] = useState<FailedProduct[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isApplyConfirmationOpen, setIsApplyConfirmationOpen] = useState(false);
  const [isSavingProposal, setIsSavingProposal] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addedProductIds, setAddedProductIds] = useState<string[]>([]);
  const hasCurrentDraft = hasNonEmptyBaseRoutine(draft);
  const hasSavedRoutine = hasNonEmptyBaseRoutine(savedDraft);
  const isDraftDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const shelfById = new Map(shelfCatalog.map((item) => [item.id, item]));

  useEffect(() => {
    if (!isApplyConfirmationOpen) {
      return;
    }

    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
    };
  }, [isApplyConfirmationOpen]);

  async function startAiFlow() {
    setStage("preparing");
    setProposal(null);
    setRecommendations([]);
    setFailedProducts([]);
    setRequestError(null);
    setAddedProductIds([]);

    try {
      const preparation = await postJson<{ status: "ready" | "blocked"; failedProducts?: FailedProduct[] }>(
        "/api/domain/routine/ai",
        { action: "prepare_shelf" },
      );
      if (preparation.status === "blocked") {
        setFailedProducts(preparation.failedProducts ?? []);
        setStage("blocked");
        return;
      }

      setStage("generating");
      const generated = await postJson<{ proposal: RoutineAiProposal }>("/api/domain/routine/ai", {
        action: "generate_proposal",
        currentDraft: draft,
      });
      setProposal(generated.proposal);

      if (generated.proposal.missingSteps.length === 0) {
        setStage("ready");
        return;
      }

      setStage("evaluating_candidates");
      const evaluated = await postJson<{ recommendations: MissingStepRecommendation[] }>("/api/domain/routine/ai", {
        action: "evaluate_candidates",
        missingSteps: generated.proposal.missingSteps,
      });
      setRecommendations(evaluated.recommendations);
      setStage("ready");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Nie udało się przygotować propozycji AI.");
      setStage("error");
    }
  }

  function applyProposal() {
    if (!proposal) {
      return;
    }

    setApplyError(null);
    setIsApplyConfirmationOpen(true);
  }

  async function saveProposal() {
    if (!proposal) {
      return;
    }

    setIsSavingProposal(true);
    setApplyError(null);
    try {
      await postJson<{ ok: true }>("/api/domain/routine", {
        mode: "save",
        routine: proposal.routine,
      });
      setDraft(proposal.routine);
      setSavedDraft(proposal.routine);
      setProposal(null);
      setRecommendations([]);
      setStage("idle");
      setEditorRevision((revision) => revision + 1);
      setIsApplyConfirmationOpen(false);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Nie udało się zapisać propozycji AI.");
    } finally {
      setIsSavingProposal(false);
    }
  }

  async function addCandidate(recommendation: MissingStepRecommendation, candidate: CatalogCandidate) {
    if (!proposal || addingProductId || addedProductIds.includes(candidate.product.id)) {
      return;
    }

    setAddingProductId(candidate.product.id);
    setRequestError(null);
    try {
      const response = await postJson<{
        shelfItem: UserShelfCatalogItem;
        section: BaseRoutineSectionKey;
        routineRole: RoutineRole;
      }>("/api/domain/routine/ai-candidates", {
        productId: candidate.product.id,
        section: recommendation.missingStep.section,
        routineRole: recommendation.missingStep.routineRole,
      });

      setShelfCatalog((current) =>
        current.some((item) => item.id === response.shelfItem.id) ? current : [...current, response.shelfItem],
      );
      setProposal((current) =>
        current
          ? appendCandidateToProposal(current, response.shelfItem.id, response.section, response.routineRole)
          : current,
      );
      setAddedProductIds((current) => [...current, candidate.product.id]);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Nie udało się dodać rekomendowanego produktu.");
    } finally {
      setAddingProductId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/8 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm tracking-[0.24em] text-cyan-100/65 uppercase">Asystent rutyny</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {hasCurrentDraft ? "Sprawdź i popraw rutynę z AI" : "Ułóż pierwszą rutynę z AI"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-blue-100/75">
              Asystent najpierw sprawdza aktualne analizy produktów z Twojej półki. Potem przygotowuje propozycję, którą
              możesz obejrzeć przed decyzją o zapisie.
            </p>
          </div>
          <button
            type="button"
            disabled={
              shelfCatalog.length === 0 ||
              proposal !== null ||
              stage === "preparing" ||
              stage === "generating" ||
              stage === "evaluating_candidates"
            }
            onClick={startAiFlow}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:translate-y-0"
          >
            {stage === "preparing" || stage === "generating" || stage === "evaluating_candidates" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {stage === "preparing" || stage === "generating" || stage === "evaluating_candidates"
              ? "Pracuję nad rutyną..."
              : hasCurrentDraft
                ? "Sprawdź z AI"
                : "Ułóż z AI"}
          </button>
        </div>

        {(stage === "preparing" || stage === "generating" || stage === "evaluating_candidates") && (
          <div className="mt-5 rounded-2xl border border-cyan-200/20 bg-slate-950/30 p-4 text-sm text-blue-100/80">
            <p className="font-semibold text-white">
              {stage === "preparing" && "Analizuję produkty z Twojej półki"}
              {stage === "generating" && "Układam propozycję bazowej rutyny AM/PM"}
              {stage === "evaluating_candidates" && "Sprawdzam produkty z katalogu dla brakujących kroków"}
            </p>
            <p className="mt-2 leading-6">
              Może to chwilę potrwać przy produktach, które nie miały jeszcze aktualnej analizy.
            </p>
          </div>
        )}

        {stage === "blocked" && (
          <div className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-950/25 p-4">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">Nie udało się przygotować wszystkich analiz produktów</p>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-blue-100/75">
                  {failedProducts.map((product) => (
                    <li key={product.productId}>
                      <span className="font-semibold text-white">{product.label}:</span> {product.message}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={startAiFlow}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  <RefreshCw className="size-4" />
                  Spróbuj ponownie
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === "error" && requestError && (
          <div className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-950/25 p-4">
            <p className="font-semibold text-white">Nie udało się wygenerować propozycji</p>
            <p className="mt-2 text-sm leading-6 text-blue-100/75">{requestError}</p>
            <button
              type="button"
              onClick={startAiFlow}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <RefreshCw className="size-4" />
              Spróbuj ponownie
            </button>
          </div>
        )}
      </section>

      {requestError && stage !== "error" && (
        <p className="rounded-2xl border border-rose-300/25 bg-rose-950/25 px-4 py-3 text-sm leading-6 text-rose-100">
          {requestError}
        </p>
      )}

      {proposal && stage === "ready" && (
        <section className="rounded-[1.75rem] border border-violet-300/25 bg-violet-950/20 p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm tracking-[0.24em] text-violet-100/60 uppercase">Propozycja AI</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Zobacz układ przed zastosowaniem</h2>
              <p className="mt-3 text-sm leading-6 text-blue-100/80">{proposal.summary}</p>
            </div>
            <button
              type="button"
              onClick={applyProposal}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-violet-200 px-5 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              <Check className="size-4" />
              Zastosuj i zapisz
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(["morning", "evening"] as const).map((section) => (
              <div key={section} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <h3 className="font-semibold text-white">{SECTION_LABELS[section]}</h3>
                {proposal.routine[section].length === 0 ? (
                  <p className="mt-3 text-sm leading-6 text-blue-100/60">
                    AI nie proponuje teraz produktu w tej sekcji.
                  </p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {proposal.routine[section].map((entry, index) => {
                      const item = shelfById.get(entry.shelfItemId);
                      return (
                        <li
                          key={`${section}-${entry.shelfItemId}-${entry.routineRole}-${index}`}
                          className="rounded-xl bg-white/5 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-violet-100/70">Krok {index + 1}</span>
                            <span className="rounded-full border border-violet-200/25 px-2 py-0.5 text-xs text-violet-100">
                              {ROUTINE_ROLE_LABELS[entry.routineRole]}
                            </span>
                          </div>
                          <p className="mt-2 font-semibold text-white">{item?.product.name ?? "Produkt z półki"}</p>
                          <p className="mt-1 text-sm leading-6 text-blue-100/70">
                            {getEntryReason(proposal, section, entry.shelfItemId, entry.routineRole) ??
                              "Brak dodatkowego uzasadnienia."}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ))}
          </div>

          {recommendations.length > 0 && (
            <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
              <div>
                <p className="text-sm tracking-[0.2em] text-violet-100/60 uppercase">Brakujące kroki</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Co warto rozważyć poza obecną półką</h3>
              </div>
              {recommendations.map((recommendation) => (
                <article
                  key={`${recommendation.missingStep.section}-${recommendation.missingStep.routineRole}`}
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"
                >
                  <p className="font-semibold text-white">
                    {SECTION_LABELS[recommendation.missingStep.section]} ·{" "}
                    {ROUTINE_ROLE_LABELS[recommendation.missingStep.routineRole]}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-blue-100/75">{recommendation.missingStep.reason}</p>
                  {recommendation.candidates.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-sm leading-6 text-amber-100">
                      W katalogu nie ma teraz produktu, który można odpowiedzialnie polecić dla tego kroku.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                      {recommendation.candidates.map((candidate) => {
                        const isAdded = addedProductIds.includes(candidate.product.id);
                        return (
                          <div key={candidate.product.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex gap-3">
                              {candidate.product.imageUrl ? (
                                <img
                                  src={candidate.product.imageUrl}
                                  alt=""
                                  className="size-12 rounded-xl object-cover"
                                />
                              ) : (
                                <div className="flex size-12 items-center justify-center rounded-xl bg-slate-950/40 text-xs text-blue-100/50">
                                  Brak
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-white">{candidate.product.name}</p>
                                <p className="text-sm text-blue-100/60">{candidate.product.brand ?? "Bez marki"}</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-blue-100/75">
                              {candidate.fit.summary ?? "Produkt ma pozytywną analizę dopasowania."}
                            </p>
                            <p className="mt-2 text-xs text-emerald-100/80">
                              Dopasowanie: {candidate.fit.score ?? "-"}/100
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <a
                                href={`/products/${candidate.product.id}`}
                                className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                              >
                                Szczegóły
                              </a>
                              <button
                                type="button"
                                disabled={isAdded || addingProductId === candidate.product.id}
                                onClick={() => {
                                  void addCandidate(recommendation, candidate);
                                }}
                                className="rounded-full bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-400"
                              >
                                {addingProductId === candidate.product.id
                                  ? "Dodaję..."
                                  : isAdded
                                    ? "Dodano do propozycji"
                                    : "Dodaj do propozycji"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <ManualRoutineEditor
        key={editorRevision}
        initialDraft={draft}
        savedDraft={savedDraft}
        shelfCatalog={shelfCatalog}
        onDraftChange={setDraft}
      />

      {isApplyConfirmationOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="apply-ai-proposal-title"
              className="w-full max-w-md rounded-[1.75rem] border border-violet-200/25 bg-slate-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm tracking-[0.2em] text-violet-100/65 uppercase">
                    {hasSavedRoutine ? "Obecna rutyna" : "Niezapisana rutyna"}
                  </p>
                  <h2 id="apply-ai-proposal-title" className="mt-2 text-xl font-semibold text-white">
                    Zastosować i zapisać propozycję AI?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsApplyConfirmationOpen(false);
                  }}
                  className="rounded-full border border-white/12 p-2 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Zamknij"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-4 text-sm leading-6 text-blue-100/75">
                {isDraftDirty
                  ? "Propozycja AI zastąpi bieżącą wersję rutyny widoczną w edytorze."
                  : "Propozycja AI zastąpi obecną zapisaną rutynę."}{" "}
                Po potwierdzeniu nowa rutyna zostanie od razu zapisana.
              </p>
              {applyError && (
                <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-950/25 px-3 py-2 text-sm leading-6 text-rose-100">
                  {applyError}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsApplyConfirmationOpen(false);
                  }}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveProposal();
                  }}
                  disabled={isSavingProposal}
                  className="rounded-full bg-violet-200 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSavingProposal ? "Zapisuję..." : "Zastosuj i zapisz"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
