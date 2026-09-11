import { describe, expect, it } from "vitest";
import type { Review } from "./review-schema.js";
import { deriveVerdict } from "./review-policy.js";

function reviewWith(score: number): Review {
  const criterion = { score, summary: "Ocena.", findings: [] };

  return {
    functionalCorrectness: criterion,
    securityPrivacy: { ...criterion },
    platformFit: { ...criterion },
    maintainability: { ...criterion },
    regressionProtection: { ...criterion },
    manualChecks: [],
    summary: "Podsumowanie.",
  };
}

describe("deriveVerdict", () => {
  it("przepuszcza zmianę, gdy wszystkie kryteria mają co najmniej 8 punktów", () => {
    expect(deriveVerdict(reviewWith(8))).toBe("pass");
  });

  it("wymaga zmian dla oceny od 5 do 7 albo findingu high", () => {
    expect(deriveVerdict(reviewWith(7))).toBe("needs_changes");

    const review = reviewWith(8);
    review.platformFit.findings.push({
      severity: "high",
      file: "astro.config.mjs",
      line: null,
      message: "Konfiguracja nie pasuje do adaptera.",
      suggestedFix: "Dopasuj konfigurację do adaptera Cloudflare.",
    });
    expect(deriveVerdict(review)).toBe("needs_changes");
  });

  it("blokuje zmianę dla oceny maksymalnie 4 albo findingu critical", () => {
    expect(deriveVerdict(reviewWith(4))).toBe("fail");

    const review = reviewWith(10);
    review.securityPrivacy.findings.push({
      severity: "critical",
      file: "src/lib/supabase.ts",
      line: 8,
      message: "Sekret został wystawiony po stronie klienta.",
      suggestedFix: "Przenieś sekret do konfiguracji serwerowej.",
    });
    expect(deriveVerdict(review)).toBe("fail");
  });
});
