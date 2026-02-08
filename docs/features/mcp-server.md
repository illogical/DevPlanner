# MCP (Model Context Protocol) Server Integration (Phase 18)

**Status:** Not Started
**Dependencies:** Phases 1-17 (Complete MVP)
**Priority:** High (enables AI agent workflows)

---

## Overview

Phase 18 integrates DevPlanner with the **Model Context Protocol (MCP)**, enabling AI coding assistants like Claude Code and GitHub Copilot to directly interact with DevPlanner projects as a structured work management system. This transforms DevPlanner from a human-centric tool into a true **AI-native task management platform**.

### Why MCP?

The Model Context Protocol provides a standardized way for AI assistants to access external tools and data sources. By implementing an MCP server for DevPlanner:

- AI agents can **discover available work** without manual intervention
- Agents can **claim and track their tasks** systematically
- Multiple agents can **coordinate work** across projects
- All interactions are **typed and validated** for reliability
- Context is **rich and structured** for better AI decision-making

### Agent Workflow Example

```
1. Agent launches → MCP connects to DevPlanner
2. Agent calls `get_board_overview` → sees all active work
3. Agent calls `get_next_tasks(assignee='agent')` → finds uncompleted tasks
4. Agent picks task, calls `update_card(assignee='agent')` → claims work
5. Agent works on implementation
6. Agent calls `toggle_task(...)` as subtasks complete → reports progress
7. Agent finishes, calls `move_card(targetLane='complete')` → marks done
8. Agent calls `update_card_content(...)` → adds implementation notes
```

This creates a **self-documenting, auditable workflow** where all agent actions are tracked in DevPlanner's history and visible to human collaborators.

---

## Architecture

### MCP Server Entry Points

DevPlanner will provide **two MCP transport modes**:

1. **stdio transport** (recommended) — Standard input/output, works with all MCP clients
   - Entry point: `src/mcp-server.ts`
   - Launched as: `bun src/mcp-server.ts`
   - Used by: Claude Desktop, Claude Code CLI, custom scripts

2. **SSE transport** (optional) — Server-Sent Events over HTTP
   - Integrated into: `src/server.ts` (alongside REST API)
   - Endpoint: `/mcp/sse` (separate from REST API)
   - Used by: Web-based AI tools, browser extensions

### Service Layer Reuse

The MCP server will **reuse all existing services** without duplication:

```
┌─────────────────────────────────────────────┐
│         MCP Server (src/mcp-server.ts)      │
│   - Tool handler functions                  │
│   - Resource provider functions             │
│   - MCP SDK integration                     │
└──────────────┬──────────────────────────────┘
               │
               ├── Calls existing services ────┐
               │                               │
┌──────────────▼────────────┐    ┌────────────▼──────────┐
│   ProjectService          │    │   CardService         │
│   - listProjects()        │    │   - listCards()       │
│   - getProject()          │    │   - getCard()         │
│   - createProject()       │    │   - createCard()      │
└───────────────────────────┘    └───────────────────────┘
                                              │
                               ┌──────────────▼──────────┐
                               │   TaskService           │
                               │   - addTask()           │
                               │   - setTaskChecked()    │
                               └─────────────────────────┘
```

**Benefits:**
- No logic duplication
- Consistent behavior with REST API
- Automatic file watching and WebSocket updates
- Existing validation and error handling

### MCP SDK Integration

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'devplanner',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},      // Advertise tool support
      resources: {},  // Advertise resource support
    },
  }
);
```

---

## MCP Tools (17 tools)

### Core CRUD Tools

#### 1. `list_projects`

**Description:** List all projects with summary statistics. Use this to discover what projects exist and get an overview of work across the entire workspace.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "includeArchived": {
      "type": "boolean",
      "description": "Include archived projects in results",
      "default": false
    }
  }
}
```

**Output Format:**
```json
{
  "projects": [
    {
      "slug": "media-manager",
      "name": "Media Manager",
      "description": "File organization tool",
      "cardCounts": {
        "01-upcoming": 5,
        "02-in-progress": 2,
        "03-complete": 12,
        "04-archive": 3
      },
      "archived": false,
      "created": "2024-01-15T10:30:00Z",
      "updated": "2024-02-08T14:22:00Z"
    }
  ],
  "total": 3
}
```

**Example Usage:**
```
Agent: "Show me what projects are available"
→ Calls list_projects() → Gets overview of all active projects
```

---

#### 2. `get_project`

**Description:** Get detailed information about a specific project including lane configuration and card counts. Use this to understand a project's structure before querying cards.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier (slug)"
    }
  },
  "required": ["projectSlug"]
}
```

**Output Format:**
```json
{
  "slug": "media-manager",
  "name": "Media Manager",
  "description": "File organization tool",
  "lanes": {
    "01-upcoming": {
      "displayName": "Upcoming",
      "color": "#3b82f6",
      "collapsed": false
    },
    "02-in-progress": {
      "displayName": "In Progress",
      "color": "#f59e0b",
      "collapsed": false
    },
    "03-complete": {
      "displayName": "Complete",
      "color": "#10b981",
      "collapsed": true
    },
    "04-archive": {
      "displayName": "Archive",
      "color": "#6b7280",
      "collapsed": true
    }
  },
  "cardCounts": {
    "01-upcoming": 5,
    "02-in-progress": 2,
    "03-complete": 12,
    "04-archive": 3
  },
  "archived": false,
  "created": "2024-01-15T10:30:00Z",
  "updated": "2024-02-08T14:22:00Z"
}
```

**Example Usage:**
```
Agent: "Tell me about the media-manager project"
→ Calls get_project(projectSlug='media-manager')
```

---

#### 3. `create_project`

**Description:** Create a new project with default lane structure. The project will be initialized with four lanes: Upcoming, In Progress, Complete, and Archive.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Project display name"
    },
    "description": {
      "type": "string",
      "description": "Optional project description"
    }
  },
  "required": ["name"]
}
```

