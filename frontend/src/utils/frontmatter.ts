/**
 * Parses YAML frontmatter from a Markdown document.
 * Extracts key: value pairs between --- delimiters.
 * Filters empty values ([], "", null, undefined).
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const lines = content.split('\n');

  if (lines[0].trim() !== '---') {
    return { frontmatter: null, body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const fmLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join('\n').replace(/^\n/, '');

  const frontmatter: Record<string, unknown> = {};
  for (const line of fmLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    if (!key) continue;

    // Parse value
    let value: unknown = rawVal;
    if (rawVal === 'null' || rawVal === '~') {
      value = null;
    } else if (rawVal === 'true') {
      value = true;
    } else if (rawVal === 'false') {
      value = false;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      // Simple array: [a, b, c]
      // Note: does not handle quoted values containing commas (e.g. ["a, b"])
      const inner = rawVal.slice(1, -1).trim();
      value = inner ? inner.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else if (!isNaN(Number(rawVal)) && rawVal !== '') {
      value = Number(rawVal);
    } else {
      // Strip surrounding quotes
      value = rawVal.replace(/^["']|["']$/g, '');
    }

    // Filter empty values
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }

    frontmatter[key] = value;
  }

  return {
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
    body,
  };
}
