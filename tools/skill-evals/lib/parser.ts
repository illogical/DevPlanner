/**
 * Extracts ParsedCall[] from raw model output using a cascade of strategies.
 *
 * Strategies (first success wins):
 *  1. json_block  — fenced ```json … ``` block
 *  2. json_array  — first bare [...] span in the text
 *  3. heuristic   — scan lines for METHOD /path patterns
 *  4. failed      — no parseable calls found
 *
 * NEVER violation checks are performed against raw text independently of
 * the parse strategy — they always run.
 */

import type { ParsedCall, ParseResult } from "./types.ts";

const VALID_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

function isValidCall(obj: unknown): obj is { method: string; path: string; body?: unknown } {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return typeof o.method === "string" && typeof o.path === "string";
}

function buildCall(raw: { method: string; path: string; body?: unknown }, index: number): ParsedCall | null {
  const method = raw.method.toUpperCase();
  if (!VALID_METHODS.has(method)) return null;
  if (!raw.path.startsWith("/")) return null;
  return {
    method,
    path: raw.path,
    body: typeof raw.body === "object" && raw.body !== null
      ? (raw.body as Record<string, unknown>)
      : undefined,
    index,
  };
}

/** Strategy 1: extract first ```json … ``` block and parse it. */
function tryJsonBlock(text: string): ParsedCall[] | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return null;
    const calls: ParsedCall[] = [];
    for (const item of parsed) {
      if (!isValidCall(item)) continue;
      const call = buildCall(item, calls.length);
      if (call) calls.push(call);
    }
    return calls.length > 0 ? calls : null;
  } catch {
    return null;
  }
}

/** Strategy 2: find first [...] span (allowing nested objects) and parse it. */
function tryJsonArray(text: string): ParsedCall[] | null {
  const start = text.indexOf("[");
  if (start === -1) return null;

  // Walk forward tracking bracket depth to find the matching ]
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[" || text[i] === "{") depth++;
    else if (text[i] === "]" || text[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const calls: ParsedCall[] = [];
    for (const item of parsed) {
      if (!isValidCall(item)) continue;
      const call = buildCall(item, calls.length);
      if (call) calls.push(call);
    }
    return calls.length > 0 ? calls : null;
  } catch {
    return null;
  }
}

/** Strategy 3: scan lines for "METHOD /path" patterns. No body data. */
function tryHeuristic(text: string): ParsedCall[] {
  const calls: ParsedCall[] = [];
  // Match lines like: POST /projects/hex/cards
  // or: "method": "POST", "path": "/projects/..."
  const linePattern = /\b(GET|POST|PATCH|DELETE)\s+(\/[^\s"',)}]+)/g;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(text)) !== null) {
    const method = match[1];
    const path = match[2].replace(/[,;.)"'\]]+$/, ""); // strip trailing punctuation
    if (path.startsWith("/")) {
      calls.push({ method, path, index: calls.length });
    }
  }
  return calls;
}

/**
 * Parse raw model output into ParsedCall[].
 * Always returns a ParseResult; never throws.
 */
export function parse(rawText: string): ParseResult {
  // Strategy 1
  const fromBlock = tryJsonBlock(rawText);
  if (fromBlock && fromBlock.length > 0) {
    return { success: true, calls: fromBlock, rawText, parseStrategy: "json_block" };
  }

  // Strategy 2
  const fromArray = tryJsonArray(rawText);
  if (fromArray && fromArray.length > 0) {
    return { success: true, calls: fromArray, rawText, parseStrategy: "json_array" };
  }

  // Strategy 3
  const fromHeuristic = tryHeuristic(rawText);
  if (fromHeuristic.length > 0) {
    return { success: true, calls: fromHeuristic, rawText, parseStrategy: "heuristic" };
  }

  // Strategy 4
  return { success: false, calls: [], rawText, parseStrategy: "failed" };
}