**Output Format:**
```json
{
  "slug": "new-project",
  "name": "New Project",
  "description": "Project description",
  "archived": false,
  "created": "2024-02-08T15:00:00Z",
  "updated": "2024-02-08T15:00:00Z",
  "lanes": {
    "01-upcoming": {...},
    "02-in-progress": {...},
    "03-complete": {...},
    "04-archive": {...}
  }
}
```

**Example Usage:**
```
Agent: "Create a new project called 'API Documentation'"
→ Calls create_project(name='API Documentation')
```

---

#### 4. `list_cards`

**Description:** List cards with rich filtering options. Returns card summaries including title, status, priority, assignee, tags, and task progress. Use this to find specific cards or get an overview of work in a lane.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "lane": {
      "type": "string",
      "description": "Filter by lane (e.g., '02-in-progress')",
      "enum": ["01-upcoming", "02-in-progress", "03-complete", "04-archive"]
    },
    "priority": {
      "type": "string",
      "description": "Filter by priority level",
      "enum": ["low", "medium", "high"]
    },
    "assignee": {
      "type": "string",
      "description": "Filter by assignee",
      "enum": ["user", "agent"]
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Filter by tags (matches any tag)"
    },
    "status": {
      "type": "string",
      "description": "Filter by status",
      "enum": ["in-progress", "blocked", "review", "testing"]
    }
  },
  "required": ["projectSlug"]
}
```

**Output Format:**
```json
{
  "cards": [
    {
      "slug": "user-authentication",
      "filename": "user-authentication.md",
      "lane": "02-in-progress",
      "frontmatter": {
        "title": "User Authentication",
        "status": "in-progress",
        "priority": "high",
        "assignee": "agent",
        "created": "2024-02-01T10:00:00Z",
        "updated": "2024-02-08T14:30:00Z",
        "tags": ["auth", "security"]
      },
      "taskProgress": {
        "total": 5,
        "checked": 2
      }
    }
  ],
  "total": 1
}
```

**Example Usage:**
```
Agent: "Show me all in-progress cards assigned to agents"
→ Calls list_cards(projectSlug='media-manager', lane='02-in-progress', assignee='agent')
```

---

#### 5. `get_card`

**Description:** Get complete card details including full markdown content and all tasks. Use this when you need to read the card's description or work on specific tasks.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier (filename without .md)"
    }
  },
  "required": ["projectSlug", "cardSlug"]
}
```

**Output Format:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "02-in-progress",
  "frontmatter": {
    "title": "User Authentication",
    "status": "in-progress",
    "priority": "high",
    "assignee": "agent",
    "created": "2024-02-01T10:00:00Z",
    "updated": "2024-02-08T14:30:00Z",
    "tags": ["auth", "security"]
  },
  "content": "## Overview\n\nImplement JWT-based authentication...",
  "tasks": [
    {
      "index": 0,
      "text": "Set up JWT library",
      "checked": true
    },
    {
      "index": 1,
      "text": "Create auth middleware",
      "checked": true
    },
    {
      "index": 2,
      "text": "Add login endpoint",
      "checked": false
    }
  ]
}
```

**Example Usage:**
```
Agent: "What are the details of the user-authentication card?"
→ Calls get_card(projectSlug='media-manager', cardSlug='user-authentication')
```

---

#### 6. `create_card`

**Description:** Create a new card in a specified lane with optional metadata. The card will be created with a unique slug and placed at the top of the lane.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "title": {
      "type": "string",
      "description": "Card title (will be slugified for filename)"
    },
    "lane": {
      "type": "string",
      "description": "Target lane (defaults to '01-upcoming')",
      "enum": ["01-upcoming", "02-in-progress", "03-complete", "04-archive"],
      "default": "01-upcoming"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high"]
    },
    "assignee": {
      "type": "string",
      "enum": ["user", "agent"]
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"}
    },
    "content": {
      "type": "string",
      "description": "Markdown body content"
    },
    "status": {
      "type": "string",
      "enum": ["in-progress", "blocked", "review", "testing"]
    }
  },
  "required": ["projectSlug", "title"]
}
```

**Output Format:**
```json
{
  "slug": "new-feature",
  "filename": "new-feature.md",
  "lane": "01-upcoming",
  "frontmatter": {
    "title": "New Feature",
    "priority": "medium",
    "created": "2024-02-08T15:00:00Z",
    "updated": "2024-02-08T15:00:00Z"
  },
  "content": "",
  "tasks": []
}
```

**Example Usage:**
```
Agent: "Create a card for implementing OAuth2"
→ Calls create_card(projectSlug='media-manager', title='Implement OAuth2', priority='high', assignee='agent')
```

---

#### 7. `update_card`

