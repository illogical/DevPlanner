#!/usr/bin/env node
/**
 * DevPlanner MCP Server
 * 
 * Provides Model Context Protocol interface for AI agents to interact with DevPlanner.
 * Supports stdio transport for communication with MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { toolHandlers } from './mcp/tool-handlers.js';
import { resourceProviders } from './mcp/resource-providers.js';
import { toMCPError } from './mcp/errors.js';

// Initialize MCP server
const server = new Server(
  {
    name: 'devplanner',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register list_tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Core CRUD Tools
      {
        name: 'list_projects',
        description: 'List all projects with summary statistics. Use this to discover available projects.',
        inputSchema: (await import('./mcp/schemas.js')).LIST_PROJECTS_SCHEMA,
      },
      {
        name: 'get_project',
        description: 'Get detailed information about a specific project including lane configuration.',
        inputSchema: (await import('./mcp/schemas.js')).GET_PROJECT_SCHEMA,
      },
      {
        name: 'create_project',
        description: 'Create a new project with default lanes.',
        inputSchema: (await import('./mcp/schemas.js')).CREATE_PROJECT_SCHEMA,
      },
      {
        name: 'list_cards',
        description: 'List cards in a project with optional filtering by lane, priority, assignee, tags, or status.',
        inputSchema: (await import('./mcp/schemas.js')).LIST_CARDS_SCHEMA,
      },
      {
        name: 'get_card',
        description: 'Get full details of a specific card including content and tasks.',
        inputSchema: (await import('./mcp/schemas.js')).GET_CARD_SCHEMA,
      },
      {
        name: 'create_card',
        description: 'Create a new card in a project.',
        inputSchema: (await import('./mcp/schemas.js')).CREATE_CARD_SCHEMA,
      },
      {
        name: 'update_card',
        description: 'Update card metadata (title, status, priority, assignee, tags).',
        inputSchema: (await import('./mcp/schemas.js')).UPDATE_CARD_SCHEMA,
      },
      {
        name: 'move_card',
        description: 'Move a card to a different lane.',
        inputSchema: (await import('./mcp/schemas.js')).MOVE_CARD_SCHEMA,
      },
      {
        name: 'add_task',
        description: 'Add a new task to a card\'s checklist.',
        inputSchema: (await import('./mcp/schemas.js')).ADD_TASK_SCHEMA,
      },
      {
        name: 'toggle_task',
        description: 'Toggle a task\'s checked state or set it explicitly.',
        inputSchema: (await import('./mcp/schemas.js')).TOGGLE_TASK_SCHEMA,
      },
      // Smart/Workflow Tools
      {
        name: 'get_board_overview',
        description: 'Get a comprehensive overview of a project\'s Kanban board with statistics for each lane.',
        inputSchema: (await import('./mcp/schemas.js')).GET_BOARD_OVERVIEW_SCHEMA,
      },
      {
        name: 'get_next_tasks',
        description: 'Get uncompleted tasks sorted by priority and lane. Useful for finding work to do.',
        inputSchema: (await import('./mcp/schemas.js')).GET_NEXT_TASKS_SCHEMA,
      },
      {
        name: 'batch_update_tasks',
        description: 'Update multiple tasks in a card at once. More efficient than calling toggle_task repeatedly.',
        inputSchema: (await import('./mcp/schemas.js')).BATCH_UPDATE_TASKS_SCHEMA,
      },
      {
        name: 'search_cards',
        description: 'Search for cards by text in title, content, or tags.',
        inputSchema: (await import('./mcp/schemas.js')).SEARCH_CARDS_SCHEMA,
      },
      {
        name: 'update_card_content',
        description: 'Replace a card\'s markdown content body. Preserves frontmatter and tasks.',
        inputSchema: (await import('./mcp/schemas.js')).UPDATE_CARD_CONTENT_SCHEMA,
      },
      {
        name: 'get_project_progress',
        description: 'Get detailed progress statistics for a project.',
        inputSchema: (await import('./mcp/schemas.js')).GET_PROJECT_PROGRESS_SCHEMA,
      },
      {
        name: 'archive_card',
        description: 'Move a card to the archive lane.',
        inputSchema: (await import('./mcp/schemas.js')).ARCHIVE_CARD_SCHEMA,
      },
      // File Management Tools
      {
        name: 'list_project_files',
        description: 'List all files in a project with their descriptions and card associations. Use this to discover available reference materials before reading specific files.',
        inputSchema: (await import('./mcp/schemas.js')).LIST_PROJECT_FILES_SCHEMA,
      },
      {
        name: 'list_card_files',
        description: 'List files associated with a specific card. Returns filenames, descriptions, and metadata. Call read_file_content to read the actual content of text-based files.',
        inputSchema: (await import('./mcp/schemas.js')).LIST_CARD_FILES_SCHEMA,
      },
      {
        name: 'read_file_content',
        description: 'Read the text content of a file in a project. Only works for text-based files (markdown, plain text, JSON, code files, etc.). Returns an error for binary files like PDFs and images.',
        inputSchema: (await import('./mcp/schemas.js')).READ_FILE_CONTENT_SCHEMA,
      },
    ],
  };
});

// Register call_tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Find and execute the appropriate tool handler
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await handler(args as never);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const mcpError = toMCPError(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mcpError, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Register list_resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'devplanner://projects',
        name: 'All Projects',
        description: 'List of all projects in the workspace',
        mimeType: 'application/json',
      },
    ],
  };
});

// Register read_resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    const result = await resourceProviders.readResource(uri);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const mcpError = toMCPError(error);
    throw new Error(JSON.stringify(mcpError));
  }
});

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdout is used for MCP protocol)
  console.error('[MCP] DevPlanner MCP Server started');
  console.error('[MCP] Ready to accept connections via stdio');
}

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
