import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { PRODUCT_CATEGORY_LABELS, isProductCategory } from "@/lib/domain/product-domain";
import {
  ROUTINE_ROLE_DESCRIPTIONS,
  ROUTINE_ROLE_LABELS,
  ROUTINE_ROLE_OPTIONS,
  type BaseRoutineDraft,
  type BaseRoutineEntry,
  type BaseRoutineSectionKey,
  type RoutineRole,
} from "@/lib/domain/routine-schedule";
import type { UserShelfCatalogItem } from "@/lib/domain/user-domain";

const SECTION_LABELS: Record<BaseRoutineSectionKey, string> = {
  morning: "Rutyna poranna",
  evening: "Rutyna wieczorna",
};

const EMPTY_STATE_COPY: Record<BaseRoutineSectionKey, string> = {
  morning: "Sekcja poranna jest jeszcze pusta. Dodaj pierwszy produkt i przypisz mu krok rutyny.",
  evening: "Sekcja wieczorna jest jeszcze pusta. Dodaj pierwszy produkt i przypisz mu krok rutyny.",
};

interface DraftEntry extends BaseRoutineEntry {
  clientId: string;
}

interface DraftState {
  morning: DraftEntry[];
  evening: DraftEntry[];
}

interface ManualRoutineEditorProps {
  initialDraft: BaseRoutineDraft;
  savedDraft?: BaseRoutineDraft;
  shelfCatalog: UserShelfCatalogItem[];
  onDraftChange?: (draft: BaseRoutineDraft) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

function buildShelfLabel(item: UserShelfCatalogItem) {
  const brandPrefix = item.product.brand ? `${item.product.brand} · ` : "";
  const aiExclusion = item.excludeFromAiRoutines ? " · Wykluczony tylko z AI" : "";
  return `${brandPrefix}${item.product.name}${aiExclusion}`;
}

function getCategoryHint(category: string | null) {
  if (!category || !isProductCategory(category)) {
    return "Typ kroku nieustalony";
  }

  return PRODUCT_CATEGORY_LABELS[category];
}

function serializeDraft(draft: DraftState): BaseRoutineDraft {
  return {
    morning: draft.morning.map((entry) => ({
      shelfItemId: entry.shelfItemId,
      routineRole: entry.routineRole,
    })),
    evening: draft.evening.map((entry) => ({
      shelfItemId: entry.shelfItemId,
      routineRole: entry.routineRole,
    })),
  };
}

function buildRoleSummary(sectionEntries: DraftEntry[], shelfLookup: Record<string, UserShelfCatalogItem | undefined>) {
  return ROUTINE_ROLE_OPTIONS.flatMap((role) => {
    const items = sectionEntries.filter((entry) => entry.routineRole === role);
    if (items.length === 0) {
      return [];
    }

    return [
      {
        role,
        items: items.map((entry) => shelfLookup[entry.shelfItemId]).filter(Boolean),
      },
    ];
  });
}

function buildInitialDraftState(initialDraft: BaseRoutineDraft) {
  let counter = 0;
  const createClientId = () => `routine-entry-${counter++}`;

  return {
    draft: {
      morning: initialDraft.morning.map((entry) => ({ ...entry, clientId: createClientId() })),
      evening: initialDraft.evening.map((entry) => ({ ...entry, clientId: createClientId() })),
    },
    nextCounter: counter,
  };
}

export default function ManualRoutineEditor({
  initialDraft,
  savedDraft,
  shelfCatalog,
  onDraftChange,
  onDirtyChange,
}: ManualRoutineEditorProps) {
  const initialState = buildInitialDraftState(initialDraft);
  const nextIdRef = useRef(initialState.nextCounter);
  const resetSubmitterRef = useRef<HTMLButtonElement>(null);
  const allowResetSubmitRef = useRef(false);
  const createClientId = () => `routine-entry-${nextIdRef.current++}`;
  const initialSerialized = JSON.stringify(savedDraft ?? initialDraft);
  const [draft, setDraft] = useState<DraftState>(initialState.draft);
  const [activeSection, setActiveSection] = useState<BaseRoutineSectionKey>(
    initialDraft.morning.length > 0 ? "morning" : initialDraft.evening.length > 0 ? "evening" : "morning",
  );
  const [selectedShelfItemId, setSelectedShelfItemId] = useState(shelfCatalog[0]?.id ?? "");
  const [selectedRole, setSelectedRole] = useState<RoutineRole>("cleanse");
  const [submissionMode, setSubmissionMode] = useState<"save" | "reset" | null>(null);
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);

