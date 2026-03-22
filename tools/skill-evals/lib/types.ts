/**
 * Shared types for the skill evaluation framework.
 *
 * Scenario definitions live in <skill-dir>/evals/scenarios.json.
 * Run output lands in <skill-dir>/evals/runs/<runId>/.
 */

// ─── Scenario definition (scenarios.json) ────────────────────────────────────

/** One API call the model is expected to produce (or not). */
export interface ExpectedCall {
  /** HTTP method (uppercase). */
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Regex tested against the parsed call's path. Use anchored patterns for precision. */
  path_pattern: string;
  /** Top-level body keys that must exist in the matched call's body. */
  required_body_fields?: string[];
  /** Body key→value pairs that must deep-equal (strict) in the matched call's body. */
  required_body_values?: Record<string, unknown>;
  /** Body key→value pairs that must NOT appear in the matched call's body. */
  forbidden_body_values?: Record<string, unknown>;
}

export interface NeverViolation {
  /** Short name used in reports. */
  name: string;
  /** Regex tested against the full raw model output (case-insensitive). */
  pattern: string;
  /** Human-readable description of the rule. */
  description: string;
}

/**
 * A single scoring criterion for a scenario.
 *
 * Types:
 * - call_present      At least one parsed call matches expected_call
 * - call_sequence     Calls appear matching expected_sequence in order
 * - never_violation   Pattern must NOT appear in raw output (pass = absent)
 * - body_field_present Key exists in matched call body
 * - body_value_match  Key deep-equals expected value in matched call body
 * - call_count        Number of matching calls within [min_count, max_count]
 */
export interface Criterion {
  name: string;
  type:
    | "call_present"
    | "call_sequence"
    | "never_violation"
    | "body_field_present"
    | "body_value_match"
    | "call_count";
  /** Used by: call_present, body_field_present, body_value_match, call_count */
  expected_call?: ExpectedCall;
  /** Used by: call_sequence */
  expected_sequence?: ExpectedCall[];
  /** Used by: never_violation */
  never_violation?: NeverViolation;
  /** Used by: call_count */
  min_count?: number;
  max_count?: number;
}

export interface Scenario {
  /** Unique ID, e.g. "basic-001". Used for file names and filtering. */
  id: string;
  /** Human-readable name for reports. */
  name: string;
  /** Difficulty tier: 1=basic, 2=medium, 3=complex. */
  tier: 1 | 2 | 3;
  /** The user-turn prompt sent to the model. */
  prompt: string;
  /** All scoring criteria for this scenario. */
  criteria: Criterion[];
  /** Optional tags for filtering, e.g. ["never-rule", "move"]. */
  tags?: string[];
}

export interface ScenariosFile {
  /** Increment when schema changes. */
  version: number;
  /** Skill identifier, e.g. "devplanner". Used in report headings. */
  skill: string;
  scenarios: Scenario[];
}

// ─── Parser output ────────────────────────────────────────────────────────────

/** One API call extracted from the model's raw output. */
export interface ParsedCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  /** Position in the extracted array; used for sequence checking. */
  index: number;
}

export type ParseStrategy = "json_block" | "json_array" | "heuristic" | "failed";

export interface ParseResult {
  success: boolean;
  calls: ParsedCall[];
  rawText: string;
  parseStrategy: ParseStrategy;
  error?: string;
}

// ─── Scorer output ────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CriterionResult {
  name: string;
  type: Criterion["type"];
  passed: boolean;
  /** Explanation of why this criterion passed or failed. */
  evidence: string;
  /** True for never_violation criteria — used to detect auto-fail. */
  isNever: boolean;
  /** Original criterion definition — included for report rendering. */
  criterion?: Criterion;
}

export interface ScenarioResult {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  prompt: string;
  modelOutput: string;
  parsedCalls: ParsedCall[];
  parseStrategy: ParseStrategy;
  criteria: CriterionResult[];
  /** True if any never_violation criterion failed → score forced to 0. */
  neverViolated: boolean;
  /** Criteria passed (0 if neverViolated). */
  score: number;
  maxScore: number;
  passRate: number;
  durationMs: number;
  tags?: string[];
  usage?: TokenUsage;
}

export interface TierSummary {
  passed: number;
  total: number;
  passRate: number;
  scenarioCount: number;
}

export interface RunResult {
  runId: string;
  runAt: string;
  model: string;
  skillName: string;
  /** SHA-256 hex of SKILL.md content at eval time. */
  skillHash: string;
  scenarios: ScenarioResult[];
  summary: {
    tier1: TierSummary;
    tier2: TierSummary;
    tier3: TierSummary;
    overall: { passed: number; total: number; passRate: number };
    neverViolationCount: number;
    parseFailureCount: number;
    totalDurationMs: number;
    totalUsage?: TokenUsage;
  };
}

// ─── compare-runs.ts output ───────────────────────────────────────────────────

export interface RunMeta {
  runId: string;
  runAt: string;
  model: string;
  skillHash: string;
  overallPassRate: number;
  tier1PassRate: number;
  tier2PassRate: number;
  tier3PassRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface ScenarioComparison {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  /** runId → passRate (null if scenario not present in that run). */
  runs: Record<string, number | null>;
  /** passRate of last run minus first run. Null if only one run. */
  trend: number | null;
}

export interface ComparisonReport {
  skillName: string;
  generatedAt: string;
  runs: RunMeta[];
  scenarios: ScenarioComparison[];
}
