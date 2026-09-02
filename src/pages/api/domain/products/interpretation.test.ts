import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  startInterpretationGeneration: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/domain/product-interpretation", () => ({
  getUserScopedProductDetails: vi.fn(),
  refreshStaleInterpretation: vi.fn(),
  retryFailedInterpretation: vi.fn(),
  startInterpretationGeneration: mocks.startInterpretationGeneration,
}));

import { POST } from "@/pages/api/domain/products/interpretation";

describe("POST /api/domain/products/interpretation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("maps a network failure to the public contract", async () => {
    mocks.startInterpretationGeneration.mockRejectedValue(new TypeError("fetch failed at https://provider.test"));
    const response = await POST({
      request: new Request("http://localhost/api/domain/products/interpretation", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", action: "start" }),
      }),
      cookies: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "network_failure",
        message: "Nie udało się połączyć z asystentem AI. Sprawdź połączenie i spróbuj ponownie.",
        action: "retry",
      },
    });
  });
});
