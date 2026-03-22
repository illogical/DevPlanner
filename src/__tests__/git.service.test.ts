import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitService } from '../services/git.service';

/** Run a synchronous git command in a directory, returning stdout. */
function runGitSync(args: string[], cwd: string): string {
  const proc = Bun.spawnSync(['git', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
}

/** Check whether the git binary is available. */
function gitAvailable(): boolean {
  try {
    const proc = Bun.spawnSync(['git', '--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

const HAS_GIT = gitAvailable();

describe('GitService', () => {
  let tmpDir: string;
  let svc: GitService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-git-test-'));
    svc = new GitService(tmpDir);

    if (HAS_GIT) {
      runGitSync(['init'], tmpDir);
      runGitSync(['config', 'user.email', 'test@example.com'], tmpDir);
      runGitSync(['config', 'user.name', 'Test User'], tmpDir);
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getStatus
  // ──────────────────────────────────────────────────────────────────────────

  test('getStatus returns outside-repo when not a git repo', async () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-nogit-'));
    try {
      const noGitSvc = new GitService(noGitDir);
      fs.writeFileSync(path.join(noGitDir, 'test.md'), 'hello');
      const status = await noGitSvc.getStatus('test.md');
      expect(status).toBe('outside-repo');
    } finally {
      fs.rmSync(noGitDir, { recursive: true, force: true });
    }
  });

  test('getStatus returns untracked for a new file', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'new.md'), 'content');
    const status = await svc.getStatus('new.md');
    expect(status).toBe('untracked');
  });

  test('getStatus returns staged-new after git add of new file', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    const status = await svc.getStatus('file.md');
    expect(status).toBe('staged-new');
  });

  test('getStatus returns clean after commit', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    const status = await svc.getStatus('file.md');
    expect(status).toBe('clean');
  });

  test('getStatus returns modified after editing a committed file', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    const status = await svc.getStatus('file.md');
    expect(status).toBe('modified');
  });

  test('getStatus returns modified-staged when file has both staged and unstaged changes', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    runGitSync(['add', 'file.md'], tmpDir);        // stage v2
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v3'); // additional unstaged change
    const status = await svc.getStatus('file.md');
    expect(status).toBe('modified-staged');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // stage / unstage
  // ──────────────────────────────────────────────────────────────────────────

  test('stage transitions untracked → staged-new', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'content');
    const newState = await svc.stage('file.md');
    expect(newState).toBe('staged-new');
  });

  test('unstage (from staged-only state) transitions staged → untracked for new file', async () => {
    if (!HAS_GIT) return;
    // For a brand-new file that was staged but never committed, unstaging
    // should return it to untracked state.
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'content');
    await svc.stage('file.md');
    const newState = await svc.unstage('file.md');
    expect(newState).toBe('untracked');
  });

  test('unstage transitions staged → modified after first commit', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    // Stage a second change
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    await svc.stage('file.md');
    expect(await svc.getStatus('file.md')).toBe('staged');
    // Unstage
    const newState = await svc.unstage('file.md');
    expect(newState).toBe('modified');
  });

  test('unstage transitions modified-staged → modified', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    // Create modified-staged: stage v2, then add further unstaged change v3
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    runGitSync(['add', 'file.md'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v3');
    expect(await svc.getStatus('file.md')).toBe('modified-staged');
    // Unstage: should remove the staged part, leaving v3 as unstaged
    const newState = await svc.unstage('file.md');
    expect(newState).toBe('modified');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // discardUnstaged
  // ──────────────────────────────────────────────────────────────────────────

  test('discardUnstaged reverts working-tree changes back to HEAD', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    expect(await svc.getStatus('file.md')).toBe('modified');
    const newState = await svc.discardUnstaged('file.md');
    expect(newState).toBe('clean');
    // fs.readFileSync is safe here: discardUnstaged awaits the git operation
    // before returning, so the working tree is already restored at this point.
    const content = fs.readFileSync(path.join(tmpDir, 'file.md'), 'utf8');
    expect(content).toBe('v1');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getFileAtRef
  // ──────────────────────────────────────────────────────────────────────────

  test('getFileAtRef returns committed content at HEAD', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'committed content');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    // Modify working tree — HEAD should still return original
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'working tree content');
    const headContent = await svc.getFileAtRef('file.md', 'HEAD');
    expect(headContent).toBe('committed content');
  });

  test('getFileAtRef returns staged content at :0', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v1');
    runGitSync(['add', 'file.md'], tmpDir);
    runGitSync(['commit', '-m', 'init'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v2');
    runGitSync(['add', 'file.md'], tmpDir);
    // Further modify working tree — :0 should return staged (v2)
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'v3');
    const stagedContent = await svc.getFileAtRef('file.md', ':0');
    expect(stagedContent).toBe('v2');
  });

  test('getFileAtRef throws GIT_NOT_FOUND when ref does not exist', async () => {
    if (!HAS_GIT) return;
    fs.writeFileSync(path.join(tmpDir, 'file.md'), 'content');
    // No commits yet → HEAD does not resolve
    let threw = false;
    try {
      await svc.getFileAtRef('file.md', 'HEAD');
    } catch (err: any) {
      threw = true;
      expect(err.error).toBe('GIT_NOT_FOUND');
    }
    expect(threw).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Path validation
  // ──────────────────────────────────────────────────────────────────────────

  test('stage throws INVALID_PATH for path traversal', async () => {
    let threw = false;
    try {
      await svc.stage('../../../etc/passwd');
    } catch (err: any) {
      threw = true;
      expect(err.error).toBe('INVALID_PATH');
    }
    expect(threw).toBe(true);
  });

  test('unstage throws INVALID_PATH for path traversal', async () => {
    let threw = false;
    try {
      await svc.unstage('../secret.txt');
    } catch (err: any) {
      threw = true;
      expect(err.error).toBe('INVALID_PATH');
    }
    expect(threw).toBe(true);
  });

  test('getFileAtRef throws INVALID_PATH for path traversal', async () => {
    let threw = false;
    try {
      await svc.getFileAtRef('../../../etc/passwd', 'HEAD');
    } catch (err: any) {
      threw = true;
      expect(err.error).toBe('INVALID_PATH');
    }
    expect(threw).toBe(true);
  });

  test('getFileAtRef throws INVALID_REF for disallowed ref format', async () => {
    let threw = false;
    try {
      await svc.getFileAtRef('file.md', 'refs/heads/main');
    } catch (err: any) {
      threw = true;
      expect(err.error).toBe('INVALID_REF');
    }
    expect(threw).toBe(true);
  });
});
