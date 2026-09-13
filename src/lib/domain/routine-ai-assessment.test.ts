import { describe, expect, it } from "vitest";
import { createRoutineAiAssessmentFingerprint, createRoutineAiShelfInputs } from "@/lib/domain/routine-ai-assessment";
import { createAiContractFixtures } from "@/test/fixtures";

describe("createRoutineAiAssessmentFingerprint", () => {
  it("is stable for the same inputs and changes with the routine", async () => {
    const fixtures = createAiContractFixtures();
    const shelf = createRoutineAiShelfInputs(fixtures.shelfCatalog, fixtures.products, fixtures.interpretations);
    const first = await createRoutineAiAssessmentFingerprint(fixtures.profileBasis, fixtures.currentDraft, shelf);
    const second = await createRoutineAiAssessmentFingerprint(fixtures.profileBasis, fixtures.currentDraft, shelf);
    const changed = await createRoutineAiAssessmentFingerprint(
      fixtures.profileBasis,
      { ...fixtures.currentDraft, evening: fixtures.currentDraft.morning },
      shelf,
    );

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });
});
