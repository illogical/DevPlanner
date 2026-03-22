import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  // Remove temp files written by global-setup
  const markerFile = path.join(process.cwd(), '.playwright-vault-path');
  const envTestFile = path.join(process.cwd(), '.env.test');

  if (fs.existsSync(markerFile)) {
    const vaultDir = fs.readFileSync(markerFile, 'utf-8').trim();
    try {
      fs.rmSync(vaultDir, { recursive: true, force: true });
      console.log(`\n[teardown] Removed test vault: ${vaultDir}`);
    } catch {
      console.warn(`[teardown] Could not remove test vault: ${vaultDir}`);
    }
    fs.rmSync(markerFile, { force: true });
  }

  if (fs.existsSync(envTestFile)) {
    fs.rmSync(envTestFile, { force: true });
  }
}
