#!/usr/bin/env bun
/**
 * compare-runs.ts — Cross-run comparison for a skill's eval history.
 *
 * Usage:
 *   bun tools/skill-evals/compare-runs.ts --skill .claude/skills/devplanner
 *   bun tools/skill-evals/compare-runs.ts --skill .claude/skills/devplanner --output /tmp/
 *
 * Reads all results.json files under <skill>/evals/runs/ and produces:
 *   <skill>/evals/comparison.json
 *   <skill>/evals/comparison.html
 */

import { parseArgs } from "util";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { ComparisonReport, RunMeta, RunResult, ScenarioComparison } from "./lib/types.ts";

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    skill:  { type: "string" },
    output: { type: "string" },
  },
  strict: false,
});

const skillArg = values.skill as string | undefined;
if (!skillArg) {
  console.error("Usage: bun compare-runs.ts --skill <path-to-skill-dir>");
  process.exit(1);
}

const skillDir = resolve(process.cwd(), skillArg);
const runsDir = join(skillDir, "evals", "runs");
const outputDir = (values.output as string | undefined)
  ? resolve(process.cwd(), values.output as string)
  : join(skillDir, "evals");

if (!existsSync(runsDir)) {
  console.error(`No runs directory found at ${runsDir}. Run eval:skill first.`);
  process.exit(1);
}

// ─── Load runs ────────────────────────────────────────────────────────────────

const runDirs = readdirSync(runsDir)
  .filter((d) => /^\d{4}-\d{2}-\d{2}_\d{3}$/.test(d))
  .filter((d) => {
    const p = join(runsDir, d, "results.json");
    return existsSync(p) && statSync(join(runsDir, d)).isDirectory();
  })
  .sort(); // chronological

if (runDirs.length === 0) {
  console.error("No completed runs found (missing results.json). Run eval:skill first.");
  process.exit(1);
}

const runResults: RunResult[] = runDirs.map((d) => {
  try {
    return JSON.parse(readFileSync(join(runsDir, d, "results.json"), "utf-8")) as RunResult;
  } catch {
    console.warn(`  Skipping ${d} — could not parse results.json`);
    return null;
  }
}).filter(Boolean) as RunResult[];

console.log(`Loaded ${runResults.length} run(s) for ${skillArg}`);

// ─── Build report ─────────────────────────────────────────────────────────────

const runMetas: RunMeta[] = runResults.map((r) => {
  const totalDurationMs = r.summary.totalDurationMs ?? r.scenarios.reduce((n, s) => n + s.durationMs, 0);
  const avgDurationMs = r.scenarios.length > 0 ? totalDurationMs / r.scenarios.length : 0;
  return {
    runId: r.runId,
    runAt: r.runAt,
    model: r.model,
    skillHash: r.skillHash,
    overallPassRate: r.summary.overall.passRate,
    tier1PassRate: r.summary.tier1.passRate,
    tier2PassRate: r.summary.tier2.passRate,
    tier3PassRate: r.summary.tier3.passRate,
    totalDurationMs,
    avgDurationMs,
  };
});

// Union of all scenario IDs across all runs
const allScenarioIds = new Map<string, { name: string; tier: 1 | 2 | 3 }>();
for (const r of runResults) {
  for (const s of r.scenarios) {
    if (!allScenarioIds.has(s.id)) {
      allScenarioIds.set(s.id, { name: s.name, tier: s.tier });
    }
  }
}

// Sort by tier then id
const sortedIds = [...allScenarioIds.entries()].sort((a, b) => {
  if (a[1].tier !== b[1].tier) return a[1].tier - b[1].tier;
  return a[0].localeCompare(b[0]);
});

