import { config } from "dotenv";
import { Codex } from "@openai/codex-sdk";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewPrompt, parseReviewInput, readReviewMetadata } from "./review-input.js";
import { finalizeReview } from "./review-policy.js";
import { REVIEW_JSON_SCHEMA, REVIEW_SCHEMA } from "./review-schema.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(process.env.SHELFIE_WORKSPACE ?? resolve(packageRoot, "../.."));

config({ path: resolve(workspaceRoot, ".env"), quiet: true });

async function readDiff(): Promise<string> {
  const chunks: string[] = [];

  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    if (typeof chunk !== "string") {
      throw new Error("Diff musi być tekstem UTF-8.");
    }

    chunks.push(chunk);
  }

  return chunks.join("");
}

function validateWorkspace(path: string): void {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(path, "package.json"), "utf8")) as { name?: string };
    if (packageJson.name !== "shelfie") {
      throw new Error("Nie znaleziono głównego katalogu projektu Shelfie.");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "nieznany błąd";
    throw new Error(`Nieprawidłowy katalog roboczy (${path}): ${detail}`);
  }
}

async function main(): Promise<void> {
  const metadata = readReviewMetadata(process.argv.slice(2), process.env);
  const input = parseReviewInput({ ...metadata, diff: await readDiff() });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Brakuje konfiguracji OPENAI_API_KEY dla lokalnego reviewera.");
  }

  validateWorkspace(workspaceRoot);

  const startedAt = performance.now();
  // eslint-disable-next-line no-console -- CLI emits safe operational metrics to stderr for CI observability.
  console.error(
    JSON.stringify({
      event: "code_review_started",
      titleBytes: Buffer.byteLength(input.title),
      descriptionBytes: Buffer.byteLength(input.description ?? ""),
      diffBytes: Buffer.byteLength(input.diff),
    }),
  );
  const codex = new Codex({ apiKey: process.env.OPENAI_API_KEY });
  const thread = codex.startThread({
    model: "gpt-5.6-terra",
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchMode: "disabled",
    workingDirectory: workspaceRoot,
  });
  const turn = await thread.run(buildReviewPrompt(input), {
    outputSchema: REVIEW_JSON_SCHEMA,
  });
  const parsed = REVIEW_SCHEMA.safeParse(JSON.parse(turn.finalResponse));

  if (!parsed.success) {
    throw new Error(`Codex zwrócił JSON niezgodny z kontraktem: ${parsed.error.message}`);
  }

  // eslint-disable-next-line no-console -- CLI returns the machine-readable review report on stdout.
  console.log(JSON.stringify(finalizeReview(parsed.data), null, 2));
  // eslint-disable-next-line no-console -- CLI emits safe operational metrics to stderr for CI observability.
  console.error(
    JSON.stringify({
      event: "code_review_completed",
      threadId: thread.id,
      durationMs: Math.round(performance.now() - startedAt),
      usage: turn.usage,
    }),
  );
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Nieznany błąd reviewera.";
  // eslint-disable-next-line no-console -- CLI reports failures to stderr without exposing review input.
  console.error(`Code review nie powiodło się: ${message}`);
  process.exitCode = 1;
}
