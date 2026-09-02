import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoutineAiShelfInputs } from "@/lib/domain/routine-ai-assessment";
import { generateRoutineDraft } from "@/lib/integrations/openrouter-routine-draft";
import { createAiContractFixtures } from "@/test/fixtures";

describe("generateRoutineDraft", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a JSON-only request and validates the model response without a real provider", async () => {
    const fixtures = createAiContractFixtures();
    const shelf = createRoutineAiShelfInputs(fixtures.shelfCatalog, fixtures.products, fixtures.interpretations);
    const modelResponse = {
      summary: "Propozycja testowa.",
      routine: {
        morning: [
          { shelf_item_id: "shelf-cleanser", routine_role: "cleanse" },
          { shelf_item_id: "shelf-serum", routine_role: "exfoliate" },
        ],
        evening: [],
      },
      entry_reasons: [
        { section: "morning", shelf_item_id: "shelf-cleanser", routine_role: "cleanse", reason: "Oczyszczanie." },
        { section: "morning", shelf_item_id: "shelf-serum", routine_role: "exfoliate", reason: "Złuszczanie." },
      ],
      missing_steps: [],
      assessment: fixtures.validAssessment,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(modelResponse) } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateRoutineDraft(fixtures.profileBasis, fixtures.currentDraft, shelf)).resolves.toMatchObject({
      summary: "Propozycja testowa.",
      assessment: fixtures.validAssessment,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toMatchObject({ response_format: { type: "json_object" } });
  });
});
