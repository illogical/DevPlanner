/**
 * Converts a vault artifact URL (artifact viewer format) to a DevPlanner
 * diff viewer URL with the relative vault path as the `left` query param.
 *
 * Both the vault link URL and artifactBaseUrl store their path in a `path`
 * query parameter. The URL API (`searchParams.get`) automatically URL-decodes
 * the parameter value, so the extracted strings are plain (decoded) paths.
 *
 * Example:
 *   vaultLinkUrl  = "https://viewer.example.com/view?path=10-Projects%2Fmy-project%2Fmy-card%2Ffile.md"
 *   artifactBaseUrl = "https://viewer.example.com/view?path=10-Projects"
 *   → fullPath   (decoded) = "10-Projects/my-project/my-card/file.md"
 *   → basePath   (decoded) = "10-Projects"
 *   → relativePath         = "my-project/my-card/file.md"
 *   → return "/diff?left=my-project%2Fmy-card%2Ffile.md"
 */
export function buildDiffUrl(vaultLinkUrl: string, artifactBaseUrl: string): string {
  const linkUrl = new URL(vaultLinkUrl);
  const baseUrl = new URL(artifactBaseUrl);

  // searchParams.get() returns the already-decoded value; the decodeURIComponent
  // call is a safety guard in case the server doubly-encoded the path value.
  const fullPath = decodeURIComponent(linkUrl.searchParams.get('path') ?? '');
  const basePath = decodeURIComponent(baseUrl.searchParams.get('path') ?? '');

  const relativePath = fullPath.startsWith(basePath + '/')
    ? fullPath.slice(basePath.length + 1)
    : fullPath;

  return `/diff?left=${encodeURIComponent(relativePath)}`;
}
