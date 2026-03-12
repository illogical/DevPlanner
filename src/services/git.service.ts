import * as path from 'path';
import { resolve } from 'path';

export type GitState =
  | 'clean'
  | 'modified'
  | 'staged'
  | 'staged-new'       // new file staged for the first time (no HEAD version exists)
  | 'modified-staged'
  | 'untracked'
  | 'ignored'
  | 'outside-repo'
  | 'unknown';

function runGit(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(['git', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
    exitCode: proc.exitCode ?? 1,
  };
}

function parsePorcelainStatus(line: string): GitState {
  if (!line || line.length < 2) return 'clean';
  const xy = line.substring(0, 2);
  if (xy === '??') return 'untracked';
  if (xy === '!!') return 'ignored';
  const x = xy[0]; // index (staged)
  const y = xy[1]; // worktree (unstaged)
  const staged = x !== ' ' && x !== '?';
  const modified = y !== ' ' && y !== '?';
  if (staged && modified) return 'modified-staged';
  if (staged) return x === 'A' ? 'staged-new' : 'staged';
  if (modified) return 'modified';
  return 'clean';
}

export class GitService {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = resolve(vaultPath);
  }

  private validatePath(relativePath: string): string {
    const resolvedFile = resolve(this.vaultPath, relativePath);
    if (!resolvedFile.startsWith(this.vaultPath + path.sep) && resolvedFile !== this.vaultPath) {
      throw { error: 'INVALID_PATH', message: 'Path traversal detected.' };
    }
    return resolvedFile;
  }

  async getStatus(relativePath: string): Promise<GitState> {
    this.validatePath(relativePath);
    const result = runGit(['status', '--porcelain=v1', '--', relativePath], this.vaultPath);
    if (result.exitCode !== 0) {
      if (result.stderr.includes('not a git repository')) return 'outside-repo';
      return 'unknown';
    }
    // Use trimEnd() (not trim()) to preserve the leading XY status characters.
    // Git porcelain format is "XY <file>" where X=index and Y=worktree.
    // A leading space means the index is unchanged; trim() would strip it and
    // misidentify a working-tree modification as a staged change.
    const line = result.stdout.trimEnd();
    if (!line) return 'clean';
    return parsePorcelainStatus(line);
  }

  async getStatuses(paths: string[]): Promise<Record<string, GitState>> {
    const results: Record<string, GitState> = {};
    await Promise.all(
      paths.map(async (p) => {
        results[p] = await this.getStatus(p);
      })
    );
    return results;
  }

  async stage(relativePath: string): Promise<GitState> {
    this.validatePath(relativePath);
    const result = runGit(['add', '--', relativePath], this.vaultPath);
    if (result.exitCode !== 0) {
      throw { error: 'GIT_ERROR', message: result.stderr.trim() || 'git add failed' };
    }
    return this.getStatus(relativePath);
  }

  async unstage(relativePath: string): Promise<GitState> {
    this.validatePath(relativePath);
    // Prefer `git restore --staged` (git 2.23+); fall back to `git reset HEAD` for
    // older git. Both handle the common case of unstaging from a repo that has commits.
    // For a brand-new repo with no commits yet, `git reset HEAD` fails because HEAD
    // does not resolve; `git restore --staged` handles that case correctly.
    let result = runGit(['restore', '--staged', '--', relativePath], this.vaultPath);
    if (result.exitCode !== 0) {
      result = runGit(['reset', 'HEAD', '--', relativePath], this.vaultPath);
      if (result.exitCode !== 0) {
        throw { error: 'GIT_ERROR', message: result.stderr.trim() || 'git unstage failed' };
      }
    }
    return this.getStatus(relativePath);
  }

  async getFileAtRef(relativePath: string, ref: string): Promise<string> {
    this.validatePath(relativePath);
    // Validate ref to prevent command injection via unexpected values.
    // Allowed: 'HEAD', stage indices ':0'–':3', and 40-char commit SHAs.
    if (!/^(HEAD|:[0-3]|[0-9a-f]{40})$/.test(ref)) {
      throw { error: 'INVALID_REF', message: `Invalid git ref: ${ref}` };
    }
    // ref can be 'HEAD' (last commit) or ':0' (staging area / index)
    const gitPath = `${ref}:${relativePath}`;
    const result = runGit(['show', gitPath], this.vaultPath);
    if (result.exitCode !== 0) {
      throw { error: 'GIT_NOT_FOUND', message: result.stderr.trim() || `No content at ref ${ref}` };
    }
    return result.stdout;
  }

  async discardUnstaged(relativePath: string): Promise<GitState> {
    this.validatePath(relativePath);
    // Try git restore first, fall back to git checkout
    const result = runGit(['restore', '--worktree', '--', relativePath], this.vaultPath);
    if (result.exitCode !== 0) {
      runGit(['checkout', '--', relativePath], this.vaultPath);
    }
    return this.getStatus(relativePath);
  }

  async commit(relativePath: string, message: string): Promise<{ state: GitState; output: string }> {
    this.validatePath(relativePath);
    const result = runGit(['commit', '-m', message, '--', relativePath], this.vaultPath);
    const state = await this.getStatus(relativePath);
    return { state, output: result.stdout + result.stderr };
  }

  async getDiff(relativePath: string, mode: 'working' | 'staged'): Promise<string> {
    this.validatePath(relativePath);
    const args = mode === 'staged'
      ? ['diff', '--cached', '--', relativePath]
      : ['diff', '--', relativePath];
    const result = runGit(args, this.vaultPath);
    return result.stdout;
  }

  async getFileAtRef(relativePath: string, ref: 'staged' | 'HEAD'): Promise<string> {
    this.validatePath(relativePath);
    // `git show HEAD:<path>` requires path relative to repo root, not cwd.
    // `git rev-parse --show-prefix` returns the prefix of cwd relative to root (e.g. "10-Projects/").
    const prefixResult = runGit(['rev-parse', '--show-prefix'], this.vaultPath);
    const prefix = prefixResult.stdout.trim(); // trailing slash included, or "" at root
    const gitRelPath = prefix ? `${prefix}${relativePath}` : relativePath;
    const gitRef = ref === 'staged' ? `:${gitRelPath}` : `HEAD:${gitRelPath}`;
    const result = runGit(['show', gitRef], this.vaultPath);
    if (result.exitCode !== 0) {
      // New file: exists on disk but not yet in HEAD/staged — treat as empty (all lines will appear as added)
      if (result.stderr.includes('exists on disk, but not in') || result.stderr.includes('does not exist in')) {
        return '';
      }
      throw { error: 'GIT_ERROR', message: result.stderr.trim() };
    }
    return result.stdout;
  }
}