**Description:** Update card frontmatter fields (title, priority, assignee, tags, status). Does not modify the card's content or tasks. Use this to claim a card, change priority, or update status.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "title": {
      "type": "string",
      "description": "New card title"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high"]
    },
    "assignee": {
      "type": "string",
      "enum": ["user", "agent"]
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Replaces existing tags (not additive)"
    },
    "status": {
      "type": "string",
      "enum": ["in-progress", "blocked", "review", "testing"]
    }
  },
  "required": ["projectSlug", "cardSlug"]
}
```

**Output Format:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "02-in-progress",
  "frontmatter": {
    "title": "User Authentication",
    "status": "in-progress",
    "priority": "high",
    "assignee": "agent",
    "updated": "2024-02-08T15:05:00Z",
    "tags": ["auth", "security", "jwt"]
  },
  "content": "...",
  "tasks": [...]
}
```

**Example Usage:**
```
Agent: "I'm starting work on the auth card"
→ Calls update_card(projectSlug='media-manager', cardSlug='user-authentication', assignee='agent', status='in-progress')
```

---

#### 8. `move_card`

**Description:** Move a card from one lane to another. Automatically updates the card's lane metadata and reorders both source and target lanes. Use this to progress cards through your workflow (Upcoming → In Progress → Complete).

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "targetLane": {
      "type": "string",
      "description": "Destination lane",
      "enum": ["01-upcoming", "02-in-progress", "03-complete", "04-archive"]
    }
  },
  "required": ["projectSlug", "cardSlug", "targetLane"]
}
```

**Output Format:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "03-complete",
  "frontmatter": {
    "title": "User Authentication",
    "updated": "2024-02-08T16:00:00Z"
  },
  "content": "...",
  "tasks": [...]
}
```

**Example Usage:**
```
Agent: "I finished the authentication work"
→ Calls move_card(projectSlug='media-manager', cardSlug='user-authentication', targetLane='03-complete')
```

---

#### 9. `add_task`

**Description:** Add a new unchecked task to a card's checklist. Tasks are appended to the end of the existing task list. Use this when you discover additional work items while implementing a card.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "text": {
      "type": "string",
      "description": "Task description text"
    }
  },
  "required": ["projectSlug", "cardSlug", "text"]
}
```

**Output Format:**
```json
{
  "task": {
    "index": 5,
    "text": "Add error handling for token expiry",
    "checked": false
  },
  "card": {
    "slug": "user-authentication",
    "taskProgress": {
      "total": 6,
      "checked": 2
    }
  }
}
```

**Example Usage:**
```
Agent: "I need to add a task for error handling"
→ Calls add_task(projectSlug='media-manager', cardSlug='user-authentication', text='Add error handling for token expiry')
```

---

#### 10. `toggle_task`

**Description:** Toggle a task's completion state (checked ↔ unchecked). Use this to mark tasks complete as you work through them, or to uncheck tasks that need rework.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "taskIndex": {
      "type": "integer",
      "description": "Zero-based task index",
      "minimum": 0
    },
    "checked": {
      "type": "boolean",
      "description": "Target state (true = checked, false = unchecked). If omitted, toggles current state."
    }
  },
  "required": ["projectSlug", "cardSlug", "taskIndex"]
}
```

**Output Format:**
```json
{
  "task": {
    "index": 2,
    "text": "Add login endpoint",
    "checked": true
  },
  "card": {
    "slug": "user-authentication",
    "taskProgress": {
      "total": 5,
      "checked": 3
    }
  }
}
```

**Example Usage:**
```
Agent: "I completed the login endpoint task"
→ Calls toggle_task(projectSlug='media-manager', cardSlug='user-authentication', taskIndex=2, checked=true)
```

---

### Smart/Workflow Tools

#### 11. `get_board_overview`

**Description:** Get a comprehensive board summary with all lanes, card counts, task progress statistics, and priority breakdowns. This is designed to give an LLM maximum context in a single call, ideal for agents to understand the full state of a project before starting work.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    }
  },
  "required": ["projectSlug"]
}
```

**Output Format:**
```json
{
  "project": {
    "slug": "media-manager",
    "name": "Media Manager",
    "description": "File organization tool"
  },
  "lanes": {
    "01-upcoming": {
      "displayName": "Upcoming",
      "color": "#3b82f6",
      "cardCount": 5,
      "taskStats": {
        "total": 23,
        "completed": 0,
        "completionRate": 0
      },
      "priorityBreakdown": {
        "high": 2,
        "medium": 2,
        "low": 1
      }
    },
    "02-in-progress": {
      "displayName": "In Progress",
      "color": "#f59e0b",
      "cardCount": 2,
      "taskStats": {
        "total": 10,
        "completed": 6,
        "completionRate": 0.6
      },
      "priorityBreakdown": {
        "high": 1,
        "medium": 1,
        "low": 0
      }
    },
    "03-complete": {
      "displayName": "Complete",
      "color": "#10b981",
      "cardCount": 12,
      "taskStats": {
        "total": 58,
        "completed": 58,
        "completionRate": 1.0
      },
      "priorityBreakdown": {
        "high": 4,
        "medium": 6,
        "low": 2
      }
    },
    "04-archive": {
      "displayName": "Archive",
      "color": "#6b7280",
      "cardCount": 3,
      "taskStats": {
        "total": 15,
        "completed": 15,
        "completionRate": 1.0
      },
      "priorityBreakdown": {
        "high": 1,
        "medium": 1,
        "low": 1
      }
    }
  },
  "summary": {
    "totalCards": 22,
    "totalTasks": 106,
    "completedTasks": 79,
    "overallCompletionRate": 0.745
  }
}
```

**Example Usage:**
```
Agent: "Give me a full overview of the media-manager project"
→ Calls get_board_overview(projectSlug='media-manager')
→ Agent sees: 2 cards in progress with 60% task completion, 5 upcoming cards (2 high priority)
```

---

#### 12. `get_next_tasks`

**Description:** Get all uncompleted tasks across a project, optionally filtered by assignee. Returns tasks sorted by card priority (high → medium → low) and lane order (in-progress first). Perfect for agents to find their next work item without scanning all cards manually.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "assignee": {
      "type": "string",
      "description": "Filter tasks by card assignee",
      "enum": ["user", "agent"]
    },
    "lane": {
      "type": "string",
      "description": "Filter tasks by lane",
      "enum": ["01-upcoming", "02-in-progress", "03-complete", "04-archive"]
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of tasks to return",
      "default": 20,
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": ["projectSlug"]
}
```

