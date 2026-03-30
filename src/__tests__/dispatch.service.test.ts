import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DispatchService } from '../services/dispatch.service';
import { isValidAdapterName } from '../services/adapters/adapter.interface';
import { GeminiCliAdapter } from '../services/adapters/gemini-cli.adapter';
import { ClaudeCliAdapter } from '../services/adapters/claude-cli.adapter';

describe('isValidAdapterName', () => {
  test('returns true for claude-cli', () => {
    expect(isValidAdapterName('claude-cli')).toBe(true);
  });

  test('returns true for gemini-cli', () => {
    expect(isValidAdapterName('gemini-cli')).toBe(true);
  });

  test('returns false for unknown adapter', () => {
    expect(isValidAdapterName('unknown')).toBe(false);
    expect(isValidAdapterName('')).toBe(false);
  });
});

describe('GeminiCliAdapter', () => {
  test('isTurnLimitExceeded returns true for exit code 53', () => {
    expect(GeminiCliAdapter.isTurnLimitExceeded(53)).toBe(true);
  });

  test('isTurnLimitExceeded returns false for other exit codes', () => {
    expect(GeminiCliAdapter.isTurnLimitExceeded(0)).toBe(false);
    expect(GeminiCliAdapter.isTurnLimitExceeded(1)).toBe(false);
  });
});

describe('ClaudeCliAdapter', () => {
  test('buildMcpConfig returns correct structure', () => {
    const config = ClaudeCliAdapter.buildMcpConfig('/path/to/mcp.ts', '/path/to/workspace');

    expect(config).toMatchObject({
      mcpServers: {
        devplanner: {
          // defaults to process.execPath so the MCP subprocess can find bun
          // regardless of the PATH Claude Code inherits
          command: process.execPath,
          args: ['/path/to/mcp.ts'],
          env: {
            DEVPLANNER_WORKSPACE: '/path/to/workspace',
          },
        },
      },
    });
  });

  test('buildMcpConfig accepts an explicit bunPath', () => {
    const config = ClaudeCliAdapter.buildMcpConfig('/path/to/mcp.ts', '/path/to/workspace', '/usr/local/bin/bun');

    expect((config as { mcpServers: { devplanner: { command: string } } }).mcpServers.devplanner.command).toBe('/usr/local/bin/bun');
  });

  test('writeMcpConfig writes file to disk', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'devplanner-dispatch-test-'));
    try {
      const mcpPath = await ClaudeCliAdapter.writeMcpConfig(
        tempDir,
        '/path/to/mcp.ts',
        '/path/to/workspace'
      );

      const content = await Bun.file(mcpPath).text();
      const json = JSON.parse(content);

      expect(json.mcpServers.devplanner.command).toBe(process.execPath);
      expect(json.mcpServers.devplanner.args).toEqual(['/path/to/mcp.ts']);
      expect(json.mcpServers.devplanner.env.DEVPLANNER_WORKSPACE).toBe('/path/to/workspace');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('DispatchService', () => {
  beforeEach(() => {
    DispatchService._resetInstance();
  });

  test('is a singleton', () => {
    const instance1 = DispatchService.getInstance();
    const instance2 = DispatchService.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('listActive returns empty array when no dispatches', () => {
    const service = DispatchService.getInstance();
    expect(service.listActive()).toHaveLength(0);
  });

  test('getDispatch returns undefined for unknown ID', () => {
    const service = DispatchService.getInstance();
    expect(service.getDispatch('nonexistent-id')).toBeUndefined();
  });

  test('getCardDispatch returns undefined for unknown card', () => {
    const service = DispatchService.getInstance();
    expect(service.getCardDispatch('my-project', 'my-card')).toBeUndefined();
  });

  test('getOutputBuffer returns empty array for unknown dispatch', () => {
    const service = DispatchService.getInstance();
    expect(service.getOutputBuffer('nonexistent-id')).toHaveLength(0);
  });

  test('dispatch throws for project without repoPath', async () => {
    const service = DispatchService.getInstance();

    // We need a real workspace for this test to get past project loading
    const workspace = await mkdtemp(join(tmpdir(), 'devplanner-dispatch-svc-test-'));
    try {
      const { ProjectService } = await import('../services/project.service');
      const projectService = new ProjectService(workspace);
      await projectService.createProject('Test Project');

      await expect(
        service.dispatch('test-project', 'some-card', {
          adapter: 'claude-cli',
          autoCreatePR: false,
        }, workspace)
      ).rejects.toThrow('repository path');
    } finally {
      await rm(workspace, { recursive: true, force: true });
      DispatchService._resetInstance();
    }
  });
});
