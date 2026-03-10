import { test, expect, type Page } from '@playwright/test';
import { saveVaultFile, deleteVaultFile, gitStage, gitCommit, gitDiscard, gitStatus, editorUrl, diffUrl } from './helpers';

// ---------------------------------------------------------------------------
// Shared selectors
// ---------------------------------------------------------------------------

/** The git status pill in the bottom bar */
const statusPill = (page: Page) => page.locator('[data-testid="git-status-pill"], button[title*="git"], button[title*="Git"]').first();

/** Open the file browser drawer */
const openFileBrowser = async (page: Page) => {
  await page.locator('button[title*="file" i], button[aria-label*="file browser" i], [data-testid="file-browser-toggle"]').first().click();
  await page.waitForSelector('[data-testid="file-browser"], .file-browser, [class*="FileBrowser"]', { timeout: 3000 }).catch(() => {});
};

// ---------------------------------------------------------------------------
// Helper: wait for the git status dot colour to reflect expected state
// ---------------------------------------------------------------------------

const STATE_ARIA: Record<string, string> = {
  untracked: 'Untracked',
  'staged-new': 'New file',
  modified: 'Unstaged',
  staged: 'Staged',
  'modified-staged': 'Partial staged',
  clean: 'Clean',
};

async function waitForGitState(page: Page, expected: string) {
  const label = STATE_ARIA[expected] ?? expected;
  // The GitStatusDot renders an aria-label on the dot/button
  await expect(page.locator(`[aria-label*="${label}" i]`).first()).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Test 1 — untracked → staged-new → commit
// ---------------------------------------------------------------------------

test('untracked → staged-new: Git Actions panel shows Unstage + Commit', async ({ page }) => {
  const filePath = '_playwright-tests/test-new-file.md';

  // Set up: create a new untracked file
  await saveVaultFile(filePath, '# New File\n\nSome content.\n');

  try {
    // Open the file in the editor
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');

    // Verify untracked status
    await waitForGitState(page, 'untracked');

    // Click the git status pill to open the Git Actions panel
    await page.locator('[aria-label*="Untracked" i]').first().click();
    await page.waitForTimeout(300);

    // The panel should show a Stage button
    const stageBtn = page.getByRole('button', { name: /^stage$/i });
    await expect(stageBtn).toBeVisible();

    // Stage the file
    await stageBtn.click();
    await page.waitForTimeout(500);

    // Status should now be staged-new
    await waitForGitState(page, 'staged-new');

    // Open the panel again — should show Unstage and Commit, NOT a diff link
    await page.locator('[aria-label*="New file" i]').first().click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: /^unstage$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();
    // Info note about no previous commit
    await expect(page.getByText(/no previous commit/i)).toBeVisible();
    // No "All changes" or "Staged diff" diff links for staged-new
    await expect(page.getByRole('link', { name: /all changes/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /staged diff/i })).not.toBeVisible();

    // Commit with a message
    await page.getByRole('textbox', { name: /commit message/i }).fill('Add new test file');
    await page.getByRole('button', { name: /^commit$/i }).click();
    await page.waitForTimeout(800);

    // File should be clean after commit
    await waitForGitState(page, 'clean');
  } finally {
    // Cleanup: discard any leftover changes and remove from git
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 2 — Edit committed file → stage → partial-stage → commit cycle
// ---------------------------------------------------------------------------

test('full edit→stage→edit→commit cycle produces correct git states', async ({ page }) => {
  const filePath = '_playwright-tests/test-cycle.md';

  // Set up: create, stage, and commit a file so it starts clean
  await saveVaultFile(filePath, '# Cycle Test\n\nOriginal content.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit for cycle test');

  try {
    // Edit the file to create unstaged changes
    await saveVaultFile(filePath, '# Cycle Test\n\nModified content.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');

    // Should be modified (unstaged)
    await waitForGitState(page, 'modified');

    // Open panel — should show Stage button and "All changes" diff link
    await page.locator('[aria-label*="Unstaged" i]').first().click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: /^stage$/i })).toBeVisible();
    await expect(page.getByText(/all changes|view changes/i).first()).toBeVisible();

    // Stage the changes — panel should stay open (Bug 4 fix)
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');

    // Panel should still be open — verify Commit button is visible without reopening
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();

    // Make another change — now we have modified-staged
    await saveVaultFile(filePath, '# Cycle Test\n\nModified content.\n\nExtra paragraph.\n');
    // Trigger a status refresh by reloading
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified-staged');

    // Open panel — should show Discard, Stage, Commit, and three diff buttons
    await page.locator('[aria-label*="Partial staged" i]').first().click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: /^discard$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^stage$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();

    // Stage all remaining changes and commit
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');

    await page.getByRole('textbox', { name: /commit message/i }).fill('Cycle test final commit');
    await page.getByRole('button', { name: /^commit$/i }).click();
    await page.waitForTimeout(800);
    await waitForGitState(page, 'clean');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 3 — File browser highlight syncs on Compare tab (/diff)  [Bug 1]
// ---------------------------------------------------------------------------

test('file browser selection highlight follows URL on Compare tab', async ({ page }) => {
  const fileA = '_playwright-tests/file-a.md';
  const fileB = '_playwright-tests/file-b.md';

  await saveVaultFile(fileA, '# File A\n');
  await saveVaultFile(fileB, '# File B\n');
  await gitStage(fileA);
  await gitCommit(fileA, 'Add file A');

  try {
    // Open the diff viewer with file A loaded
    await page.goto(diffUrl(fileA, 'HEAD', 'working'));
    await page.waitForLoadState('networkidle');

    // Open the file browser
    await openFileBrowser(page);
    await page.waitForTimeout(500);

    // Navigate to the _playwright-tests folder in the file browser
    // (folder selection is app-specific; look for folder name)
    await page.getByText('_playwright-tests').first().click().catch(() => {});
    await page.waitForTimeout(300);

    // File A should be highlighted (amber border / text)
    const fileAEntry = page.getByText('file-a').first();
    await expect(fileAEntry).toBeVisible();
    // Check the parent button has the active class (amber styling)
    const fileABtn = page.locator('button', { has: page.getByText('file-a') }).first();
    await expect(fileABtn).toHaveClass(/amber|border-amber/);

    // Click file B in the browser
    await page.getByText('file-b').first().click();
    await page.waitForTimeout(500);

    // URL should now reference file B
    await expect(page).toHaveURL(/left=.*file-b/);

    // File B should now be highlighted, file A should not
    const fileBBtn = page.locator('button', { has: page.getByText('file-b') }).first();
    await expect(fileBBtn).toHaveClass(/amber|border-amber/);
    await expect(fileABtn).not.toHaveClass(/amber|border-amber/);
  } finally {
    await deleteVaultFile(fileA).catch(() => {});
    await deleteVaultFile(fileB).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 4 — staged-new + working changes: only staged→working tab, no HEAD tabs
// ---------------------------------------------------------------------------

test('staged-new + working changes: only Unstaged changes tab + no-HEAD banner', async ({ page }) => {
  const filePath = '_playwright-tests/test-no-head.md';

  // Set up: create file, stage it (staged-new), then modify it (→ modified-staged, no HEAD)
  await saveVaultFile(filePath, '# No Head File\n\nFirst content.\n');
  await gitStage(filePath);

  // Verify the state is staged-new
  const state = await gitStatus(filePath);
  expect(state).toBe('staged-new');

  // Now edit the file without staging → becomes modified-staged with no HEAD
  await saveVaultFile(filePath, '# No Head File\n\nFirst content.\n\nAdded paragraph.\n');

  try {
    // Open the diff viewer in staged→working mode
    await page.goto(diffUrl(filePath, 'staged', 'working'));
    await page.waitForLoadState('networkidle');

    // The no-HEAD banner should be visible
    await expect(page.getByText(/no previous commit/i)).toBeVisible({ timeout: 8_000 });

    // Only the "Unstaged changes" tab should be visible — no HEAD-based tabs
    await expect(page.getByRole('button', { name: /unstaged changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /all changes/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /staged diff/i })).not.toBeVisible();

    // The diff panes should show content (staged on left, working on right)
    await expect(page.getByText('First content')).toBeVisible();
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});
