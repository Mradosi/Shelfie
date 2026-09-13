import { describe, expect, it } from "vitest";
import { classifyAiError, createAiErrorDetails, createAiErrorResponse } from "@/lib/domain/ai-error-contract";

describe("AI error contract", () => {
  it("returns a stable Polish public payload without provider details", async () => {
    const response = createAiErrorResponse("source_validation_failed", 422);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "source_validation_failed",
        message: "Nie udało się potwierdzić danych produktu ze źródła. Doprecyzuj produkt albo dodaj go ręcznie.",
        action: "use_manual_entry",
      },
    });
  });

  it.each([
    [new TypeError("fetch failed"), "network_failure"],
    [new Error("Model returned invalid JSON: token=secret"), "invalid_model_output"],
    [
      Object.assign(new Error("source page returned 404"), { name: "SourceValidationError" }),
      "source_validation_failed",
    ],
    [new Error("Uzupełnij profil skóry"), "invalid_request"],
    [new Error("Najpierw przygotuj aktualne analizy"), "conflict"],
    [new Error("unexpected provider detail https://example.test/token"), "unknown"],
  ] as const)("classifies %s safely as %s", (error, expected) => {
    expect(classifyAiError(error)).toBe(expected);
  });

  it("covers every public code with a Polish message and declared action", () => {
    expect(createAiErrorDetails("provider_unavailable")).toEqual({
      code: "provider_unavailable",
      message: "Asystent AI jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
      action: "retry",
    });
  });

  it.each([
    [new Error("AI nie ma obecnie produktów do użycia."), "no_eligible_shelf_items"],
    [new Error("Twoja rutyna zawiera produkt wykluczony z AI."), "excluded_shelf_item_in_draft"],
  ] as const)("classifies the routine preference boundary %s safely as %s", (error, expected) => {
    expect(classifyAiError(error)).toBe(expected);
  });
});
