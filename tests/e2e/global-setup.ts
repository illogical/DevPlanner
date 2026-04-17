import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Creates a fresh temporary git repository as the test vault and writes
 * `.env.test` so the backend server (started by playwright.config.ts webServer)
 * uses it instead of the production workspace.
 *
 * The vault path is stored in `process.env.TEST_VAULT_PATH` and in a temp
 * file so `global-teardown.ts` can clean it up even across processes.
 */
export default async function globalSetup() {
  const vaultDir = path.join(os.tmpdir(), `devplanner-test-vault-${Date.now()}`);
  fs.mkdirSync(vaultDir, { recursive: true });

  // Initialize a real git repo so all git operations work
  const git = (cmd: string) =>
    execSync(`git ${cmd}`, { cwd: vaultDir, stdio: 'pipe' }).toString().trim();

  git('init');
  git('config user.email "playwright@test.local"');
  git('config user.name "Playwright Test"');

  // Create an initial commit so HEAD exists (required by some git operations)
  const readmePath = path.join(vaultDir, 'README.md');
  fs.writeFileSync(readmePath, '# Test Vault\n');
  git('add README.md');
  git('commit -m "Initial commit"');

  // Write .env.test that overrides the vault path for the test backend
  const envContent = [
    `PORT=17103`,
    `DEVPLANNER_WORKSPACE=${process.env.DEVPLANNER_WORKSPACE ?? path.join(vaultDir, '_kanban')}`,
    `ARTIFACT_BASE_PATH=${vaultDir}`,
    `ARTIFACT_BASE_URL=http://localhost:17103/test-view`,
    `DISABLE_FILE_WATCHER=true`,
    `WEBSOCKET_HEARTBEAT_ENABLED=false`,
  ].join('\n');

  fs.writeFileSync(path.join(process.cwd(), '.env.test'), envContent);

  // Also create the kanban workspace dir to avoid backend startup errors
  fs.mkdirSync(path.join(vaultDir, '_kanban'), { recursive: true });

  // Persist vault path so teardown can find and remove it
  fs.writeFileSync(
    path.join(process.cwd(), '.playwright-vault-path'),
    vaultDir
  );

  console.log(`\n[setup] Test vault: ${vaultDir}`);
  process.env.TEST_VAULT_PATH = vaultDir;
}
