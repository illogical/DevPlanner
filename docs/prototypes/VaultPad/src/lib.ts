import path from "node:path";

export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/^\/+/, "");
}

export function safeResolve(vaultRoot: string, relPath: string): string {
  const root = path.resolve(vaultRoot);
  const abs = path.resolve(root, normalizeRelPath(relPath));
  if (!abs.startsWith(root)) throw new Error("Path escapes vault root");
  return abs;
}

export function toRel(vaultRoot: string, absPath: string): string {
  return path.relative(path.resolve(vaultRoot), absPath).replaceAll("\\", "/");
}

export function buildEditorUrl(baseUrl: string, relPath: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const rel = normalizeRelPath(relPath);
  return `${base}/editor?path=${encodeURIComponent(rel)}`;
}

export function editorApiBase(pathname: string): string {
  return pathname.endsWith("/editor") ? pathname.slice(0, -"/editor".length) : "";
}
