# Skill Eval System — Implementation Plan

## Context

The DevPlanner `devplanner` skill ([SKILL.md](../../.claude/skills/devplanner/SKILL.md)) teaches AI agents to manage a Kanban board via REST API. This system evaluates how well any LLM follows the skill's instructions, enabling two goals:

1. **Skill refinement** — measure whether edits to SKILL.md improve or degrade correctness
2. **Model comparison** — rank local models (via LM API / Ollama) on skill adherence

The approach is **completion-only**: inject SKILL.md as the system prompt, give the model a task, instruct it to output a JSON plan of API calls, then score the plan deterministically against expected criteria — no live DevPlanner server required.

---

## Directory Structure

```
tools/skill-evals/              ← New directory; Bun scripts + config
├── run-eval.ts                 ← Main runner
├── compare-runs.ts             ← Cross-run comparison
├── scenarios.json              ← All eval scenario definitions
├── harness-prompt.md           ← Appended to system prompt; instructs JSON output
├── tsconfig.json
└── lib/
    ├── types.ts                ← Shared TypeScript interfaces
    ├── lm-client.ts            ← POST /v1/chat/completions wrapper
    ← parser.ts                ← Extracts ParsedCall[] from raw model text
    ├── scorer.ts               ← Scores ParsedCall[] against Criterion[]
    ├── reporter.ts             ← Writes results.json, report.md, report.html
    └── feedback.ts             ← Optional LLM feedback step

docs/features/skill-refinement/
├── brainstorm.md
├── plan.md                     ← This file
└── runs/                       ← Created by run-eval.ts; one folder per run
    └── YYYY-MM-DD_NNN/
        ├── skill-snapshot.md           ← Copy of SKILL.md at eval time
        ├── api-reference-snapshot.md   ← Copy of references/api-reference.md
        ├── model.txt
        ├── raw-responses/
        │   └── scenario-{id}.json      ← Full LM API response per scenario
        ├── results.json                ← Scored results (machine-readable)
        ├── report.md                   ← Human-readable summary
        ├── report.html                 ← Self-contained HTML with color-coded pass/fail
        └── llm-feedback.md             ← Optional; only with --feedback flag

docs/features/skill-refinement/
├── comparison.json             ← Cross-run comparison data
└── comparison.html             ← Cross-run comparison report
```

---

## Environment Variables

Added to `.env` (documented in `.env.example`):

```
OLLAMA_BASE_URL=http://192.168.7.45:17100
OLLAMA_MODEL=qwen2.5-coder:14b
OLLAMA_FEEDBACK_MODEL=qwen2.5:7b   # optional; defaults to OLLAMA_MODEL if unset
OLLAMA_CALL_DELAY_MS=500           # pause between scenario calls
```

"LM API" and "Ollama" are interchangeable here — the LM API server exposes an OpenAI-compatible completions endpoint backed by a pool of Ollama servers.

---

## Evaluation Approach

### System Prompt

Full SKILL.md content + `harness-prompt.md` appended. The harness instructs the model to output a `\`\`\`json` block of API calls before "executing" them, e.g.:

```json
[
  { "step": 1, "method": "POST", "path": "/projects/hex/cards",
    "body": { "title": "Add OAuth", "lane": "01-upcoming", "description": "..." },
    "reason": "Create card in backlog" }
]
```

`temperature: 0`, `stream: false`, single-turn completion.

### Parsing Strategy (cascade, first success wins)

1. **json_block** — extract fenced ` ```json ``` ` block, `JSON.parse`
2. **json_array** — find first `[…]` span, `JSON.parse`
3. **heuristic** — scan lines for `METHOD /projects/...` patterns
4. **failed** — no parseable calls; scenario scores zero on call criteria (NEVER checks still run on raw text)

### Scoring

Each scenario defines `Criterion[]`. Criterion types:

| Type | Check |
|------|-------|
| `call_present` | At least one call matches expected method + path regex |
| `call_sequence` | Calls appear in correct order |
| `never_violation` | Pattern must NOT appear in raw output (pass = violation absent) |
| `body_field_present` | Required key exists in matched call's body |
| `body_value_match` | Key equals expected value in matched call's body |
| `call_count` | Number of matching calls within [min, max] |

**NEVER violations auto-fail the scenario.** If any `never_violation` criterion fails, the scenario receives a score of 0 regardless of how other criteria scored. This reflects how critical these rules are — a model that uses the wrong endpoint or injects checkbox syntax into task text has fundamentally misunderstood the skill, even if other calls look correct. The criterion-level results still record pass/fail per criterion for diagnostic purposes.

Score = criteria passed / criteria total (0 if any NEVER violated). Aggregated per tier and overall.

---

## Scenarios (15 total, 3 tiers)

### Tier 1 — Basic (5 scenarios)
Single-operation tasks:
- `basic-001` Create a card (POST /cards, required fields)
- `basic-002` Add a task (POST /tasks, no checkbox syntax)
- `basic-003` Toggle a task (GET card first → PATCH /tasks/{index})
- `basic-004` Move card to in-progress (**key NEVER-rule test**: must use `/move`)
- `basic-005` Add a URL link (POST /links, required fields + kind)