  const shelfLookup = shelfCatalog.reduce<Record<string, UserShelfCatalogItem | undefined>>((lookup, item) => {
    lookup[item.id] = item;
    return lookup;
  }, {});
  const serializedDraft = JSON.stringify(serializeDraft(draft));
  const hasEntries = draft.morning.length > 0 || draft.evening.length > 0;
  const hasFewProducts = shelfCatalog.length > 0 && shelfCatalog.length < 2;
  const isDirty = serializedDraft !== initialSerialized;
  const activeEntries = draft[activeSection];
  const roleSummary = buildRoleSummary(activeEntries, shelfLookup);
  const reportDraftChange = useEffectEvent(() => {
    onDraftChange?.(serializeDraft(draft));
  });
  const reportDirtyChange = useEffectEvent(() => {
    onDirtyChange?.(isDirty);
  });

  useEffect(() => {
    reportDraftChange();
  }, [serializedDraft]);

  useEffect(() => {
    reportDirtyChange();
  }, [isDirty]);

  useEffect(() => {
    if (!isResetConfirmationOpen) {
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
  }, [isResetConfirmationOpen]);

  function addEntry() {
    if (!selectedShelfItemId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      [activeSection]: [
        ...current[activeSection],
        {
          clientId: createClientId(),
          shelfItemId: selectedShelfItemId,
          routineRole: selectedRole,
        },
      ],
    }));
  }

  function updateEntryRole(section: BaseRoutineSectionKey, clientId: string, nextRole: RoutineRole) {
    setDraft((current) => ({
      ...current,
      [section]: current[section].map((entry) =>
        entry.clientId === clientId ? { ...entry, routineRole: nextRole } : entry,
      ),
    }));
  }

  function removeEntry(section: BaseRoutineSectionKey, clientId: string) {
    setDraft((current) => ({
      ...current,
      [section]: current[section].filter((entry) => entry.clientId !== clientId),
    }));
  }

  function moveEntry(section: BaseRoutineSectionKey, clientId: string, direction: "up" | "down") {
    setDraft((current) => {
      const sectionEntries = [...current[section]];
      const currentIndex = sectionEntries.findIndex((entry) => entry.clientId === clientId);
      if (currentIndex === -1) {
        return current;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= sectionEntries.length) {
        return current;
      }

      const [entry] = sectionEntries.splice(currentIndex, 1);
      sectionEntries.splice(nextIndex, 0, entry);

      return {
        ...current,
        [section]: sectionEntries,
      };
    });
  }

  return (
    <form
      method="POST"
      action="/api/domain/routine"
      className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]"
      onSubmit={(event) => {
        const submitter = event.nativeEvent.submitter;
        const nextMode =
          submitter instanceof HTMLButtonElement && (submitter.value === "save" || submitter.value === "reset")
            ? submitter.value
            : "save";

        window.requestAnimationFrame(() => {
          setSubmissionMode(nextMode);
        });
      }}
    >
      <input type="hidden" name="successRedirectTo" value="/routine" />
      <input type="hidden" name="errorRedirectTo" value="/routine" />
      <input type="hidden" name="routine" value={serializedDraft} readOnly />

      <section className="space-y-6 rounded-[1.75rem] border border-white/10 bg-slate-950/30 p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5">
          <div className="flex flex-wrap gap-3">
            {(["morning", "evening"] as const).map((sectionKey) => {
              const isActive = activeSection === sectionKey;
              const count = draft[sectionKey].length;

              return (
                <button
                  key={sectionKey}
                  type="button"
                  onClick={() => {
                    setActiveSection(sectionKey);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-cyan-300 text-slate-950"
                      : "border border-white/15 bg-white/5 text-blue-100/75 hover:bg-white/12"
                  }`}
                >
                  {SECTION_LABELS[sectionKey]} · {count}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Aktualna sekcja</p>
            <h2 className="text-2xl font-semibold text-white">{SECTION_LABELS[activeSection]}</h2>
            <p className="max-w-2xl text-sm leading-6 text-blue-100/75">
              Dodawaj produkty do aktywnej sekcji, ustawiaj ich krok rutyny i zmieniaj kolejność dokładnie tak, jak
              chcesz prowadzić poranny albo wieczorny flow.
            </p>
          </div>
        </div>

        {shelfCatalog.length === 0 ? (
          <div className="rounded-[1.5rem] border border-amber-400/25 bg-amber-950/35 p-5 text-sm leading-6 text-amber-100">
            <p className="font-semibold text-white">Nie masz jeszcze produktów na półce.</p>
            <p className="mt-2">
              Ten widok pozostaje dostępny, ale żeby zbudować rutynę, dodaj najpierw choć jeden produkt do swojej półki.
            </p>
            <a
              href="/products/intake"
              className="mt-4 inline-flex rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              Dodaj pierwszy produkt
            </a>
          </div>
        ) : (
          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Dodaj wpis</p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Nowy krok w sekcji {SECTION_LABELS[activeSection].toLowerCase()}
                </h3>
              </div>
              {hasFewProducts && (
                <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1 text-xs text-blue-100/65">
                  Na półce masz na razie tylko 1 produkt
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_auto]">
              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Produkt z półki</span>
                <select
                  value={selectedShelfItemId}
                  onChange={(event) => {
                    setSelectedShelfItemId(event.target.value);
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white focus:border-cyan-300/60 focus:outline-none"
                >
                  {shelfCatalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {buildShelfLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-blue-100/80">Krok rutyny</span>
                <select
                  value={selectedRole}
                  onChange={(event) => {
                    setSelectedRole(event.target.value as RoutineRole);
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white focus:border-cyan-300/60 focus:outline-none"
                >
                  {ROUTINE_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROUTINE_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={addEntry}
                className="inline-flex items-center justify-center gap-2 self-end rounded-full bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
              >
                <Plus className="h-4 w-4" />
                Dodaj do sekcji
              </button>
            </div>

            <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm leading-6 text-blue-100/80">
              <span className="font-semibold text-white">{ROUTINE_ROLE_LABELS[selectedRole]}:</span>{" "}
              {ROUTINE_ROLE_DESCRIPTIONS[selectedRole]}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {activeEntries.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/25 px-5 py-8 text-sm leading-6 text-blue-100/65">
              {EMPTY_STATE_COPY[activeSection]}
            </div>
          ) : (
            activeEntries.map((entry, index) => {
              const shelfItem = shelfLookup[entry.shelfItemId];
              if (!shelfItem) {
                return null;
              }

              const isFirst = index === 0;
              const isLast = index === activeEntries.length - 1;

              return (
                <article key={entry.clientId} className="rounded-[1.5rem] border border-white/10 bg-slate-950/35 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      {shelfItem.product.imageUrl ? (
                        <img
                          src={shelfItem.product.imageUrl}
                          alt={shelfItem.product.name}
                          className="h-20 w-20 rounded-2xl border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xs text-blue-100/45">
                          Brak zdjęcia
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1 text-xs text-blue-100/65">
                            Krok {index + 1}
                          </span>
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1 text-xs text-cyan-100">
                            {ROUTINE_ROLE_LABELS[entry.routineRole]}
                          </span>
                          {shelfItem.excludeFromAiRoutines && (
                            <span className="rounded-full border border-violet-200/25 bg-violet-300/10 px-3 py-1 text-xs text-violet-100">
                              Wykluczony tylko z AI
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/60">{shelfItem.product.brand ?? "Bez marki"}</p>
                          <h3 className="text-lg font-semibold text-white">{shelfItem.product.name}</h3>
                        </div>
                        <p className="text-sm leading-6 text-blue-100/70">
                          Typ kroku z katalogu produktu: {getCategoryHint(shelfItem.product.category)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => {
                          moveEntry(activeSection, entry.clientId, "up");
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowUp className="h-4 w-4" />W górę
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => {
                          moveEntry(activeSection, entry.clientId, "down");
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowDown className="h-4 w-4" />W dół
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeEntry(activeSection, entry.clientId);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-950/30 px-3 py-2 text-sm text-red-100 transition-colors hover:bg-red-950/45"
                      >
                        <Trash2 className="h-4 w-4" />
                        Usuń
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="block">
                      <span className="mb-2 block text-sm text-blue-100/80">Krok rutyny</span>
                      <select
                        value={entry.routineRole}
                        onChange={(event) => {
                          updateEntryRole(activeSection, entry.clientId, event.target.value as RoutineRole);
                        }}
                        className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white focus:border-cyan-300/60 focus:outline-none"
                      >
                        {ROUTINE_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROUTINE_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-blue-100/75">
                      <span className="font-semibold text-white">{ROUTINE_ROLE_LABELS[entry.routineRole]}:</span>{" "}
                      {ROUTINE_ROLE_DESCRIPTIONS[entry.routineRole]}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-blue-100/60">
            {hasEntries
              ? isDirty
                ? "Masz niezapisane zmiany w bazowej rutynie."
                : "Brak niezapisanych zmian. Możesz odświeżyć stronę albo wrócić później."
              : "Dodaj co najmniej jeden produkt do sekcji porannej albo wieczornej, żeby odblokować zapis."}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              ref={resetSubmitterRef}
              type="submit"
              name="mode"
              value="reset"
              disabled={!hasEntries}
              onClick={(event) => {
                if (!hasEntries) {
                  event.preventDefault();
                  return;
                }

                if (!allowResetSubmitRef.current) {
                  event.preventDefault();
                  setIsResetConfirmationOpen(true);
                  return;
                }

                allowResetSubmitRef.current = false;
              }}
              className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-950/30 px-4 py-2.5 text-sm font-semibold text-red-100 transition-colors hover:bg-red-950/45 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              Reset rutyny
            </button>

            <button
              type="submit"
              name="mode"
              value="save"
              disabled={!hasEntries || !isDirty}
              className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-800 disabled:hover:translate-y-0"
            >
              {submissionMode === "save" ? "Zapisuję..." : "Zapisz rutynę"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/35 p-5">
        <div>
          <p className="text-sm tracking-[0.24em] text-blue-100/45 uppercase">Stan sekcji</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{SECTION_LABELS[activeSection]}</h2>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-blue-100/55">Liczba wpisów</p>
          <p className="mt-2 text-2xl font-semibold text-white">{activeEntries.length}</p>
          <p className="mt-2 leading-6 text-blue-100/70">
            Możesz wielokrotnie użyć tego samego produktu, jeśli chcesz np. zachować różne role w różnych sekcjach.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-blue-100/55">Rozkład kroków w aktywnej sekcji</p>
          {roleSummary.length === 0 ? (
            <p className="mt-3 leading-6 text-blue-100/65">
              Po dodaniu pierwszych wpisów zobaczysz tu podsumowanie według ról.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {roleSummary.map(({ role, items }) => (
                <div key={role} className="space-y-2">
                  <p className="font-semibold text-white">
                    {ROUTINE_ROLE_LABELS[role]} <span className="text-blue-100/45">({items.length})</span>
                  </p>
                  <ul className="space-y-1 text-blue-100/70">
                    {items.map((item, index) => (
                      <li key={`${role}-${item.id}-${index}`}>{buildShelfLabel(item)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-blue-100/55">Słownik kroków</p>
          <div className="mt-3 space-y-3">
            {ROUTINE_ROLE_OPTIONS.map((role) => (
              <div key={role} className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                <p className="font-semibold text-white">{ROUTINE_ROLE_LABELS[role]}</p>
                <p className="mt-2 leading-6 text-blue-100/70">{ROUTINE_ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {isResetConfirmationOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-routine-title"
              className="w-full max-w-md rounded-[1.75rem] border border-rose-300/25 bg-slate-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm tracking-[0.2em] text-rose-200/70 uppercase">Reset rutyny</p>
                  <h2 id="reset-routine-title" className="mt-2 text-xl font-semibold text-white">
                    Wyczyścić bazową rutynę?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetConfirmationOpen(false);
                  }}
                  className="rounded-full border border-white/12 p-2 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Zamknij"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-4 text-sm leading-6 text-blue-100/75">
                Produkty na półce pozostaną bez zmian. Możesz później ułożyć nową rutynę ręcznie albo z pomocą AI.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetConfirmationOpen(false);
                  }}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetConfirmationOpen(false);
                    allowResetSubmitRef.current = true;
                    resetSubmitterRef.current?.form?.requestSubmit(resetSubmitterRef.current);
                  }}
                  className="rounded-full bg-rose-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-rose-200"
                >
                  Wyczyść rutynę
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
}
