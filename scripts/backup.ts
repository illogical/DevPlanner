#!/usr/bin/env bun
/**
 * DevPlanner Backup Script
 *
 * Triggers a workspace backup via the DevPlanner API. Designed for scheduled
 * execution (cron, Task Scheduler). Produces timestamped output suitable for
 * log files or cron email.
 *
 * Usage:
 *   bun scripts/backup.ts
 *   bun run backup
 *
 * Environment variables:
 *   DEVPLANNER_API   Base URL of the running server (default: http://localhost:17103)
 *
 * Exit codes:
 *   0  Backup created or skipped (no changes) — both are successful outcomes
 *   1  Server unreachable or API returned an error
 *
 * Cron example (every day at 9 PM):
 *   0 21 * * * cd /path/to/devplanner && bun scripts/backup.ts >> /var/log/devplanner-backup.log 2>&1
 */

const API_BASE = (process.env.DEVPLANNER_API ?? 'http://localhost:17103').replace(/\/$/, '');
const TIMEOUT_MS = 60_000; // 1 minute — zipping a large workspace can take a moment

// ─── Output helpers ──────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};

function timestamp(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`[${timestamp()}] ${msg}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

// ─── API client ───────────────────────────────────────────────────────────────

interface BackupStatus {
  lastBackup: string | null;
  lastBackupFile: string | null;
  lastChangeAt: string | null;
  hasChanges: boolean;
}

interface BackupResultSkipped {
  skipped: true;
  reason: string;
}

interface BackupResultCreated {
  skipped: false;
  filename: string;
  sizeBytes: number;
}

type BackupResult = BackupResultSkipped | BackupResultCreated;

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`${c.cyan}${c.bold}DevPlanner Backup${c.reset}`);
  console.log(`${c.dim}API: ${API_BASE}${c.reset}`);
  console.log();

  // 1. Check current status
  log('Checking backup status...');
  let status: BackupStatus;
  try {
    status = await fetchApi<BackupStatus>('/api/backup/status');
  } catch (err: any) {
    log(`${c.red}ERROR: Could not reach DevPlanner server — ${err.message}${c.reset}`);
    log(`${c.red}Make sure the server is running at ${API_BASE}${c.reset}`);
    process.exit(1);
  }

  if (status.lastBackup) {
    log(`Last backup : ${status.lastBackup}`);
    log(`Last file   : ${status.lastBackupFile ?? '—'}`);
  } else {
    log('Last backup : none');
  }

  if (status.lastChangeAt) {
    log(`Last change : ${status.lastChangeAt}`);
  }

  const changeIndicator = status.hasChanges
    ? `${c.yellow}changes detected${c.reset}`
    : `${c.dim}no changes detected${c.reset}`;
  log(`Status      : ${changeIndicator}`);
  console.log();

  // 2. Trigger backup
  log('Triggering backup...');
  let result: BackupResult;
  try {
    result = await fetchApi<BackupResult>('/api/backup', { method: 'POST' });
  } catch (err: any) {
    log(`${c.red}ERROR: Backup request failed — ${err.message}${c.reset}`);
    process.exit(1);
  }

  // 3. Report result
  if (result.skipped) {
    log(`${c.yellow}SKIPPED${c.reset} — ${result.reason}`);
    console.log();
    log(`${c.green}Done.${c.reset} No backup file written.`);
  } else {
    const size = formatBytes(result.sizeBytes);
    log(`${c.green}SUCCESS${c.reset} — ${result.filename} (${size})`);
    console.log();
    log(`${c.green}Done.${c.reset} Backup written successfully.`);
  }
}

main();
