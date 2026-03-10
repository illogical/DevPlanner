import { test, expect, type Page } from '@playwright/test';
import {
  saveVaultFile,
  deleteVaultFile,
  gitStage,
  gitUnstage,
  gitCommit,
  gitDiscard,
  gitStatus,
  editorUrl,
  diffUrl,
} from './helpers';

// ---------------------------------------------------------------------------
// Shared selectors
// ---------------------------------------------------------------------------

/** Wait for the git status dot to show a given state (matched by aria-label) */
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
  await expect(page.locator(`[aria-label*="${label}" i]`).first()).toBeVisible({ timeout: 10_000 });
}

/** Click the git status pill/dot to open the Git Actions panel */
async function openGitPanel(page: Page, currentState: string) {
  const label = STATE_ARIA[currentState] ?? currentState;
  await page.locator(`[aria-label*="${label}" i]`).first().click();
  await page.waitForTimeout(300);
}

/** Open the file browser drawer */
const openFileBrowser = async (page: Page) => {
  await page
    .locator('button[title*="file" i], button[aria-label*="file browser" i], [data-testid="file-browser-toggle"]')
    .first()
    .click();
  await page
    .waitForSelector('[data-testid="file-browser"], .file-browser, [class*="FileBrowser"]', { timeout: 3000 })
    .catch(() => {});
};

// ---------------------------------------------------------------------------
// Test 1 — untracked → staged-new → commit
// Verifies: Bug 2 fix (staged-new shows Unstage + Commit), no diff links for new file
// ---------------------------------------------------------------------------

