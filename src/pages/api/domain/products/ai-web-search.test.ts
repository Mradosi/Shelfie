import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAiWebSearchDraft: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/integrations/openrouter", () => ({ resolveAiWebSearchDraft: mocks.resolveAiWebSearchDraft }));

import { POST } from "@/pages/api/domain/products/ai-web-search";

describe("POST /api/domain/products/ai-web-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("does not expose a provider error", async () => {
    mocks.resolveAiWebSearchDraft.mockRejectedValue(new Error("OpenRouter HTTP 503 trace=private-token"));
    const response = await POST({
      request: new Request("http://localhost/api/domain/products/ai-web-search", {
        method: "POST",
        body: JSON.stringify({ name: "Serum" }),
      }),
      cookies: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_model_output",
        message: "Asystent AI zwrócił niepełną odpowiedź. Spróbuj ponownie.",
        action: "retry",
      },
    });
  });
});
