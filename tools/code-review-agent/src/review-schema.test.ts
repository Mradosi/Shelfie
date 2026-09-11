import { describe, expect, it } from "vitest";
import { REVIEW_CRITERIA, REVIEW_SCHEMA } from "./review-schema.js";

function validReview() {
  const criterion = { score: 8, summary: "Spełnia kryterium.", findings: [] };

  return {
    functionalCorrectness: criterion,
    securityPrivacy: { ...criterion },
    platformFit: { ...criterion },
    maintainability: { ...criterion },
    regressionProtection: { ...criterion },
    manualChecks: [],
    summary: "Zmiana jest gotowa do połączenia.",
  };
}

describe("REVIEW_SCHEMA", () => {
  it("wymaga dokładnie pięciu ustalonych kryteriów", () => {
    expect(REVIEW_CRITERIA).toEqual([
      "functionalCorrectness",
      "securityPrivacy",
      "platformFit",
      "maintainability",
      "regressionProtection",
    ]);
    expect(REVIEW_SCHEMA.safeParse(validReview()).success).toBe(true);

    const missingCriterion = { ...validReview() } as Record<string, unknown>;
    delete missingCriterion.platformFit;
    expect(REVIEW_SCHEMA.safeParse(missingCriterion).success).toBe(false);
  });

  it.each([0, 11, 7.5])("odrzuca wynik poza skalą 1–10: %s", (score) => {
    const review = validReview();
    review.securityPrivacy.score = score;

    expect(REVIEW_SCHEMA.safeParse(review).success).toBe(false);
  });

  it("odrzuca niepełne findings i manual checks", () => {
    const review = validReview();
    review.securityPrivacy.findings.push({
      severity: "high",
      file: "src/middleware.ts",
      line: 12,
      message: "Brakuje sprawdzenia sesji.",
    } as never);
    review.manualChecks.push({ check: "Sprawdź logowanie" } as never);

    expect(REVIEW_SCHEMA.safeParse(review).success).toBe(false);
  });
});
