/**
 * Scores a ParseResult against a Scenario's criteria.
 *
 * NEVER auto-fail: if any never_violation criterion fails, neverViolated=true
 * and the scenario score is forced to 0 (individual results still recorded).
 */

import type {
  Criterion,
  CriterionResult,
  ExpectedCall,
  ParsedCall,
  ParseResult,
  Scenario,
  ScenarioResult,
} from "./types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function methodMatches(call: ParsedCall, expected: ExpectedCall): boolean {
  return call.method.toUpperCase() === expected.method.toUpperCase();
}

function pathMatches(call: ParsedCall, expected: ExpectedCall): boolean {
  try {
    return new RegExp(expected.path_pattern, "i").test(call.path);
  } catch {
    // Invalid regex — fall back to substring match
    return call.path.includes(expected.path_pattern);
  }
}

function bodyFieldsPresent(call: ParsedCall, fields: string[]): boolean {
  if (!call.body) return false;
  return fields.every((f) => f in call.body!);
}

function bodyValuesMatch(call: ParsedCall, values: Record<string, unknown>): boolean {
  if (!call.body) return false;
  return Object.entries(values).every(([k, v]) => {
    return JSON.stringify(call.body![k]) === JSON.stringify(v);
  });
}

function bodyValuesForbidden(call: ParsedCall, forbidden: Record<string, unknown>): boolean {
  if (!call.body) return true; // no body → no forbidden values present
  return Object.entries(forbidden).every(([k, v]) => {
    return JSON.stringify(call.body![k]) !== JSON.stringify(v);
  });
}

/**
 * Returns true if the call satisfies all constraints of an ExpectedCall.
 * Used by call_present, call_sequence, body_field_present, body_value_match.
 */
function callSatisfies(call: ParsedCall, expected: ExpectedCall): boolean {
  if (!methodMatches(call, expected)) return false;
  if (!pathMatches(call, expected)) return false;
  if (expected.required_body_fields && !bodyFieldsPresent(call, expected.required_body_fields)) return false;
  if (expected.required_body_values && !bodyValuesMatch(call, expected.required_body_values)) return false;
  if (expected.forbidden_body_values && !bodyValuesForbidden(call, expected.forbidden_body_values)) return false;
  return true;
}

// ─── Criterion evaluators ─────────────────────────────────────────────────────

function scoreCallPresent(c: Criterion, calls: ParsedCall[]): CriterionResult {
  const ec = c.expected_call!;
  const match = calls.find((call) => callSatisfies(call, ec));
  if (match) {
    return { name: c.name, type: c.type, passed: true, evidence: `Found: ${match.method} ${match.path}`, isNever: false };
  }
  const candidates = calls.filter((call) => methodMatches(call, ec)).map((x) => x.path).join(", ") || "none";
  return {
    name: c.name, type: c.type, passed: false,
    evidence: `No call matched ${ec.method} ${ec.path_pattern}. Candidate paths: ${candidates}`,
    isNever: false,
  };
}

function scoreCallSequence(c: Criterion, calls: ParsedCall[]): CriterionResult {
  const seq = c.expected_sequence!;
  let lastIndex = -1;
  for (const ec of seq) {
    const match = calls.find((call) => call.index > lastIndex && callSatisfies(call, ec));
    if (!match) {
      return {
        name: c.name, type: c.type, passed: false,
        evidence: `Sequence broken: expected ${ec.method} ${ec.path_pattern} after index ${lastIndex}, not found`,
        isNever: false,
      };
    }
    lastIndex = match.index;
  }
  return { name: c.name, type: c.type, passed: true, evidence: `All ${seq.length} calls found in order`, isNever: false };
}

function scoreNeverViolation(c: Criterion, rawText: string): CriterionResult {
  const nv = c.never_violation!;
  let regex: RegExp;
  try {
    regex = new RegExp(nv.pattern, "i");
  } catch {
    return { name: c.name, type: c.type, passed: false, evidence: `Invalid regex: ${nv.pattern}`, isNever: true };
  }
  const violated = regex.test(rawText);
  if (!violated) {
    return { name: c.name, type: c.type, passed: true, evidence: `NEVER pattern not found in output (good)`, isNever: true };
  }
  const match = rawText.match(regex);
  const snippet = match ? match[0].slice(0, 80) : "";
  return {
    name: c.name, type: c.type, passed: false,
    evidence: `NEVER violation: "${snippet}" matched /${nv.pattern}/i — ${nv.description}`,
    isNever: true,
  };
}

