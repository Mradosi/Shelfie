export const ROUTINE_DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const BASE_ROUTINE_SECTION_KEYS = ["morning", "evening"] as const;
export const ROUTINE_TIME_ZONE = "Europe/Warsaw";
export const ROUTINE_ROLE_OPTIONS = [
  "cleanse",
  "moisturize",
  "protect",
  "tone",
  "treat",
  "exfoliate",
  "remove_makeup",
  "care_mask",
  "eye_care",
  "other",
] as const;

export type RoutineDayKey = (typeof ROUTINE_DAY_KEYS)[number];
export type BaseRoutineSectionKey = (typeof BASE_ROUTINE_SECTION_KEYS)[number];
export type RoutineRole = (typeof ROUTINE_ROLE_OPTIONS)[number];

export const ROUTINE_ROLE_LABELS: Record<RoutineRole, string> = {
  cleanse: "Oczyszczanie",
  moisturize: "Nawilżenie",
  protect: "Ochrona",
  tone: "Tonizowanie",
  treat: "Kuracja",
  exfoliate: "Złuszczanie",
  remove_makeup: "Usuwanie makijażu",
  care_mask: "Maseczki pielęgnacyjne",
  eye_care: "Pielęgnacja oczu",
  other: "Inne",
};

export const ROUTINE_ROLE_DESCRIPTIONS: Record<RoutineRole, string> = {
  cleanse: "Usuwa makijaż, brud i sebum ze skóry, aby przygotować ją do kolejnych kroków.",
  moisturize: "Pomaga zatrzymać nawilżenie i utrzymać barierę wilgoci skóry.",
  protect: "Chroni skórę przed szkodliwym promieniowaniem UV i zewnętrznymi czynnikami środowiskowymi.",
  tone: "Równoważy i nawilża skórę, przygotowując ją do dalszych zabiegów.",
  treat: "Zabiegi, które są ukierunkowane na problemy skórne, takie jak trądzik, ciemne plamy lub oznaki starzenia.",
  exfoliate: "Złuszcza martwe komórki skóry, aby wygładzić skórę, odblokować pory i promować odnowę komórek.",
  remove_makeup: "Rozpuszcza makijaż, filtry przeciwsłoneczne i zanieczyszczenia przed głównym krokiem oczyszczania.",
  care_mask:
    "Intensywne zabiegi stosowane kilka razy w tygodniu, aby zapewnić skórze dodatkowe nawilżenie lub odżywienie.",
  eye_care:
    "Specjalistyczne produkty, które są ukierunkowane na wrażliwą okolicę oczu, zapewniając nawilżenie i leczenie typowych problemów, takich jak obrzęki i cienie.",
  other: "Dowolny krok, który nie pasuje do pozostałych kategorii rutyny.",
};

export interface RoutineScheduleEntry {
  shelf_item_id: string;
  routine_role: RoutineRole;
}

export type RoutineScheduleSection = Record<string, RoutineScheduleEntry[]>;
export type RoutineSchedule = Record<string, RoutineScheduleSection>;

export interface RoutineDaySchedule {
  dayKey: RoutineDayKey;
  morning: RoutineScheduleEntry[];
  evening: RoutineScheduleEntry[];
}

export interface BaseRoutineEntry {
  shelfItemId: string;
  routineRole: RoutineRole;
}

export interface BaseRoutineDraft {
  morning: BaseRoutineEntry[];
  evening: BaseRoutineEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRoutineRole(value: unknown): value is RoutineRole {
  return typeof value === "string" && (ROUTINE_ROLE_OPTIONS as readonly string[]).includes(value);
}

export function createEmptyBaseRoutine(): BaseRoutineDraft {
  return {
    morning: [],
    evening: [],
  };
}

function parseRequiredNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} musi być tekstem`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} jest wymagane`);
  }

  return trimmed;
}

function parseBaseRoutineEntry(value: unknown, index: number): BaseRoutineEntry {
  if (!isRecord(value)) {
    throw new Error(`Pozycja ${index + 1} w rutynie musi być obiektem`);
  }

  const shelfItemId = parseRequiredNonEmptyString(value.shelfItemId ?? value.shelf_item_id, "Produkt w rutynie");
  const routineRoleRaw = value.routineRole ?? value.routine_role;
  if (!isRoutineRole(routineRoleRaw)) {
    throw new Error("Rola produktu w rutynie musi być jedną z obsługiwanych opcji");
  }

  return {
    shelfItemId,
    routineRole: routineRoleRaw,
  };
}

function normalizeRoutineScheduleEntry(value: unknown): RoutineScheduleEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const shelfItemId = typeof value.shelf_item_id === "string" ? value.shelf_item_id.trim() : "";
  if (!shelfItemId || !isRoutineRole(value.routine_role)) {
    return null;
  }

  return {
    shelf_item_id: shelfItemId,
    routine_role: value.routine_role,
  };
}

function normalizeBaseRoutineEntries(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Rutyna musi być listą kroków");
  }

  return value.map((entry, index) => parseBaseRoutineEntry(entry, index));
}

function mapBaseRoutineEntryToScheduleEntry(entry: BaseRoutineEntry): RoutineScheduleEntry {
  return {
    shelf_item_id: entry.shelfItemId,
    routine_role: entry.routineRole,
  };
}

function mapScheduleEntryToBaseRoutineEntry(entry: RoutineScheduleEntry): BaseRoutineEntry {
  return {
    shelfItemId: entry.shelf_item_id,
    routineRole: entry.routine_role,
  };
}

