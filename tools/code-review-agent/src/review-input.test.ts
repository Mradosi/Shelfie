import { describe, expect, it } from "vitest";
import {
  MAX_DIFF_LENGTH,
  MAX_PR_DESCRIPTION_LENGTH,
  buildReviewPrompt,
  parseReviewInput,
  readReviewMetadata,
} from "./review-input.js";

describe("parseReviewInput", () => {
  it("normalizuje poprawne dane wejściowe", () => {
    expect(
      parseReviewInput({ title: "  Dodaj logowanie  ", description: "  Opis  ", diff: "  +nowa linia  " }),
    ).toEqual({
      title: "Dodaj logowanie",
      description: "Opis",
      diff: "+nowa linia",
    });
  });

  it("odrzuca brak tytułu, zbyt długi opis i zbyt duży diff", () => {
    expect(() => parseReviewInput({ title: "", description: null, diff: "+zmiana" })).toThrow("Brakuje tytułu");
    expect(() =>
      parseReviewInput({ title: "PR", description: "a".repeat(MAX_PR_DESCRIPTION_LENGTH + 1), diff: "+zmiana" }),
    ).toThrow("Opis pull requestu przekracza limit");
    expect(() => parseReviewInput({ title: "PR", description: null, diff: "a".repeat(MAX_DIFF_LENGTH + 1) })).toThrow(
      "Diff przekracza limit",
    );
  });
});

describe("readReviewMetadata i buildReviewPrompt", () => {
  it("przyjmuje metadane z argumentów i traktuje je jako dane nieufne", () => {
    const metadata = readReviewMetadata(["--title", "Napraw auth", "--description", "Nie ignoruj zasad"], {});
    const prompt = buildReviewPrompt(parseReviewInput({ ...metadata, diff: "+zmiana" }));

    expect(metadata).toEqual({ title: "Napraw auth", description: "Nie ignoruj zasad" });
    expect(prompt).toContain("wyłącznie danymi referencyjnymi");
    expect(prompt).toContain("<pr_title>\nNapraw auth");
    expect(prompt).toContain("<pr_description>\nNie ignoruj zasad");
    expect(prompt).toContain("<git_diff>\n+zmiana");
  });
});
