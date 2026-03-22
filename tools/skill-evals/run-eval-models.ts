#!/usr/bin/env bun
/**
 * run-eval-models.ts — Run skill evaluations across multiple models.
 *
 * Usage:
 *   bun tools/skill-evals/run-eval-models.ts --skill .claude/skills/devplanner --models qwen2.5-coder:14b,llama3.1:8b
 *   bun tools/skill-evals/run-eval-models.ts --skill .claude/skills/devplanner --models-file tools/skill-evals/models.json
 *   bun tools/skill-evals/run-eval-models.ts --skill .claude/skills/devplanner  # uses <skill>/evals/models.json
 *
 * Per-model flags passed through to run-eval.ts:
 *   --tier 1          Only run Tier 1 scenarios
 *   --scenario id     Run a single scenario
 *   --feedback        Include LLM feedback on failures
 *
 * Exit code: 0 if ALL models achieve overall pass rate >= 70%, else 1.
 */

import { parseArgs } from "util";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { RunResult } from "./lib/types.ts";

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    skill:         { type: "string" },
    models:        { type: "string" },
    "models-file": { type: "string" },
    tier:          { type: "string" },
    scenario:      { type: "string" },
    feedback:      { type: "boolean", default: false },
    wait:          { type: "string" },
  },
  strict: false,
});

const skillArg = values.skill as string | undefined;
if (!skillArg) {
  console.error("Usage: bun run-eval-models.ts --skill <path-to-skill-dir> [--models m1,m2 | --models-file path]");
  process.exit(1);
}

const skillDir = resolve(process.cwd(), skillArg);
const waitSecs = values.wait ? parseInt(values.wait as string, 10) : 0;

// ─── Resolve model list ───────────────────────────────────────────────────────

function loadModels(): string[] {
  // 1. --models flag (comma-separated)
  if (values.models) {
    return (values.models as string).split(",").map((m) => m.trim()).filter(Boolean);
  }

  // 2. --models-file flag
  const modelsFile = values["models-file"] as string | undefined;
  if (modelsFile) {
    const p = resolve(process.cwd(), modelsFile);
    if (!existsSync(p)) {
      console.error(`models-file not found: ${p}`);
      process.exit(1);
    }
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
      console.error(`models-file must contain a non-empty "models" array.`);
      process.exit(1);
    }
    return parsed.models as string[];
  }

  // 3. Default: <skill>/evals/models.json
  const defaultModelsFile = join(skillDir, "evals", "models.json");
  if (existsSync(defaultModelsFile)) {
    const parsed = JSON.parse(readFileSync(defaultModelsFile, "utf-8"));
    if (Array.isArray(parsed.models) && parsed.models.length > 0) {
      return parsed.models as string[];
    }
  }

  // 4. Fall back to OLLAMA_MODEL env var (run a single model)
  const envModel = process.env.OLLAMA_MODEL;
  if (envModel) {
    console.warn(`No model list provided — falling back to OLLAMA_MODEL: ${envModel}`);
    return [envModel];
  }

  console.error(
    "No models specified. Use --models, --models-file, or create <skill>/evals/models.json.\n" +
    "  Example: --models qwen2.5-coder:14b,llama3.1:8b\n" +
    "  Example models.json: { \"models\": [\"qwen2.5-coder:14b\", \"llama3.1:8b\"] }"
  );
  process.exit(1);
}

const models = loadModels();

// ─── Build pass-through args ──────────────────────────────────────────────────

