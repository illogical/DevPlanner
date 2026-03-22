#!/usr/bin/env bun
/**
 * run-eval.ts — Skill evaluation runner
 *
 * Usage:
 *   bun tools/skill-evals/run-eval.ts --skill .claude/skills/devplanner
 *   bun tools/skill-evals/run-eval.ts --skill .claude/skills/devplanner --tier 1
 *   bun tools/skill-evals/run-eval.ts --skill .claude/skills/devplanner --scenario basic-004
 *   bun tools/skill-evals/run-eval.ts --skill .claude/skills/devplanner --model llama3.1:8b
 *   bun tools/skill-evals/run-eval.ts --skill .claude/skills/devplanner --feedback
 *
 * Exit code 0 if overall pass rate >= 70%, else 1.
 */

import { parseArgs } from "util";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "fs";
import { join, resolve, basename } from "path";
import { createHash } from "crypto";
import { LmClient } from "./lib/lm-client.ts";
import { parse } from "./lib/parser.ts";
import { score } from "./lib/scorer.ts";
import { aggregateSummary, writeRunOutput } from "./lib/reporter.ts";
import { writeLlmFeedback } from "./lib/feedback.ts";
import type { RunResult, ScenarioResult, ScenariosFile } from "./lib/types.ts";

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    skill:    { type: "string" },
    model:    { type: "string" },
    tier:     { type: "string" },
    scenario: { type: "string" },
    feedback: { type: "boolean", default: false },
    "run-dir":{ type: "string" },
  },
  strict: false,
});

const skillArg = values.skill as string | undefined;
if (!skillArg) {
  console.error("Usage: bun run-eval.ts --skill <path-to-skill-dir>");
  process.exit(1);
}

const skillDir = resolve(process.cwd(), skillArg);
const skillMdPath = join(skillDir, "SKILL.md");
const scenariosPath = join(skillDir, "evals", "scenarios.json");
const harnessPath = join(import.meta.dirname, "harness-prompt.md");
const refsDir = join(skillDir, "references");

for (const [label, p] of [["SKILL.md", skillMdPath], ["evals/scenarios.json", scenariosPath], ["harness-prompt.md", harnessPath]] as const) {
  if (!existsSync(p)) {
    console.error(`Missing required file: ${label} (looked at ${p})`);
    process.exit(1);
  }
}

// ─── Load inputs ──────────────────────────────────────────────────────────────

const skillContent = readFileSync(skillMdPath, "utf-8");
const skillHash = createHash("sha256").update(skillContent).digest("hex");
const harnessContent = readFileSync(harnessPath, "utf-8");
const systemPrompt = `${skillContent}\n\n${harnessContent}`;

const scenariosFile: ScenariosFile = JSON.parse(readFileSync(scenariosPath, "utf-8"));
let scenarios = scenariosFile.scenarios;

// Apply filters
const tierFilter = values.tier ? parseInt(values.tier as string, 10) as 1 | 2 | 3 : undefined;
const scenarioFilter = values.scenario as string | undefined;
if (tierFilter) scenarios = scenarios.filter((s) => s.tier === tierFilter);
if (scenarioFilter) scenarios = scenarios.filter((s) => s.id === scenarioFilter);

if (scenarios.length === 0) {
  console.error("No scenarios matched the given filters.");
  process.exit(1);
}

// ─── Run directory ────────────────────────────────────────────────────────────

const runsBase = (values["run-dir"] as string | undefined)
  ? resolve(process.cwd(), values["run-dir"] as string)
  : join(skillDir, "evals", "runs");

mkdirSync(runsBase, { recursive: true });

// Generate runId: YYYY-MM-DD_NNN (incrementing suffix per date)
const today = new Date().toISOString().slice(0, 10);
const existing = existsSync(runsBase)
  ? readdirSync(runsBase).filter((d) => d.startsWith(today))
  : [];
const maxN = existing.reduce((max, d) => {
  const match = d.match(/_(\d+)$/);
  return match ? Math.max(max, parseInt(match[1], 10)) : max;
}, 0);
const nextN = (maxN + 1).toString().padStart(3, "0");
const runId = `${today}_${nextN}`;
const runDir = join(runsBase, runId);
mkdirSync(join(runDir, "raw-responses"), { recursive: true });

// ─── Snapshot skill files ─────────────────────────────────────────────────────

writeFileSync(join(runDir, "skill-snapshot.md"), skillContent, "utf-8");

// Snapshot reference files if they exist
if (existsSync(refsDir)) {
  const refSnapshotDir = join(runDir, "references-snapshot");
  mkdirSync(refSnapshotDir, { recursive: true });
  cpSync(refsDir, refSnapshotDir, { recursive: true });
}

// ─── LM client ───────────────────────────────────────────────────────────────

