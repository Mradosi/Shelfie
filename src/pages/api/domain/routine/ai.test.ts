import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  listUserShelfCatalog: vi.fn(),
  isUserProfileComplete: vi.fn(),
  prepareUserProductInterpretations: vi.fn(),
  generateRoutineDraft: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/lib/domain/user-domain", () => ({
  createUserProfileInterpretationBasis: vi.fn(),
  getUserProfile: mocks.getUserProfile,
  getUserRoutineConfig: vi.fn(),
  isUserProfileComplete: mocks.isUserProfileComplete,
  listUserShelfCatalog: mocks.listUserShelfCatalog,
}));

vi.mock("@/lib/domain/product-interpretation", () => ({
  getUserProductInterpretation: vi.fn(),
  prepareUserProductInterpretations: mocks.prepareUserProductInterpretations,
}));

vi.mock("@/lib/integrations/openrouter-routine-draft", () => ({
  generateRoutineDraft: mocks.generateRoutineDraft,
  ROUTINE_DRAFT_MODEL_VERSION: "test-model",
  ROUTINE_DRAFT_PROMPT_VERSION: "test-prompt",
}));

import { POST } from "@/pages/api/domain/routine/ai";

describe("POST /api/domain/routine/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.isUserProfileComplete.mockReturnValue(true);
    mocks.getUserProfile.mockResolvedValue({ skinType: "normal", skinAspects: {} });
  });

  it("returns the public contract for an invalid AI action", async () => {
    const response = await POST({
      request: new Request("http://localhost/api/domain/routine/ai", {
        method: "POST",
        body: JSON.stringify({ action: "private_provider_action", currentDraft: { morning: [], evening: [] } }),
      }),
      cookies: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_request",
        message: "Sprawdź podane dane i spróbuj ponownie.",
        action: "refine_input",
      },
    });
  });

  it("does not prepare products or call a provider when every shelf item is excluded", async () => {
    mocks.listUserShelfCatalog.mockResolvedValue([
      {
        id: "shelf-item-1",
        productId: "product-1",
        excludeFromAiRoutines: true,
        product: { name: "Produkt testowy", brand: null },
      },
    ]);

    const response = await POST({
      request: new Request("http://localhost/api/domain/routine/ai", {
        method: "POST",
        body: JSON.stringify({ action: "prepare_shelf" }),
      }),
      cookies: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "no_eligible_shelf_items" } });
    expect(mocks.prepareUserProductInterpretations).not.toHaveBeenCalled();
    expect(mocks.generateRoutineDraft).not.toHaveBeenCalled();
  });

  it("blocks an existing draft that contains an AI-excluded product before provider generation", async () => {
    mocks.listUserShelfCatalog.mockResolvedValue([
      {
        id: "shelf-item-1",
        productId: "product-1",
        excludeFromAiRoutines: true,
        product: { name: "Produkt testowy", brand: null },
      },
      {
        id: "shelf-item-2",
        productId: "product-2",
        excludeFromAiRoutines: false,
        product: { name: "Dozwolony produkt", brand: null },
      },
    ]);

    const response = await POST({
      request: new Request("http://localhost/api/domain/routine/ai", {
        method: "POST",
        body: JSON.stringify({
          action: "generate_proposal",
          currentDraft: { morning: [{ shelfItemId: "shelf-item-1", routineRole: "cleanse" }], evening: [] },
        }),
      }),
      cookies: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "excluded_shelf_item_in_draft" } });
    expect(mocks.generateRoutineDraft).not.toHaveBeenCalled();
  });
});
