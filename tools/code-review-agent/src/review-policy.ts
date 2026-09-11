import type { Review } from "./review-schema.js";

export type ReviewVerdict = "pass" | "needs_changes" | "fail";

export type FinalReview = Review & { verdict: ReviewVerdict };

export function deriveVerdict(review: Review): ReviewVerdict {
  const criteria = [
    review.functionalCorrectness,
    review.securityPrivacy,
    review.platformFit,
    review.maintainability,
    review.regressionProtection,
  ];
  const findings = criteria.flatMap((criterion) => criterion.findings);

  if (
    criteria.some((criterion) => criterion.score <= 4) ||
    findings.some((finding) => finding.severity === "critical")
  ) {
    return "fail";
  }

  if (criteria.some((criterion) => criterion.score <= 7) || findings.some((finding) => finding.severity === "high")) {
    return "needs_changes";
  }

  return "pass";
}

export function finalizeReview(review: Review): FinalReview {
  return { ...review, verdict: deriveVerdict(review) };
}
