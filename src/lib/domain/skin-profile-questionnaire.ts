import {
  createDefaultSkinAspects,
  SKIN_ASPECT_LABELS,
  SKIN_TYPE_LABELS,
  SKIN_TYPE_OPTIONS,
  type SkinAspectKey,
  type SkinAspectLevel,
  type SkinAspects,
  type SkinType,
} from "@/lib/domain/user-domain";

interface SkinProfileQuestion {
  id: string;
  prompt: string;
  options?: readonly {
    value: SkinProfileAnswerValue;
    label: string;
    description: string;
  }[];
}

interface SkinProfileQuestionGroup {
  aspect: SkinAspectKey;
  title: string;
  questions: readonly SkinProfileQuestion[];
}

export const SKIN_PROFILE_TIMEFRAME_COPY =
  "Pomyśl o swojej skórze takiej, jaka bywa na co dzień w ostatnich 2-4 tygodniach.";

export const SKIN_PROFILE_ANSWER_OPTIONS = [
  { value: 0, label: "Nigdy", description: "To praktycznie się nie zdarza." },
  { value: 1, label: "Czasami", description: "Pojawia się od czasu do czasu." },
  { value: 2, label: "Często", description: "To dość częsta sytuacja." },
  { value: 3, label: "Bardzo często", description: "To wyraźna część codziennego stanu skóry." },
] as const;

export const SKIN_PROFILE_VISIBILITY_OPTIONS = [
  { value: 0, label: "Prawie niewidoczny", description: "Trudno to zauważyć na pierwszy rzut oka." },
  { value: 1, label: "Lekko widoczny", description: "Widać to delikatnie, ale nie dominuje wyglądu skóry." },
  { value: 2, label: "Wyraźnie widoczny", description: "To dość zauważalny element wyglądu skóry." },
  { value: 3, label: "Bardzo widoczny", description: "To mocno rzuca się w oczy i jest trudne do przeoczenia." },
] as const;

export const SKIN_PROFILE_INTENSITY_OPTIONS = [
  { value: 0, label: "Prawie wcale", description: "Skóra wygląda dość równo i spokojnie." },
  { value: 1, label: "Trochę", description: "Widać lekkie odchylenia, ale nie są dominujące." },
  { value: 2, label: "Wyraźnie", description: "To zauważalna cecha skóry na co dzień." },
  { value: 3, label: "Bardzo mocno", description: "To jedna z pierwszych rzeczy, które widać na skórze." },
] as const;

export type SkinProfileAnswerValue = (typeof SKIN_PROFILE_ANSWER_OPTIONS)[number]["value"];

export const SKIN_PROFILE_QUESTION_GROUPS: readonly SkinProfileQuestionGroup[] = [
  {
    aspect: "sensitivity",
    title: SKIN_ASPECT_LABELS.sensitivity,
    questions: [
      {
        id: "sensitivity_reactive_products",
        prompt: "Jak często skóra piecze, szczypie albo reaguje dyskomfortem po nowym produkcie?",
      },
      {
        id: "sensitivity_redness_triggers",
        prompt:
          "Jak często pogoda, ciepło, zapachy albo aktywne składniki zostawiają skórę zaczerwienioną lub podrażnioną?",
      },
    ],
  },
  {
    aspect: "pigmentation",
    title: SKIN_ASPECT_LABELS.pigmentation,
    questions: [
      {
        id: "pigmentation_post_blemish_marks",
        prompt: "Jak często po niedoskonałościach zostają widoczne ślady albo ciemniejsze plamki?",
      },
      {
        id: "pigmentation_uneven_tone",
        prompt: "Na ile nierówny wydaje się koloryt skóry bez makijażu?",
        options: SKIN_PROFILE_INTENSITY_OPTIONS,
      },
    ],
  },
  {
    aspect: "firmness",
    title: SKIN_ASPECT_LABELS.firmness,
    questions: [
      {
        id: "firmness_less_bouncy",
        prompt: "Jak często skóra wydaje się mniej sprężysta, niż byś chciała?",
      },
      {
        id: "firmness_lines_visible",
        prompt: "Jak widoczne są drobne linie albo oznaki utraty jędrności, gdy twarz jest w spoczynku?",
        options: SKIN_PROFILE_VISIBILITY_OPTIONS,
      },
    ],
  },
  {
    aspect: "breakouts",
    title: SKIN_ASPECT_LABELS.breakouts,
    questions: [
      {
        id: "breakouts_new_blemishes",
        prompt: "Jak często pojawiają się nowe niedoskonałości, stany zapalne albo bolesne zmiany?",
      },
      {
        id: "breakouts_clogged_pores",
        prompt: "Jak często utrzymują się zapchane pory, grudki albo zaskórniki?",
      },
    ],
  },
  {
    aspect: "texture",
    title: SKIN_ASPECT_LABELS.texture,
    questions: [
      {
        id: "texture_rough_touch",
        prompt: "Jak często skóra jest w dotyku szorstka, nierówna albo grudkowata?",
      },
      {
        id: "texture_makeup_sits_unevenly",
        prompt: "Jak często SPF albo makijaż układają się nierówno przez suche miejsca albo drobne nierówności?",
      },
    ],
  },
] as const;

