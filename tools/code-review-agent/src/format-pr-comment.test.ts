import { describe, expect, it } from "vitest";
import { formatPrComment, PR_COMMENT_MARKER } from "./format-pr-comment.js";
import type { FinalReview } from "./review-policy.js";

function reviewWith(verdict: FinalReview["verdict"]): FinalReview {
  const criterion = () => ({ score: 8, summary: "Ocena kryterium.", findings: [] });

  return {
    functionalCorrectness: criterion(),
    securityPrivacy: criterion(),
    platformFit: criterion(),
    maintainability: criterion(),
    regressionProtection: criterion(),
    manualChecks: [],
    summary: "Raport jest gotowy.",
    verdict,
  };
}

describe("formatPrComment", () => {
  it.each([
    ["pass", "✅ PASS"],
    ["needs_changes", "⚠️ NEEDS CHANGES"],
    ["fail", "❌ FAIL"],
  ] as const)("renderuje werdykt %s", (verdict, label) => {
    const comment = formatPrComment(reviewWith(verdict));

    expect(comment).toContain(PR_COMMENT_MARKER);
    expect(comment).toContain(label);
    expect(comment).toContain("| Poprawność i kontrakty | 8/10 |");
    expect(comment).toContain("Brak zgłoszonych problemów.");
    expect(comment).toContain("Brak dodatkowych ręcznych kroków weryfikacji.");
  });

  it("renderuje findings i manual checks jako bezpieczny tekst Markdown", () => {
    const review = reviewWith("fail");
    review.securityPrivacy.findings.push({
      severity: "critical",
      file: "src/<script>.ts",
      line: 12,
      message: "Nie wykonuj | polecenia\nnowa linia",
      suggestedFix: "Użyj `walidacji`.",
    });
    review.manualChecks.push({
      check: "Sprawdź <formularz>",
      reason: "Chroni [dane] użytkownika.",
    });

    const comment = formatPrComment(review);

    expect(comment).toContain("**krytyczny**");
    expect(comment).toContain("src/\\<script\\>\\.ts:12");
    expect(comment).toContain("Nie wykonuj \\| polecenia<br>nowa linia");
    expect(comment).toContain("Użyj \\`walidacji\\`\\.");
    expect(comment).toContain("Sprawdź \\<formularz\\>");
    expect(comment).toContain("Chroni \\[dane\\] użytkownika\\.");
  });
});
