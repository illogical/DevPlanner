/**
 * Converts a vault artifact URL (artifact viewer format) to a DevPlanner
 * diff viewer URL with the relative vault path as the `left` query param.
 *
 * Both the vault link URL and artifactBaseUrl use a `path` query parameter
 * containing a URL-encoded relative path within the artifact base directory.
 *
 * Example:
 *   vaultLinkUrl  = "https://viewer.example.com/view?path=10-Projects%2Fmy-project%2Fmy-card%2Ffile.md"
 *   artifactBaseUrl = "https://viewer.example.com/view?path=10-Projects"
 *   → relativePath = "my-project/my-card/file.md"
 *   → return "/diff?left=my-project%2Fmy-card%2Ffile.md"
 */
export function buildDiffUrl(vaultLinkUrl: string, artifactBaseUrl: string): string {
  const linkUrl = new URL(vaultLinkUrl);
  const baseUrl = new URL(artifactBaseUrl);

  const fullPath = decodeURIComponent(linkUrl.searchParams.get('path') ?? '');
  const basePath = decodeURIComponent(baseUrl.searchParams.get('path') ?? '');

  const relativePath = fullPath.startsWith(basePath + '/')
    ? fullPath.slice(basePath.length + 1)
    : fullPath;

  return `/diff?left=${encodeURIComponent(relativePath)}`;
}
