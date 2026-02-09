/**
 * JSON Schema definitions for MCP tools
 * 
 * These schemas validate input parameters for each tool following the MCP specification.
 * They provide type hints and descriptions to help AI assistants use the tools correctly.
 */

export const LIST_PROJECTS_SCHEMA = {
  type: 'object',
  properties: {
    includeArchived: {
      type: 'boolean',
      description: 'Include archived projects in results. Default: false',
      default: false,
    },
  },
} as const;

export const GET_PROJECT_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier (slug)',
    },
  },
  required: ['projectSlug'],
} as const;

export const CREATE_PROJECT_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Human-readable project name',
    },
    description: {
      type: 'string',
      description: 'Optional project description',
    },
  },
  required: ['name'],
} as const;

export const LIST_CARDS_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    lane: {
      type: 'string',
      description: 'Filter by lane slug (e.g., "01-upcoming", "02-in-progress")',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'Filter by priority level',
    },
    assignee: {
      type: 'string',
      enum: ['user', 'agent'],
      description: 'Filter by assignee',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Filter by tags (cards must have ALL specified tags)',
    },
    status: {
      type: 'string',
      enum: ['in-progress', 'blocked', 'review', 'testing'],
      description: 'Filter by status',
    },
  },
  required: ['projectSlug'],
} as const;

export const GET_CARD_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier (slug)',
    },
  },
  required: ['projectSlug', 'cardSlug'],
} as const;

export const CREATE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    title: {
      type: 'string',
      description: 'Card title',
    },
    lane: {
      type: 'string',
      description: 'Lane slug. Default: "01-upcoming"',
      default: '01-upcoming',
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'Priority level',
    },
    assignee: {
      type: 'string',
      enum: ['user', 'agent'],
      description: 'Assignee',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags for categorization',
    },
    content: {
      type: 'string',
      description: 'Markdown content for the card body',
    },
    status: {
      type: 'string',
      enum: ['in-progress', 'blocked', 'review', 'testing'],
      description: 'Card status',
    },
  },
  required: ['projectSlug', 'title'],
} as const;

export const UPDATE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    title: {
      type: 'string',
      description: 'New card title',
    },
    status: {
      type: ['string', 'null'],
      enum: ['in-progress', 'blocked', 'review', 'testing', null],
      description: 'Card status. Use null to clear',
    },
    priority: {
      type: ['string', 'null'],
      enum: ['low', 'medium', 'high', null],
      description: 'Priority level. Use null to clear',
    },
    assignee: {
      type: ['string', 'null'],
      enum: ['user', 'agent', null],
      description: 'Assignee. Use null to clear',
    },
    tags: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'Tags. Use null to clear all tags',
    },
  },
  required: ['projectSlug', 'cardSlug'],
} as const;

export const MOVE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    targetLane: {
      type: 'string',
      description: 'Target lane slug (e.g., "02-in-progress", "03-complete")',
    },
    position: {
      type: 'number',
      description: 'Position in target lane (0-based). Omit to append to end',
    },
  },
  required: ['projectSlug', 'cardSlug', 'targetLane'],
} as const;

export const ADD_TASK_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    text: {
      type: 'string',
      description: 'Task text (max 500 characters)',
      maxLength: 500,
    },
  },
  required: ['projectSlug', 'cardSlug', 'text'],
} as const;

export const TOGGLE_TASK_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    taskIndex: {
      type: 'number',
      description: '0-based task index',
      minimum: 0,
    },
    checked: {
      type: 'boolean',
      description: 'New checked state. If omitted, toggles current state',
    },
  },
  required: ['projectSlug', 'cardSlug', 'taskIndex'],
} as const;

export const GET_BOARD_OVERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
  },
  required: ['projectSlug'],
} as const;

export const GET_NEXT_TASKS_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    assignee: {
      type: 'string',
      enum: ['user', 'agent'],
      description: 'Filter tasks by assignee',
    },
    lane: {
      type: 'string',
      description: 'Filter tasks from specific lane',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of tasks to return. Default: 20, Max: 100',
      default: 20,
      minimum: 1,
      maximum: 100,
    },
  },
  required: ['projectSlug'],
} as const;

export const BATCH_UPDATE_TASKS_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskIndex: {
            type: 'number',
            description: '0-based task index',
            minimum: 0,
          },
          checked: {
            type: 'boolean',
            description: 'New checked state',
          },
        },
        required: ['taskIndex', 'checked'],
      },
      description: 'Array of task updates to apply',
    },
  },
  required: ['projectSlug', 'cardSlug', 'updates'],
} as const;

export const SEARCH_CARDS_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    query: {
      type: 'string',
      description: 'Search query string',
    },
    searchIn: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['title', 'content', 'tags'],
      },
      description: 'Fields to search in. Default: all fields',
      default: ['title', 'content', 'tags'],
    },
  },
  required: ['projectSlug', 'query'],
} as const;

export const UPDATE_CARD_CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
    content: {
      type: 'string',
      description: 'New Markdown content for card body (replaces existing content)',
    },
  },
  required: ['projectSlug', 'cardSlug', 'content'],
} as const;

export const GET_PROJECT_PROGRESS_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
  },
  required: ['projectSlug'],
} as const;

export const ARCHIVE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    projectSlug: {
      type: 'string',
      description: 'Project identifier',
    },
    cardSlug: {
      type: 'string',
      description: 'Card identifier',
    },
  },
  required: ['projectSlug', 'cardSlug'],
} as const;
