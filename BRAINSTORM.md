# DevPlanner - AI-Collaborative Kanban Board

A file-based Kanban board web app designed for iterative software development with AI agents. Plain-text storage using Markdown and JSON enables both humans and AI assistants to read, search, and modify project data directly.

---

## Core Philosophy

- **Plain-text first**: All data stored as Markdown and JSON files - no database required
- **AI-native**: Designed from the ground up for AI agents to read, search, and update
- **Human-readable**: File structure that makes sense when browsing in a file manager or code editor and versioned with git
- **Obsidian-compatible patterns**: Leverage familiar conventions from the knowledge management ecosystem

---

## File Structure Architecture

```
<base-path>/
├── .devplanner/                    # Global configuration
│   └── config.json                 # Base path settings, defaults
│
└── projects/
    └── <project-name>/             # Each folder is a project
        ├── _project.json           # Project metadata & lane configuration
        ├── _references/            # Project-level files and links
        │   ├── links.json          # Referenced URLs with descriptions
        │   └── <attached files>    # Copied/linked reference files
        │
        ├── 01-upcoming/            # Kanban lanes as numbered folders
        │   ├── feature-auth.md     # Individual cards as Markdown files
        │   └── feature-api.md
        │
        ├── 02-in-progress/
        │   └── feature-ui.md
        │
        ├── 03-complete/
        │   └── feature-setup.md
        │
        └── 04-archive/             # Optional: archived/closed cards
```

### Lane Ordering Strategy

**Recommendation**: Use numbered prefixes on lane folders (e.g., `01-upcoming`, `02-in-progress`).

**Rationale**:
- Natural sort order works in file managers, terminals, and code
- No need for a separate config file to track order
- Easy to insert new lanes (e.g., `02.5-review` or renumber)
- The `_project.json` can store display names that hide the numbers in the UI

---

## Project Metadata (`_project.json`)

```json
{
  "name": "DevPlanner",
  "description": "AI-collaborative Kanban board for software development",
  "created": "2024-01-15T10:30:00Z",
  "updated": "2024-01-20T14:22:00Z",
  "lanes": {
    "01-upcoming": { "displayName": "Upcoming", "color": "#6b7280" },
    "02-in-progress": { "displayName": "In Progress", "color": "#3b82f6" },
    "03-complete": { "displayName": "Complete", "color": "#22c55e", "collapsed": true },
    "04-archive": { "displayName": "Archive", "hidden": true }
  },
  "defaultLane": "01-upcoming",
  "references": []
}
```

**Why JSON for project metadata**:
- Structured data that benefits from schema validation
- Easy to parse programmatically
- Lane configuration with colors, visibility, display names
- Not primarily human-authored content

---

## Card Format (Markdown with YAML Frontmatter)

Individual cards use **YAML frontmatter** (the Obsidian/Jekyll convention) rather than JSON code blocks.

```markdown
---
title: User Authentication System
status: in-progress
priority: high
created: 2024-01-15T10:30:00Z
updated: 2024-01-20T14:22:00Z
tags:
  - feature
  - security
references:
  - auth-flow-diagram.png
  - https://docs.example.com/oauth
---

## Overview

Implement OAuth2 authentication flow with support for Google and GitHub providers.

## Requirements

- [ ] Set up OAuth2 client configuration
- [ ] Implement login redirect flow
- [x] Create user session management
- [ ] Add logout functionality

## Technical Notes

```typescript
// Example session interface
interface UserSession {
  userId: string;
  provider: 'google' | 'github';
  accessToken: string;
  expiresAt: Date;
}
```

## Related Files

- `src/auth/oauth.ts` - OAuth client implementation
- `src/middleware/session.ts` - Session middleware
```

### Why YAML Frontmatter (not JSON code blocks)

1. **Obsidian compatibility**: Obsidian uses YAML frontmatter for properties/metadata
2. **Industry standard**: Used by Jekyll, Hugo, Astro, MDX, and most static site generators
3. **Cleaner syntax**: More readable than JSON for simple key-value pairs
4. **Library support**: `gray-matter` and similar parsers are mature and well-tested
5. **Separation of concerns**: Metadata at top, content below - clear boundary

---

## Card Status Conventions

Cards can have status tracked in two ways:

