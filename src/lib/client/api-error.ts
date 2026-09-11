import { AI_ERROR_ACTIONS, AI_ERROR_CODES, type AiErrorAction, type AiErrorCode } from "@/lib/domain/ai-error-contract";

export interface ApiError {
  code: AiErrorCode | "unknown";
  message: string;
  action: AiErrorAction;
}

const FALLBACK_ERROR: ApiError = {
  code: "unknown",
  message: "Nie udało się wykonać tej akcji. Spróbuj ponownie później.",
  action: "retry",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && AI_ERROR_CODES.includes(value as AiErrorCode);
}

function isAiErrorAction(value: unknown): value is AiErrorAction {
  return AI_ERROR_ACTIONS.includes(value as AiErrorAction);
}

export function getApiError(payload: unknown, fallbackMessage = FALLBACK_ERROR.message): ApiError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const { code, message, action } = payload.error;
    if (isAiErrorCode(code) && typeof message === "string" && message.trim() && isAiErrorAction(action)) {
      return {
        code,
        message: message.trim(),
        action,
      };
    }
  }

  return { ...FALLBACK_ERROR, message: fallbackMessage };
}

export function getApiErrorMessage(payload: unknown, fallbackMessage?: string) {
  return getApiError(payload, fallbackMessage).message;
}