const scenarioComparisons: ScenarioComparison[] = sortedIds.map(([id, meta]) => {
  const runs: Record<string, number | null> = {};
  for (const r of runResults) {
    const found = r.scenarios.find((s) => s.id === id);
    runs[r.runId] = found !== undefined ? found.passRate : null;
  }

  // Trend: last run passRate minus first run passRate (skip nulls)
  const values = runResults.map((r) => runs[r.runId]).filter((v) => v !== null) as number[];
  const trend = values.length >= 2 ? values[values.length - 1] - values[0] : null;

  return { id, name: meta.name, tier: meta.tier, runs, trend };
});

const skillName = runResults[0]?.skillName ?? skillArg;

const report: ComparisonReport = {
  skillName,
  generatedAt: new Date().toISOString(),
  runs: runMetas,
  scenarios: scenarioComparisons,
};

// ─── Write JSON ───────────────────────────────────────────────────────────────

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, "comparison.json");
writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");
console.log(`  JSON: ${jsonPath}`);

// ─── Write HTML ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(0)}%`;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function rateColor(n: number | null): string {
  if (n === null) return "#71717a";
  if (n >= 1.0) return "#22c55e";
  if (n >= 0.7) return "#84cc16";
  if (n >= 0.5) return "#f59e0b";
  return "#ef4444";
}

function trendArrow(t: number | null): string {
  if (t === null) return "";
  if (t > 0.05) return `<span style="color:#22c55e">▲ +${(t * 100).toFixed(0)}%</span>`;
  if (t < -0.05) return `<span style="color:#ef4444">▼ ${(t * 100).toFixed(0)}%</span>`;
  return `<span style="color:#a1a1aa">→ 0%</span>`;
}

// Detect skill hash changes between consecutive runs
const hashChanges = new Set<string>(); // runIds where hash changed vs prev
for (let i = 1; i < runMetas.length; i++) {
  if (runMetas[i].skillHash !== runMetas[i - 1].skillHash) {
    hashChanges.add(runMetas[i].runId);
  }
}

// Model column: show if more than one model used
const modelSet = new Set(runMetas.map((r) => r.model));
const showModel = modelSet.size > 1;

// Header row
const headerCells = runMetas.map((r) => {
  const changed = hashChanges.has(r.runId) ? `<br><span class="badge changed">skill changed</span>` : "";
  const modelBadge = showModel ? `<br><span class="badge model">${esc(r.model)}</span>` : "";
  return `<th class="run-col"><div class="run-id">${esc(r.runId)}</div>${changed}${modelBadge}</th>`;
}).join("\n");

// Overall row
const overallCells = runMetas.map((r) => {
  const color = rateColor(r.overallPassRate);
  const border = r.overallPassRate >= 0.7 ? "2px solid #22c55e" : "2px solid #ef4444";
  return `<td style="color:${color};font-weight:bold;border-bottom:${border}">${pct(r.overallPassRate)}</td>`;
}).join("\n");

// Duration row
const durationCells = runMetas.map((r) => {
  return `<td style="color:#a1a1aa;text-align:center;font-family:monospace;font-size:.85em">${fmtMs(r.totalDurationMs)}<br><span style="font-size:.85em;opacity:.7">avg ${fmtMs(Math.round(r.avgDurationMs))}</span></td>`;
}).join("\n");

// Tier rows
function tierRow(tier: 1 | 2 | 3, label: string): string {
  const key = `tier${tier}PassRate` as "tier1PassRate" | "tier2PassRate" | "tier3PassRate";
  const cells = runMetas.map((r) => {
    const v = r[key];
    return `<td style="color:${rateColor(v)}">${pct(v)}</td>`;
  }).join("\n");
  return `<tr class="tier-row"><td>${label}</td>${cells}<td></td></tr>`;
}

