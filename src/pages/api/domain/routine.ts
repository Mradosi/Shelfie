import type { APIRoute } from "astro";
import {
  expandBaseRoutineToWeeklySchedule,
  hasNonEmptyBaseRoutine,
  parseBaseRoutineDraft,
  type BaseRoutineDraft,
} from "@/lib/domain/routine-schedule";
import {
  getMissingUserDomainContractMessage,
  isMissingUserDomainContractError,
  upsertUserRoutineConfig,
} from "@/lib/domain/user-domain";
import { createClient } from "@/lib/supabase";

type RoutineMutationMode = "save" | "reset";

function encodeMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "https://shelfie.local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function expectsJson(request: Request) {
  const accept = request.headers.get("Accept") ?? "";
  const requestedWith = request.headers.get("X-Shelfie-Request") ?? "";
  const contentType = request.headers.get("Content-Type") ?? "";
  return (
    accept.includes("application/json") ||
    requestedWith === "routine-editor" ||
    contentType.includes("application/json")
  );
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function parseRedirectPath(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    throw new Error("Ścieżka przekierowania musi prowadzić wewnątrz aplikacji");
  }

  return trimmed;
}

function parseMode(value: FormDataEntryValue | string | null | undefined): RoutineMutationMode {
  if (value === "save" || value === "reset") {
    return value;
  }

  throw new Error("Akcja rutyny musi być jedną z obsługiwanych opcji");
}

function parseRoutineJsonString(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Brakuje danych rutyny do zapisu");
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Dane rutyny muszą być poprawnym JSON-em");
  }
}

function parseSaveDraft(input: unknown): BaseRoutineDraft {
  const draft = parseBaseRoutineDraft(input);
  if (!hasNonEmptyBaseRoutine(draft)) {
    throw new Error("Dodaj co najmniej jeden produkt do porannej albo wieczornej rutyny");
  }

  return draft;
}

async function parsePayload(request: Request, wantsJson: boolean) {
  let successRedirectTo = "/routine";
  let errorRedirectTo = "/routine";
  let mode: RoutineMutationMode = "save";
  let routine: BaseRoutineDraft | null = null;

  if (wantsJson) {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Payload rutyny musi być obiektem");
    }
    const jsonBody = body as Record<string, unknown>;

    try {
      successRedirectTo = parseRedirectPath(jsonBody.successRedirectTo as string | undefined, successRedirectTo);
      errorRedirectTo = parseRedirectPath(jsonBody.errorRedirectTo as string | undefined, errorRedirectTo);
      mode = parseMode(jsonBody.mode as string | undefined);
      routine = mode === "save" ? parseSaveDraft(jsonBody.routine) : null;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Nie udało się przetworzyć żądania rutyny");
    }

    return {
      successRedirectTo,
      errorRedirectTo,
      mode,
      routine,
    };
  }

  const form = await request.formData();

  successRedirectTo = parseRedirectPath(form.get("successRedirectTo"), successRedirectTo);
  errorRedirectTo = parseRedirectPath(form.get("errorRedirectTo"), errorRedirectTo);
  mode = parseMode(form.get("mode"));
  routine = mode === "save" ? parseSaveDraft(parseRoutineJsonString(form.get("routine"))) : null;

  return {
    successRedirectTo,
    errorRedirectTo,
    mode,
    routine,
  };
}

function jsonSuccess(mode: RoutineMutationMode, redirectTo: string) {
  const message = mode === "save" ? "Rutyna została zapisana" : "Rutyna została wyczyszczona";

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      message,
      redirectTo,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export const POST: APIRoute = async (context) => {
  const wantsJson = expectsJson(context.request);

  let successRedirectTo = "/routine";
  let errorRedirectTo = "/routine";
  let mode: RoutineMutationMode = "save";
  let routine: BaseRoutineDraft | null = null;

  try {
    const payload = await parsePayload(context.request, wantsJson);
    successRedirectTo = payload.successRedirectTo;
    errorRedirectTo = payload.errorRedirectTo;
    mode = payload.mode;
    routine = payload.routine;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nieprawidłowe dane rutyny";
    if (wantsJson) {
      return jsonError(message);
    }

    return context.redirect(encodeMessage("/routine", "error", message));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    if (wantsJson) {
      return jsonError("Supabase nie jest skonfigurowane", 500);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", "Supabase nie jest skonfigurowane"));
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    if (wantsJson) {
      return jsonError(authError.message, 401);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", authError.message));
  }

  if (!user) {
    if (wantsJson) {
      return jsonError("Musisz być zalogowany, żeby zarządzać rutyną", 401);
    }

    return context.redirect("/auth/signin");
  }

  try {
    if (mode === "save" && !routine) {
      throw new Error("Brakuje danych rutyny do zapisu");
    }

    const schedule =
      mode === "reset"
        ? {}
        : (() => {
            if (!routine) {
              throw new Error("Brakuje danych rutyny do zapisu");
            }

            return expandBaseRoutineToWeeklySchedule(routine);
          })();
    await upsertUserRoutineConfig(supabase, user.id, schedule);
  } catch (error) {
    const message = isMissingUserDomainContractError(error)
      ? getMissingUserDomainContractMessage()
      : error instanceof Error
        ? error.message
        : "Nie udało się zapisać rutyny";

    if (wantsJson) {
      return jsonError(message, 500);
    }

    return context.redirect(encodeMessage(errorRedirectTo, "error", message));
  }

  const successMessage = mode === "save" ? "Rutyna została zapisana" : "Rutyna została wyczyszczona";
  if (wantsJson) {
    return jsonSuccess(mode, successRedirectTo);
  }

  return context.redirect(encodeMessage(successRedirectTo, "success", successMessage));
};
