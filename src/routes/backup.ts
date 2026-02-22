import { Elysia, t } from 'elysia';
import { BackupService } from '../services/backup.service';

export const backupRoutes = (workspacePath: string, backupDir: string) => {
  const backupService = new BackupService(workspacePath, backupDir);

  return new Elysia({ prefix: '/api/backup' })

    // GET /api/backup/status
    // Lightweight: reads state file + walks project/card updated timestamps (no zipping)
    .get('/status', async () => {
      return await backupService.getStatus();
    })

    // GET /api/backup/log
    // Returns backup log entries (newest first, capped at 200)
    .get('/log', async () => {
      const log = await backupService.getLog();
      return { log };
    })

    // POST /api/backup
    // Zips workspace in memory, hashes the zip, compares to prior hash.
    // If unchanged: discards zip bytes, logs no_change, returns { skipped: true }.
    // If changed: writes zip to backupDir, logs backed_up, returns { skipped: false, filename, sizeBytes }.
    .post('/', async ({ set }) => {
      const result = await backupService.createBackup();
      if (!result.skipped) {
        set.status = 201;
      }
      return result;
    })

    // GET /api/backup
    // Lists existing backup zip files with filename, size, and creation time
    .get('/', async () => {
      const backups = await backupService.listBackups();
      return { backups };
    })

    // GET /api/backup/:filename/download
    // Streams a backup zip file as an attachment download
    .get(
      '/:filename/download',
      async ({ params, set }) => {
        const absPath = await backupService.resolveBackupFile(params.filename);
        set.headers['Content-Type'] = 'application/zip';
        set.headers['Content-Disposition'] = `attachment; filename="${params.filename}"`;
        return Bun.file(absPath);
      },
      {
        params: t.Object({
          filename: t.String(),
        }),
      }
    );
};
