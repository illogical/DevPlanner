# Skill Eval Framework

A reusable, **completion-only** evaluation framework for SKILL.md agent skills. It measures how well any LLM follows a skill's API instructions — no live server required.

**Two goals:**
1. **Skill refinement** — compare runs before/after SKILL.md edits to see if they help or hurt
2. **Model comparison** — rank local Ollama models on the same skill to find the best fit

---

## How It Works

For each eval scenario, the framework:
1. Injects `SKILL.md` + `harness-prompt.md` as the system prompt
2. Sends the scenario's task as the user turn to the Ollama model
3. Parses the model's response for a JSON plan of API calls
4. Scores the plan against expected criteria (correct endpoints, methods, body fields, ordering)
5. Writes a timestamped run folder with raw responses, results JSON, Markdown, and HTML reports

Every run folder includes a snapshot of the SKILL.md at that moment — so you can always diff what the skill said when a run happened.

---

## Prerequisites

- **Bun** runtime
- **Ollama pool** running and reachable at `OLLAMA_BASE_URL`
- A skill directory with `SKILL.md` and `evals/scenarios.json`

---

## Environment Setup

Add to your `.env` file:

```env
# Ollama (OpenAI-compatible completions)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:14b

# Optional: separate model for LLM feedback step (--feedback flag)
# Defaults to OLLAMA_MODEL if unset
OLLAMA_FEEDBACK_MODEL=qwen2.5:latest

# Optional: pause between scenario calls in ms (default: 500)
OLLAMA_CALL_DELAY_MS=500

# Optional: per-call timeout in ms (default: 60000)
OLLAMA_CALL_TIMEOUT_MS=60000
```

---

## Running Evals

```bash
# Run all 15 devplanner scenarios
bun run eval:skill -- --skill .claude/skills/devplanner

# Run only Tier 1 (basic) scenarios
bun run eval:skill -- --skill .claude/skills/devplanner --tier 1

# Run a single scenario
bun run eval:skill -- --skill .claude/skills/devplanner --scenario basic-004

# Override model for this run
bun run eval:skill -- --skill .claude/skills/devplanner --model llama3.1:8b

# Include LLM feedback on failures (advisory, not deterministic)
bun run eval:skill -- --skill .claude/skills/devplanner --feedback
```

**Exit codes:** `0` if overall pass rate ≥ 70%, `1` otherwise.

### Example output

```
════════════════════════════════════════════════════════════
  Skill Eval: devplanner
════════════════════════════════════════════════════════════
  Run ID  : 2026-03-18_001
  Model   : qwen2.5-coder:14b
  Scenarios: 15

  [1/15] basic-001 "Create a card" … ✓ 100% (4/4)
  [2/15] basic-002 "Add a task" … ✓ 100% (3/3)
  [3/15] basic-003 "Toggle a task" … ~ 67% (2/3)
    ✗ Read card before toggling: No GET .+/cards/.+ found before PATCH
  [4/15] basic-004 "Move card to in-progress" … ✗ NEVER 0% (0/4)
    ✗ Uses /move endpoint: NEVER violation — ...

  Results
  ─────────────────────────────
  Tier 1 (Basic)  : 85.0%
  Tier 2 (Medium) : 70.0%
  Tier 3 (Complex): 50.0%
  Overall         : 68.3%  FAIL ✗

  Report : .claude/skills/devplanner/evals/runs/2026-03-18_001/report.html
```

---

## Comparing Runs

```bash
# Compare all runs for the devplanner skill
bun run eval:compare -- --skill .claude/skills/devplanner
```

Produces `comparison.html` and `comparison.json` in `.claude/skills/devplanner/evals/`. The HTML shows a timeline table with color-coded pass rates, skill hash change markers (when you edited SKILL.md between runs), and a model column when multiple models have been tested.

---

## Adding a New Skill

The framework is fully generic — it works with any skill that teaches an LLM to call a REST API.

**Step 1**: Create `evals/scenarios.json` alongside the skill's `SKILL.md`:

```
.claude/skills/my-skill/
├── SKILL.md
└── evals/
    └── scenarios.json
```

**Step 2**: Define scenarios following the `ScenariosFile` schema:

```json
{
  "version": 1,
  "skill": "my-skill",
  "scenarios": [
    {
      "id": "basic-001",
      "name": "Create a resource",
      "tier": 1,
      "prompt": "Create a new widget named 'Blue Widget' via the API.",
      "criteria": [
        {
          "name": "Uses POST method",
          "type": "call_present",
          "expected_call": {
            "method": "POST",
            "path_pattern": "/widgets",
            "required_body_fields": ["name"]
          }
        }
      ],
      "tags": ["create"]
    }
  ]
}
```

**Step 3**: Run it:

```bash
bun run eval:skill -- --skill .claude/skills/my-skill
```

That's it. No changes to the framework needed.

---

## Criterion Type Reference

| Type | What it checks |
|------|----------------|
| `call_present` | At least one parsed call matches the expected method + path regex, plus any required body fields/values |
| `call_sequence` | All expected calls appear in the output **in order** (by position) |
| `never_violation` | A regex pattern must **NOT** appear in the raw output — if it does, the scenario auto-fails (score = 0) |
| `body_field_present` | A specific key exists at the top level of the matched call's request body |
| `body_value_match` | A specific key deep-equals an expected value in the matched call's body |
| `call_count` | The number of matching calls falls within `[min_count, max_count]` |

### NEVER violations

Any scenario with a failing `never_violation` criterion is **automatically scored 0**, regardless of how other criteria scored. This reflects the critical nature of these rules — using the wrong endpoint or injecting checkbox syntax into task text is a fundamental misunderstanding of the skill.

Individual criterion-level pass/fail results are still recorded for diagnostic purposes.

### `path_pattern` is a regex

```json
"path_pattern": "/projects/\\w+/cards/[^/]+/move"
```

Use anchors (`^`, `$`) for precision. The pattern is matched case-insensitively against the full path.

---

## Output Files

### Per-run (in `<skill>/evals/runs/<runId>/`)

| File | Contents |
|------|----------|
| `skill-snapshot.md` | Exact copy of SKILL.md at eval time |
| `references-snapshot/` | Copy of `references/` directory |
| `model.txt` | Model name used |
| `raw-responses/<id>.json` | Full LM API request + response per scenario |
| `results.json` | Scored results for all scenarios (machine-readable) |
| `report.md` | Human-readable tier summary + per-scenario pass/fail |
| `report.html` | Self-contained HTML with color-coded pass/fail (open in browser) |
| `llm-feedback.md` | AI-generated improvement suggestions (`--feedback` only) |

### Cross-run (in `<skill>/evals/`)

| File | Contents |
|------|----------|
| `comparison.json` | All runs as a structured diff |
| `comparison.html` | Visual timeline table — open in browser |

All generated output is **gitignored** — run history lives on disk only.

---

## Scenario Tiers

| Tier | Difficulty | Description |
|------|------------|-------------|
| 1 | Basic | Single API operation |
| 2 | Medium | Multi-step workflow (3–5 calls) |
| 3 | Complex | Full workflows, error handling, NEVER-rule edge cases |

Start with Tier 1 when evaluating a new model — if it fails basic scenarios, Tier 3 results won't be meaningful.
