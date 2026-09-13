export const AI_ERROR_CODES = [
  "unauthorized",
  "invalid_request",
  "not_found",
  "conflict",
  "provider_unavailable",
  "invalid_model_output",
  "network_failure",
  "source_validation_failed",
  "no_eligible_shelf_items",
  "excluded_shelf_item_in_draft",
  "unknown",
] as const;

export const AI_ERROR_ACTIONS = ["retry", "refine_input", "use_manual_entry", null] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
export type AiErrorAction = (typeof AI_ERROR_ACTIONS)[number];

export interface AiErrorDetails {
  code: AiErrorCode;
  message: string;
  action: AiErrorAction;
}

export interface AiErrorPayload {
  error: AiErrorDetails;
}

const ERROR_DETAILS: Record<AiErrorCode, Omit<AiErrorDetails, "code">> = {
  unauthorized: {
    message: "Zaloguj się ponownie, aby kontynuować.",
    action: null,
  },
  invalid_request: {
    message: "Sprawdź podane dane i spróbuj ponownie.",
    action: "refine_input",
  },
  not_found: {
    message: "Nie znaleźliśmy danych potrzebnych do wykonania tej akcji.",
    action: "refine_input",
  },
  conflict: {
    message: "Ta akcja nie jest teraz dostępna dla aktualnych danych. Sprawdź je i spróbuj ponownie.",
    action: "refine_input",
  },
  provider_unavailable: {
    message: "Asystent AI jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
    action: "retry",
  },
  invalid_model_output: {
    message: "Asystent AI zwrócił niepełną odpowiedź. Spróbuj ponownie.",
    action: "retry",
  },
  network_failure: {
    message: "Nie udało się połączyć z asystentem AI. Sprawdź połączenie i spróbuj ponownie.",
    action: "retry",
  },
  source_validation_failed: {
    message: "Nie udało się potwierdzić danych produktu ze źródła. Doprecyzuj produkt albo dodaj go ręcznie.",
    action: "use_manual_entry",
  },
  no_eligible_shelf_items: {
    message: "AI nie ma obecnie produktów do użycia. Cofnij wykluczenie dla co najmniej jednego produktu na półce.",
    action: "refine_input",
  },
  excluded_shelf_item_in_draft: {
    message:
      "Twoja rutyna zawiera produkt wykluczony z AI. Usuń go ręcznie z rutyny albo cofnij wykluczenie produktu, a potem spróbuj ponownie.",
    action: "refine_input",
  },
  unknown: {
    message: "Nie udało się wykonać tej akcji z pomocą AI. Spróbuj ponownie później.",
    action: "retry",
  },
};

export function createAiErrorDetails(code: AiErrorCode): AiErrorDetails {
  return { code, ...ERROR_DETAILS[code] };
}

export function createAiErrorResponse(code: AiErrorCode, status = 500) {
  return Response.json({ error: createAiErrorDetails(code) } satisfies AiErrorPayload, { status });
}

export function classifyAiError(error: unknown): AiErrorCode {
  if (error instanceof TypeError) {
    return "network_failure";
  }

  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (/AI nie ma obecnie produktów do użycia/i.test(message)) {
    return "no_eligible_shelf_items";
  }
  if (/rutyna zawiera produkt wykluczony z AI/i.test(message)) {
    return "excluded_shelf_item_in_draft";
  }
  if (/Nie znaleziono|nie znaleźliśmy/i.test(message)) {
    return "not_found";
  }
  if (
    /Najpierw przygotuj|Brakuje aktualnych|nie ma listy składników|nie ma obecnie wskazówek|Ponowienie jest dostępne|Odświeżenie jest dostępne/i.test(
      message,
    )
  ) {
    return "conflict";
  }
  if (
    /Uzupełnij profil|Dodaj co najmniej jeden produkt|spoza Twojej półki|Brakuje identyfikatora|Akcja |Payload/i.test(
      message,
    )
  ) {
    return "invalid_request";
  }
  if (/SourceValidationError|źródł|source page/i.test(`${name} ${message}`)) {
    return "source_validation_failed";
  }
  if (/OPENROUTER_API_KEY|nie jest skonfigurowany/i.test(message)) {
    return "provider_unavailable";
  }
  if (/Model|OpenRouter|JSON|propozycję|analiz[ęy]|wyjaśnieni[ea]|draft/i.test(message)) {
    return "invalid_model_output";
  }

  return "unknown";
}

export function createAiErrorResponseFromException(error: unknown) {
  return createAiErrorResponse(classifyAiError(error));
}