**Output Format:**
```json
{
  "tasks": [
    {
      "task": {
        "index": 2,
        "text": "Add login endpoint",
        "checked": false
      },
      "card": {
        "slug": "user-authentication",
        "title": "User Authentication",
        "lane": "02-in-progress",
        "priority": "high",
        "assignee": "agent",
        "status": "in-progress"
      },
      "project": {
        "slug": "media-manager",
        "name": "Media Manager"
      }
    },
    {
      "task": {
        "index": 0,
        "text": "Research OAuth2 providers",
        "checked": false
      },
      "card": {
        "slug": "oauth2-integration",
        "title": "OAuth2 Integration",
        "lane": "02-in-progress",
        "priority": "high",
        "assignee": "agent",
        "status": "in-progress"
      },
      "project": {
        "slug": "media-manager",
        "name": "Media Manager"
      }
    }
  ],
  "total": 2
}
```

**Example Usage:**
```
Agent: "What tasks should I work on next?"
→ Calls get_next_tasks(projectSlug='media-manager', assignee='agent', lane='02-in-progress')
→ Agent sees prioritized list of uncompleted tasks in in-progress cards
```

---

#### 13. `batch_update_tasks`

**Description:** Toggle multiple tasks at once for efficiency. Useful when an agent completes several related subtasks simultaneously. All tasks are updated atomically within a single file write.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "updates": {
      "type": "array",
      "description": "Array of task updates",
      "items": {
        "type": "object",
        "properties": {
          "taskIndex": {
            "type": "integer",
            "minimum": 0
          },
          "checked": {
            "type": "boolean"
          }
        },
        "required": ["taskIndex", "checked"]
      },
      "minItems": 1
    }
  },
  "required": ["projectSlug", "cardSlug", "updates"]
}
```

**Output Format:**
```json
{
  "updated": [
    {
      "index": 0,
      "text": "Set up JWT library",
      "checked": true
    },
    {
      "index": 1,
      "text": "Create auth middleware",
      "checked": true
    }
  ],
  "card": {
    "slug": "user-authentication",
    "taskProgress": {
      "total": 5,
      "checked": 4
    }
  }
}
```

**Example Usage:**
```
Agent: "I completed three setup tasks"
→ Calls batch_update_tasks(projectSlug='media-manager', cardSlug='user-authentication', updates=[{taskIndex:0, checked:true}, {taskIndex:1, checked:true}, {taskIndex:2, checked:true}])
```

---

#### 14. `search_cards`

**Description:** Full-text search across card titles, content, tags, and frontmatter fields. Returns ranked results. Use this to find cards by keyword, locate related work, or check if a card already exists before creating a duplicate.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "query": {
      "type": "string",
      "description": "Search query (searches title, content, tags)"
    },
    "fields": {
      "type": "array",
      "description": "Limit search to specific fields",
      "items": {
        "type": "string",
        "enum": ["title", "content", "tags", "assignee", "priority", "status"]
      }
    },
    "limit": {
      "type": "integer",
      "description": "Maximum results to return",
      "default": 20,
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": ["projectSlug", "query"]
}
```

**Output Format:**
```json
{
  "results": [
    {
      "card": {
        "slug": "user-authentication",
        "filename": "user-authentication.md",
        "lane": "02-in-progress",
        "frontmatter": {
          "title": "User Authentication",
          "priority": "high",
          "tags": ["auth", "security"]
        },
        "taskProgress": {
          "total": 5,
          "checked": 2
        }
      },
      "matchedFields": ["title", "tags"],
      "excerpt": "...implement JWT-based authentication..."
    }
  ],
  "total": 1,
  "query": "authentication"
}
```

**Example Usage:**
```
Agent: "Is there already a card about OAuth?"
→ Calls search_cards(projectSlug='media-manager', query='OAuth')
→ Agent discovers existing oauth2-integration card
```

---

#### 15. `update_card_content`