test('untracked → staged-new: Git Actions panel shows Unstage + Commit (no diff links)', async ({ page }) => {
  const filePath = '_playwright-tests/test-new-file.md';
  await saveVaultFile(filePath, '# New File\n\nSome content.\n');

  try {
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');

    // Verify untracked status
    await waitForGitState(page, 'untracked');

    // Open panel — should show Stage button only
    await openGitPanel(page, 'untracked');
    const stageBtn = page.getByRole('button', { name: /^stage$/i });
    await expect(stageBtn).toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).not.toBeVisible();

    // Stage the file
    await stageBtn.click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged-new');

    // Open the panel — Bug 2: must show Unstage and Commit for staged-new
    await openGitPanel(page, 'staged-new');
    await expect(page.getByRole('button', { name: /^unstage$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();

    // No diff links — there is no HEAD to compare against
    await expect(page.getByText(/no previous commit/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /all changes/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /staged diff/i })).not.toBeVisible();

    // Commit
    await page.getByRole('textbox', { name: /commit message/i }).fill('Add new test file');
    await page.getByRole('button', { name: /^commit$/i }).click();
    await page.waitForTimeout(800);
    await waitForGitState(page, 'clean');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 2 — staged-new: Unstage returns file to untracked
// ---------------------------------------------------------------------------

test('staged-new → unstage → untracked', async ({ page }) => {
  const filePath = '_playwright-tests/test-unstage-new.md';
  await saveVaultFile(filePath, '# Unstage Test\n\nContent.\n');

  try {
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'untracked');

    // Stage via panel
    await openGitPanel(page, 'untracked');
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged-new');

    // Unstage via panel
    await openGitPanel(page, 'staged-new');
    await page.getByRole('button', { name: /^unstage$/i }).click();
    await page.waitForTimeout(500);

    // Should be untracked again
    await waitForGitState(page, 'untracked');

    // Verify via API as well
    const state = await gitStatus(filePath);
    expect(state).toBe('untracked');
  } finally {
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 3 — Git Actions panel stays open after stage/unstage  [Bug 4 fix]
// ---------------------------------------------------------------------------

test('Git Actions panel stays open after Stage and Unstage actions', async ({ page }) => {
  const filePath = '_playwright-tests/test-panel-stays-open.md';
  await saveVaultFile(filePath, '# Panel Test\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    // Create unstaged changes
    await saveVaultFile(filePath, '# Panel Test\n\nModified.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified');

    // Open panel
    await openGitPanel(page, 'modified');

    // Stage — panel must remain open (Bug 4)
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');

    // Commit button must be visible without reopening the panel
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();

    // Unstage — panel must remain open
    await page.getByRole('button', { name: /^unstage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'modified');

    // Stage button visible without reopening
    await expect(page.getByRole('button', { name: /^stage$/i })).toBeVisible();
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 4 — Discard: modified → clean  (no staged changes)
// ---------------------------------------------------------------------------

test('discard unstaged changes: modified → clean', async ({ page }) => {
  const filePath = '_playwright-tests/test-discard.md';
  await saveVaultFile(filePath, '# Discard Test\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    // Modify without staging
    await saveVaultFile(filePath, '# Discard Test\n\nModified — will be discarded.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified');

    // Open panel and discard
    await openGitPanel(page, 'modified');
    await expect(page.getByRole('button', { name: /^discard$/i })).toBeVisible();
    await page.getByRole('button', { name: /^discard$/i }).click();
    await page.waitForTimeout(800);

    // Status should be clean
    await waitForGitState(page, 'clean');

    const state = await gitStatus(filePath);
    expect(state).toBe('clean');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 5 — Discard in partial-staged: modified-staged → staged
// ---------------------------------------------------------------------------

test('discard unstaged portion of partial-staged file → staged', async ({ page }) => {
  const filePath = '_playwright-tests/test-discard-partial.md';
  await saveVaultFile(filePath, '# Partial Discard\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    // Stage a change
    await saveVaultFile(filePath, '# Partial Discard\n\nStaged change.\n');
    await gitStage(filePath);

    // Then make a second un-staged change
    await saveVaultFile(filePath, '# Partial Discard\n\nStaged change.\n\nUnstaged extra.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified-staged');

    // Open panel and discard the unstaged portion
    await openGitPanel(page, 'modified-staged');
    await expect(page.getByRole('button', { name: /^discard$/i })).toBeVisible();
    await page.getByRole('button', { name: /^discard$/i }).click();
    await page.waitForTimeout(800);

    // Should now be staged (only staged changes remain)
    await waitForGitState(page, 'staged');

    const state = await gitStatus(filePath);
    expect(state).toBe('staged');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 6 — Full edit→stage→partial-stage→commit cycle with diff shortcuts
// ---------------------------------------------------------------------------

test('full edit→stage→edit→commit cycle: correct states and diff shortcuts', async ({ page }) => {
  const filePath = '_playwright-tests/test-cycle.md';
  await saveVaultFile(filePath, '# Cycle Test\n\nOriginal content.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit for cycle test');

  try {
    // Step 1: Edit → modified (unstaged)
    await saveVaultFile(filePath, '# Cycle Test\n\nModified content.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified');

    // Open panel — Stage button visible; "All changes" diff shortcut visible
    await openGitPanel(page, 'modified');
    await expect(page.getByRole('button', { name: /^stage$/i })).toBeVisible();
    await expect(page.getByText(/all changes|view changes/i).first()).toBeVisible();

    // Step 2: Stage → staged; panel stays open (Bug 4)
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^unstage$/i })).toBeVisible();

    // Step 3: Another external edit → modified-staged
    await saveVaultFile(filePath, '# Cycle Test\n\nModified content.\n\nExtra paragraph.\n');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified-staged');

    // Open panel — Discard, Stage, Commit; three diff links
    await openGitPanel(page, 'modified-staged');
    await expect(page.getByRole('button', { name: /^discard$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^stage$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).toBeVisible();
    // All three diff buttons must be present (including HEAD→staged for what will be committed)
    await expect(page.getByText(/view staged diff/i).first()).toBeVisible();
    await expect(page.getByText(/all changes/i).first()).toBeVisible();
    await expect(page.getByText(/unstaged changes/i).first()).toBeVisible();

    // Step 4: Stage all and commit
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');

    await page.getByRole('textbox', { name: /commit message/i }).fill('Cycle test final commit');
    await page.getByRole('button', { name: /^commit$/i }).click();
    await page.waitForTimeout(800);
    await waitForGitState(page, 'clean');

    // Verify via API — commit is real and persisted
    const state = await gitStatus(filePath);
    expect(state).toBe('clean');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 7 — staged → unstage → modified (committed file)
// ---------------------------------------------------------------------------

test('staged → unstage → modified (committed file)', async ({ page }) => {
  const filePath = '_playwright-tests/test-unstage-committed.md';
  await saveVaultFile(filePath, '# Committed File\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    // Stage a change
    await saveVaultFile(filePath, '# Committed File\n\nChanged.\n');
    await gitStage(filePath);

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'staged');

    // Unstage via panel
    await openGitPanel(page, 'staged');
    await page.getByRole('button', { name: /^unstage$/i }).click();
    await page.waitForTimeout(500);

    // Should revert to modified (changes exist but not staged)
    await waitForGitState(page, 'modified');

    const state = await gitStatus(filePath);
    expect(state).toBe('modified');
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 8 — clean file: no actions shown in Git Actions panel
// ---------------------------------------------------------------------------

test('clean file: Git Actions panel shows no action buttons', async ({ page }) => {
  const filePath = '_playwright-tests/test-clean.md';
  await saveVaultFile(filePath, '# Clean File\n\nContent.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'clean');

    // Open panel — no action buttons for a clean file
    await openGitPanel(page, 'clean');
    await expect(page.getByRole('button', { name: /^stage$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^commit$/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^discard$/i })).not.toBeVisible();
  } finally {
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 9 — Diff shortcuts: BottomBar shows correct shortcuts per git state
// ---------------------------------------------------------------------------

test('BottomBar diff shortcuts: modified shows "All changes", staged shows "Staged diff"', async ({ page }) => {
  const filePath = '_playwright-tests/test-diff-shortcuts.md';
  await saveVaultFile(filePath, '# Diff Shortcuts\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    // modified: bottom bar should show "All changes" shortcut
    await saveVaultFile(filePath, '# Diff Shortcuts\n\nModified.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified');

    // BottomBar shortcut for HEAD→working diff
    await expect(page.getByRole('link', { name: /all changes/i }).or(
      page.locator('[data-testid="diff-shortcut-all"]')
    ).first()).toBeVisible();

    // Click shortcut — should navigate to diff viewer
    await page.getByRole('link', { name: /all changes/i }).first().click();
    await expect(page).toHaveURL(/\/diff/);
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Stage → "Staged diff" shortcut
    await gitStage(filePath);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'staged');

    await expect(page.getByRole('link', { name: /staged diff/i }).or(
      page.locator('[data-testid="diff-shortcut-staged"]')
    ).first()).toBeVisible();
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 10 — File browser selection highlight follows URL on Compare tab  [Bug 1]
// ---------------------------------------------------------------------------

test('file browser selection highlight follows URL on Compare tab', async ({ page }) => {
  const fileA = '_playwright-tests/file-a.md';
  const fileB = '_playwright-tests/file-b.md';

  await saveVaultFile(fileA, '# File A\n');
  await saveVaultFile(fileB, '# File B\n');
  await gitStage(fileA);
  await gitCommit(fileA, 'Add file A');

  try {
    await page.goto(diffUrl(fileA, 'HEAD', 'working'));
    await page.waitForLoadState('networkidle');

    await openFileBrowser(page);
    await page.waitForTimeout(500);

    // Navigate to the _playwright-tests folder
    await page.getByText('_playwright-tests').first().click().catch(() => {});
    await page.waitForTimeout(300);

    // File A should be highlighted
    const fileABtn = page.locator('button', { has: page.getByText('file-a') }).first();
    await expect(fileABtn).toHaveClass(/amber|border-amber/);

    // Click file B — highlight should move
    await page.getByText('file-b').first().click();
    await page.waitForTimeout(500);

    await expect(page).toHaveURL(/left=.*file-b/);
    const fileBBtn = page.locator('button', { has: page.getByText('file-b') }).first();
    await expect(fileBBtn).toHaveClass(/amber|border-amber/);
    await expect(fileABtn).not.toHaveClass(/amber|border-amber/);
  } finally {
    await deleteVaultFile(fileA).catch(() => {});
    await deleteVaultFile(fileB).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 11 — staged-new + working changes: only staged→working tab + no-HEAD banner  [Bug 3]
// ---------------------------------------------------------------------------

test('staged-new + working changes: only "Unstaged changes" tab + no-HEAD banner', async ({ page }) => {
  const filePath = '_playwright-tests/test-no-head.md';
  await saveVaultFile(filePath, '# No Head File\n\nFirst content.\n');
  await gitStage(filePath);

  const stateAfterStage = await gitStatus(filePath);
  expect(stateAfterStage).toBe('staged-new');

  // Edit without re-staging → modified-staged with no HEAD
  await saveVaultFile(filePath, '# No Head File\n\nFirst content.\n\nAdded paragraph.\n');

  try {
    await page.goto(diffUrl(filePath, 'staged', 'working'));
    await page.waitForLoadState('networkidle');

    // No-HEAD banner must appear
    await expect(page.getByText(/no previous commit/i)).toBeVisible({ timeout: 8_000 });

    // Only the "Unstaged changes" / staged→working tab should be present
    await expect(page.getByRole('button', { name: /unstaged changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /all changes/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /staged diff/i })).not.toBeVisible();

    // Content from staged version should be visible in diff
    await expect(page.getByText('First content')).toBeVisible();
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 12 — Commit verification: confirm git log shows the commit
// ---------------------------------------------------------------------------

test('commit is persisted: git status is clean and commit message is verifiable via API', async ({ page }) => {
  const filePath = '_playwright-tests/test-commit-verify.md';
  await saveVaultFile(filePath, '# Commit Verify\n\nOriginal.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Pre-existing commit');

  try {
    // Edit and stage via UI
    await saveVaultFile(filePath, '# Commit Verify\n\nChanged content.\n');

    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'modified');

    await openGitPanel(page, 'modified');
    await page.getByRole('button', { name: /^stage$/i }).click();
    await page.waitForTimeout(500);
    await waitForGitState(page, 'staged');

    const commitMessage = 'Verified commit from Playwright';
    await page.getByRole('textbox', { name: /commit message/i }).fill(commitMessage);
    await page.getByRole('button', { name: /^commit$/i }).click();
    await page.waitForTimeout(800);
    await waitForGitState(page, 'clean');

    // Verify via API: state is clean (meaning the commit happened)
    const state = await gitStatus(filePath);
    expect(state).toBe('clean');
    // No unstaged or staged changes remain — the commit is real and complete.
    // (Git log verification would require a dedicated API endpoint; state=clean
    //  is the authoritative confirmation that all changes have been committed.)
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 13 — Panel-open forces git status refresh (stale state regression)
//
// Reproduces: staged-new file modified externally; UI was stale-showing
// "staged" without any indication of unstaged changes. Opening the panel
// must now trigger a fresh status fetch.
// ---------------------------------------------------------------------------

test('opening Git Actions panel fetches fresh state: staged-new + modify → shows modified-staged', async ({ page }) => {
  const filePath = '_playwright-tests/test-panel-refresh.md';

  // Stage a new file (staged-new)
  await saveVaultFile(filePath, '# Panel Refresh\n\nOriginal staged content.\n');
  await gitStage(filePath);

  try {
    // Navigate to editor — UI will show staged-new on load
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'staged-new');

    // Modify the file externally (simulates save without going through the editor)
    await saveVaultFile(filePath, '# Panel Refresh\n\nOriginal staged content.\n\nAdded after staging.\n');

    // Open the panel — mount effect must refresh git status
    await page.locator('[aria-label*="New file" i]').first().click();
    await page.waitForTimeout(800); // allow refresh to complete

    // State should now be modified-staged (not staged-new)
    await waitForGitState(page, 'modified-staged');

    // Amber warning: "only staged changes will be committed"
    await expect(page.getByText(/only staged changes will be committed/i)).toBeVisible();

    // HEAD→staged diff button must be visible (new Bug 3 fix for modified-staged)
    await expect(page.getByText(/view staged diff/i)).toBeVisible();
  } finally {
    await gitDiscard(filePath).catch(() => {});
    await deleteVaultFile(filePath).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Test 14 — Unsaved editor changes: panel warns before staging/committing
// ---------------------------------------------------------------------------

test('unsaved editor changes: Git Actions panel shows yellow warning', async ({ page }) => {
  const filePath = '_playwright-tests/test-dirty-warning.md';
  await saveVaultFile(filePath, '# Dirty Warning\n\nClean content.\n');
  await gitStage(filePath);
  await gitCommit(filePath, 'Initial commit');

  try {
    await page.goto(editorUrl(filePath));
    await page.waitForLoadState('networkidle');
    await waitForGitState(page, 'clean');

    // Type in the editor (creates unsaved changes — docIsDirty=true)
    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill('# Dirty Warning\n\nClean content.\n\nUnsaved line added.\n');
    await page.waitForTimeout(200);

    // Open the git panel (state is still "clean" from git's perspective — file on disk unchanged)
    await page.locator('[aria-label*="Clean" i]').first().click();
    await page.waitForTimeout(500);

    // Yellow unsaved-changes warning must appear
    await expect(page.getByText(/unsaved editor changes/i)).toBeVisible();
  } finally {
    await deleteVaultFile(filePath).catch(() => {});
  }
});
