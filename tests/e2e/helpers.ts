/**
 * Thin wrappers around the backend API for use in Playwright tests.
 * All paths are relative to ARTIFACT_BASE_PATH on the server.
 */

const API = 'http://localhost:17103/api/vault';

export async function saveVaultFile(relativePath: string, content: string) {
  const res = await fetch(`${API}/file`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath, content }),
  });
  if (!res.ok) throw new Error(`saveVaultFile failed: ${await res.text()}`);
  return res.json();
}

export async function deleteVaultFile(relativePath: string) {
  const res = await fetch(`${API}/file`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath }),
  });
  // Ignore 404 — file may have never been created if test failed early
  if (!res.ok && res.status !== 404) {
    console.warn(`deleteVaultFile(${relativePath}): ${res.status}`);
  }
}

export async function gitStatus(relativePath: string): Promise<string> {
  const res = await fetch(`${API}/git/status?path=${encodeURIComponent(relativePath)}`);
  if (!res.ok) throw new Error(`gitStatus failed: ${await res.text()}`);
  const data = await res.json() as { state: string };
  return data.state;
}

export async function gitUnstage(relativePath: string) {
  const res = await fetch(`${API}/git/unstage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath }),
  });
  if (!res.ok) throw new Error(`gitUnstage failed: ${await res.text()}`);
  return res.json();
}

export async function gitStage(relativePath: string) {
  const res = await fetch(`${API}/git/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath }),
  });
  if (!res.ok) throw new Error(`gitStage failed: ${await res.text()}`);
  return res.json();
}

export async function gitDiscard(relativePath: string) {
  const res = await fetch(`${API}/git/discard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath }),
  });
  if (!res.ok) throw new Error(`gitDiscard failed: ${await res.text()}`);
  return res.json();
}

export async function gitCommit(relativePath: string, message: string) {
  const res = await fetch(`${API}/git/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relativePath, message }),
  });
  if (!res.ok) throw new Error(`gitCommit failed: ${await res.text()}`);
  return res.json();
}

/** Editor URL for a given vault-relative file path */
export function editorUrl(relativePath: string) {
  return `/editor?path=${encodeURIComponent(relativePath)}`;
}

/** Diff viewer URL for git comparison */
export function diffUrl(
  relativePath: string,
  leftRef: 'HEAD' | 'staged',
  rightRef: 'working' | 'staged'
) {
  return `/diff?gitPath=${encodeURIComponent(relativePath)}&leftRef=${leftRef}&rightRef=${rightRef}`;
}