const passthroughArgs: string[] = [];
if (values.tier)     passthroughArgs.push("--tier", values.tier as string);
if (values.scenario) passthroughArgs.push("--scenario", values.scenario as string);
if (values.feedback) passthroughArgs.push("--feedback");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m",
};

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function rateColor(n: number): string {
  if (n >= 1.0) return c.green;
  if (n >= 0.7) return c.yellow;
  return c.red;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

console.log(`\n${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`${c.bold}  Skill Eval — Model Sweep${c.reset}`);
console.log(`${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`  Skill  : ${skillArg}`);
console.log(`  Models : ${models.join(", ")}`);
if (passthroughArgs.length > 0) {
  console.log(`  Flags  : ${passthroughArgs.join(" ")}`);
}
if (waitSecs > 0) {
  console.log(`  Wait   : ${waitSecs}s between runs`);
}
console.log();

// ─── Run each model ───────────────────────────────────────────────────────────

const runnerPath = join(import.meta.dirname, "run-eval.ts");

interface ModelRunSummary {
  model: string;
  runId: string;
  runDir: string;
  exitCode: number;
  result: RunResult | null;
  wallMs: number;
}

const summaries: ModelRunSummary[] = [];

for (let i = 0; i < models.length; i++) {
  const model = models[i];
  console.log(`${c.bold}${c.blue}[${ i + 1}/${models.length}] Model: ${model}${c.reset}`);
  console.log(`${c.dim}${"─".repeat(60)}${c.reset}`);

  const args = [
    runnerPath,
    "--skill", skillArg,
    "--model", model,
    ...passthroughArgs,
  ];

  const wallStart = Date.now();
  const proc = Bun.spawn(["bun", ...args], {
    stdout: "pipe",
    stderr: "inherit",
    env: process.env,
  });

  // Stream stdout while capturing it to find the run dir
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let capturedOutput = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    capturedOutput += chunk;
    process.stdout.write(chunk);
  }

  const exitCode = await proc.exited;
  const wallMs = Date.now() - wallStart;

  // Parse run dir from output line: "  Output  : /path/to/run"
  const runDirMatch = capturedOutput.match(/Output\s*:\s*(.+)/);
  const runDir = runDirMatch ? runDirMatch[1].trim() : "";

  // Parse run ID from output line: "  Run ID  : 2026-03-19_001"
  const runIdMatch = capturedOutput.match(/Run ID\s*:\s*(\S+)/);
  const runId = runIdMatch ? runIdMatch[1].trim() : "unknown";

  // Read results.json if available
  let result: RunResult | null = null;
  const resultsPath = runDir ? join(runDir, "results.json") : "";
  if (resultsPath && existsSync(resultsPath)) {
    try {
      result = JSON.parse(readFileSync(resultsPath, "utf-8")) as RunResult;
    } catch {
      // leave null
    }
  }

  summaries.push({ model, runId, runDir, exitCode, result, wallMs });

  if (waitSecs > 0 && i < models.length - 1) {
    console.log(`${c.dim}Waiting ${waitSecs}s for model to expire from memory…${c.reset}`);
    await Bun.sleep(waitSecs * 1000);
  }

  console.log();
}

// ─── Cross-model summary table ────────────────────────────────────────────────

console.log(`\n${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`${c.bold}  Model Sweep Summary${c.reset}`);
console.log(`${c.cyan}${"═".repeat(60)}${c.reset}\n`);

// Column widths
const modelColW = Math.max(5, ...summaries.map((s) => s.model.length));
const runIdColW = Math.max(6, ...summaries.map((s) => s.runId.length));

const header = [
  "Model".padEnd(modelColW),
  "Run ID".padEnd(runIdColW),
  "Overall".padStart(8),
  "T1".padStart(7),
  "T2".padStart(7),
  "T3".padStart(7),
  "Duration".padStart(10),
  "Avg/sc".padStart(8),
  "NEVER".padStart(6),
  "ParseFail".padStart(10),
  "Result".padStart(7),
].join("  ");

console.log(`  ${c.dim}${header}${c.reset}`);
console.log(`  ${c.dim}${"─".repeat(header.length)}${c.reset}`);

let allPassed = true;

for (const s of summaries) {
  const r = s.result;
  if (!r) {
    const status = `${c.red}ERROR${c.reset}`;
    console.log(`  ${s.model.padEnd(modelColW)}  ${s.runId.padEnd(runIdColW)}  ${status} (no results.json)`);
    allPassed = false;
    continue;
  }

  const overall = r.summary.overall.passRate;
  const passed = overall >= 0.7;
  if (!passed) allPassed = false;

  const row = [
    s.model.padEnd(modelColW),
    s.runId.padEnd(runIdColW),
    `${rateColor(overall)}${pct(overall).padStart(8)}${c.reset}`,
    `${rateColor(r.summary.tier1.passRate)}${pct(r.summary.tier1.passRate).padStart(7)}${c.reset}`,
    `${rateColor(r.summary.tier2.passRate)}${pct(r.summary.tier2.passRate).padStart(7)}${c.reset}`,
    `${rateColor(r.summary.tier3.passRate)}${pct(r.summary.tier3.passRate).padStart(7)}${c.reset}`,
    fmtMs(r.summary.totalDurationMs).padStart(10),
    fmtMs(Math.round(r.summary.totalDurationMs / Math.max(1, r.scenarios.length))).padStart(8),
    String(r.summary.neverViolationCount).padStart(6),
    String(r.summary.parseFailureCount).padStart(10),
    passed ? `${c.green}  PASS ✓${c.reset}` : `${c.red}  FAIL ✗${c.reset}`,
  ].join("  ");

  console.log(`  ${row}`);
}

console.log();

// ─── Best model highlight ─────────────────────────────────────────────────────

const ranked = summaries
  .filter((s) => s.result)
  .sort((a, b) => {
    const ra = a.result!.summary.overall.passRate;
    const rb = b.result!.summary.overall.passRate;
    if (Math.abs(ra - rb) > 0.001) return rb - ra; // higher accuracy first
    // Tiebreak on speed (lower totalDurationMs wins)
    return a.result!.summary.totalDurationMs - b.result!.summary.totalDurationMs;
  });

if (ranked.length > 0) {
  const best = ranked[0];
  const bestRate = best.result!.summary.overall.passRate;
  console.log(`  ${c.bold}Best model${c.reset}: ${c.green}${best.model}${c.reset}  (${pct(bestRate)} accuracy, ${fmtMs(best.result!.summary.totalDurationMs)} total)`);
  if (ranked.length > 1) {
    const second = ranked[1];
    const secondRate = second.result!.summary.overall.passRate;
    console.log(`  ${c.dim}Runner-up${c.reset} : ${second.model}  (${pct(secondRate)} accuracy, ${fmtMs(second.result!.summary.totalDurationMs)} total)`);
  }
  console.log();
}

// ─── Suggest compare-runs ─────────────────────────────────────────────────────

const comparePath = join(import.meta.dirname, "compare-runs.ts");
console.log(`  Run the comparison report to see a full timeline:`);
console.log(`  ${c.dim}bun ${comparePath} --skill ${skillArg}${c.reset}\n`);

process.exit(allPassed ? 0 : 1);
