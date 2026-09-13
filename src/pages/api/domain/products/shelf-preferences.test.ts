import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/lib/domain/user-domain", () => ({
  MAX_SHELF_ITEM_NOTE_LENGTH: 500,
  updateUserShelfItemPreferences: mocks.updatePreferences,
}));

import { POST } from "@/pages/api/domain/products/shelf-preferences";

function createContext(form: FormData) {
  const redirect = vi.fn((location: string) => new Response(null, { status: 303, headers: { Location: location } }));
  const cookies = { set: vi.fn() };
  return {
    context: {
      request: new Request("http://localhost/api/domain/products/shelf-preferences", { method: "POST", body: form }),
      cookies,
      redirect,
    } as never,
    redirect,
    cookies,
  };
}

function createForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("shelfItemId", "shelf-item-1");
  form.set("note", "  Podrażnia mnie rano.  ");
  form.set("successRedirectTo", "/products/product-1");
  form.set("errorRedirectTo", "/products/product-1");
  form.set("excludeFromAiRoutines", "on");
  Object.entries(overrides).forEach(([key, value]) => {
    form.set(key, value);
  });
  return form;
}

describe("POST /api/domain/products/shelf-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.updatePreferences.mockResolvedValue({ id: "shelf-item-1" });
  });

  it("saves the owner's note and exclusion without exposing them in the redirect", async () => {
    const { context, redirect } = createContext(createForm());

    const response = await POST(context);

    expect(mocks.updatePreferences).toHaveBeenCalledWith(expect.anything(), "user-1", "shelf-item-1", {
      note: "  Podrażnia mnie rano.  ",
      excludeFromAiRoutines: true,
    });
    expect(redirect).toHaveBeenCalledWith("/products/product-1");
    expect(response.status).toBe(303);
  });

  it("redirects anonymous requests to sign-in without attempting an update", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { context, redirect } = createContext(createForm());

    await POST(context);

    expect(redirect).toHaveBeenCalledWith("/auth/signin");
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });

  it("rejects an overlong note before attempting to update the shelf item", async () => {
    const { context, redirect, cookies } = createContext(createForm({ note: "a".repeat(501) }));

    await POST(context);

    expect(mocks.updatePreferences).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/products/product-1");
    expect(cookies.set).toHaveBeenCalledWith(
      "shelfie_flash",
      expect.stringContaining("maksymalnie 500 znaków"),
      expect.anything(),
    );
  });

  it("does not reveal whether a foreign shelf item exists", async () => {
    mocks.updatePreferences.mockResolvedValue(null);
    const { context, cookies } = createContext(createForm({ shelfItemId: "foreign-item" }));

    await POST(context);

    expect(cookies.set).toHaveBeenCalledWith(
      "shelfie_flash",
      expect.stringContaining("Nie znaleziono produktu"),
      expect.anything(),
    );
  });
});
