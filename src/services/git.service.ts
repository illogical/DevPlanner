import * as path from 'path';
import { resolve } from 'path';

export type GitState =
  | 'clean'
  | 'modified'
  | 'staged'
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
  if (staged) return 'staged';
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
    const line = result.stdout.trim();
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
    const result = runGit(['reset', 'HEAD', '--', relativePath], this.vaultPath);
    if (result.exitCode !== 0) {
      throw { error: 'GIT_ERROR', message: result.stderr.trim() || 'git reset failed' };
    }
    return this.getStatus(relativePath);
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
}
