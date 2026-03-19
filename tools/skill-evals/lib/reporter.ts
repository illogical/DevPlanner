/**
 * Generates run output: results.json, report.md, report.html.
 * All output goes into the runDir passed to writeRunOutput().
 */

import { writeFileSync } from "fs";
import { join } from "path";
import type { RunResult, ScenarioResult, TierSummary } from "./types.ts";

// ─── Tier aggregation ─────────────────────────────────────────────────────────

export function aggregateSummary(scenarios: ScenarioResult[]): RunResult["summary"] {
  function tierSummary(tier: 1 | 2 | 3): TierSummary {
    const s = scenarios.filter((x) => x.tier === tier);
    const passed = s.reduce((n, x) => n + x.score, 0);
    const total = s.reduce((n, x) => n + x.maxScore, 0);
    return { passed, total, passRate: total > 0 ? passed / total : 0, scenarioCount: s.length };
  }

  const allPassed = scenarios.reduce((n, x) => n + x.score, 0);
  const allTotal = scenarios.reduce((n, x) => n + x.maxScore, 0);

  return {
    tier1: tierSummary(1),
    tier2: tierSummary(2),
    tier3: tierSummary(3),
    overall: { passed: allPassed, total: allTotal, passRate: allTotal > 0 ? allPassed / allTotal : 0 },
    neverViolationCount: scenarios.filter((x) => x.neverViolated).length,
    parseFailureCount: scenarios.filter((x) => x.parseStrategy === "failed").length,
    totalDurationMs: scenarios.reduce((n, x) => n + x.durationMs, 0),
  };
}

// ─── Markdown report ─────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function tierLabel(t: 1 | 2 | 3): string {
  return t === 1 ? "Tier 1 (Basic)" : t === 2 ? "Tier 2 (Medium)" : "Tier 3 (Complex)";
}