**Description:** Update the markdown body of a card (the content below frontmatter). Use this to add implementation notes, documentation, code snippets, or other details after completing work. Does not modify frontmatter or tasks.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    },
    "content": {
      "type": "string",
      "description": "New markdown content (replaces existing content)"
    },
    "append": {
      "type": "boolean",
      "description": "If true, appends to existing content instead of replacing",
      "default": false
    }
  },
  "required": ["projectSlug", "cardSlug", "content"]
}
```

**Output Format:**
```json
{
  "slug": "user-authentication",
  "filename": "user-authentication.md",
  "lane": "03-complete",
  "frontmatter": {
    "title": "User Authentication",
    "updated": "2024-02-08T16:30:00Z"
  },
  "content": "## Overview\n\nImplemented JWT-based authentication...\n\n## Implementation Notes\n\nUsed jsonwebtoken library version 9.0.0...",
  "tasks": [...]
}
```

**Example Usage:**
```
Agent: "Add implementation notes to the auth card"
→ Calls update_card_content(projectSlug='media-manager', cardSlug='user-authentication', content='## Implementation Notes\n\nUsed jsonwebtoken library...', append=true)
```

---

#### 16. `get_project_progress`

**Description:** Get detailed completion statistics for a project broken down by lane and priority level. Useful for reporting overall project health and identifying bottlenecks.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    }
  },
  "required": ["projectSlug"]
}
```

**Output Format:**
```json
{
  "project": {
    "slug": "media-manager",
    "name": "Media Manager"
  },
  "byLane": {
    "01-upcoming": {
      "cardCount": 5,
      "taskCount": 23,
      "completedTasks": 0,
      "completionRate": 0
    },
    "02-in-progress": {
      "cardCount": 2,
      "taskCount": 10,
      "completedTasks": 6,
      "completionRate": 0.6
    },
    "03-complete": {
      "cardCount": 12,
      "taskCount": 58,
      "completedTasks": 58,
      "completionRate": 1.0
    },
    "04-archive": {
      "cardCount": 3,
      "taskCount": 15,
      "completedTasks": 15,
      "completionRate": 1.0
    }
  },
  "byPriority": {
    "high": {
      "cardCount": 7,
      "taskCount": 38,
      "completedTasks": 25,
      "completionRate": 0.658
    },
    "medium": {
      "cardCount": 10,
      "taskCount": 50,
      "completedTasks": 38,
      "completionRate": 0.76
    },
    "low": {
      "cardCount": 5,
      "taskCount": 18,
      "completedTasks": 16,
      "completionRate": 0.889
    }
  },
  "overall": {
    "totalCards": 22,
    "totalTasks": 106,
    "completedTasks": 79,
    "completionRate": 0.745
  }
}
```

**Example Usage:**
```
Agent: "How much progress have we made on media-manager?"
→ Calls get_project_progress(projectSlug='media-manager')
→ Agent sees: 74.5% overall completion, high-priority cards at 65.8%
```

---

#### 17. `archive_card`

**Description:** Archive a card by moving it to the 04-archive lane. This is a convenience wrapper around move_card specifically for archival. Use this for completed work that should be hidden from active views or for abandoned cards.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectSlug": {
      "type": "string",
      "description": "Project identifier"
    },
    "cardSlug": {
      "type": "string",
      "description": "Card identifier"
    }
  },
  "required": ["projectSlug", "cardSlug"]
}
```

**Output Format:**
```json
{
  "slug": "old-feature",
  "filename": "old-feature.md",
  "lane": "04-archive",
  "frontmatter": {
    "title": "Old Feature",
    "updated": "2024-02-08T17:00:00Z"
  },
  "content": "...",
  "tasks": [...]
}
```

**Example Usage:**
```
Agent: "Archive the deprecated auth card"
→ Calls archive_card(projectSlug='media-manager', cardSlug='old-auth-implementation')
```

---

## MCP Resources (3 resources)

Resources provide read-only access to DevPlanner data through structured URIs. Unlike tools (which perform actions), resources are for data retrieval and context loading.

### 1. `devplanner://projects`

**Description:** List of all projects with summary information.

**MIME Type:** `application/json`

**Schema:**
```json
{
  "uri": "devplanner://projects",
  "mimeType": "application/json",
  "content": {
    "projects": [
      {
        "slug": "media-manager",
        "name": "Media Manager",
        "description": "File organization tool",
        "cardCounts": {...},
        "archived": false
      }
    ]
  }
}
```

**Usage:** AI can read this resource to discover available projects without calling a tool.

---

### 2. `devplanner://projects/{slug}`

**Description:** Full board state for a single project including all cards in all lanes.

**MIME Type:** `application/json`

**Schema:**
```json
{
  "uri": "devplanner://projects/media-manager",
  "mimeType": "application/json",
  "content": {
    "project": {
      "slug": "media-manager",
      "name": "Media Manager",
      "description": "..."
    },
    "lanes": {
      "01-upcoming": {
        "displayName": "Upcoming",
        "cards": [...]
      },
      "02-in-progress": {
        "displayName": "In Progress",
        "cards": [...]
      }
    }
  }
}
```

**Usage:** AI can read full project state in one resource fetch (alternative to multiple tool calls).

---

### 3. `devplanner://projects/{slug}/cards/{cardSlug}`

**Description:** Full details of a single card including content and tasks.

**MIME Type:** `application/json`

**Schema:**
```json
{
  "uri": "devplanner://projects/media-manager/cards/user-authentication",
  "mimeType": "application/json",
  "content": {
    "slug": "user-authentication",
    "filename": "user-authentication.md",
    "lane": "02-in-progress",
    "frontmatter": {...},
    "content": "...",
    "tasks": [...]
  }
}
```

**Usage:** AI can read card details as a resource instead of calling get_card tool.

---

## Error Handling

