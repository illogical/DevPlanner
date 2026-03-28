import { join } from 'path';
import { mkdir } from 'fs/promises';
import type {
  DispatchAdapter,
  DispatchConfig,
  DispatchProcess,
} from '../../types/dispatch';

/**
 * Adapter for Gemini CLI (`gemini -p`).
 *
 * Pre-spawn: writes `.gemini/settings.json` with MCP server config.
 * Gemini CLI reads this file automatically when present in the working directory.
 *
 * Gemini-specific exit codes:
 *   0  — success
 *   1  — general / API error
 *   42 — invalid input
 *   53 — turn limit exceeded (treat as 'review', not hard failure)
 */
export class GeminiCliAdapter implements DispatchAdapter {
  readonly name = 'gemini-cli' as const;

  async spawn(config: DispatchConfig): Promise<DispatchProcess> {
    const id = crypto.randomUUID();
    const startTime = Date.now();

    // Write .gemini/settings.json with MCP config if provided
    if (config.mcpConfigPath) {
      const geminiDir = join(config.workingDirectory, '.gemini');
      await mkdir(geminiDir, { recursive: true });
      const settingsPath = join(geminiDir, 'settings.json');

      // Read the .mcp.json config and adapt it to Gemini's format
      const mcpContent = await Bun.file(config.mcpConfigPath).text();
      const mcpJson = JSON.parse(mcpContent);

      // Gemini uses the same mcpServers format as Claude's .mcp.json
      await Bun.write(settingsPath, JSON.stringify(mcpJson, null, 2));
    }

    // Gemini CLI doesn't have a separate system prompt flag — combine both
    const fullPrompt = `${config.systemPrompt}\n\n---\n\n${config.userPrompt}`;

    const args = ['gemini', '-p', fullPrompt];

    if (config.model) {
      args.push('--model', config.model);
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(args, {
        cwd: config.workingDirectory,
        env: { ...process.env, ...config.env },
        stdout: 'pipe',
        stderr: 'pipe',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT') || msg.includes('not found')) {
        throw new Error(
          'Gemini CLI not found — install with: npm install -g @google/gemini-cli'
        );
      }
      throw err;
    }

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Stream stdout chunks via the onOutput callback
    const readStdout = (async () => {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        stdoutChunks.push(text);
        config.onOutput?.(text);
      }
    })();

    const readStderr = (async () => {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stderrChunks.push(decoder.decode(value));
      }
    })();

    const onComplete = proc.exited.then(async (exitCode) => {
      await Promise.all([readStdout, readStderr]);
      return {
        exitCode,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        durationMs: Date.now() - startTime,
      };
    });

    return {
      id,
      pid: proc.pid,
      kill: () => proc.kill(),
      onComplete,
    };
  }

  /**
   * Gemini exit code 53 means the turn limit was exceeded.
   * Treat this as 'review' (partial success) rather than hard failure.
   */
  static isTurnLimitExceeded(exitCode: number): boolean {
    return exitCode === 53;
  }
}
