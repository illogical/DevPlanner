/**
 * Generate a unique project prefix from a project name.
 * Takes the first letter of each word, uppercase, max 4 chars.
 * Single-word names use first 2 letters.
 *
 * If the generated prefix collides with existing ones, tries variations:
 * 1. Use more letters from words (e.g., "My App" -> "MYA")
 * 2. Append digit (e.g., "MA2")
 */
export function generatePrefix(name: string, existingPrefixes: string[] = []): string {
  const words = name.trim().split(/\s+/).filter(w => w.length > 0);

  // Generate base prefix
  let prefix: string;
  if (words.length === 1) {
    prefix = words[0].substring(0, 2).toUpperCase();
  } else {
    prefix = words
      .map(w => w.charAt(0).toUpperCase())
      .join('')
      .substring(0, 4);
  }

  // Check uniqueness
  if (!existingPrefixes.includes(prefix)) {
    return prefix;
  }

  // Variation 1: Use more letters from words
  if (words.length > 1) {
    for (let chars = 2; chars <= 3; chars++) {
      const variation = words
        .map(w => w.substring(0, chars).toUpperCase())
        .join('')
        .substring(0, 4);
      if (!existingPrefixes.includes(variation)) {
        return variation;
      }
    }
  }

  // Variation 2: Append digit
  let counter = 2;
  while (existingPrefixes.includes(`${prefix}${counter}`)) {
    counter++;
  }
  return `${prefix}${counter}`;
}