All MCP tools follow consistent error response patterns to help LLMs understand what went wrong and how to fix it.

### Error Response Format

```json
{
  "error": "CARD_NOT_FOUND",
  "message": "Card 'user-auth' not found in project 'media-manager'. Check the card slug (it may have been moved or deleted).",
  "expected": "Valid card slug from list_cards() response",
  "suggestions": [
    "Call list_cards(projectSlug='media-manager') to see all available cards",
    "Verify the card slug spelling (slugs are lowercase with hyphens)"
  ]
}
```

### Common Error Codes

| Error Code | Meaning | Suggested Action |
|------------|---------|------------------|
| `PROJECT_NOT_FOUND` | Project slug doesn't exist | Call `list_projects()` to see available projects |
| `CARD_NOT_FOUND` | Card slug doesn't exist in project | Call `list_cards()` to find valid card slugs |
| `TASK_INDEX_OUT_OF_RANGE` | Task index exceeds task list length | Call `get_card()` to see current task list |
| `INVALID_LANE` | Lane slug is malformed | Use one of: `01-upcoming`, `02-in-progress`, `03-complete`, `04-archive` |
| `VALIDATION_ERROR` | Input schema validation failed | Check required fields and data types in tool schema |
| `FILE_OPERATION_ERROR` | Disk I/O error (permissions, full disk) | Check workspace directory permissions and disk space |

### LLM-Friendly Error Messages

All error messages include:
1. **What went wrong** — Clear description of the error
2. **Why it happened** — Context about the cause
3. **How to fix it** — Concrete next steps or alternative approaches

**Example:**
```
"Card 'user-auth' not found in project 'media-manager'. This usually means the card was moved to a different lane, archived, or deleted. Try calling list_cards(projectSlug='media-manager') to see all current cards, or search_cards(projectSlug='media-manager', query='auth') to find similar cards."
```

---

## Implementation Plan

### Files to Create

1. **`src/mcp-server.ts`** — Main MCP server entry point (stdio transport)
   - Initialize MCP Server from SDK
   - Register all 17 tools with handlers
   - Register all 3 resources with providers
   - Set up error handling and logging
   - Export for standalone execution

2. **`src/mcp/tool-handlers.ts`** — Tool implementation functions
   - One function per MCP tool
   - All functions call existing services (ProjectService, CardService, etc.)
   - Input validation using existing types
   - Error mapping from service exceptions to MCP error format

3. **`src/mcp/resource-providers.ts`** — Resource provider functions
   - Implement URI parsing and routing
   - Fetch data from services
   - Return formatted JSON responses

4. **`src/mcp/types.ts`** — MCP-specific TypeScript types
   - Tool input/output schemas
   - Resource content types
   - Error response structures

5. **`src/mcp/schemas.ts`** — JSON Schema definitions for all tools
   - Exported as const objects for SDK registration
   - Used by MCP SDK for validation

6. **`src/routes/mcp-sse.ts`** (optional) — SSE transport endpoint
   - Elysia route at `/mcp/sse`
   - Wraps MCP server with SSE transport
   - Registers in `src/server.ts` alongside REST API

### Files to Modify

1. **`package.json`** — Add MCP SDK dependency
   ```json
   {
     "dependencies": {
       "@modelcontextprotocol/sdk": "^0.5.0"
     },
     "scripts": {
       "mcp": "bun src/mcp-server.ts"
     }
   }
   ```

2. **`src/server.ts`** — Optional SSE endpoint registration
   ```typescript
   import { mcpSseRoutes } from './routes/mcp-sse';

   app
     .use(projectRoutes)
     .use(cardRoutes)
     .use(mcpSseRoutes)  // Add SSE transport
     .listen(PORT);
   ```

3. **`README.md`** — Add MCP server usage documentation

4. **`docs/SPECIFICATION.md`** — Document MCP integration architecture

---

## Configuration

### Claude Desktop Integration