function areRoutineEntriesEqual(left: BaseRoutineEntry[], right: BaseRoutineEntry[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getBaseRoutineSectionFromSchedule(
  schedule: RoutineSchedule,
  dayKey: string,
  sectionKey: BaseRoutineSectionKey,
): BaseRoutineEntry[] {
  const daySchedule = Object.prototype.hasOwnProperty.call(schedule, dayKey) ? schedule[dayKey] : undefined;
  const sectionEntries = daySchedule ? daySchedule[sectionKey] : undefined;
  return (sectionEntries ?? []).map((entry) => mapScheduleEntryToBaseRoutineEntry(entry));
}

export function normalizeRoutineSchedule(schedule: unknown): RoutineSchedule {
  if (!isRecord(schedule)) {
    return {};
  }

  const normalized: RoutineSchedule = {};

  for (const [dayKey, dayValue] of Object.entries(schedule)) {
    if (!isRecord(dayValue)) {
      continue;
    }

    const sections: RoutineScheduleSection = {};

    for (const [sectionKey, sectionValue] of Object.entries(dayValue)) {
      if (!Array.isArray(sectionValue)) {
        continue;
      }

      sections[sectionKey] = sectionValue.flatMap((item) => {
        const normalizedEntry = normalizeRoutineScheduleEntry(item);
        return normalizedEntry ? [normalizedEntry] : [];
      });
    }

    normalized[dayKey] = sections;
  }

  return normalized;
}

export function getRoutineDayKeyForDate(date: Date): RoutineDayKey {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data rutyny musi być prawidłowa");
  }

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: ROUTINE_TIME_ZONE,
    weekday: "long",
  }).format(date);
  const dayKey = weekday.toLowerCase();

  if (!(ROUTINE_DAY_KEYS as readonly string[]).includes(dayKey)) {
    throw new Error(`Nieobsługiwany dzień rutyny: ${weekday}`);
  }

  return dayKey as RoutineDayKey;
}

export function getRoutineDaySchedule(schedule: unknown, dayKey: RoutineDayKey): RoutineDaySchedule {
  const normalizedSchedule = normalizeRoutineSchedule(schedule);
  const daySchedule = normalizedSchedule[dayKey];

  return {
    dayKey,
    morning: (daySchedule?.morning ?? []).map((entry) => ({ ...entry })),
    evening: (daySchedule?.evening ?? []).map((entry) => ({ ...entry })),
  };
}

export function parseBaseRoutineDraft(input: unknown): BaseRoutineDraft {
  if (!isRecord(input)) {
    throw new Error("Rutyna musi być obiektem");
  }

  const draft = createEmptyBaseRoutine();
  if ("entries" in input) {
    throw new Error("Payload rutyny musi używać sekcji morning i evening");
  }

  for (const sectionKey of BASE_ROUTINE_SECTION_KEYS) {
    if (sectionKey in input) {
      draft[sectionKey] = normalizeBaseRoutineEntries(input[sectionKey]);
    }
  }

  for (const inputKey of Object.keys(input)) {
    if (!(BASE_ROUTINE_SECTION_KEYS as readonly string[]).includes(inputKey)) {
      throw new Error(`Sekcja rutyny "${inputKey}" nie jest wspierana w tym etapie`);
    }
  }

  return draft;
}

export function hasNonEmptyBaseRoutine(draft: BaseRoutineDraft) {
  return draft.morning.length > 0 || draft.evening.length > 0;
}

export function allowsRepeatedShelfItems(_draft: BaseRoutineDraft) {
  return true;
}

export function expandBaseRoutineToWeeklySchedule(draft: BaseRoutineDraft): RoutineSchedule {
  const morning = draft.morning.map((entry) => mapBaseRoutineEntryToScheduleEntry(entry));
  const evening = draft.evening.map((entry) => mapBaseRoutineEntryToScheduleEntry(entry));

  return ROUTINE_DAY_KEYS.reduce<RoutineSchedule>((schedule, dayKey) => {
    schedule[dayKey] = {
      morning: morning.map((entry) => ({ ...entry })),
      evening: evening.map((entry) => ({ ...entry })),
    };
    return schedule;
  }, {});
}

export function collapseWeeklyScheduleToBaseRoutine(schedule: RoutineSchedule): BaseRoutineDraft {
  const normalizedSchedule = normalizeRoutineSchedule(schedule);
  if (Object.keys(normalizedSchedule).length === 0) {
    return createEmptyBaseRoutine();
  }

  const firstDayKey = ROUTINE_DAY_KEYS[0];
  const baseMorning = getBaseRoutineSectionFromSchedule(normalizedSchedule, firstDayKey, "morning");
  const baseEvening = getBaseRoutineSectionFromSchedule(normalizedSchedule, firstDayKey, "evening");

  for (const dayKey of ROUTINE_DAY_KEYS.slice(1)) {
    const morning = getBaseRoutineSectionFromSchedule(normalizedSchedule, dayKey, "morning");
    const evening = getBaseRoutineSectionFromSchedule(normalizedSchedule, dayKey, "evening");

    if (!areRoutineEntriesEqual(baseMorning, morning) || !areRoutineEntriesEqual(baseEvening, evening)) {
      throw new Error("Nie udało się zwinąć tygodniowej rutyny do wspólnej bazy AM/PM");
    }
  }

  return {
    morning: baseMorning,
    evening: baseEvening,
  };
}
