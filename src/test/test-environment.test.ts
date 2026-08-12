import { describe, expect, it } from "vitest";
import { createAiContractFixtures } from "@/test/fixtures";

describe("test environment", () => {
  it("resolves the project alias and returns independent AI contract fixtures", () => {
    const first = createAiContractFixtures();
    const second = createAiContractFixtures();

    first.currentDraft.morning[0].routineRole = "other";

    expect(second.currentDraft.morning[0].routineRole).toBe("cleanse");
    expect(first.products).not.toBe(second.products);
  });
});
