import React from 'react';

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights occurrences of `query` within `text` using <mark> elements.
 * Returns the original text if query is empty.
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const escaped = escapeRegex(query);
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text; // No matches

  return (
    <>
      {parts.map((part, i) => {
        // Check if this part matches the query (case-insensitive)
        const isMatch = part.toLowerCase() === query.toLowerCase();
        return isMatch ? (
          <mark
            key={i}
            className="bg-yellow-500/30 text-yellow-200 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </>
  );
}
