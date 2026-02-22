import { readdir, readFile, writeFile, mkdir, stat, unlink, rename, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { zipSync } from 'fflate';

// Files at the workspace root that are operational and should not be included in
// the backup archive (they change on every run and would break hash comparison).
const EXCLUDED_WORKSPACE_ENTRIES = new Set(['_backups', '_backup-state.json', '_backup-log.json']);

interface BackupState {
  lastBackup: string | null;
  lastBackupFile: string | null;
  contentHash: string | null;
}

interface LogEntry {
  at: string;
  result: 'backed_up' | 'no_change';
  filename?: string;
  sizeBytes?: number;
}

export interface BackupStatus {
  lastBackup: string | null;
  lastBackupFile: string | null;
  lastChangeAt: string | null;
  hasChanges: boolean;
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export type BackupResult =
  | { skipped: true; reason: string }
  | { skipped: false; filename: string; sizeBytes: number };

export class BackupService {
  private readonly stateFile: string;
  private readonly logFile: string;

  constructor(
    private readonly workspacePath: string,
    private readonly backupDir: string
  ) {
    this.stateFile = join(workspacePath, '_backup-state.json');
    this.logFile = join(workspacePath, '_backup-log.json');
  }

  async getStatus(): Promise<BackupStatus> {
    const [state, lastChangeAt] = await Promise.all([
      this.readState(),
      this.findMaxUpdated(),
    ]);

    let hasChanges = false;
    if (lastChangeAt !== null) {
      if (state.lastBackup === null) {
        hasChanges = true;
      } else {
        hasChanges = new Date(lastChangeAt) > new Date(state.lastBackup);
      }
    }

    return {
      lastBackup: state.lastBackup,
      lastBackupFile: state.lastBackupFile,
      lastChangeAt,
      hasChanges,
    };
  }

  async createBackup(): Promise<BackupResult> {
    await this.cleanupOrphanedTempFiles();

    const filesMap = await this.collectFiles();
    const zipBytes = zipSync(filesMap, { level: 6 });
    const currentHash = createHash('sha256').update(zipBytes).digest('hex');

    const state = await this.readState();
    const now = new Date();

    if (currentHash === state.contentHash) {
      await this.appendLog({ at: now.toISOString(), result: 'no_change' });
      return { skipped: true, reason: 'No changes since last backup' };
    }

    await mkdir(this.backupDir, { recursive: true });

    const filename = `${this.formatTimestamp(now)}_devplanner-backup.zip`;
    const tmpPath = join(this.backupDir, filename + '.tmp');
    const finalPath = join(this.backupDir, filename);

    await Bun.write(tmpPath, zipBytes);
    try {
      await rename(tmpPath, finalPath);
    } catch (e: any) {
      if (e.code === 'EXDEV') {
        // Cross-device rename (e.g. backup dir on a different drive)
        await copyFile(tmpPath, finalPath);
        await unlink(tmpPath);
      } else {
        throw e;
      }
    }

    await this.writeState({
      lastBackup: now.toISOString(),
      lastBackupFile: filename,
      contentHash: currentHash,
    });
    await this.appendLog({
      at: now.toISOString(),
      result: 'backed_up',
      filename,
      sizeBytes: zipBytes.byteLength,
    });

    return { skipped: false, filename, sizeBytes: zipBytes.byteLength };
  }

  async listBackups(): Promise<BackupEntry[]> {
    try {
      const entries = await readdir(this.backupDir, { withFileTypes: true });
      const results: BackupEntry[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.zip')) continue;
        const fileStat = await stat(join(this.backupDir, entry.name));
        results.push({
          filename: entry.name,
          sizeBytes: fileStat.size,
          createdAt: fileStat.birthtime.toISOString(),
        });
      }

      // Filename prefix is lexicographically sortable — newest first
      results.sort((a, b) => b.filename.localeCompare(a.filename));
      return results;
    } catch {
      return [];
    }
  }

  async resolveBackupFile(filename: string): Promise<string> {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new Error(`Invalid backup filename: ${filename}`);
    }
    if (!filename.endsWith('.zip')) {
      throw new Error(`Invalid backup filename: ${filename}`);
    }

    const absPath = join(this.backupDir, filename);
    try {
      await stat(absPath);
    } catch {
      throw new Error(`Backup file not found: ${filename}`);
    }
    return absPath;
  }

  async getLog(): Promise<LogEntry[]> {
    try {
      return JSON.parse(await readFile(this.logFile, 'utf-8')) as LogEntry[];
    } catch {
      return [];
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async readState(): Promise<BackupState> {
    try {
      return JSON.parse(await readFile(this.stateFile, 'utf-8')) as BackupState;
    } catch {
      return { lastBackup: null, lastBackupFile: null, contentHash: null };
    }
  }

  private async writeState(state: BackupState): Promise<void> {
    await writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  private async appendLog(entry: LogEntry): Promise<void> {
    let log: LogEntry[] = [];
    try {
      log = JSON.parse(await readFile(this.logFile, 'utf-8'));
    } catch {}
    log = [entry, ...log].slice(0, 200);
    await writeFile(this.logFile, JSON.stringify(log, null, 2), 'utf-8');
  }

  private async cleanupOrphanedTempFiles(): Promise<void> {
    try {
      const entries = await readdir(this.backupDir);
      await Promise.all(
        entries
          .filter(f => f.endsWith('.tmp'))
          .map(f => unlink(join(this.backupDir, f)))
      );
    } catch {
      // Backup dir doesn't exist yet — nothing to clean
    }
  }

  private async collectFiles(): Promise<Record<string, Uint8Array>> {
    const files: Record<string, Uint8Array> = {};
    const topEntries = await readdir(this.workspacePath, { withFileTypes: true });

    for (const entry of topEntries) {
      if (EXCLUDED_WORKSPACE_ENTRIES.has(entry.name)) continue;

      if (entry.isDirectory()) {
        await this.walkDir(join(this.workspacePath, entry.name), entry.name, files);
      } else {
        files[entry.name] = new Uint8Array(await readFile(join(this.workspacePath, entry.name)));
      }
    }

    return files;
  }

  private async walkDir(
    dirPath: string,
    zipRoot: string,
    acc: Record<string, Uint8Array>
  ): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      // Use forward slashes for cross-platform ZIP compatibility
      const zipPath = `${zipRoot}/${entry.name}`;

      if (entry.isDirectory()) {
        await this.walkDir(fullPath, zipPath, acc);
      } else {
        acc[zipPath] = new Uint8Array(await readFile(fullPath));
      }
    }
  }

  private async findMaxUpdated(): Promise<string | null> {
    let maxMs = -Infinity;
    let maxIso: string | null = null;

    const topEntries = await readdir(this.workspacePath, { withFileTypes: true });

    for (const entry of topEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

      const projectPath = join(this.workspacePath, entry.name);

      try {
        const raw = await readFile(join(projectPath, '_project.json'), 'utf-8');
        const config = JSON.parse(raw);
        if (config.updated) {
          const ms = new Date(config.updated).getTime();
          if (!isNaN(ms) && ms > maxMs) { maxMs = ms; maxIso = config.updated; }
        }
      } catch {}

      const laneEntries = await readdir(projectPath, { withFileTypes: true }).catch(() => null);
      if (!laneEntries) continue;

      for (const lane of laneEntries) {
        if (!lane.isDirectory()) continue;
        const lanePath = join(projectPath, lane.name);
        let files: string[] = [];
        try { files = await readdir(lanePath); } catch { continue; }

        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          try {
            const raw = await readFile(join(lanePath, file), 'utf-8');
            const { data } = matter(raw);
            if (data.updated) {
              const ms = new Date(data.updated).getTime();
              if (!isNaN(ms) && ms > maxMs) { maxMs = ms; maxIso = data.updated; }
            }
          } catch {}
        }
      }
    }

    return maxIso;
  }

  private formatTimestamp(date: Date): string {
    // "2026-02-22T20:00:00.000Z" → "20260222T200000Z"
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
}
