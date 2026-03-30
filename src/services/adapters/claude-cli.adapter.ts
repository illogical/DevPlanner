import { join } from 'path';
import type {
  DispatchAdapter,
  DispatchConfig,
  DispatchProcess,
} from '../../types/dispatch';
import { ConfigService } from '../config.service';

/**
 * Adapter for Claude Code CLI (`claude -p`).
 *
 * Pre-spawn: writes CLAUDE.md (system prompt) and .mcp.json (MCP config)
 * to the worktree root. Claude Code reads both automatically.
 *
 * Streaming: uses `--output-format stream-json` for newline-delimited JSON
 * events that can be parsed for rich frontend rendering.
 */
export class ClaudeCliAdapter implements DispatchAdapter {
  readonly name = 'claude-cli' as const;

  async spawn(config: DispatchConfig): Promise<DispatchProcess> {
    const id = crypto.randomUUID();
    const startTime = Date.now();

    // Write CLAUDE.md (system prompt)
    await Bun.write(
      join(config.workingDirectory, 'CLAUDE.md'),
      config.systemPrompt
    );

    // Write .mcp.json (DevPlanner MCP server config)
    if (config.mcpConfigPath) {
      const mcpContent = await Bun.file(config.mcpConfigPath).text();
      await Bun.write(join(config.workingDirectory, '.mcp.json'), mcpContent);
    }

    const args = [
      'claude',
      '-p',
      config.userPrompt,
      '--verbose',
      '--output-format',
      'stream-json',
      '--allowedTools',
      [
        'Bash',
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'mcp__devplanner__get_card',
        'mcp__devplanner__toggle_task',
        'mcp__devplanner__batch_update_tasks',
        'mcp__devplanner__update_card',
        'mcp__devplanner__move_card',
        'mcp__devplanner__create_vault_artifact',
      ].join(','),
    ];

    if (config.model) {
      args.push('--model', config.model);
    }

    // Resolve claude binary — prefer PATH; on Windows also try claude.cmd
    const claudeBin = Bun.which('claude') ?? (process.platform === 'win32' ? Bun.which('claude.cmd') : null);
    if (!claudeBin) {
      throw new Error(
        'claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code, then ensure it is in your PATH.'
      );
    }
    args[0] = claudeBin;

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
        `Failed to start claude CLI at "${claudeBin}": ${msg}. Check that it is executable and your PATH is correct.`
      );
    }

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Stream stdout, forwarding chunks via the onOutput callback
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
   * Build the MCP config object for DevPlanner.
   * Written to .mcp.json in the worktree root.
   *
   * @param mcpServerPath  Absolute path to mcp-server.ts
   * @param workspacePath  DevPlanner workspace root
   * @param bunPath        Absolute path to the bun binary (default: process.execPath).
   *                       Must be absolute so that Claude Code can locate it regardless
   *                       of the PATH it inherits when spawning the MCP subprocess.
   */
  static buildMcpConfig(
    mcpServerPath: string,
    workspacePath: string,
    bunPath: string = process.execPath
  ): object {
    return {
      mcpServers: {
        devplanner: {
          command: bunPath,
          args: [mcpServerPath],
          env: {
            DEVPLANNER_WORKSPACE: workspacePath,
          },
        },
      },
    };
  }

  /**
   * Write .mcp.json to the given directory. Returns the path written.
   */
  static async writeMcpConfig(
    directory: string,
    mcpServerPath: string,
    workspacePath: string
  ): Promise<string> {
    const mcpPath = join(directory, '.mcp.json');
    await Bun.write(
      mcpPath,
      JSON.stringify(ClaudeCliAdapter.buildMcpConfig(mcpServerPath, workspacePath), null, 2)
    );
    return mcpPath;
  }
}
