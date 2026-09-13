import { describe, expect, it, vi } from "vitest";
import {
  MAX_SHELF_ITEM_NOTE_LENGTH,
  normalizeShelfItemNote,
  updateUserShelfItemPreferences,
} from "@/lib/domain/user-domain";

const TIMESTAMP = "2026-09-12T07:00:00.000Z";

function createShelfItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "shelf-item-1",
    user_id: "user-1",
    product_id: "product-1",
    note: null,
    exclude_from_ai_routines: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

describe("shelf item preferences", () => {
  it("normalizes a blank note and trims a saved note", () => {
    expect(normalizeShelfItemNote("   ")).toBeNull();
    expect(normalizeShelfItemNote("  Podrażnia skórę.  ")).toBe("Podrażnia skórę.");
  });

  it("rejects a note longer than the supported limit", () => {
    expect(() => normalizeShelfItemNote("a".repeat(MAX_SHELF_ITEM_NOTE_LENGTH + 1))).toThrow(
      `Notatka produktu musi mieć maksymalnie ${MAX_SHELF_ITEM_NOTE_LENGTH} znaków`,
    );
  });

  it("updates preferences only through the shelf item and owner filters", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: createShelfItemRow({ note: "Nie używać rano", exclude_from_ai_routines: true }),
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const userFilter = vi.fn(() => ({ select }));
    const shelfItemFilter = vi.fn(() => ({ eq: userFilter }));
    const update = vi.fn(() => ({ eq: shelfItemFilter }));
    const from = vi.fn(() => ({ update }));

    const updated = await updateUserShelfItemPreferences({ from } as never, "user-1", "shelf-item-1", {
      note: "  Nie używać rano  ",
      excludeFromAiRoutines: true,
    });

    expect(update).toHaveBeenCalledWith({ note: "Nie używać rano", exclude_from_ai_routines: true });
    expect(shelfItemFilter).toHaveBeenCalledWith("id", "shelf-item-1");
    expect(userFilter).toHaveBeenCalledWith("user_id", "user-1");
    expect(updated).toMatchObject({
      note: "Nie używać rano",
      excludeFromAiRoutines: true,
    });
  });

  it("does not report a missing or foreign shelf item as updated", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const userFilter = vi.fn(() => ({ select }));
    const shelfItemFilter = vi.fn(() => ({ eq: userFilter }));
    const update = vi.fn(() => ({ eq: shelfItemFilter }));
    const from = vi.fn(() => ({ update }));

    await expect(
      updateUserShelfItemPreferences({ from } as never, "user-1", "foreign-shelf-item", {
        note: null,
        excludeFromAiRoutines: false,
      }),
    ).resolves.toBeNull();
  });
});
