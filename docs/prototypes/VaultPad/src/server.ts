import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildEditorUrl, normalizeRelPath, safeResolve as safeResolvePath, toRel as toRelPath } from "./lib";

const PORT = Number(process.env.PORT ?? 17104);
const HOST = process.env.HOST ?? "0.0.0.0";
const VAULT_ROOT = path.resolve(process.env.VAULT_ROOT ?? "/vault");
const BASE_URL = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const LOG_FILE = process.env.LOG_FILE ?? path.join(VAULT_ROOT, ".vaultpad.log");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const execFileAsync = promisify(execFile);

async function logLine(message: string) {
  try {
    await appendFile(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // ignore
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function serveStatic(fileName: string, contentType: string) {
  const fp = path.join(PUBLIC_DIR, fileName);
  const text = await readFile(fp, "utf8");
  return new Response(text, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

type TreeFile = { name: string; path: string; updatedAt: string };
type TreeFolder = { name: string; path: string; parentPath: string; count: number; files: TreeFile[] };
type TreeError = { op: "readdir" | "stat"; relPath: string; code: string; message: string };

type GitState = "clean" | "modified" | "staged" | "modified-staged" | "untracked" | "ignored" | "outside-repo" | "unknown";

function isTransientFsError(code?: string) {
  return code === "EDEADLK" || code === "EAGAIN" || code === "EBUSY";
}

async function withFsRetry<T>(fn: () => Promise<T>, attempts = 4, baseDelayMs = 60): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      const e = error as NodeJS.ErrnoException;
      if (!isTransientFsError(e?.code) || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

function mapPorcelain(xy: string): GitState {
  const x = xy[0] ?? " ";
  const y = xy[1] ?? " ";
  if (xy === "??") return "untracked";
  if (xy === "!!") return "ignored";
  const staged = x !== " ";
  const modified = y !== " ";
  if (staged && modified) return "modified-staged";
  if (staged) return "staged";
  if (modified) return "modified";
  return "clean";
}

async function gitStatusForPath(relPath: string): Promise<GitState> {
  try {
    const normalized = normalizeRelPath(relPath);
    const { stdout } = await execFileAsync("git", ["-C", VAULT_ROOT, "status", "--porcelain=v1", "--", normalized]);
    const line = stdout
      .split(/\r?\n/)
      .map((l) => l.replace(/\r$/, ""))
      .find((l) => l.length > 0);
    if (!line) return "clean";
    return mapPorcelain(line.slice(0, 2));
  } catch (error) {
    const msg = String((error as Error).message || "");
    if (msg.includes("not a git repository")) return "outside-repo";
    return "unknown";
  }
}

async function gitStatusesForPaths(paths: string[]) {
  const out: Record<string, GitState> = {};
  await Promise.all(paths.map(async (p) => { out[p] = await gitStatusForPath(p); }));
  return out;
}

async function gitStagePath(relPath: string) {
  const normalized = normalizeRelPath(relPath);
  await execFileAsync("git", ["-C", VAULT_ROOT, "add", "--", normalized]);
}

async function gitUnstagePath(relPath: string) {
  const normalized = normalizeRelPath(relPath);
  await execFileAsync("git", ["-C", VAULT_ROOT, "reset", "HEAD", "--", normalized]);
}

async function gitDiscardUnstagedPath(relPath: string) {
  const normalized = normalizeRelPath(relPath);
  try {
    await execFileAsync("git", ["-C", VAULT_ROOT, "restore", "--worktree", "--", normalized]);
  } catch {
    await execFileAsync("git", ["-C", VAULT_ROOT, "checkout", "--", normalized]);
  }
}

async function gitCommitPath(relPath: string, message: string) {
  const normalized = normalizeRelPath(relPath);
  const { stdout } = await execFileAsync("git", ["-C", VAULT_ROOT, "commit", "-m", message, "--", normalized]);
  return stdout.trim();
}

async function buildTree(root: string): Promise<{ folders: TreeFolder[]; errors: TreeError[] }> {
  const roots = ["00-Inbox", "05-Daily", "10-Projects", "20-Knowledge", "30-Ideas", "40-Prompts"];
  const folders: TreeFolder[] = [];
  const errors: TreeError[] = [];

  async function walk(relDir: string, parentPath: string) {
    const abs = path.join(root, relDir);
    let entries;
    try {
      entries = await withFsRetry(() => readdir(abs, { withFileTypes: true }));
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      errors.push({ op: "readdir", relPath: relDir, code: e?.code || "UNKNOWN", message: String(e?.message || error) });
      return;
    }

    const files: TreeFile[] = [];
    const childDirs: string[] = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        childDirs.push(ent.name);
        continue;
      }
      if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.md')) continue;
      const fp = path.join(abs, ent.name);
      try {
        const st = await withFsRetry(() => stat(fp));
        files.push({
          name: ent.name,
          path: toRelPath(root, fp),
          updatedAt: st.mtime.toISOString(),
        });
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        const relPath = `${relDir}/${ent.name}`;
        errors.push({ op: "stat", relPath, code: e?.code || "UNKNOWN", message: String(e?.message || error) });
      }
    }

    files.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    folders.push({
      name: path.basename(relDir),
      path: relDir,
      parentPath,
      count: files.length,
      files,
    });

    childDirs.sort((a, b) => a.localeCompare(b));
    for (const child of childDirs) {
      const childRel = `${relDir}/${child}`;
      await walk(childRel, relDir);
    }
  }

  for (const rootDir of roots) {
    await walk(rootDir, "");
  }

  return { folders, errors };
}


const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    await logLine(`${req.method} ${url.pathname}${url.search}`);

    const pathname = url.pathname.startsWith("/md/") ? url.pathname.slice(3) : url.pathname;

    if (pathname === "/" || pathname === "/editor" || pathname === "/view") {
      return serveStatic("index.html", "text/html; charset=utf-8");
    }
    if (pathname === "/client.js") {
      return serveStatic("client.js", "application/javascript; charset=utf-8");
    }
    if (pathname === "/client.css") {
      return serveStatic("client.css", "text/css; charset=utf-8");
    }
    if (pathname === "/favicon.svg") {
      return serveStatic("favicon.svg", "image/svg+xml; charset=utf-8");
    }

    if (pathname === "/health") {
      return json({ ok: true, service: "vaultpad", port: PORT, vaultRoot: VAULT_ROOT, baseUrl: BASE_URL, time: new Date().toISOString() });
    }

    if (pathname === "/api/client-log" && req.method === "POST") {
      try {
        const body = (await req.json()) as { event?: string; data?: unknown; href?: string; ua?: string };
        await logLine(`CLIENT ${body.event ?? "unknown"} href=${body.href ?? ""} ua=${(body.ua ?? "").toString().slice(0, 80)} data=${JSON.stringify(body.data ?? {})}`);
        return json({ ok: true });
      } catch (error) {
        await logLine(`ERROR POST /api/client-log ${String((error as Error).message)}`);
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (pathname === "/api/tree" && req.method === "GET") {
      try {
        const tree = await buildTree(VAULT_ROOT);
        if (tree.errors.length) {
          const sample = tree.errors.slice(0, 8).map((e) => `${e.op}:${e.relPath}:${e.code}`).join(", ");
          await logLine(`WARN GET /api/tree partial folders=${tree.folders.length} errors=${tree.errors.length} sample=${sample}`);
        }
        return json(tree);
      } catch (error) {
        await logLine(`ERROR GET /api/tree ${String((error as Error).message)}`);
        return json({ error: (error as Error).message }, 500);
      }
    }

    if (pathname === "/api/link" && req.method === "GET") {
      const p = url.searchParams.get("path");
      if (!p) return json({ error: "Missing path" }, 400);
      const rel = normalizeRelPath(p);
      return json({ url: buildEditorUrl(BASE_URL, rel), path: rel });
    }

    if (pathname === "/api/file" && req.method === "GET") {
      const p = url.searchParams.get("path");
      if (!p) return json({ error: "Missing path" }, 400);
      const rel = normalizeRelPath(p);
      try {
        const abs = safeResolvePath(VAULT_ROOT, rel);
        const content = await readFile(abs, "utf8");
        const info = await stat(abs);
        return json({ path: toRelPath(VAULT_ROOT, abs), content, updatedAt: info.mtime.toISOString() });
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        const code = e?.code || "UNKNOWN";
        let abs = "";
        try {
          abs = safeResolvePath(VAULT_ROOT, rel);
        } catch {
          abs = "<unsafe-path>";
        }
        await logLine(`ERROR GET /api/file path=${rel} abs=${abs} code=${code} message=${String(e?.message || error)}`);

        if (code === "ENOENT") return json({ error: "File not found", code, path: rel }, 404);
        if (code === "EDEADLK" || code === "EAGAIN") return json({ error: "File temporarily locked by sync provider", code, path: rel }, 423);
        if (code === "EACCES" || code === "EPERM") return json({ error: "Permission denied", code, path: rel }, 403);

        return json({ error: String(e?.message || error), code, path: rel }, 500);
      }
    }

    if (pathname === "/api/file" && req.method === "PUT") {
      try {
        const body = (await req.json()) as { path?: string; content?: string };
        if (!body.path) return json({ error: "Missing path" }, 400);
        const abs = safeResolvePath(VAULT_ROOT, body.path);
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, body.content ?? "", "utf8");
        const rel = toRelPath(VAULT_ROOT, abs);
        return json({ ok: true, path: rel, url: buildEditorUrl(BASE_URL, rel) });
      } catch (error) {
        await logLine(`ERROR PUT /api/file ${String((error as Error).message)}`);
        return json({ error: (error as Error).message }, 400);
      }
    }


    if (pathname === "/api/git/status" && req.method === "GET") {
      const p = url.searchParams.get("path");
      if (!p) return json({ error: "Missing path" }, 400);
      const rel = normalizeRelPath(p);
      const state = await gitStatusForPath(rel);
      return json({ path: rel, state });
    }

    if (pathname === "/api/git/statuses" && req.method === "POST") {
      try {
        const body = (await req.json()) as { paths?: string[] };
        const raw = body.paths ?? [];
        const paths = raw.map((p) => normalizeRelPath(p)).filter(Boolean);
        const statuses = await gitStatusesForPaths(paths);
        return json({ statuses });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }


    if (pathname === "/api/git/stage" && req.method === "POST") {
      try {
        const body = (await req.json()) as { path?: string };
        if (!body.path) return json({ error: "Missing path" }, 400);
        const rel = normalizeRelPath(body.path);
        await gitStagePath(rel);
        const state = await gitStatusForPath(rel);
        return json({ ok: true, path: rel, state });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (pathname === "/api/git/unstage" && req.method === "POST") {
      try {
        const body = (await req.json()) as { path?: string };
        if (!body.path) return json({ error: "Missing path" }, 400);
        const rel = normalizeRelPath(body.path);
        await gitUnstagePath(rel);
        const state = await gitStatusForPath(rel);
        return json({ ok: true, path: rel, state });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (pathname === "/api/git/discard-unstaged" && req.method === "POST") {
      try {
        const body = (await req.json()) as { path?: string };
        if (!body.path) return json({ error: "Missing path" }, 400);
        const rel = normalizeRelPath(body.path);
        await gitDiscardUnstagedPath(rel);
        const state = await gitStatusForPath(rel);
        return json({ ok: true, path: rel, state });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    if (pathname === "/api/git/commit" && req.method === "POST") {
      try {
        const body = (await req.json()) as { path?: string; message?: string };
        if (!body.path) return json({ error: "Missing path" }, 400);
        const message = (body.message ?? '').trim();
        if (!message) return json({ error: "Missing commit message" }, 400);
        const rel = normalizeRelPath(body.path);
        const output = await gitCommitPath(rel, message);
        const state = await gitStatusForPath(rel);
        return json({ ok: true, path: rel, state, output });
      } catch (error) {
        return json({ error: (error as Error).message }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`[vaultpad] listening on http://${HOST}:${PORT}`);
console.log(`[vaultpad] vault root: ${VAULT_ROOT}`);
console.log(`[vaultpad] example link: ${BASE_URL}/editor?path=20-Knowledge/operations/example.md`);

export default server;
