/**
 * Slugify a string for use as a filename or URL component.
 * Converts to lowercase, replaces spaces with hyphens, and keeps only alphanumeric characters and hyphens.
 * 
 * Examples:
 * - "My Card Title!" → "my-card-title"
 * - "User Authentication System" → "user-authentication-system"
 * - "API/Endpoints (v2)" → "api-endpoints-v2"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, ' ') // Replace non-alphanumeric characters with spaces
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading and trailing hyphens
}
