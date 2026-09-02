import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));

import { POST } from "@/pages/api/domain/routine/ai";

describe("POST /api/domain/routine/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
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
});