### 1. Lane-based Status (Primary)
The folder a card lives in determines its primary status:
- `01-upcoming/` → Not started
- `02-in-progress/` → Active work
- `03-complete/` → Done

### 2. Frontmatter Status (Secondary/Granular)
For more nuanced tracking within a lane:
```yaml
status: in-progress      # or: blocked, review, testing
```

**Suggestion**: The frontmatter `status` field allows sub-states like `blocked` or `needs-review` while the card remains in the "In Progress" lane. This gives flexibility without requiring many lanes.

---

## Backend API Features

### MVP Features

#### Create API endpoints and a service class layer for modifying markdown files
- [ ] Run on port 17103
- [ ] List all projects found in an environment variable workspace/base path
- [ ] Create new project (creates folder + `_project.json`) in the workspace path
- [ ] Delete/archive projects
- [ ] Add new card with just a title (creates the markdown file)
- [ ] Add a new task to a card
- [ ] Set task status to in-progress
- [ ] Set task status to complete

#### Create Unit Tests for modifying markdown files
- [ ] Units tests for each endpoint's service layer logic

#### Create Typescript script to generate seed sample/test/verifcation data
- [ ] Create seed Projects: ["Media Manager", "LM API, Memory API"]
- [ ] Add sample cards with checklist TODOs for each project to verify frontend's ability to check off items


## Web Frontend Features

#### Project Management
- [ ] List all projects from the base path
- [ ] Create new project 
- [ ] Project settings panel (edit metadata)
- [ ] Delete/archive projects

#### Kanban Board View
- [ ] Display lanes left-to-right based on folder order
- [ ] Render cards within each lane
- [ ] Collapse/expand lanes (especially useful for "Complete")
- [ ] Drag-and-drop cards between lanes (moves the .md file)
- [ ] Drag-and-drop to reorder cards within a lane

#### Card Interactions
- [ ] Click card to open detail/edit view
- [ ] Quick-add card (title only, creates minimal .md file)
- [ ] Inline checkbox toggling (updates the .md file)
- [ ] Delete card (moves to archive)
- [ ] Status indicator/badge on card preview

### Future Features

#### Enhanced Editor
- [ ] Syntax highlighting in code blocks (Prism.js or highlight.js)
- [ ] Drag-and-drop image upload (stores in `_references/`)
- [ ] `[[wiki-link]]` style linking between cards
- [ ] `@mention` syntax for referencing files in the codebase

#### Search & Filter
- [ ] Full-text search across all cards
- [ ] Filter by tags
- [ ] Filter by status/priority
- [ ] Search within a single project

#### Collaboration Indicators
- [ ] Show "last modified by" (human vs AI agent)
- [ ] Activity log/history for cards
- [ ] Visual diff when card was modified externally

#### Reference Management
- [ ] Panel showing project-level references (files + links)
- [ ] Add link via URL paste
- [ ] Browse/upload file to `_references/` folder
- [ ] Associate references with specific cards via frontmatter

#### Views
- [ ] List view (alternative to Kanban)

#### Markdown Editor
- [ ] Rich Markdown rendering (using `marked` or similar) 
- [ ] Edit mode with live preview or split view
- [ ] Keyboard shortcut for adding checklist item (`Ctrl/Cmd + Shift + C`?)
- [ ] Button/shortcut to insert code block with language picker
- [ ] Auto-save on save button click or checkbox check

---

## AI Agent Integration

### Integration Approaches

#### Option 1: Direct File Access
AI agents with filesystem access can read/write the Markdown and JSON files directly.

**Pros**: Simple, no additional infrastructure
**Cons**: No validation, potential for malformed files, no real-time sync

#### Option 2: MCP Server (Recommended)
Build an MCP (Model Context Protocol) server that exposes the Kanban board as tools.