// Scenario rows
const scenarioRows = scenarioComparisons.map((s) => {
  const cells = runMetas.map((r) => {
    const v = s.runs[r.runId];
    const bg = v === null ? "#3f3f46" : v >= 1.0 ? "#14532d" : v >= 0.7 ? "#365314" : v >= 0.5 ? "#451a03" : "#450a0a";
    return `<td style="background:${bg};color:${rateColor(v)};text-align:center">${pct(v)}</td>`;
  }).join("\n");
  const arrow = trendArrow(s.trend);
  return `<tr><td class="scenario-name"><span class="scenario-id">${esc(s.id)}</span> ${esc(s.name)}</td>${cells}<td class="trend">${arrow}</td></tr>`;
}).join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skill Eval Comparison — ${esc(skillName)}</title>
<style>
  :root { --bg: #18181b; --surface: #27272a; --text: #f4f4f5; --muted: #a1a1aa; --border: #3f3f46; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 2rem; line-height: 1.5; }
  h1, h2 { margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .9em; }
  th, td { text-align: left; padding: .35rem .7rem; border: 1px solid var(--border); white-space: nowrap; }
  th { background: var(--surface); }
  .run-col { text-align: center; min-width: 90px; }
  .run-id { font-size: .8em; font-family: monospace; }
  .tier-row td { font-style: italic; color: var(--muted); }
  .tier-row td:first-child { padding-left: 1.5rem; }
  .scenario-name { max-width: 260px; white-space: normal; }
  .scenario-id { font-family: monospace; font-size: .8em; color: var(--muted); }
  .trend { text-align: center; min-width: 60px; }
  .badge { font-size: .7em; padding: .1em .4em; border-radius: .3em; font-weight: 600; }
  .badge.changed { background: #451a03; color: #fdba74; }
  .badge.model { background: #1e3a5f; color: #93c5fd; }
  .meta { color: var(--muted); font-size: .9em; margin-bottom: 1rem; }
  .legend { display: flex; gap: 1rem; margin: .5rem 0; font-size: .85em; }
  .legend span { display: flex; align-items: center; gap: .3rem; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
</style>
</head>
<body>
<h1>Skill Eval Comparison: ${esc(skillName)}</h1>
<p class="meta">Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; ${runMetas.length} run(s) &nbsp;·&nbsp; ${scenarioComparisons.length} scenario(s)</p>

<div class="legend">
  <span><span class="dot" style="background:#22c55e"></span> 100%</span>
  <span><span class="dot" style="background:#84cc16"></span> 70–99%</span>
  <span><span class="dot" style="background:#f59e0b"></span> 50–69%</span>
  <span><span class="dot" style="background:#ef4444"></span> &lt;50%</span>
  <span><span class="dot" style="background:#3f3f46"></span> not run</span>
</div>

<h2>Run History</h2>
<table>
  <thead>
    <tr><th>Scenario</th>${headerCells}<th>Trend</th></tr>
  </thead>
  <tbody>
    <tr style="font-weight:bold"><td>Overall</td>${overallCells}<td></td></tr>
    ${tierRow(1, "↳ Tier 1 (Basic)")}
    ${tierRow(2, "↳ Tier 2 (Medium)")}
    ${tierRow(3, "↳ Tier 3 (Complex)")}
    <tr class="tier-row"><td>⏱ Duration (total / avg)</td>${durationCells}<td></td></tr>
    <tr><td colspan="${runMetas.length + 2}" style="padding:.2rem"></td></tr>
    ${scenarioRows}
  </tbody>
</table>

${showModel ? `<h2>Models Used</h2>
<table>
  <thead><tr><th>Run</th><th>Model</th><th>Overall</th></tr></thead>
  <tbody>
    ${runMetas.map((r) => `<tr><td>${esc(r.runId)}</td><td>${esc(r.model)}</td><td>${pct(r.overallPassRate)}</td></tr>`).join("\n")}
  </tbody>
</table>` : ""}

</body>
</html>`;

const htmlPath = join(outputDir, "comparison.html");
writeFileSync(htmlPath, html, "utf-8");
console.log(`  HTML: ${htmlPath}`);
console.log(`\nDone.`);
