import { readFile } from "node:fs/promises";
import { formatPrComment } from "./format-pr-comment.js";
import { finalizeReview } from "./review-policy.js";
import { REVIEW_SCHEMA } from "./review-schema.js";

async function main(): Promise<void> {
  const reportPath = process.argv[2];

  if (!reportPath) {
    throw new Error("Podaj ścieżkę do raportu JSON.");
  }

  const candidate: unknown = JSON.parse(await readFile(reportPath, "utf8"));

  if (typeof candidate !== "object" || candidate === null || !("verdict" in candidate)) {
    throw new Error("Raport reviewera nie zawiera werdyktu.");
  }

  const { verdict, ...reviewCandidate } = candidate;
  const review = REVIEW_SCHEMA.parse(reviewCandidate);
  const finalReview = finalizeReview(review);

  if (verdict !== finalReview.verdict) {
    throw new Error("Werdykt raportu nie zgadza się z lokalną polityką.");
  }

  console.log(formatPrComment(finalReview));
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Nie udało się sformatować komentarza PR.";
  console.error(`Formatowanie komentarza PR nie powiodło się: ${message}`);
  process.exitCode = 1;
}
