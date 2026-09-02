import { describe, expect, it } from "vitest";
import { getApiError } from "@/lib/client/api-error";

describe("getApiError", () => {
  it("reads the declared public error payload", () => {
    expect(
      getApiError({
        error: { code: "network_failure", message: "Brak połączenia.", action: "retry" },
      }),
    ).toEqual({ code: "network_failure", message: "Brak połączenia.", action: "retry" });
  });

  it.each([
    { error: "raw provider error" },
    { error: { code: "internal_500", message: "raw provider error", action: "retry" } },
    { error: { code: "unknown", message: "", action: "retry" } },
    { error: { code: "unknown", message: "Technical", action: "open_url" } },
  ])("uses a Polish fallback for malformed payload %#", (payload) => {
    expect(getApiError(payload)).toEqual({
      code: "unknown",
      message: "Nie udało się wykonać tej akcji. Spróbuj ponownie później.",
      action: "retry",
    });
  });
});
