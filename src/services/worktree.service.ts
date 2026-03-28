import { existsSync } from 'fs';
import { join, normalize } from 'path';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

/**
 * Service for managing git worktrees used by card dispatch.
 * Each dispatched card gets its own worktree at a deterministic path,
 * checked out to a branch named `card/<cardSlug>`.
 */
export class WorktreeService {
  private readonly worktreeBase: string;

  constructor(worktreeBase?: string) {
    this.worktreeBase = worktreeBase ?? join(tmpdir(), 'devplanner-dispatch');
  }

  /**
   * Run a git command synchronously and return the result.
   */
  private runGit(
    args: string[],
    cwd: string
  ): { stdout: string; stderr: string; exitCode: number } {
    const proc = Bun.spawnSync(['git', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      stdout: proc.stdout ? new TextDecoder().decode(proc.stdout).trim() : '',
      stderr: proc.stderr ? new TextDecoder().decode(proc.stderr).trim() : '',
      exitCode: proc.exitCode ?? 1,
    };
  }

  /**
   * Check whether a path is inside a git repository.
   */
  validateRepo(repoPath: string): boolean {
    if (!existsSync(repoPath)) return false;
    const result = this.runGit(['rev-parse', '--is-inside-work-tree'], repoPath);
    return result.exitCode === 0;
  }

  /**
   * Check whether a branch already exists in the given repository.
   */
  async branchExists(repoPath: string, branchName: string): Promise<boolean> {
    const result = this.runGit(['branch', '--list', branchName], repoPath);
    return result.exitCode === 0 && result.stdout.length > 0;
  }

  /**
   * Create a new git worktree for the given project/card and return the path.
   * The worktree is created at `{worktreeBase}/{projectSlug}/{cardSlug}`.
   */
  async create(
    repoPath: string,
    projectSlug: string,
    cardSlug: string
  ): Promise<{ worktreePath: string; branch: string }> {
    const branch = `card/${cardSlug}`;
    const worktreePath = join(this.worktreeBase, projectSlug, cardSlug);

    // Ensure parent directory exists
    await mkdir(join(this.worktreeBase, projectSlug), { recursive: true });

    // Remove stale worktree directory if it exists (leftover from a previous run)
    if (existsSync(worktreePath)) {
      await rm(worktreePath, { recursive: true, force: true });
      // Also prune stale worktree references from git
      this.runGit(['worktree', 'prune'], repoPath);
    }

    const result = this.runGit(
      ['worktree', 'add', worktreePath, '-b', branch],
      repoPath
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create git worktree: ${result.stderr || result.stdout}`
      );
    }

    return { worktreePath, branch };
  }

  /**
   * Remove a worktree and optionally delete its branch.
   */
  async remove(
    repoPath: string,
    worktreePath: string,
    branch?: string
  ): Promise<void> {
    // Remove the worktree
    const result = this.runGit(
      ['worktree', 'remove', worktreePath, '--force'],
      repoPath
    );

    if (result.exitCode !== 0) {
      // Try manual cleanup if git command failed
      try {
        await rm(worktreePath, { recursive: true, force: true });
        this.runGit(['worktree', 'prune'], repoPath);
      } catch {
        // Best-effort cleanup
      }
    }

    // Optionally delete the branch
    if (branch) {
      this.runGit(['branch', '-D', branch], repoPath);
    }
  }

  /**
   * List all worktrees for the given repository.
   */
  async list(
    repoPath: string
  ): Promise<Array<{ path: string; branch: string; head: string }>> {
    const result = this.runGit(['worktree', 'list', '--porcelain'], repoPath);
    if (result.exitCode !== 0) return [];

    const worktrees: Array<{ path: string; branch: string; head: string }> = [];
    let current: Partial<{ path: string; branch: string; head: string }> = {};

    for (const line of result.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current as { path: string; branch: string; head: string });
        current = { path: normalize(line.slice('worktree '.length)) };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice('branch '.length).replace('refs/heads/', '');
      } else if (line === '') {
        if (current.path) {
          worktrees.push({
            path: current.path,
            branch: current.branch ?? '',
            head: current.head ?? '',
          });
          current = {};
        }
      }
    }

    if (current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch ?? '',
        head: current.head ?? '',
      });
    }

    return worktrees;
  }
}
