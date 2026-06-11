import React, { useId, useState } from "react";
import {
  SKIN_PROFILE_SUGGESTED_CONCERNS,
  SKIN_PROFILE_SUGGESTED_GOALS,
  getSkinProfileOptions,
  getSkinProfileQuestionIds,
  isSkinProfileAnswerValue,
  mapQuestionnaireAnswersToSkinAspects,
  SKIN_PROFILE_QUESTION_GROUPS,
  SKIN_PROFILE_SKIN_TYPE_OPTIONS,
  SKIN_PROFILE_TIMEFRAME_COPY,
  type SkinProfileAnswerValue,
  type SkinProfileQuestionId,
} from "@/lib/domain/skin-profile-questionnaire";
import { getSkinAspectLevelLabel, SKIN_ASPECT_LABELS, type SkinType } from "@/lib/domain/user-domain";

interface SkinProfileWizardProps {
  serverError?: string | null;
  initialSkinType?: SkinType | null;
  initialConcerns?: string[];
  initialGoals?: string[];
}

const STEPS = ["Typ skóry", "Sygnały skóry", "Potrzeby i cele"] as const;

function normalizeItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-sm transition-colors",
        active
          ? "border-cyan-300 bg-cyan-300 text-slate-950"
          : "border-white/12 bg-slate-950/35 text-blue-100/80 hover:border-cyan-300/50 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SelectedBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-cyan-300/20"
    >
      <span>{label}</span>
      <span className="text-cyan-200/80">x</span>
    </button>
  );
}

