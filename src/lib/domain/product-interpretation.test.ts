import { describe, expect, it } from "vitest";
import { getInterpretationStaleReason } from "@/lib/domain/product-interpretation";
import { createAiContractFixtures } from "@/test/fixtures";

describe("getInterpretationStaleReason", () => {
  it("keeps an identical ready interpretation fresh", () => {
    const fixtures = createAiContractFixtures();
    const interpretation = fixtures.interpretations[0];
    expect(getInterpretationStaleReason({
      interpretation,
      profileBasis: fixtures.profileBasis,
      productBasis: interpretation.productBasis,
      promptVersion: interpretation.promptVersion,
      modelVersion: interpretation.modelVersion,
    })).toBeNull();
  });

  it.each([
    ["profile", (fixtures: ReturnType<typeof createAiContractFixtures>) => ({ ...fixtures.profileBasis, skinType: "dry" as const })],
    ["product", (fixtures: ReturnType<typeof createAiContractFixtures>) => ({ ...fixtures.interpretations[0].productBasis, inciList: ["Aqua"] })],
  ])("marks the interpretation stale after a %s basis change", (_name, mutation) => {
    const fixtures = createAiContractFixtures();
    const interpretation = fixtures.interpretations[0];
    const changed = mutation(fixtures);
    const input = {
      interpretation,
      profileBasis: fixtures.profileBasis,
      productBasis: interpretation.productBasis,
      promptVersion: interpretation.promptVersion,
      modelVersion: interpretation.modelVersion,
    };
    if ("skinType" in changed) input.profileBasis = changed;
    else input.productBasis = changed;
    expect(getInterpretationStaleReason(input)).not.toBeNull();
  });
});
