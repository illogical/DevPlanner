import { join } from 'path';
import { mkdir, access } from 'fs/promises';
import type {
  DispatchAdapter,
  DispatchConfig,
  DispatchProcess,
} from '../../types/dispatch';

// Homebrew installs binaries into one of two locations depending on CPU arch
const HOMEBREW_BIN_PATHS = [
  '/opt/homebrew/bin/gemini', // Apple Silicon
  '/usr/local/bin/gemini',    // Intel Mac / Linux Linuxbrew
];

/** Resolve the `gemini` binary to an absolute path, or return null. */
async function resolveGeminiBin(): Promise<string | null> {
  // 1. Prefer PATH resolution via Bun.which (bare name)
  const fromPath = Bun.which('gemini');
  if (fromPath) return fromPath;

  if (process.platform === 'win32') {
    // 2. Windows: npm creates a gemini.cmd wrapper; Bun.which may not find it
    //    when searching the bare name due to PATHEXT handling.
    const cmdPath = Bun.which('gemini.cmd');
    if (cmdPath) return cmdPath;

    // 3. Check well-known npm global locations on Windows
    const candidates: string[] = [];
    const appData = process.env['APPDATA'];
    if (appData) {
      candidates.push(
        join(appData, 'npm', 'gemini.cmd'),
        join(appData, 'npm', 'gemini'),
      );
    }
    const userProfile = process.env['USERPROFILE'];
    if (userProfile) {
      candidates.push(
        join(userProfile, 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
        join(userProfile, 'AppData', 'Roaming', 'npm', 'gemini'),
      );
    }
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not found at this location
      }
    }
  } else {
    // 2. Unix fallback: check known homebrew locations
    for (const candidate of HOMEBREW_BIN_PATHS) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not found at this location
      }
    }
  }

  return null;
}

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

      // Gemini requires "trust: true" on each MCP server for non-TTY / headless
      // mode — without it, every tool call surfaces a confirmation dialog that
      // silently hangs when stdout is not a terminal.
      if (mcpJson.mcpServers && typeof mcpJson.mcpServers === 'object') {
        for (const server of Object.values(mcpJson.mcpServers) as Record<string, unknown>[]) {
          server['trust'] = true;
        }
      }

      // Gemini uses the same mcpServers format as Claude's .mcp.json
      await Bun.write(settingsPath, JSON.stringify(mcpJson, null, 2));
    }

    // Gemini CLI doesn't have a separate system prompt flag — combine both.
    // Append an explicit action trigger: without it Gemini reads the combined
    // prompt as introductory context and responds conversationally rather than
    // executing the tasks immediately.
    const ACTION_TRIGGER = `\n\n---\n\n**Working directory: ${config.workingDirectory}**\n\n` +
      `**BEGIN NOW.** Do not ask for clarification or confirmation. ` +
      `Your first action must be to call \`mcp__devplanner__get_card\` to read the current task ` +
      `indices, then implement each task in order and toggle it complete immediately after finishing. ` +
      `If MCP tools are unavailable, use the curl REST fallback described above.`;
    const fullPrompt = `${config.systemPrompt}\n\n---\n\n${config.userPrompt}${ACTION_TRIGGER}`;

    // Resolve the gemini binary — prefer PATH, fall back to homebrew locations
    const geminiBin = await resolveGeminiBin();
    if (!geminiBin) {
      throw new Error(
        'gemini CLI not found. Install via homebrew (`brew install gemini`) or npm (`npm install -g @google/gemini-cli`), then ensure it is in your PATH.'
      );
    }

    const args = [geminiBin, '-p', fullPrompt, '--yolo'];

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
      throw new Error(
        `Failed to start gemini CLI at "${geminiBin}": ${msg}. Check that it is executable and your PATH is correct.`
      );
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