function scoreBodyFieldPresent(c: Criterion, calls: ParsedCall[]): CriterionResult {
  const ec = c.expected_call!;
  const match = calls.find((call) => methodMatches(call, ec) && pathMatches(call, ec));
  if (!match) {
    return { name: c.name, type: c.type, passed: false, evidence: `No call matched ${ec.method} ${ec.path_pattern}`, isNever: false };
  }
  const fields = ec.required_body_fields ?? [];
  const missing = fields.filter((f) => !match.body || !(f in match.body));
  if (missing.length === 0) {
    return { name: c.name, type: c.type, passed: true, evidence: `Fields present: ${fields.join(", ")}`, isNever: false };
  }
  return { name: c.name, type: c.type, passed: false, evidence: `Missing fields: ${missing.join(", ")}`, isNever: false };
}

function scoreBodyValueMatch(c: Criterion, calls: ParsedCall[]): CriterionResult {
  const ec = c.expected_call!;
  const match = calls.find((call) => methodMatches(call, ec) && pathMatches(call, ec));
  if (!match) {
    return { name: c.name, type: c.type, passed: false, evidence: `No call matched ${ec.method} ${ec.path_pattern}`, isNever: false };
  }
  const expected = ec.required_body_values ?? {};
  const mismatches = Object.entries(expected).filter(([k, v]) => {
    return JSON.stringify(match.body?.[k]) !== JSON.stringify(v);
  });
  if (mismatches.length === 0) {
    return {
      name: c.name, type: c.type, passed: true,
      evidence: `Values matched: ${Object.keys(expected).join(", ")}`,
      isNever: false,
    };
  }
  const detail = mismatches.map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(match.body?.[k])}`).join("; ");
  return { name: c.name, type: c.type, passed: false, evidence: detail, isNever: false };
}

function scoreCallCount(c: Criterion, calls: ParsedCall[]): CriterionResult {
  const ec = c.expected_call!;
  const count = calls.filter((call) => callSatisfies(call, ec)).length;
  const min = c.min_count ?? 0;
  const max = c.max_count ?? Infinity;
  const passed = count >= min && count <= max;
  const rangeStr = max === Infinity ? `≥${min}` : `${min}–${max}`;
  return {
    name: c.name, type: c.type, passed,
    evidence: `Found ${count} calls matching ${ec.method} ${ec.path_pattern} (expected ${rangeStr})`,
    isNever: false,
  };
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

function scoreCriterion(c: Criterion, calls: ParsedCall[], rawText: string): CriterionResult {
  switch (c.type) {
    case "call_present":      return scoreCallPresent(c, calls);
    case "call_sequence":     return scoreCallSequence(c, calls);
    case "never_violation":   return scoreNeverViolation(c, rawText);
    case "body_field_present":return scoreBodyFieldPresent(c, calls);
    case "body_value_match":  return scoreBodyValueMatch(c, calls);
    case "call_count":        return scoreCallCount(c, calls);
    default:
      return { name: c.name, type: (c as Criterion).type, passed: false, evidence: `Unknown criterion type`, isNever: false };
  }
}

export function score(
  scenario: Scenario,
  parseResult: ParseResult,
  durationMs: number
): ScenarioResult {
  const criteriaResults = scenario.criteria.map((c) =>
    scoreCriterion(c, parseResult.calls, parseResult.rawText)
  );

  const neverViolated = criteriaResults.some((r) => r.isNever && !r.passed);
  const maxScore = criteriaResults.length;
  const rawPassed = criteriaResults.filter((r) => r.passed).length;
  const scorePassed = neverViolated ? 0 : rawPassed;

  return {
    id: scenario.id,
    name: scenario.name,
    tier: scenario.tier,
    prompt: scenario.prompt,
    modelOutput: parseResult.rawText,
    parsedCalls: parseResult.calls,
    parseStrategy: parseResult.parseStrategy,
    criteria: criteriaResults,
    neverViolated,
    score: scorePassed,
    maxScore,
    passRate: maxScore > 0 ? scorePassed / maxScore : 0,
    durationMs,
    tags: scenario.tags,
  };
}