export type SkinProfileQuestionId = (typeof SKIN_PROFILE_QUESTION_GROUPS)[number]["questions"][number]["id"];
export type SkinProfileQuestionnaireAnswers = Record<SkinProfileQuestionId, SkinProfileAnswerValue>;

export const SKIN_PROFILE_SUGGESTED_CONCERNS = [
  "Zaczerwienienie",
  "Wrażliwość",
  "Niedoskonałości",
  "Zapchane pory",
  "Przebarwienia",
  "Nierówny koloryt",
  "Odwodnienie",
  "Szorstka tekstura",
] as const;

export const SKIN_PROFILE_SUGGESTED_GOALS = [
  "Spokojniejsza skóra",
  "Mniej niedoskonałości",
  "Gładsza tekstura",
  "Bardziej równy koloryt",
  "Jaśniejsza skóra",
  "Lepsze nawilżenie",
  "Silniejsza bariera",
  "Lepsza jędrność",
] as const;

const QUESTION_IDS = SKIN_PROFILE_QUESTION_GROUPS.flatMap((group) => group.questions.map((question) => question.id));
const ANSWER_VALUES = new Set<number>(SKIN_PROFILE_ANSWER_OPTIONS.map((option) => option.value));

export const SKIN_PROFILE_SKIN_TYPE_OPTIONS = SKIN_TYPE_OPTIONS.map((value) => ({
  value,
  label: SKIN_TYPE_LABELS[value],
  description:
    value === "dry"
      ? "Często bywa napięta, matowa i potrzebuje bardziej odżywczego wsparcia."
      : value === "oily"
        ? "Szybciej się błyszczy i potrafi sprawiać wrażenie cięższej w ciągu dnia."
        : value === "combination"
          ? "Niektóre obszary się przetłuszczają, a inne pozostają bardziej normalne albo suche."
          : value === "normal"
            ? "Na co dzień jest dość stabilna, bez większych wahań w stronę suchości albo przetłuszczenia."
            : value === "balanced"
              ? "Na ogół zachowuje równowagę i zmienia się tylko lekko zależnie od tygodnia."
              : "Nie masz jeszcze pewności i to zupełnie w porządku na pierwszy, bazowy profil.",
})) satisfies { value: SkinType; label: string; description: string }[];

export function getSkinProfileOptions(question: SkinProfileQuestion) {
  return question.options ?? SKIN_PROFILE_ANSWER_OPTIONS;
}

export function getSkinProfileQuestionIds() {
  return [...QUESTION_IDS];
}

export function isSkinProfileAnswerValue(value: unknown): value is SkinProfileAnswerValue {
  return typeof value === "number" && ANSWER_VALUES.has(value);
}

function averageToSkinAspectLevel(score: number): SkinAspectLevel {
  if (score < 0.5) {
    return "none";
  }

  if (score < 1.5) {
    return "low";
  }

  if (score < 2.5) {
    return "medium";
  }

  return "high";
}

export function mapQuestionnaireAnswersToSkinAspects(answers: SkinProfileQuestionnaireAnswers): SkinAspects {
  const skinAspects = createDefaultSkinAspects();

  for (const group of SKIN_PROFILE_QUESTION_GROUPS) {
    const scores = group.questions.map((question) => answers[question.id]);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    skinAspects[group.aspect] = averageToSkinAspectLevel(average);
  }

  return skinAspects;
}

export function isValidQuestionnaireAnswers(value: unknown): value is SkinProfileQuestionnaireAnswers {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return QUESTION_IDS.every((questionId) => isSkinProfileAnswerValue(record[questionId]));
}