### Tier 2 — Medium (5 scenarios)
Multi-step workflows:
- `medium-001` Claim existing work (GET list → GET card → PATCH assign → PATCH move)
- `medium-002` Create card + 3 tasks + move to in-progress (sequence + call count)
- `medium-003` Set blocked status then unblock (two-step PATCH sequence)
- `medium-004` Check for duplicate link before adding (GET card first)
- `medium-005` Create vault artifact and attach to card

### Tier 3 — Complex (5 scenarios)
Full workflows + edge cases:
- `complex-001` Full create workflow (create → tasks → intro artifact → complete tasks → summary artifact → move complete)
- `complex-002` Full claim workflow (find → read → claim → tasks → summary → complete)
- `complex-003` Error recovery: 409 DUPLICATE_LINK (prompt includes inline 409 response)
- `complex-004` NEVER test: lane change must use `/move` (not PATCH /cards/{card})
- `complex-005` NEVER test: task text must not include `- [ ]` syntax

---

## Output Files

### `results.json` (per run)

```json
{
  "runId": "2026-03-17_001",
  "runAt": "ISO timestamp",
  "model": "qwen2.5-coder:14b",
  "skillHash": "sha256 first 8 chars",
  "apiRefHash": "sha256 first 8 chars",
  "scenarios": [
    {
      "id": "basic-001", "name": "Create a card", "tier": 1,
      "parsedCalls": [...], "parseStrategy": "json_block",
      "criteria": [{ "name": "Uses POST method", "passed": true, "evidence": "..." }],
      "score": 4, "maxScore": 4, "passRate": 1.0, "durationMs": 1200
    }
  ],
  "summary": {
    "tier1": { "passed": 18, "total": 20, "passRate": 0.9, "scenarioCount": 5 },
    "tier2": { "passed": 14, "total": 20, "passRate": 0.7, "scenarioCount": 5 },
    "tier3": { "passed": 10, "total": 20, "passRate": 0.5, "scenarioCount": 5 },
    "overall": { "passed": 42, "total": 60, "passRate": 0.7 },
    "neverViolationCount": 1,
    "parseFailureCount": 0
  }
}
```

### `report.md` (per run)

Markdown table: tier summary, per-scenario pass rate, failed criteria listed per scenario.

### `report.html` (per run)

Self-contained HTML, no external deps. Green/red color-coded cells. Tables for summary and per-scenario detail.

### `comparison.json` + `comparison.html` (cross-run)

Timeline: runs as columns, scenarios as rows. Highlights skill hash changes between runs. Groups by model when multiple models have been tested.

---

## CLI Usage

```bash
# Run all scenarios
bun tools/skill-evals/run-eval.ts

# Run only tier 1
bun tools/skill-evals/run-eval.ts --tier 1

# Run a specific scenario
bun tools/skill-evals/run-eval.ts --scenario basic-004

# Run with LLM feedback
bun tools/skill-evals/run-eval.ts --feedback

# Override model for this run
bun tools/skill-evals/run-eval.ts --model llama3.1:8b

# Compare all runs
bun tools/skill-evals/compare-runs.ts
```

Exit code 0 if overall pass rate ≥ 70%, exit code 1 otherwise (CI-friendly).

### Shorthand scripts (added to `package.json`)

```json
"eval:skill": "bun tools/skill-evals/run-eval.ts",
"eval:compare": "bun tools/skill-evals/compare-runs.ts"
```

### Gitignore

All generated output is gitignored — run history lives on disk only:

```
# .gitignore additions
docs/features/skill-refinement/runs/
docs/features/skill-refinement/comparison.json
docs/features/skill-refinement/comparison.html
```

---

## Optional LLM Feedback Step

When `--feedback` is passed, after scoring, the runner sends a targeted prompt to `LMAPI_FEEDBACK_MODEL`:
- Provides the SKILL.md content
- Lists only the failing criteria, grouped by frequency
- Asks for 1–3 specific, actionable suggestions referencing exact SKILL.md sections

Output written to `runs/{runId}/llm-feedback.md` with a disclaimer that it is AI-generated, not deterministic output. This is secondary to the deterministic scoring and clearly labeled as advisory.

---

## Design Decisions (resolved)

| Decision | Choice |
|----------|--------|
| Git tracking | All generated output gitignored; history lives on disk |
| NEVER rule weight | Auto-fail: any NEVER violation zeroes the scenario score |
| Scenario prompts | Concrete card slugs (e.g. `add-oauth-login`) to test path placement |
| Feedback model | Separate `OLLAMA_FEEDBACK_MODEL`; defaults to `OLLAMA_MODEL` if unset |
| Env var naming | `OLLAMA_*` prefix (LM API and Ollama are interchangeable terms) |

---

## Critical Files

| File | Role |
|------|------|
| `.claude/skills/devplanner/SKILL.md` | Source content snapshotted at eval time |
| `.claude/skills/devplanner/references/api-reference.md` | Ground truth for endpoint patterns |
| `tools/skill-evals/scenarios.json` | All scenario + criterion definitions |
| `tools/skill-evals/harness-prompt.md` | Appended to system prompt |
| `tools/skill-evals/lib/types.ts` | All shared interfaces |
| `tools/skill-evals/lib/parser.ts` | Raw text → ParsedCall[] |
| `tools/skill-evals/lib/scorer.ts` | ParsedCall[] + Criterion[] → CriterionResult[] |
| `tools/skill-evals/lib/reporter.ts` | RunResult → results.json, report.md, report.html |