Users can add DevPlanner to Claude Desktop's MCP configuration:

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "devplanner": {
      "command": "bun",
      "args": ["src/mcp-server.ts"],
      "cwd": "/path/to/DevPlanner",
      "env": {
        "DEVPLANNER_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

### Claude Code CLI Integration

For Claude Code CLI (the tool you're using right now), users add to their project or global config:

**File:** `.claudecode/config.json` or `~/.config/claude-code/config.json`

```json
{
  "mcp": {
    "servers": {
      "devplanner": {
        "command": "bun",
        "args": ["src/mcp-server.ts"],
        "cwd": "/path/to/DevPlanner",
        "env": {
          "DEVPLANNER_WORKSPACE": "/path/to/workspace"
        }
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEVPLANNER_WORKSPACE` | Yes | - | Path to workspace directory containing projects |
| `MCP_LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |

---

## Example Agent Workflows

### Workflow 1: Agent Claims and Completes a Card

```
1. Agent: "What work is available?"
   → get_board_overview(projectSlug='media-manager')
   → Sees: 2 cards in-progress, 5 upcoming (2 high priority)

2. Agent: "Show me high-priority upcoming work"
   → list_cards(projectSlug='media-manager', lane='01-upcoming', priority='high')
   → Finds: "OAuth2 Integration" card (5 unchecked tasks)

3. Agent: "I'll work on OAuth2"
   → update_card(projectSlug='media-manager', cardSlug='oauth2-integration', assignee='agent')
   → move_card(projectSlug='media-manager', cardSlug='oauth2-integration', targetLane='02-in-progress')
   → Card now in-progress and assigned to agent

4. Agent: "What are the tasks?"
   → get_card(projectSlug='media-manager', cardSlug='oauth2-integration')
   → Sees: 5 tasks (research, library selection, endpoint creation, testing, docs)

5. [Agent implements OAuth2 integration...]

6. Agent: "I completed the first three tasks"
   → batch_update_tasks(projectSlug='media-manager', cardSlug='oauth2-integration',
        updates=[{taskIndex:0, checked:true}, {taskIndex:1, checked:true}, {taskIndex:2, checked:true}])
   → Tasks 0-2 now checked

7. [Agent continues implementation...]

8. Agent: "All tasks done, moving to complete"
   → toggle_task(projectSlug='media-manager', cardSlug='oauth2-integration', taskIndex=3, checked=true)
   → toggle_task(projectSlug='media-manager', cardSlug='oauth2-integration', taskIndex=4, checked=true)
   → move_card(projectSlug='media-manager', cardSlug='oauth2-integration', targetLane='03-complete')
   → Card marked complete

9. Agent: "Adding implementation notes"
   → update_card_content(projectSlug='media-manager', cardSlug='oauth2-integration',
        content='## Implementation Notes\n\nUsed Passport.js with Google OAuth2 strategy...', append=true)
   → Card has detailed notes for future reference
```

**Result:** Card fully completed with progress tracked at each step, visible to human collaborators in real-time via WebSocket updates.

---

### Workflow 2: Agent Discovers Related Work

```
1. Agent: "Is there existing work on authentication?"
   → search_cards(projectSlug='media-manager', query='authentication')
   → Finds: "User Authentication" (in-progress), "OAuth2 Integration" (complete)

2. Agent: "What's the status of the User Authentication card?"
   → get_card(projectSlug='media-manager', cardSlug='user-authentication')
   → Sees: 5 tasks, 2 completed, assigned to 'agent', status 'in-progress'

3. Agent: "What tasks are left?"
   → get_next_tasks(projectSlug='media-manager', assignee='agent', lane='02-in-progress')
   → Sees: 3 uncompleted tasks across in-progress cards

4. Agent: "I'll continue where the other agent left off"
   → [Works on remaining tasks...]
```

**Result:** Agent coordinated work without duplicating effort, leveraging existing card context.

---

### Workflow 3: Agent Creates New Work Items

```
1. Agent: "During implementation, I discovered we need rate limiting"
   → add_task(projectSlug='media-manager', cardSlug='user-authentication',
        text='Implement rate limiting for login endpoint')
   → New task added to card

2. Agent: "This needs its own card"
   → create_card(projectSlug='media-manager', title='API Rate Limiting',
        priority='high', assignee='agent',
        content='## Overview\n\nPrevent abuse by limiting request rates...')
   → New card created in Upcoming lane

3. Agent: "Adding tasks to the new card"
   → add_task(projectSlug='media-manager', cardSlug='api-rate-limiting', text='Choose rate limiting library')
   → add_task(projectSlug='media-manager', cardSlug='api-rate-limiting', text='Configure Redis for storage')
   → add_task(projectSlug='media-manager', cardSlug='api-rate-limiting', text='Add middleware to all routes')
   → Card has structured task list
```

**Result:** Agent self-organized new work items without human intervention, maintaining project structure.

---

## Testing Strategy

### Unit Tests

Test tool handlers in isolation with mocked services:

```typescript
// src/mcp/__tests__/tool-handlers.test.ts

describe('list_cards tool', () => {
  it('returns filtered cards by lane', async () => {
    const mockCardService = {
      listCards: vi.fn().mockResolvedValue([...]),
    };

    const result = await handleListCards(
      { projectSlug: 'test-project', lane: '02-in-progress' },
      mockCardService
    );

    expect(result.cards).toHaveLength(2);
    expect(mockCardService.listCards).toHaveBeenCalledWith('test-project');
  });

  it('throws CARD_NOT_FOUND error gracefully', async () => {
    const mockCardService = {
      getCard: vi.fn().mockResolvedValue(null),
    };

    await expect(
      handleGetCard({ projectSlug: 'test', cardSlug: 'missing' }, mockCardService)
    ).rejects.toMatchObject({
      error: 'CARD_NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });
});
```

### Integration Tests

Test MCP server end-to-end with real services and test workspace:

```typescript
// src/mcp/__tests__/mcp-server.integration.test.ts

describe('MCP Server Integration', () => {
  let server: Server;
  let testWorkspace: string;

  beforeEach(async () => {
    testWorkspace = await createTestWorkspace();
    process.env.DEVPLANNER_WORKSPACE = testWorkspace;
    server = await startMCPServer();
  });

  it('executes full agent workflow', async () => {
    // Create project
    await server.callTool('create_project', { name: 'Test Project' });

    // Create card
    const card = await server.callTool('create_card', {
      projectSlug: 'test-project',
      title: 'Test Card',
      assignee: 'agent',
    });

    // Add task
    await server.callTool('add_task', {
      projectSlug: 'test-project',
      cardSlug: card.slug,
      text: 'Test task',
    });

    // Toggle task
    await server.callTool('toggle_task', {
      projectSlug: 'test-project',
      cardSlug: card.slug,
      taskIndex: 0,
      checked: true,
    });

    // Verify state
    const updatedCard = await server.callTool('get_card', {
      projectSlug: 'test-project',
      cardSlug: card.slug,
    });

    expect(updatedCard.tasks[0].checked).toBe(true);
  });
});
```

### Manual Testing with MCP Inspector

Use the official MCP Inspector tool to test the server interactively:

```bash
# Install MCP Inspector
bun add -g @modelcontextprotocol/inspector

# Launch server with inspector
mcp-inspector bun src/mcp-server.ts
```

This opens a web UI where you can:
- Browse available tools and resources
- Call tools with custom inputs
- Inspect responses and errors
- Test resource URIs

---

## Success Criteria

Phase 18 is complete when:

1. ✅ MCP server starts via stdio transport and responds to ping
2. ✅ All 17 tools are registered and callable
3. ✅ All 3 resources are registered and readable
4. ✅ Tool calls successfully invoke existing services (ProjectService, CardService, etc.)
5. ✅ Error responses follow consistent format with helpful messages
6. ✅ Claude Desktop can connect and list available tools
7. ✅ Full agent workflow test passes (claim card → complete tasks → move to complete)
8. ✅ Unit tests cover all tool handlers
9. ✅ Integration tests verify end-to-end functionality
10. ✅ Documentation includes Claude Desktop and Claude Code configuration examples

---

## Performance Considerations

### Tool Call Overhead

- Each tool call involves: JSON parsing → service call → file I/O → JSON serialization
- Typical latency: 10-50ms for reads, 50-200ms for writes
- Batching tools (like `batch_update_tasks`) reduce round trips significantly
- Resource reads are generally faster than tool calls (no validation overhead)

### Concurrent Agent Access

- File watching detects external changes and broadcasts via WebSocket
- Multiple agents can work on different cards simultaneously without conflicts
- Card-level locking not implemented (agents should claim cards via assignee field)
- Task index conflicts possible if two agents modify same card simultaneously (last write wins)

### Optimization Opportunities

1. **Caching:** Cache project configs and card lists in memory with TTL
2. **Resource Batching:** Allow fetching multiple resources in one call
3. **Delta Updates:** Return only changed fields in update operations
4. **Lazy Loading:** Only load full card content when explicitly requested

---

## Security Considerations

### Phase 18 Scope (Basic Functionality)

- No authentication or authorization
- Any MCP client can access all projects
- No rate limiting per client
- No audit logging of MCP tool calls

### Future Enhancements (Post-MVP)

1. **Authentication:** Validate API tokens on MCP connection
2. **Authorization:** Project-level access control (agent can only access assigned projects)
3. **Rate Limiting:** Prevent abuse (max N tool calls per minute per client)
4. **Audit Logging:** Log all MCP operations to history service
5. **Read-Only Mode:** Restrict certain clients to read-only tools
6. **Sandboxing:** Run MCP server in isolated process with limited filesystem access

---

## Alternative Approaches Considered

### 1. REST API Only (No MCP)

**Pros:** Simple, no new dependencies
**Cons:** Agents must manually craft HTTP requests, no typed schemas, poor discoverability

### 2. GraphQL API

**Pros:** Rich query language, typed schema
**Cons:** Overkill for CRUD operations, less AI-native than MCP

### 3. Custom Protocol

**Pros:** Full control over design
**Cons:** Reinventing the wheel, no ecosystem support

**Decision:** MCP is purpose-built for AI agents and has growing ecosystem support (Claude, GitHub Copilot, VS Code). It provides typed schemas, discoverability, and error handling patterns that make it ideal for this use case.

---

## Timeline

**Estimated effort:** 12-16 hours

- 2-3 hours: MCP SDK integration + server setup (stdio transport)
- 4-5 hours: Implement all 17 tool handlers
- 1-2 hours: Implement 3 resource providers
- 2-3 hours: JSON Schema definitions + type safety
- 1-2 hours: Error handling + LLM-friendly messages
- 2-3 hours: Testing (unit tests + integration tests + MCP Inspector)
- 1 hour: Documentation + configuration examples

**Next milestone:** Post-MVP enhancements (task-level status, persistent history, multi-agent coordination)

---

## Related Documentation

- `docs/TASKS.md` — Phase 18 task breakdown
- `docs/SPECIFICATION.md` — API contracts and data structures
- `docs/features/websocket-infrastructure.md` — Real-time updates (Phase 12)
- `docs/features/activity-history.md` — History tracking (Phase 16)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/) — Official MCP docs
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk) — TypeScript SDK reference

---

## Future Enhancements (Out of Scope)

### Advanced Agent Features

- **Task-level claiming:** Agents claim individual tasks, not just cards
- **Conflict resolution:** Detect concurrent modifications and merge or warn
- **Agent identity:** Track which agent made each change (in frontmatter and history)
- **Work sessions:** Agent can "start session" and "end session" for time tracking

### Enhanced Tools

- **Bulk operations:** Create multiple cards at once, move multiple cards
- **Card templates:** Create card from predefined template with tasks
- **Dependencies:** Mark cards as blocked by other cards
- **Subtasks:** Nested task lists (tasks within tasks)
- **Task notes:** Add comments/notes to individual tasks

### Observability

- **MCP metrics dashboard:** Track tool usage, latency, error rates
- **Agent activity feed:** Real-time view of which agents are working on what
- **Performance monitoring:** Identify slow tool calls, optimize hot paths