```typescript
// Example MCP tools
tools: [
  {
    name: "list_projects",
    description: "List all projects in the Kanban board"
  },
  {
    name: "search_cards",
    description: "Search cards by keyword across projects",
    parameters: { query: string, project?: string }
  },
  {
    name: "get_card",
    description: "Get full content of a specific card",
    parameters: { project: string, card: string }
  },
  {
    name: "update_card_status",
    description: "Move a card to a different lane",
    parameters: { project: string, card: string, lane: string }
  },
  {
    name: "add_card",
    description: "Create a new card in a project",
    parameters: { project: string, title: string, content?: string, lane?: string }
  },
  {
    name: "update_card_checklist",
    description: "Toggle a checklist item in a card",
    parameters: { project: string, card: string, itemIndex: number, checked: boolean }
  },
  {
    name: "get_card_context",
    description: "Get card content plus contents of referenced files and summaries of linked URLs",
    parameters: { project: string, card: string, includeFileContents?: boolean, fetchLinks?: boolean }
  },
  {
    name: "get_project_references",
    description: "List all files and links associated with a project",
    parameters: { project: string }
  }
]
```

**Pros**: Structured access, validation, atomic operations, works with any MCP-compatible agent
**Cons**: Additional server to run

#### Option 3: Agent Skill/Slash Command
For Claude Code specifically, create a skill that provides specialized prompts and file patterns.

**Pros**: Lightweight, no server needed
**Cons**: Only works in Claude Code, less structured

#### Recommendation: Hybrid Approach
1. **Primary**: MCP server for structured, validated access
2. **Fallback**: Direct file access patterns documented for agents without MCP
3. **Enhancement**: Claude Code skill for convenient slash commands

### AI-Specific Features

#### Search Capabilities
- Keyword search across project names, card titles, and content
- Tag-based filtering
- Status-based queries ("show me all in-progress cards")
- Return results with file paths for direct access

#### Update Operations
- Create new cards with proper frontmatter
- Move cards between lanes (file move operation)
- Update card content while preserving frontmatter
- Toggle checklist items
- Add/remove tags
- Update status and priority

#### Context Gathering
- "Get project context" - returns project metadata + all card titles + references
- "Get card with related files" - returns card content + contents of referenced files
- "Get project progress" - summary of cards by status/lane

#### File & Link Review (AI Context Loading)
A key capability for AI-assisted development: the agent should be able to **review all files and links associated with a card** before working on that task.

**Use Case**: When an AI agent picks up a card like "Implement user authentication", it needs to:
1. Read the card's Markdown content (requirements, checklist, notes)
2. Access referenced local files (e.g., `src/auth/oauth.ts`, design diagrams)
3. Fetch and summarize referenced URLs (e.g., OAuth documentation, API specs)
4. Understand the broader project context (other related cards, project-level references)

**MCP Tools for Context Loading**:
```typescript
{
  name: "get_card_context",
  description: "Get a card's full context including referenced file contents and link summaries",
  parameters: {
    project: string,
    card: string,
    includeFileContents: boolean,  // Read and include local file contents
    fetchLinks: boolean,           // Fetch and summarize URLs
    includeRelatedCards: boolean   // Include cards with overlapping tags/references
  }
}
```

**Reference Types to Support**:
- **Local files**: Read contents directly (code files, configs, docs)
- **Local images/diagrams**: Return file path for display or describe if AI has vision
- **URLs**: Fetch and summarize web content (docs, specs, issues, PRs)
- **GitHub links**: Parse and fetch via GitHub API (issues, PRs, code permalinks)

**Workflow Example**:
1. AI calls `get_card_context` for the task it's working on
2. Receives: card content + file contents + link summaries + related cards
3. AI now has full context to implement the feature or answer questions
4. After completing work, AI updates the card (checklist, status, adds notes)

---

## Technical Stack Suggestions

### Frontend
- **Framework**: React or Preact (lightweight)
- **Styling**: Tailwind CSS
- **Markdown**: `marked` for rendering, `gray-matter` for frontmatter parsing
- **Drag-and-drop**: `@dnd-kit/core` or `react-beautiful-dnd`
- **Code highlighting**: Prism.js or highlight.js (deferred)
- **State management**: Zustand or Jotai (lightweight)

### Backend (Minimal)
- **Runtime**: Bun or Node.js
- **Framework**: Elysia (Bun) or Express/Fastify
- **File watching**: `chokidar` for real-time updates
- **API**: REST endpoints that map to file operations

### MCP Server
- TypeScript-based MCP server
- Uses same file I/O logic as backend
- Exposes tools for AI agent interaction

---

## Obsidian Compatibility Notes