export default function SkinProfileWizard({
  serverError,
  initialSkinType = null,
  initialConcerns = [],
  initialGoals = [],
}: SkinProfileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [aspectIndex, setAspectIndex] = useState(0);
  const [skinType, setSkinType] = useState<SkinType | "">(initialSkinType ?? "");
  const [questionAnswers, setQuestionAnswers] = useState<
    Partial<Record<SkinProfileQuestionId, SkinProfileAnswerValue>>
  >({});
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>(normalizeItems(initialConcerns));
  const [selectedGoals, setSelectedGoals] = useState<string[]>(normalizeItems(initialGoals));
  const [customConcernInput, setCustomConcernInput] = useState("");
  const [customGoalInput, setCustomGoalInput] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);
  const concernInputId = useId();
  const goalInputId = useId();

  const progressWidth = `${((stepIndex + 1) / STEPS.length) * 100}%`;
  const requiredQuestionIds = getSkinProfileQuestionIds();
  const answeredQuestionCount = requiredQuestionIds.filter((questionId) =>
    isSkinProfileAnswerValue(questionAnswers[questionId]),
  ).length;
  const selectedSkinAspects =
    answeredQuestionCount === requiredQuestionIds.length
      ? mapQuestionnaireAnswersToSkinAspects(questionAnswers as Record<SkinProfileQuestionId, SkinProfileAnswerValue>)
      : null;
  const currentAspectGroup = SKIN_PROFILE_QUESTION_GROUPS[aspectIndex];
  const aspectProgressWidth = `${((aspectIndex + 1) / SKIN_PROFILE_QUESTION_GROUPS.length) * 100}%`;
  const currentAspectAnsweredCount = currentAspectGroup.questions.filter((question) =>
    isSkinProfileAnswerValue(questionAnswers[question.id]),
  ).length;

  function toggleItem(currentItems: string[], item: string, setter: (items: string[]) => void) {
    setter(
      currentItems.includes(item)
        ? currentItems.filter((currentItem) => currentItem !== item)
        : [...currentItems, item],
    );
  }

  function addCustomItem(input: string, currentItems: string[], setter: (items: string[]) => void, reset: () => void) {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    setter(normalizeItems([...currentItems, trimmed]));
    reset();
  }

  function validateStep(index: number) {
    if (index === 0 && !skinType) {
      return "Wybierz typ skóry, który najlepiej opisuje Twoją codzienną bazę.";
    }

    if (index === 1 && currentAspectAnsweredCount !== currentAspectGroup.questions.length) {
      return `Odpowiedz na oba pytania dla obszaru ${currentAspectGroup.title.toLowerCase()}, zanim przejdziesz dalej.`;
    }

    return null;
  }

  function handleNext() {
    const nextError = validateStep(stepIndex);
    if (nextError) {
      setStepError(nextError);
      return;
    }

    setStepError(null);

    if (stepIndex === 1 && aspectIndex < SKIN_PROFILE_QUESTION_GROUPS.length - 1) {
      setAspectIndex((current) => current + 1);
      return;
    }

    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStepError(null);

    if (stepIndex === 1 && aspectIndex > 0) {
      setAspectIndex((current) => current - 1);
      return;
    }

    if (stepIndex === 2) {
      setAspectIndex(SKIN_PROFILE_QUESTION_GROUPS.length - 1);
    }

    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    const nextError = validateStep(stepIndex);
    if (nextError) {
      event.preventDefault();
      setStepError(nextError);
      return;
    }

    setStepError(null);
  }

  return (
    <form method="POST" action="/api/domain/profile" className="mt-8 space-y-8" onSubmit={handleSubmit}>
      <input type="hidden" name="mode" value="onboarding" />
      <input type="hidden" name="successRedirectTo" value="/onboarding/skin-profile/complete?source=save" />
      <input type="hidden" name="errorRedirectTo" value="/onboarding/skin-profile" />
      <input type="hidden" name="questionnaireAnswers" value={JSON.stringify(questionAnswers)} />

      {normalizeItems(selectedConcerns).map((concern) => (
        <input key={concern} type="hidden" name="concerns" value={concern} />
      ))}

      {normalizeItems(selectedGoals).map((goal) => (
        <input key={goal} type="hidden" name="goals" value={goal} />
      ))}

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-blue-100/70">
          <span>
            Krok {stepIndex + 1} z {STEPS.length}
          </span>
          <span>{STEPS[stepIndex]}</span>
        </div>
        <div className="h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: progressWidth }} />
        </div>
      </div>

      {(stepError ?? serverError) && (
        <p className="rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {stepError ?? serverError}
        </p>
      )}

      {stepIndex === 0 && (
        <section className="space-y-5">
          <div>
            <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Baza</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Który typ skóry jest Ci najbliższy?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75">{SKIN_PROFILE_TIMEFRAME_COPY}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SKIN_PROFILE_SKIN_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={[
                  "cursor-pointer rounded-[1.5rem] border p-4 transition-colors",
                  skinType === option.value
                    ? "border-cyan-300 bg-cyan-300/15"
                    : "border-white/12 bg-slate-950/35 hover:border-cyan-300/40",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="skinType"
                  value={option.value}
                  checked={skinType === option.value}
                  onChange={() => {
                    setSkinType(option.value);
                    setStepError(null);
                  }}
                  className="sr-only"
                />
                <span className="text-base font-semibold text-white">{option.label}</span>
                <span className="mt-2 block text-sm leading-6 text-blue-100/70">{option.description}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {stepIndex === 1 && (
        <section className="space-y-6">
          <div>
            <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Sygnały</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Jak zachowywała się Twoja skóra ostatnio?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75">{SKIN_PROFILE_TIMEFRAME_COPY}</p>
          </div>

          <div className="space-y-4 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
            <div className="space-y-3 border-b border-white/10 pb-4">
              <div className="flex items-center justify-between text-sm text-blue-100/70">
                <span>
                  Obszar {aspectIndex + 1} z {SKIN_PROFILE_QUESTION_GROUPS.length}
                </span>
                <span>{currentAspectGroup.title}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-all"
                  style={{ width: aspectProgressWidth }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {SKIN_PROFILE_QUESTION_GROUPS.map((group, index) => {
                  const isActive = index === aspectIndex;
                  const isCompleted = group.questions.every((question) =>
                    isSkinProfileAnswerValue(questionAnswers[question.id]),
                  );

                  return (
                    <span
                      key={group.aspect}
                      className={[
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        isActive
                          ? "border-cyan-300 bg-cyan-300/15 text-white"
                          : isCompleted
                            ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                            : "border-white/12 bg-white/5 text-blue-100/60",
                      ].join(" ")}
                    >
                      {group.title}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{currentAspectGroup.title}</h3>
                <p className="text-sm text-blue-100/60">
                  Dwa krótkie pytania, które pomagają opisać obszar {currentAspectGroup.title.toLowerCase()}.
                </p>
              </div>
              {selectedSkinAspects && (
                <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-blue-100/75">
                  {SKIN_ASPECT_LABELS[currentAspectGroup.aspect]}:{" "}
                  {getSkinAspectLevelLabel(currentAspectGroup.aspect, selectedSkinAspects[currentAspectGroup.aspect])}
                </span>
              )}
            </div>

            <div className="space-y-4">
              {currentAspectGroup.questions.map((question) => (
                <fieldset key={question.id} className="space-y-3">
                  <legend className="text-sm leading-6 text-white">{question.prompt}</legend>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {getSkinProfileOptions(question).map((option) => (
                      <label
                        key={option.value}
                        className={[
                          "cursor-pointer rounded-2xl border p-4 transition-colors",
                          questionAnswers[question.id] === option.value
                            ? "border-cyan-300 bg-cyan-300/15"
                            : "border-white/12 bg-white/5 hover:border-cyan-300/40",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          checked={questionAnswers[question.id] === option.value}
                          onChange={() => {
                            setQuestionAnswers((current) => ({ ...current, [question.id]: option.value }));
                            setStepError(null);
                          }}
                          className="sr-only"
                        />
                        <span className="block text-sm font-semibold text-white">{option.label}</span>
                        <span className="mt-2 block text-xs leading-5 text-blue-100/60">{option.description}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </section>
      )}

      {stepIndex === 2 && (
        <section className="space-y-6">
          <div>
            <p className="text-sm tracking-[0.22em] text-cyan-100/55 uppercase">Priorytety</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Na czym najbardziej Ci zależy?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/75">
              Wybierz propozycje, które pasują do Twojej skóry, a jeśli czegoś brakuje, wpisz to własnymi słowami.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
              <div>
                <h3 className="text-lg font-semibold text-white">Problemy skórne</h3>
                <p className="mt-2 text-sm leading-6 text-blue-100/70">
                  Wybierz to, co najbardziej przeszkadza Ci teraz w skórze. Jeśli czegoś brakuje, dodaj własne
                  określenie.
                </p>
              </div>

              {selectedConcerns.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedConcerns.map((concern) => (
                    <SelectedBadge
                      key={concern}
                      label={concern}
                      onRemove={() => {
                        setSelectedConcerns((current) => current.filter((item) => item !== concern));
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {SKIN_PROFILE_SUGGESTED_CONCERNS.map((concern) => (
                  <ChipButton
                    key={concern}
                    active={selectedConcerns.includes(concern)}
                    onClick={() => {
                      toggleItem(selectedConcerns, concern, setSelectedConcerns);
                    }}
                  >
                    {concern}
                  </ChipButton>
                ))}
              </div>

              <div className="mt-5 flex gap-3">
                <input
                  id={concernInputId}
                  type="text"
                  value={customConcernInput}
                  onChange={(event) => {
                    setCustomConcernInput(event.target.value);
                  }}
                  placeholder="Dodaj własny problem"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    addCustomItem(customConcernInput, selectedConcerns, setSelectedConcerns, () => {
                      setCustomConcernInput("");
                    });
                  }}
                  className="rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm text-white transition-colors hover:bg-white/16"
                >
                  Dodaj
                </button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
              <div>
                <h3 className="text-lg font-semibold text-white">Cele</h3>
                <p className="mt-2 text-sm leading-6 text-blue-100/70">
                  Cele opisują efekt, który chcesz osiągnąć, a nie tylko problem, który widzisz dzisiaj.
                </p>
              </div>

              {selectedGoals.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedGoals.map((goal) => (
                    <SelectedBadge
                      key={goal}
                      label={goal}
                      onRemove={() => {
                        setSelectedGoals((current) => current.filter((item) => item !== goal));
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {SKIN_PROFILE_SUGGESTED_GOALS.map((goal) => (
                  <ChipButton
                    key={goal}
                    active={selectedGoals.includes(goal)}
                    onClick={() => {
                      toggleItem(selectedGoals, goal, setSelectedGoals);
                    }}
                  >
                    {goal}
                  </ChipButton>
                ))}
              </div>

              <div className="mt-5 flex gap-3">
                <input
                  id={goalInputId}
                  type="text"
                  value={customGoalInput}
                  onChange={(event) => {
                    setCustomGoalInput(event.target.value);
                  }}
                  placeholder="Dodaj własny cel"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    addCustomItem(customGoalInput, selectedGoals, setSelectedGoals, () => {
                      setCustomGoalInput("");
                    });
                  }}
                  className="rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm text-white transition-colors hover:bg-white/16"
                >
                  Dodaj
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-blue-100/60">
          {stepIndex === 1
            ? `${currentAspectAnsweredCount} z ${currentAspectGroup.questions.length} odpowiedzi gotowe w obszarze ${currentAspectGroup.title.toLowerCase()}`
            : "Możesz wracać bez utraty wcześniej wpisanych danych."}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="rounded-full border border-white/20 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Wstecz
          </button>

          {stepIndex < STEPS.length - 1 ? (
            <button
              key="continue-button"
              type="button"
              onClick={handleNext}
              className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              Dalej
            </button>
          ) : (
            <button
              key="submit-button"
              type="submit"
              className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              Zapisz profil skóry
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
