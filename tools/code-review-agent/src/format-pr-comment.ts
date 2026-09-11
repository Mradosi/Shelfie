import type { FinalReview, ReviewVerdict } from "./review-policy.js";
import type { Finding, Review } from "./review-schema.js";

export const PR_COMMENT_MARKER = "<!-- shelfie-ai-code-review -->";

type CriterionKey = Exclude<keyof Review, "manualChecks" | "summary">;

const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "functionalCorrectness", label: "Poprawność i kontrakty" },
  { key: "securityPrivacy", label: "Bezpieczeństwo i prywatność" },
  { key: "platformFit", label: "Dopasowanie do platformy" },
  { key: "maintainability", label: "Utrzymywalność i zakres" },
  { key: "regressionProtection", label: "Ochrona przed regresją" },
];

const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  pass: "✅ PASS — zmiana może przejść dalej",
  needs_changes: "⚠️ NEEDS CHANGES — wymagane są poprawki",
  fail: "❌ FAIL — zmiana nie może przejść dalej",
};

const SEVERITY_LABELS: Record<Finding["severity"], string> = {
  low: "niski",
  medium: "średni",
  high: "wysoki",
  critical: "krytyczny",
};

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[`*_{}<>()#+.!|]/g, "\\$&")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, "<br>");
}

function formatFinding(finding: Finding): string {
  const location = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;

  return `- **${SEVERITY_LABELS[finding.severity]}** — \`${escapeMarkdown(location)}\`: ${escapeMarkdown(finding.message)}\n  - Sugerowana poprawka: ${escapeMarkdown(finding.suggestedFix)}`;
}

export function formatPrComment(review: FinalReview): string {
  const findings = CRITERIA.flatMap(({ key, label }) => review[key].findings.map((finding) => ({ label, finding })));
  const scoreRows = CRITERIA.map(({ key, label }) => `| ${label} | ${review[key].score}/10 |`).join("\n");
  const findingsSection =
    findings.length === 0
      ? "Brak zgłoszonych problemów."
      : findings.map(({ label, finding }) => `#### ${label}\n\n${formatFinding(finding)}`).join("\n\n");
  const manualChecksSection =
    review.manualChecks.length === 0
      ? "Brak dodatkowych ręcznych kroków weryfikacji."
      : review.manualChecks
          .map((manualCheck) => `- ${escapeMarkdown(manualCheck.check)} — ${escapeMarkdown(manualCheck.reason)}`)
          .join("\n");

  return `${PR_COMMENT_MARKER}
## AI code review

**Werdykt: ${VERDICT_LABELS[review.verdict]}**

${escapeMarkdown(review.summary)}

| Kryterium | Ocena |
| --- | --- |
${scoreRows}

### Findings

${findingsSection}

### Ręczna weryfikacja

${manualChecksSection}

_Raport jest automatycznym wsparciem review; końcowa odpowiedzialność za zmianę pozostaje po stronie zespołu._`;
}