### What Obsidian Uses
- **YAML frontmatter** for properties (not JSON code blocks)
- **`[[wikilinks]]`** for internal linking
- **Tags** as `#tag` in content or `tags:` array in frontmatter
- **Folder structure** as organizational hierarchy

### Compatibility Considerations
If you want cards to be openable/editable in Obsidian:
- Use YAML frontmatter (we are)
- Consider supporting `[[wikilinks]]` syntax for card-to-card links
- The folder structure already aligns with Obsidian's model
- Could add `.obsidian/` config to make the projects folder an Obsidian vault

---

## Summary of Suggestions

1. **Use numbered folder prefixes for lane ordering** - simpler than config files, natural sort order
2. **YAML frontmatter over JSON code blocks** - Obsidian-compatible, industry standard, cleaner
3. **Dual status tracking** - lane location for primary status, frontmatter for sub-states
4. **MCP server as primary AI integration** - structured, validated, works across agents
5. **`_project.json` for project config** - keeps structured data separate from content
6. **`_references/` folder pattern** - clean separation of attachments
7. **Archive lane instead of deletion** - preserve history, allow restoration
8. **File watching for real-time sync** - external edits (by AI or editor) appear instantly
9. **Hybrid AI approach** - MCP + direct file access + skill for maximum flexibility
10. **Consider Obsidian vault compatibility** - opens up ecosystem of plugins and mobile apps
11. **AI context loading for cards** - agent can fetch all referenced files and links before working on a task

---

## Follow-Up Questions for Planning

### Architecture
1. **Base path configuration**: Should this be a single hardcoded path, user-configurable, or support multiple base paths (workspaces)?
user-configurable
2. **File naming convention**: Should card filenames be auto-generated from title (slugified), timestamps, or user-specified?
Auto-generated from title and creation date. Store the title in metadata as the source of truth. No need to keep it in sync if the title changes.
3. **Conflict handling**: What happens if the same card is edited in the web UI and by an AI agent simultaneously?
I imagine this being an edge case but I am open to suggestions. My initial thought is: locking it from the agent editing it while the user is actively in an edit mode for the card. Ideally queue up the changes for review after the user is done editing the card.

### MVP Scope
4. **Initial lanes**: Start with the 3 core lanes (Upcoming, In Progress, Complete), or include Archive from day one?
Yes, include an Archive as well. For the frontend, the Complete and Archive lanes could be hidden by default to save screen realestate
5. **Reference files**: MVP must-have, or defer file attachments to post-MVP?
Post-MVP is a good idea
6. **Mobile support**: Is responsive design a priority, or desktop-first?
Responsive would be ideal

### AI Integration
7. **MCP server priority**: Build MCP server alongside MVP, or after web UI is functional?
After the web UI is functional
8. **Which AI features first**: Search? Status updates? Card creation? What's most valuable initially?
Card creation, then status updates, then search.
9. **Validation strictness**: Should AI operations be permissive (auto-fix malformed input) or strict (reject and explain)?
What are the pros and cons of each?
10. **Context loading scope**: When AI requests card context, should it auto-fetch URL contents (potential latency/cost), or return URLs for the agent to fetch selectively?
Return URLs for the agent to fetch selectively


### Technical
11. **Offline-first**: Should the web app work fully offline with a service worker?
No thank you
12. **Multi-user**: Any need for multiple users, or single-user only?
Single user only. Assignments will either be for me or for an agent.
13. **Version control**: Should the tool auto-commit changes to git, or leave that to the user?
Leave that to the user

### UX
14. **Quick-add flow**: Add card to which lane by default? Always "Upcoming", or the currently viewed lane?
The UI could have a plus button at the top of each lane.
15. **Keyboard-first**: Priority on keyboard shortcuts, or mouse-friendly first?
Mouse-friendly first, and no need for the keyboard shortcuts for the MVP.
16. **Dark mode**: Essential from the start, or add later?
Dark mode from the start with a modern interface.

---

## Next Steps

1. Answer follow-up questions to refine requirements
2. Define MVP feature set with clear boundaries
3. Create technical specification for file formats
4. Set up project scaffolding (Bun + Vite + React + Elysia)
5. Implement core file I/O layer
6. Build basic Kanban UI
7. Add MCP server
