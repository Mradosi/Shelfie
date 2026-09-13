import { describe, expect, it } from "vitest";
import { parseRoutineAiAssessment } from "@/lib/domain/routine-ai";
import { createAiContractFixtures } from "@/test/fixtures";
import { createRoutineAiShelfInputs } from "@/lib/domain/routine-ai-assessment";

function assessmentInput() {
  const fixtures = createAiContractFixtures();
  return {
    fixtures,
    shelf: createRoutineAiShelfInputs(fixtures.shelfCatalog, fixtures.products, fixtures.interpretations),
  };
}

describe("parseRoutineAiAssessment", () => {
  it("accepts a complete audit for every product pair", () => {
    const { fixtures, shelf } = assessmentInput();
    expect(parseRoutineAiAssessment(fixtures.validAssessment, fixtures.currentDraft, shelf)).toEqual(
      fixtures.validAssessment,
    );
  });

  it("rejects a missing compatibility pair before persistence", () => {
    const { fixtures, shelf } = assessmentInput();
    expect(() =>
      parseRoutineAiAssessment({ ...fixtures.validAssessment, compatibilityAudit: [] }, fixtures.currentDraft, shelf),
    ).toThrow("Ocena rutyny musi zawierać werdykt dla każdej pary produktów.");
  });

  it("rejects an ingredient that is absent from the cited product INCI", () => {
    const { fixtures, shelf } = assessmentInput();
    const invalid = {
      ...fixtures.validAssessment,
      findings: [
        {
          severity: "medium",
          section: "morning",
          shelfItemIds: ["shelf-serum"],
          ingredientCitations: [{ shelfItemId: "shelf-serum", ingredient: "Retinal" }],
          message: "Nieprawidłowy cytat.",
          recommendation: "Sprawdź skład.",
        },
      ],
    };
    expect(() => parseRoutineAiAssessment(invalid, fixtures.currentDraft, shelf)).toThrow(
      "Ocena AI wskazała składnik nieobecny w przekazanym INCI produktu.",
    );
  });
});
