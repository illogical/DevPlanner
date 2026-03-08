/**
 * Parses a vault filename into a human-readable title and timestamp.
 * Pattern: 2026-01-15_14-30-00-feature-name.md
 * → { title: "feature name", stamp: "2026-01-15 14:30" }
 * Falls back to raw filename (without .md) for non-matching filenames.
 */
export function parseVaultFilename(name: string): { title: string; stamp: string | null } {
  // Remove .md extension
  const base = name.endsWith('.md') ? name.slice(0, -3) : name;

  // Pattern: YYYY-MM-DD_HH-MM-SS[-title] or YYYY-MM-DD_HH-MM-SS_TITLE
  const match = base.match(
    /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})[-_]?(.*)$/
  );

  if (!match) {
    return { title: base, stamp: null };
  }

  const [, date, hh, mm, , rest] = match;
  const stamp = `${date} ${hh}:${mm}`;
  const title = rest
    ? rest
        .toLowerCase()
        .replace(/[-_]+/g, ' ')
        .trim()
    : base;

  return { title, stamp };
}