export function generateMarkdown(result: RunResult): string {
  const { summary, scenarios } = result;
  const lines: string[] = [];

  lines.push(`# Skill Eval Report: ${result.skillName}`);
  lines.push(``);
  const avgDurationMs = scenarios.length > 0 ? summary.totalDurationMs / scenarios.length : 0;
  lines.push(`**Run ID**: ${result.runId}  `);
  lines.push(`**Run at**: ${result.runAt}  `);
  lines.push(`**Model**: ${result.model}  `);
  lines.push(`**Skill hash**: \`${result.skillHash.slice(0, 8)}\`  `);
  lines.push(`**Total duration**: ${fmtMs(summary.totalDurationMs)} (avg ${fmtMs(Math.round(avgDurationMs))}/scenario)`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Tier | Scenarios | Passed | Total Pts | Pass Rate |`);
  lines.push(`|------|-----------|--------|-----------|-----------|`);
  for (const tier of [1, 2, 3] as const) {
    const s = summary[`tier${tier}` as "tier1" | "tier2" | "tier3"];
    lines.push(`| ${tierLabel(tier)} | ${s.scenarioCount} | ${s.passed} | ${s.total} | ${pct(s.passRate)} |`);
  }
  lines.push(`| **Overall** | **${scenarios.length}** | **${summary.overall.passed}** | **${summary.overall.total}** | **${pct(summary.overall.passRate)}** |`);
  lines.push(``);

  if (summary.neverViolationCount > 0) {
    lines.push(`> ⚠️ **${summary.neverViolationCount} scenario(s) had NEVER violations** — those scores were zeroed.`);
    lines.push(``);
  }
  if (summary.parseFailureCount > 0) {
    lines.push(`> ⚠️ **${summary.parseFailureCount} scenario(s) produced no parseable JSON output.**`);
    lines.push(``);
  }

  lines.push(`## Per-Scenario Results`);
  lines.push(``);
  lines.push(`| ID | Name | Tier | Parse | Pass Rate | Duration | NEVER | Failed Criteria |`);
  lines.push(`|----|------|------|-------|-----------|----------|-------|-----------------|`);

  for (const s of scenarios) {
    const failed = s.criteria.filter((c) => !c.passed).map((c) => c.name);
    const failedStr = failed.length > 0 ? failed.join(", ") : "—";
    const neverMark = s.neverViolated ? "❌" : "—";
    lines.push(`| ${s.id} | ${s.name} | ${s.tier} | ${s.parseStrategy} | ${pct(s.passRate)} | ${fmtMs(s.durationMs)} | ${neverMark} | ${failedStr} |`);
  }

  lines.push(``);
  lines.push(`## Notable Failures`);
  lines.push(``);

  const failing = scenarios.filter((s) => s.passRate < 1.0);
  if (failing.length === 0) {
    lines.push(`All scenarios passed.`);
  } else {
    for (const s of failing) {
      lines.push(`### ${s.id} — ${s.name} (${pct(s.passRate)})`);
      if (s.neverViolated) lines.push(`> ⚠️ **NEVER violation — score zeroed.**`);
      const failedCriteria = s.criteria.filter((c) => !c.passed);
      for (const c of failedCriteria) {
        lines.push(`- **${c.name}** [${c.type}]: ${c.evidence}`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

// ─── HTML report ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateHtml(result: RunResult): string {
  const { summary, scenarios } = result;
  const avgDurationMs = scenarios.length > 0 ? summary.totalDurationMs / scenarios.length : 0;

  function cell(pass: boolean, text: string): string {
    const cls = pass ? "pass" : "fail";
    return `<td class="${cls}">${esc(text)}</td>`;
  }

  const tierRows = ([1, 2, 3] as const).map((tier) => {
    const s = summary[`tier${tier}` as "tier1" | "tier2" | "tier3"];
    const tierScenarios = scenarios.filter((x) => x.tier === tier);
    const tierDuration = tierScenarios.reduce((n, x) => n + x.durationMs, 0);
    const tierAvg = tierScenarios.length > 0 ? tierDuration / tierScenarios.length : 0;
    return `<tr><td>${esc(tierLabel(tier))}</td><td>${s.scenarioCount}</td><td>${s.passed}</td><td>${s.total}</td>${cell(s.passRate >= 0.7, pct(s.passRate))}<td class="small">${fmtMs(tierDuration)} (avg ${fmtMs(Math.round(tierAvg))})</td></tr>`;
  }).join("\n");

  const overallPass = summary.overall.passRate >= 0.7;

  const scenarioRows = scenarios.map((s) => {
    const failed = s.criteria.filter((c) => !c.passed).map((c) => esc(c.name)).join(", ") || "—";
    return `<tr>
      <td>${esc(s.id)}</td>
      <td>${esc(s.name)}</td>
      <td>${s.tier}</td>
      <td>${esc(s.parseStrategy)}</td>
      ${cell(s.passRate >= 1.0, pct(s.passRate))}
      <td class="duration">${fmtMs(s.durationMs)}</td>
      <td>${s.neverViolated ? '<span class="fail">❌ YES</span>' : "—"}</td>
      <td class="small">${failed}</td>
    </tr>`;
  }).join("\n");

  const detailSections = scenarios.filter((s) => s.passRate < 1.0).map((s) => {
    const criteriaRows = s.criteria.map((c) =>
      `<tr>${cell(c.passed, c.passed ? "✓" : "✗")}<td>${esc(c.name)}</td><td class="small">${esc(c.evidence)}</td></tr>`
    ).join("\n");
    return `<h3>${esc(s.id)} — ${esc(s.name)} (${pct(s.passRate)})</h3>
    ${s.neverViolated ? '<p class="fail">⚠️ NEVER violation — score zeroed.</p>' : ""}
    <table><thead><tr><th>Pass</th><th>Criterion</th><th>Evidence</th></tr></thead>
    <tbody>${criteriaRows}</tbody></table>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skill Eval — ${esc(result.skillName)} — ${esc(result.runId)}</title>
<style>
  :root { --pass: #22c55e; --fail: #ef4444; --warn: #f59e0b; --bg: #18181b; --surface: #27272a; --text: #f4f4f5; --muted: #a1a1aa; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 2rem; line-height: 1.5; }
  h1, h2, h3 { margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { text-align: left; padding: .4rem .8rem; border: 1px solid #3f3f46; }
  th { background: var(--surface); }
  .pass { color: var(--pass); font-weight: 600; }
  .fail { color: var(--fail); font-weight: 600; }
  .small { font-size: .85em; color: var(--muted); }
  .meta { background: var(--surface); padding: 1rem; border-radius: .5rem; display: grid; grid-template-columns: auto 1fr auto 1fr; gap: .2rem 1rem; }
  .duration { font-family: monospace; color: var(--muted); font-size: .9em; }
  .meta dt { color: var(--muted); } .meta dd { margin: 0; font-weight: 600; }
  .banner { padding: .6rem 1rem; border-radius: .4rem; margin: 1rem 0; font-weight: 600; }
  .banner.pass-bg { background: #14532d; color: var(--pass); }
  .banner.fail-bg { background: #450a0a; color: var(--fail); }
</style>
</head>
<body>
<h1>Skill Eval: ${esc(result.skillName)}</h1>
<dl class="meta">
  <dt>Run ID</dt><dd>${esc(result.runId)}</dd>
  <dt>Run at</dt><dd>${esc(result.runAt)}</dd>
  <dt>Model</dt><dd>${esc(result.model)}</dd>
  <dt>Skill hash</dt><dd>${esc(result.skillHash.slice(0, 8))}</dd>
  <dt>Total duration</dt><dd>${fmtMs(summary.totalDurationMs)}</dd>
  <dt>Avg / scenario</dt><dd>${fmtMs(Math.round(avgDurationMs))}</dd>
</dl>

<div class="banner ${overallPass ? "pass-bg" : "fail-bg"}">
  Overall: ${pct(summary.overall.passRate)} (${summary.overall.passed}/${summary.overall.total} pts)
  — ${overallPass ? "PASS ✓" : "FAIL ✗"}
</div>

<h2>Summary</h2>
<table>
  <thead><tr><th>Tier</th><th>Scenarios</th><th>Pts Passed</th><th>Pts Total</th><th>Pass Rate</th><th>Duration</th></tr></thead>
  <tbody>
    ${tierRows}
    <tr style="font-weight:bold"><td>Overall</td><td>${scenarios.length}</td><td>${summary.overall.passed}</td><td>${summary.overall.total}</td>${cell(overallPass, pct(summary.overall.passRate))}<td class="small">${fmtMs(summary.totalDurationMs)} (avg ${fmtMs(Math.round(avgDurationMs))})</td></tr>
  </tbody>
</table>

<h2>Per-Scenario Results</h2>
<table>
  <thead><tr><th>ID</th><th>Name</th><th>Tier</th><th>Parse</th><th>Pass Rate</th><th>Duration</th><th>NEVER</th><th>Failed Criteria</th></tr></thead>
  <tbody>${scenarioRows}</tbody>
</table>

<h2>Notable Failures</h2>
${detailSections || "<p>All scenarios passed.</p>"}

</body>
</html>`;
}

// ─── Write all outputs ────────────────────────────────────────────────────────

export function writeRunOutput(runDir: string, result: RunResult): void {
  writeFileSync(join(runDir, "results.json"), JSON.stringify(result, null, 2), "utf-8");
  writeFileSync(join(runDir, "report.md"), generateMarkdown(result), "utf-8");
  writeFileSync(join(runDir, "report.html"), generateHtml(result), "utf-8");
}