const modelOverride = values.model as string | undefined;
const client = new LmClient(modelOverride ? { model: modelOverride } : undefined);
const modelName = modelOverride ?? (process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b");

writeFileSync(join(runDir, "model.txt"), modelName, "utf-8");

// ─── Banner ───────────────────────────────────────────────────────────────────

const c = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" };

console.log(`\n${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`${c.bold}  Skill Eval: ${scenariosFile.skill}${c.reset}`);
console.log(`${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`  Run ID  : ${runId}`);
console.log(`  Model   : ${modelName}`);
console.log(`  Skill   : ${skillArg} (hash: ${skillHash.slice(0, 8)})`);
console.log(`  Scenarios: ${scenarios.length}${tierFilter ? ` (tier ${tierFilter})` : ""}${scenarioFilter ? ` (id: ${scenarioFilter})` : ""}`);
console.log(`  Output  : ${runDir}\n`);

// ─── Run scenarios ────────────────────────────────────────────────────────────

const results: ScenarioResult[] = [];
let passCount = 0;

for (let i = 0; i < scenarios.length; i++) {
  const scenario = scenarios[i];
  const prefix = `[${i + 1}/${scenarios.length}] ${scenario.id}`;

  const ts = new Date().toTimeString().slice(0, 8);
  process.stdout.write(`  ${prefix} ${c.dim}${ts}${c.reset} "${scenario.name}" … `);

  if (i > 0) await client.delay();

  let modelOutput = "";
  let durationMs = 0;
  let parseError: string | undefined;

  try {
    const response = await client.complete([
      { role: "system", content: systemPrompt },
      { role: "user", content: scenario.prompt },
    ]);
    modelOutput = response.content;
    durationMs = response.durationMs;

    // Save raw response
    writeFileSync(
      join(runDir, "raw-responses", `${scenario.id}.json`),
      JSON.stringify({ scenarioId: scenario.id, prompt: scenario.prompt, response: modelOutput, durationMs }, null, 2),
      "utf-8"
    );
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    modelOutput = "";
    process.stdout.write(`${c.red}ERROR${c.reset}\n`);
    console.error(`    ${c.dim}${parseError}${c.reset}`);
  }

  const parseResult = parse(modelOutput);
  const scenarioResult = score(scenario, parseResult, durationMs);
  if (parseError) {
    // Mark as failed parse
    (scenarioResult as { parseStrategy: string }).parseStrategy = "failed";
  }

  results.push(scenarioResult);

  const icon = scenarioResult.passRate >= 1.0 ? `${c.green}✓` : scenarioResult.neverViolated ? `${c.red}✗ NEVER` : `${c.yellow}~`;
  const pct = `${(scenarioResult.passRate * 100).toFixed(0)}%`;
  const dur = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
  process.stdout.write(`${icon} ${pct}${c.reset} (${scenarioResult.score}/${scenarioResult.maxScore}) ${c.dim}[${dur}]${c.reset}\n`);

  if (scenarioResult.passRate >= 1.0) passCount++;

  // Print failed criteria on the next line
  const failed = scenarioResult.criteria.filter((cr) => !cr.passed);
  for (const cr of failed) {
    console.log(`    ${c.dim}✗ ${cr.name}: ${cr.evidence.slice(0, 100)}${c.reset}`);
  }
}

// ─── Aggregate & write output ─────────────────────────────────────────────────

const summary = aggregateSummary(results);

const runResult: RunResult = {
  runId,
  runAt: new Date().toISOString(),
  model: modelName,
  skillName: scenariosFile.skill,
  skillHash,
  scenarios: results,
  summary,
};

writeRunOutput(runDir, runResult);

// ─── Final summary ────────────────────────────────────────────────────────────

const overallPct = (summary.overall.passRate * 100).toFixed(1);
const passed = summary.overall.passRate >= 0.7;

console.log(`\n${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`${c.bold}  Results${c.reset}`);
console.log(`${c.cyan}${"═".repeat(60)}${c.reset}`);
console.log(`  Tier 1 (Basic)  : ${(summary.tier1.passRate * 100).toFixed(1)}%  (${summary.tier1.passed}/${summary.tier1.total} pts)`);
console.log(`  Tier 2 (Medium) : ${(summary.tier2.passRate * 100).toFixed(1)}%  (${summary.tier2.passed}/${summary.tier2.total} pts)`);
console.log(`  Tier 3 (Complex): ${(summary.tier3.passRate * 100).toFixed(1)}%  (${summary.tier3.passed}/${summary.tier3.total} pts)`);
console.log(`  ─────────────────────────────`);
const totalDur = summary.totalDurationMs >= 1000 ? `${(summary.totalDurationMs / 1000).toFixed(1)}s` : `${summary.totalDurationMs}ms`;
const avgDur = scenarios.length > 0 ? Math.round(summary.totalDurationMs / scenarios.length) : 0;
const avgDurStr = avgDur >= 1000 ? `${(avgDur / 1000).toFixed(1)}s` : `${avgDur}ms`;
console.log(`  Overall         : ${c.bold}${passed ? c.green : c.red}${overallPct}%${c.reset}  (${summary.overall.passed}/${summary.overall.total} pts)  ${passed ? `${c.green}PASS ✓` : `${c.red}FAIL ✗`}${c.reset}`);
console.log(`  Duration        : ${totalDur} total  (avg ${avgDurStr}/scenario)`);
if (summary.neverViolationCount > 0) {
  console.log(`  ${c.yellow}⚠ ${summary.neverViolationCount} NEVER violation(s) — those scenarios scored 0${c.reset}`);
}
if (summary.parseFailureCount > 0) {
  console.log(`  ${c.yellow}⚠ ${summary.parseFailureCount} scenario(s) produced no parseable JSON${c.reset}`);
}
console.log(`\n  Report : ${join(runDir, "report.html")}`);
console.log(`  JSON   : ${join(runDir, "results.json")}\n`);

// ─── Optional feedback ────────────────────────────────────────────────────────

if (values.feedback) {
  console.log(`  Generating LLM feedback…`);
  await writeLlmFeedback(runDir, runResult, skillContent);
}

process.exit(passed ? 0 : 1);
