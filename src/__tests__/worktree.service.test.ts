import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { WorktreeService } from '../services/worktree.service';

/**
 * WorktreeService tests.
 *
 * These tests use an in-process git repo for worktree operations.
 * They require git to be installed on the host.
 */
describe('WorktreeService', () => {
  let tempDir: string;
  let repoPath: string;
  let worktreeService: WorktreeService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'devplanner-worktree-test-'));
    repoPath = join(tempDir, 'repo');
    await mkdir(repoPath, { recursive: true });

    // Initialize a bare git repository with an initial commit
    const initResult = Bun.spawnSync(['git', 'init'], { cwd: repoPath });
    if (initResult.exitCode !== 0) {
      throw new Error('git init failed — is git installed?');
    }

    // Configure git identity (required for commit)
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: repoPath });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: repoPath });

    // Add an initial commit (required to create worktrees)
    await writeFile(join(repoPath, 'README.md'), '# Test Repo');
    Bun.spawnSync(['git', 'add', '.'], { cwd: repoPath });
    Bun.spawnSync(['git', 'commit', '-m', 'Initial commit'], { cwd: repoPath });

    worktreeService = new WorktreeService(join(tempDir, 'worktrees'));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateRepo', () => {
    test('returns true for a valid git repository', () => {
      expect(worktreeService.validateRepo(repoPath)).toBe(true);
    });

    test('returns false for a non-existent path', () => {
      expect(worktreeService.validateRepo('/nonexistent/path')).toBe(false);
    });

    test('returns false for a directory that is not a git repository', async () => {
      const notARepo = join(tempDir, 'not-a-repo');
      await mkdir(notARepo, { recursive: true });
      expect(worktreeService.validateRepo(notARepo)).toBe(false);
    });
  });

  describe('branchExists', () => {
    test('returns false when branch does not exist', async () => {
      const exists = await worktreeService.branchExists(repoPath, 'card/my-feature');
      expect(exists).toBe(false);
    });

    test('returns true after branch is created', async () => {
      Bun.spawnSync(['git', 'branch', 'card/my-feature'], { cwd: repoPath });
      const exists = await worktreeService.branchExists(repoPath, 'card/my-feature');
      expect(exists).toBe(true);
    });
  });

  describe('create', () => {
    test('creates a worktree with the expected branch', async () => {
      const result = await worktreeService.create(repoPath, 'test-project', 'my-card');

      expect(result.branch).toBe('card/my-card');
      expect(result.worktreePath).toContain('my-card');

      // Verify the worktree was actually created
      const { existsSync } = await import('fs');
      expect(existsSync(result.worktreePath)).toBe(true);
    });

    test('creates a worktree at the deterministic path', async () => {
      const result = await worktreeService.create(repoPath, 'test-project', 'my-card');
      const expectedPath = join(tempDir, 'worktrees', 'test-project', 'my-card');
      expect(result.worktreePath).toBe(expectedPath);
    });
  });

  describe('list', () => {
    test('returns at least the main worktree', async () => {
      const worktrees = await worktreeService.list(repoPath);
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
    });

    test('includes a created worktree in the list', async () => {
      const { worktreePath } = await worktreeService.create(repoPath, 'test-project', 'test-card');
      const worktrees = await worktreeService.list(repoPath);

      const found = worktrees.find((w) => w.path === worktreePath);
      expect(found).toBeDefined();
      expect(found?.branch).toBe('card/test-card');
    });
  });

  describe('remove', () => {
    test('removes a created worktree', async () => {
      const { worktreePath } = await worktreeService.create(repoPath, 'test-project', 'rm-card');

      await worktreeService.remove(repoPath, worktreePath, 'card/rm-card');

      const { existsSync } = await import('fs');
      expect(existsSync(worktreePath)).toBe(false);
    });
  });
});
