import React, { useId, useState } from "react";
import {
  getSkinAspectLevelLabel,
  SKIN_ASPECT_KEYS,
  SKIN_ASPECT_LABELS,
  SKIN_ASPECT_LEVELS,
  SKIN_TYPE_LABELS,
  SKIN_TYPE_OPTIONS,
  type SkinAspectKey,
  type SkinAspectLevel,
  type SkinType,
} from "@/lib/domain/user-domain";
import { SKIN_PROFILE_SUGGESTED_CONCERNS, SKIN_PROFILE_SUGGESTED_GOALS } from "@/lib/domain/skin-profile-questionnaire";

interface SkinProfileEditFormProps {
  serverError?: string | null;
  initialSkinType: SkinType | null;
  initialSkinAspects: Record<SkinAspectKey, SkinAspectLevel>;
  initialConcerns: string[];
  initialGoals: string[];
  initialNotes: string | null;
}

function normalizeItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function SelectableBadge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
      {label}
    </button>
  );
}

function RemovableBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
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

export default function SkinProfileEditForm({
  serverError,
  initialSkinType,
  initialSkinAspects,
  initialConcerns,
  initialGoals,
  initialNotes,
}: SkinProfileEditFormProps) {
  const [concerns, setConcerns] = useState<string[]>(normalizeItems(initialConcerns));
  const [goals, setGoals] = useState<string[]>(normalizeItems(initialGoals));
  const [customConcern, setCustomConcern] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const concernInputId = useId();
  const goalInputId = useId();

  function toggleItem(currentItems: string[], item: string, setter: (items: string[]) => void) {
    setter(
      currentItems.includes(item)
        ? currentItems.filter((currentItem) => currentItem !== item)
        : [...currentItems, item],
    );
  }

  function addItem(input: string, currentItems: string[], setter: (items: string[]) => void, reset: () => void) {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    setter(normalizeItems([...currentItems, trimmed]));
    reset();
  }

  return (
    <form method="POST" action="/api/domain/profile" className="mt-8 space-y-8">
      <input type="hidden" name="mode" value="edit" />
      <input type="hidden" name="successRedirectTo" value="/settings/skin-profile" />
      <input type="hidden" name="errorRedirectTo" value="/settings/skin-profile" />

      {concerns.map((concern) => (
        <input key={concern} type="hidden" name="concerns" value={concern} />
      ))}

      {goals.map((goal) => (
        <input key={goal} type="hidden" name="goals" value={goal} />
      ))}

      {serverError && (
        <p className="rounded-2xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {serverError}
        </p>
      )}

      <section className="space-y-4 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Typ skóry</h2>
          <p className="mt-2 text-sm leading-6 text-blue-100/70">
            Wybierz odpowiedź, która najlepiej opisuje Twoją codzienną bazę.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SKIN_TYPE_OPTIONS.map((skinType) => (
            <label
              key={skinType}
              className={[
                "cursor-pointer rounded-[1.5rem] border p-4 transition-colors",
                initialSkinType === skinType
                  ? "border-cyan-300 bg-cyan-300/15"
                  : "border-white/12 bg-slate-950/35 hover:border-cyan-300/40",
              ].join(" ")}
            >
              <input
                type="radio"
                name="skinType"
                value={skinType}
                defaultChecked={initialSkinType === skinType}
                className="sr-only"
              />
              <span className="text-base font-semibold text-white">{SKIN_TYPE_LABELS[skinType]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Obszary skóry</h2>
          <p className="mt-2 text-sm leading-6 text-blue-100/70">
            Tutaj edytujesz już zapisane poziomy. Jeśli wolisz, możesz też jeszcze raz przejść przez pytania
            onboardingowe.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href="/onboarding/skin-profile?mode=rerun"
            className="rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm text-white transition-colors hover:bg-white/16"
          >
            Przejdź ponownie przez pytania
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SKIN_ASPECT_KEYS.map((aspectKey) => (
            <label key={aspectKey} className="block">
              <span className="mb-2 block text-sm text-blue-100/75">{SKIN_ASPECT_LABELS[aspectKey]}</span>
              <select
                name={`skinAspect_${aspectKey}`}
                defaultValue={initialSkinAspects[aspectKey]}
                className="w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white focus:border-cyan-300/60 focus:outline-none"
              >
                {SKIN_ASPECT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {getSkinAspectLevelLabel(aspectKey, level)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Problemy skórne</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100/70">
              Zaznacz to, co najbardziej przeszkadza Ci teraz w skórze. Jeśli chcesz, dopisz coś własnymi słowami.
            </p>
          </div>

          {concerns.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {concerns.map((concern) => (
                <RemovableBadge
                  key={concern}
                  label={concern}
                  onRemove={() => {
                    setConcerns((current) => current.filter((item) => item !== concern));
                  }}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {SKIN_PROFILE_SUGGESTED_CONCERNS.map((concern) => (
              <SelectableBadge
                key={concern}
                label={concern}
                active={concerns.includes(concern)}
                onClick={() => {
                  toggleItem(concerns, concern, setConcerns);
                }}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-3">
            <input
              id={concernInputId}
              type="text"
              value={customConcern}
              onChange={(event) => {
                setCustomConcern(event.target.value);
              }}
              placeholder="Dodaj własny problem"
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                addItem(customConcern, concerns, setConcerns, () => {
                  setCustomConcern("");
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
            <h2 className="text-lg font-semibold text-white">Cele</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100/70">
              Wybierz efekty, do których chcesz dążyć. Możesz też dodać własny cel.
            </p>
          </div>

          {goals.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {goals.map((goal) => (
                <RemovableBadge
                  key={goal}
                  label={goal}
                  onRemove={() => {
                    setGoals((current) => current.filter((item) => item !== goal));
                  }}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {SKIN_PROFILE_SUGGESTED_GOALS.map((goal) => (
              <SelectableBadge
                key={goal}
                label={goal}
                active={goals.includes(goal)}
                onClick={() => {
                  toggleItem(goals, goal, setGoals);
                }}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-3">
            <input
              id={goalInputId}
              type="text"
              value={customGoal}
              onChange={(event) => {
                setCustomGoal(event.target.value);
              }}
              placeholder="Dodaj własny cel"
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                addItem(customGoal, goals, setGoals, () => {
                  setCustomGoal("");
                });
              }}
              className="rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm text-white transition-colors hover:bg-white/16"
            >
              Dodaj
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/12 bg-slate-950/30 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Notatki</h2>
          <p className="mt-2 text-sm leading-6 text-blue-100/70">
            Jeśli chcesz, dopisz dodatkowy kontekst, który nie mieści się w pozostałych polach.
          </p>
        </div>

        <textarea
          name="notes"
          rows={4}
          defaultValue={initialNotes ?? ""}
          placeholder="Np. skóra bywa bardziej reaktywna po nieprzespanej nocy albo przy zmianie pogody"
          className="mt-4 w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-white placeholder:text-blue-100/35 focus:border-cyan-300/60 focus:outline-none"
        />
      </section>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-blue-100/60">Zmiany zapiszą się do Twojego aktualnego profilu.</p>

        <button
          type="submit"
          className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
        >
          Zapisz zmiany
        </button>
      </div>
    </form>
  );
}
