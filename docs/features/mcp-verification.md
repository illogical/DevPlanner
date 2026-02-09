# MCP Server Verification with Ollama/LMAPI

## Overview

This script provides **real-time validation** of DevPlanner's MCP server by simulating an AI agent working through a realistic robotics project. Unlike traditional test suites with pass/fail assertions, this script creates an observable workflow where you can watch the Kanban board update in real-time as the agent uses MCP tools to manage tasks.

**Inspired by:** `/scripts/e2e-demo.ts` - provides the same "watch it happen" experience but with an AI agent making the decisions instead of a hardcoded script.

## Motivation

The MCP server provides 17 tools for AI agents to manage DevPlanner projects. To validate their effectiveness with local LLMs, we need to:

1. **Test realistic workflows** - Can an agent work through an actual project using MCP tools?
2. **Track success metrics** - Measure tool selection accuracy, parameter correctness, workflow logic, and task completion rate
3. **Provide immediate feedback** - Watch the agent's actions update the Kanban board in real-time
4. **Compare models** - Identify which local models (qwen3, llama3.1, etc.) work best with our tools
5. **Improve iteratively** - Use failure patterns to refine tool descriptions and schemas

**Goal:** Determine if DevPlanner + MCP can effectively replace TASKS.md files for human+agent collaboration on programming projects.

## Current MCP Implementation

### Structure (in `/src/mcp/`)

```
src/
├── mcp-server.ts              # Main MCP server with stdio transport
└── mcp/
    ├── types.ts               # TypeScript interfaces for all 17 tools
    ├── schemas.ts             # JSON Schema definitions for tool inputs
    ├── tool-handlers.ts       # Tool implementation functions
    ├── errors.ts              # MCP error handling
    ├── resource-providers.ts  # Resource URI handlers
    └── __tests__/
        └── tool-handlers.test.ts
```

### 17 MCP Tools

**Core CRUD (10 tools):**
1. `list_projects` - List all projects with statistics
2. `get_project` - Get project details and lane configuration
3. `create_project` - Create new project with default lanes
4. `list_cards` - List cards with rich filtering (lane, priority, assignee, tags, status)
5. `get_card` - Get full card details including content and tasks
6. `create_card` - Create new card with metadata
7. `update_card` - Update card metadata (title, status, priority, assignee, tags)
8. `move_card` - Move card between lanes
9. `add_task` - Add task to card checklist
10. `toggle_task` - Toggle or set task checked state

**Smart/Workflow (7 tools):**
11. `get_board_overview` - Comprehensive board summary with lane statistics
12. `get_next_tasks` - Get uncompleted tasks sorted by priority
13. `batch_update_tasks` - Update multiple tasks atomically
14. `search_cards` - Full-text search across title, content, tags
15. `update_card_content` - Replace card markdown content
16. `get_project_progress` - Detailed progress statistics
17. `archive_card` - Move card to archive lane

### MCP Resources

- `devplanner://projects` - List all projects
- `devplanner://projects/{slug}` - Full board state for project
- `devplanner://projects/{slug}/cards/{cardSlug}` - Full card details

### Tool Schema Format

All tools use JSON Schema for input validation (see `/src/mcp/schemas.ts`):

```typescript
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
    // ... more properties
  },
  required: ['projectSlug', 'title'],
} as const;
```

## Verification Script Architecture

### File Structure

```
scripts/
├── verify-mcp-agent.ts        # Main verification script (agent-driven workflow)
├── prompts/
│   └── scenarios/
│       ├── delivery-robot.md  # Robotics project scenario (structured)
│       ├── ai-pipeline.md     # AI/ML project (future)
│       └── web-app.md         # Software project (future)
└── lib/
    ├── ollama-provider.ts     # Ollama API integration (tool calling)
    ├── mcp-client.ts          # MCP server stdio communication
    └── agent-metrics.ts       # Success tracking and reporting
```

### Script Location Rationale

Following `/scripts/e2e-demo.ts` pattern - belongs in `/scripts/` because:
- System verification tool (not a unit test)
- Spawns MCP server process and connects to Ollama
- Provides real-time visualization on Kanban board
- Standalone execution with detailed reporting

### Component Design

#### 1. Main Script (`verify-mcp-ollama.ts`)

**Responsibilities:**
- Parse CLI arguments (model, provider, filters, verbose mode)
- Initialize model provider (Ollama or LMAPI)
- Spawn MCP server process
- Load test scenarios
- Execute test scenarios sequentially
- Evaluate results with scoring algorithm
- Generate summary report with colored terminal output
- Exit with appropriate code (0 = success, 1 = failure)

**Pattern:** Follows `verify-websocket.ts` structure with:
- Executable shebang (`#!/usr/bin/env bun`)
- Color-coded output (ANSI codes)
- Pass/fail/partial result tracking
- Summary statistics table
- Timeout handling (60-120s total)

#### 2. Model Provider Abstraction (`lib/model-provider.ts`)

**Purpose:** Abstract interface for calling LLMs with tool support, enabling easy provider switching.

**Interface:**
```typescript
interface ModelProvider {
  name: string;
  callWithTools(
    messages: Message[],
    tools: Tool[],
    options?: CallOptions
  ): Promise<ModelResponse>;
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}
```

**Implementations:**

**OllamaProvider** (Phase 1):
- Endpoint: `POST http://localhost:11434/api/chat`
- Default model: `qwen3` (best tool calling support based on research)
- Fallback model: `llama3.1`
- Converts MCP schemas to Ollama tool format
- No streaming (use `stream: false` for verification)

**LMAPIProvider** (Phase 4 - Optional):
- Endpoint: User-provided LMAPI URL
- Load balances across multiple Ollama instances
- Provides observability for agent calls
- Similar API to Ollama (wrapper around Ollama API)
- Auto-selects best available model

#### 3. MCP Client Wrapper (`lib/mcp-client.ts`)

**Purpose:** Handle communication with MCP server via stdio transport.

**Responsibilities:**
- Spawn MCP server process: `Bun.spawn(['bun', 'src/mcp-server.ts'])`
- Set up stdin/stdout/stderr pipes
- Implement JSON-RPC protocol for tool calls
- Parse MCP responses
- Handle process lifecycle (start, stop, cleanup)
- Timeout if server hangs

**JSON-RPC Format:**
```typescript
// Request
{
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'list_projects',
    arguments: { includeArchived: false }
  }
}

// Response
{
  jsonrpc: '2.0',
  id: 1,
  result: {
    content: [
      {
        type: 'text',
        text: '{"projects": [...], "total": 3}'
      }
    ]
  }
}
```

**Process Management:**
- Start server in `beforeAll()` equivalent
- Keep alive during all tests
- Clean shutdown in `afterAll()` equivalent
- Kill on timeout (15s max per tool call)

#### 4. Test Scenarios (`lib/test-scenarios.ts`)

**Purpose:** Declarative test scenario definitions with expected outcomes.

**Scenario Structure:**
```typescript
interface TestScenario {
  id: string;                        // e.g., 'basic-01'
  name: string;                      // e.g., 'List all projects'
  category: 'basic' | 'workflow' | 'context-aware' | 'error-handling';
  complexity: 'simple' | 'moderate' | 'complex';
  systemPrompt: string;              // Context for LLM
  userPrompt: string;                // User request
  expectedToolCalls: ExpectedToolCall[];
  successCriteria: SuccessCriteria;
  setup?: () => Promise<void>;       // Create test data
  cleanup?: () => Promise<void>;     // Cleanup after test
}

interface ExpectedToolCall {
  toolName: string;                  // MCP tool name
  requiredParams: string[];          // Must be present
  optionalParams?: string[];         // May be present
  order?: number;                    // For multi-step workflows
  paramValidation?: (params: any) => boolean; // Custom validation
}

interface SuccessCriteria {
  minimumToolCalls: number;
  maximumToolCalls: number;
  requiredTools: string[];           // These must be called
  forbiddenTools?: string[];         // These must NOT be called
  allowPartialSuccess?: boolean;     // Score 0.5-0.8 counts as partial
}
```

#### 5. Test Utilities (`lib/test-utils.ts`)

**Shared utilities:**
- Temporary workspace creation with `mkdtemp()`
- Color codes for terminal output (✅ green, ❌ red, ⚠️ yellow)
- Metrics calculation and formatting
- Test data generation (projects, cards, tasks)
- Cleanup helpers

## Project Scenario: Autonomous Delivery Robot

### Overview

**Duration:** 2-5 minutes (~10-15 tool calls)
**Approach:** Structured workflow with predefined cards and tasks
**Visualization:** Real-time Kanban board updates with 2-second pauses

The agent receives a project brief for building an autonomous delivery robot and must use MCP tools to:
1. Create a project
2. Set up cards for different subsystems (hardware + software)
3. Add tasks to each card
4. Claim tasks (assign to 'agent')
5. Mark tasks as complete
6. Move cards through lanes (Upcoming → In Progress → Complete)

### Structured Workflow

The agent is provided with a detailed project structure and must execute it using MCP tools:

#### Phase 1: Project Setup (2-3 tool calls)

**Expected actions:**
- Create project "Autonomous Delivery Robot"
- Get board overview to understand lane structure

**Tools tested:** `create_project`, `get_board_overview`

#### Phase 2: Create Subsystem Cards (3-4 tool calls)

**Expected cards:**
1. **Navigation System** (high priority, agent assigned)
   - Implement path planning algorithm
   - Integrate GPS and IMU sensors
   - Add obstacle detection

2. **Motor Control** (medium priority, user assigned)
   - Calibrate motor controllers
   - Implement PID control loop
   - Test emergency stop

3. **API Backend** (high priority, agent assigned)
   - Design REST API for delivery requests
   - Implement order management
   - Add authentication

**Tools tested:** `create_card`, parameter handling (priority, assignee, tags)

#### Phase 3: Add Tasks (3-5 tool calls)

**Expected actions:**
- Add 2-3 tasks to each card
- Verify task counts with `get_card`

**Tools tested:** `add_task`, `get_card`

#### Phase 4: Start Work (2-3 tool calls)

**Expected actions:**
- Move "Navigation System" to In Progress
- Toggle first task as complete
- Update card status to "in-progress"

**Tools tested:** `move_card`, `toggle_task`, `update_card`

#### Phase 5: Complete Work (2-3 tool calls)

**Expected actions:**
- Mark remaining Navigation System tasks as complete (use `batch_update_tasks`)
- Move card to Complete lane
- Get project progress to verify completion

**Tools tested:** `batch_update_tasks`, `move_card`, `get_project_progress`

### Success Metrics

#### 1. Tool Selection Accuracy (25% weight)
- Did the agent choose the right tool for each action?
- Did it avoid calling unnecessary tools?

**Scoring:**
- ✅ Correct tool: +1 point
- ❌ Wrong tool: -1 point
- ⚠️ Unnecessary tool call: -0.5 points

#### 2. Parameter Correctness (25% weight)
- Are projectSlug, cardSlug, lane names formatted correctly?
- Are priorities, assignees, tags valid enum values?
- Are required parameters always provided?

**Common errors to track:**
- Lane format: "in-progress" vs "02-in-progress" (must use latter)
- Card slugs: "Navigation System" vs "navigation-system" (must use slug)
- Missing required params (projectSlug, title, etc.)

**Scoring:**
- ✅ All params correct: +1 point
- ⚠️ Minor error (fixable): +0.5 points
- ❌ Major error (call fails): 0 points

#### 3. Workflow Logic (25% weight)
- Did the agent follow a reasonable sequence?
- Did it check card state before modifying (e.g., `get_card` before `toggle_task`)?
- Did it move cards through lanes in order (Upcoming → In Progress → Complete)?

**Scoring:**
- ✅ Logical sequence: +1 point
- ⚠️ Suboptimal but works: +0.5 points
- ❌ Illogical/broken: 0 points

#### 4. Task Completion Rate (25% weight)
- What percentage of the workflow did the agent successfully complete?
- How many tool calls succeeded vs failed?

**Scoring:**
- Success rate = (successful calls / total calls)
- 100% = +1 point
- 75-99% = +0.75 points
- 50-74% = +0.5 points
- <50% = 0 points

### Final Score Calculation

```
Final Score = (Tool Selection * 0.25) +
              (Parameter Correctness * 0.25) +
              (Workflow Logic * 0.25) +
              (Task Completion Rate * 0.25)
```

**Rating:**
- **Excellent:** 0.9-1.0 (90-100%) - Agent can effectively work with DevPlanner
- **Good:** 0.75-0.89 (75-89%) - Agent mostly succeeds, minor issues
- **Fair:** 0.60-0.74 (60-74%) - Agent struggles with some tools/params
- **Poor:** <0.60 (<60%) - Agent cannot reliably use MCP tools

## Output Format

### Real-Time Console Output

The script prints colored output similar to `e2e-demo.ts`:

```bash
================================================================================
  DevPlanner MCP Agent Verification - Autonomous Delivery Robot
================================================================================

Configuration:
  Model:           qwen3 (Ollama)
  Workspace:       /tmp/devplanner-verify-abc123
  MCP Server:      src/mcp-server.ts (spawned)
  Frontend:        http://localhost:5173 (open this to watch)
  Pause Duration:  2 seconds between actions

================================================================================
  PHASE 1: Project Setup
================================================================================

→ Agent Action: Creating project "Autonomous Delivery Robot"
  Tool: create_project(name='Autonomous Delivery Robot', description='...')
  ✅ SUCCESS (1.2s)
  👀 Watch the sidebar - new project should appear

⏳ Pausing 2s...

→ Agent Action: Getting board overview
  Tool: get_board_overview(projectSlug='autonomous-delivery-robot')
  ✅ SUCCESS (0.8s)
  Response: "The project has 4 lanes: Upcoming, In Progress, Complete, Archive"

⏳ Pausing 2s...

================================================================================
  PHASE 2: Creating Subsystem Cards
================================================================================

→ Agent Action: Creating Navigation System card
  Tool: create_card(projectSlug='autonomous-delivery-robot', title='Navigation System', priority='high', assignee='agent', tags=['hardware', 'sensors'])
  ✅ SUCCESS (1.1s)
  👀 Blue glow animation on new card in Upcoming lane

⏳ Pausing 2s...

→ Agent Action: Creating Motor Control card
  Tool: create_card(projectSlug='autonomous-delivery-robot', title='Motor Control', priority='medium', assignee='user')
  ⚠️  PARAMETER WARNING (0.9s)
  Missing tags parameter (recommended but not required)
  Card created successfully

⏳ Pausing 2s...

→ Agent Action: Creating API Backend card
  Tool: create_card(projectSlug='autonomous-delivery-robot', title='API Backend', priority='high', assignee='agent')
  ✅ SUCCESS (1.0s)

⏳ Pausing 2s...

================================================================================
  PHASE 3: Adding Tasks
================================================================================

→ Agent Action: Adding tasks to Navigation System
  Tool: add_task(projectSlug='autonomous-delivery-robot', cardSlug='navigation-system', text='Implement path planning algorithm')
  ✅ SUCCESS (0.7s)
  👀 Task count updates on card (1/0)

⏳ Pausing 2s...

→ Agent Action: Adding more tasks
  Tool: add_task(..., text='Integrate GPS and IMU sensors')
  ✅ SUCCESS (0.6s)

⏳ Pausing 2s...

→ Agent Action: Adding more tasks
  Tool: add_task(..., text='Add obstacle detection')
  ✅ SUCCESS (0.7s)
  👀 Navigation System now shows 3 tasks (3/0)

⏳ Pausing 2s...

[... similar for other cards ...]

================================================================================
  PHASE 4: Starting Work
================================================================================

→ Agent Action: Moving Navigation System to In Progress
  Tool: move_card(projectSlug='autonomous-delivery-robot', cardSlug='navigation-system', targetLane='02-in-progress')
  ✅ SUCCESS (0.9s)
  👀 Card disappears from Upcoming, appears in In Progress with amber glow

⏳ Pausing 2s...

→ Agent Action: Marking first task complete
  Tool: toggle_task(projectSlug='autonomous-delivery-robot', cardSlug='navigation-system', taskIndex=0, checked=true)
  ✅ SUCCESS (0.8s)
  👀 Green flash + pulse on progress bar (1/3 complete)

⏳ Pausing 2s...

→ Agent Action: Updating card status
  Tool: update_card(projectSlug='autonomous-delivery-robot', cardSlug='navigation-system', status='in-progress')
  ✅ SUCCESS (0.7s)

⏳ Pausing 2s...

================================================================================
  PHASE 5: Completing Work
================================================================================

→ Agent Action: Batch updating remaining tasks
  Tool: batch_update_tasks(projectSlug='autonomous-delivery-robot', cardSlug='navigation-system', updates=[{taskIndex:1, checked:true}, {taskIndex:2, checked:true}])
  ✅ SUCCESS (1.0s)
  👀 Progress bar animates to 100% (3/3 complete)

⏳ Pausing 2s...

→ Agent Action: Moving card to Complete
  Tool: move_card(..., targetLane='03-complete')
  ✅ SUCCESS (0.9s)
  👀 Card moves to Complete lane with green glow

⏳ Pausing 2s...

→ Agent Action: Checking project progress
  Tool: get_project_progress(projectSlug='autonomous-delivery-robot')
  ✅ SUCCESS (0.8s)
  Response: "1 card complete (33%), 3 tasks finished (27%)"

================================================================================
  VERIFICATION COMPLETE
================================================================================

Metrics:
  Total Tool Calls:       15
  Successful:             14  (93.3%)
  Failed:                 0   (0.0%)
  Warnings:               1   (6.7%)

  Total Duration:         42.3 seconds
  Avg Call Time:          0.88 seconds
  MCP Server Crashes:     0

Scoring:
  Tool Selection:         14/15  (93.3%)  → 0.93 * 0.25 = 0.233
  Parameter Correctness:  13/15  (86.7%)  → 0.87 * 0.25 = 0.217
  Workflow Logic:         15/15  (100%)   → 1.00 * 0.25 = 0.250
  Task Completion:        14/15  (93.3%)  → 0.93 * 0.25 = 0.233

  FINAL SCORE: 0.93 (93%) - EXCELLENT ✅

Model Assessment:
  ✅ qwen3 can effectively work with DevPlanner MCP tools
  ✅ Agent successfully completed a realistic robotics workflow
  ⚠️  Minor issue: Occasionally omits optional parameters (tags)
  ✅ Excellent lane slug formatting (always used 02-in-progress, etc.)
  ✅ Perfect workflow logic (cards moved in correct order)

Recommendations:
  • qwen3 is ready for real-world DevPlanner + human collaboration
  • Consider adding examples in tool descriptions for optional params
  • Test with llama3.1 and mistral for comparison

Exit Code: 0
```

### JSON Export (Optional)

```bash
bun scripts/verify-mcp-agent.ts --json > results.json
```

```json
{
  "timestamp": "2026-02-08T10:30:00Z",
  "scenario": "delivery-robot",
  "model": "qwen3",
  "provider": "ollama",
  "finalScore": 0.93,
  "rating": "excellent",
  "metrics": {
    "toolSelection": { "score": 0.933, "details": "14/15 correct" },
    "parameterCorrectness": { "score": 0.867, "details": "13/15 perfect" },
    "workflowLogic": { "score": 1.0, "details": "15/15 logical" },
    "taskCompletion": { "score": 0.933, "details": "14/15 succeeded" }
  },
  "toolCalls": [
    {
      "phase": "Project Setup",
      "tool": "create_project",
      "params": { "name": "Autonomous Delivery Robot" },
      "success": true,
      "duration": 1200
    },
    // ... more calls
  ],
  "errors": [],
  "warnings": [
    { "phase": "Creating Cards", "message": "Missing optional tags parameter" }
  ]
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (3-4 hours)

**Goal:** Get basic agent → Ollama → MCP → Kanban flow working

**Tasks:**
1. Create `scripts/verify-mcp-agent.ts` main script
   - CLI arg parsing (--model, --verbose, --json)
   - Colored terminal output (copy from e2e-demo.ts)
   - Pause mechanism (2 seconds between actions)

2. Create `scripts/lib/ollama-provider.ts`
   - Connect to `http://localhost:11434/api/chat`
   - Convert MCP schemas to Ollama tool format
   - Handle tool calling responses (parse tool_calls array)
   - No streaming (use `stream: false`)

3. Create `scripts/lib/mcp-client.ts`
   - Spawn `bun src/mcp-server.ts` with stdio
   - Implement JSON-RPC protocol for MCP tool calls
   - Parse MCP responses
   - Process lifecycle (start, stop, cleanup)

4. Create `prompts/scenarios/delivery-robot.md`
   - System prompt (explain MCP tools)
   - Project brief (robotics scenario)
   - Phase-by-phase instructions (structured workflow)

5. Create `scripts/lib/agent-metrics.ts`
   - Track tool calls (success/fail/warning)
   - Calculate 4 metrics scores
   - Format terminal output
   - Export JSON results

**Success Criteria:**
- Script spawns MCP server successfully
- Agent calls Ollama and receives tool calls
- MCP tools execute via stdio
- Kanban board updates visibly
- At least 50% of workflow completes

### Phase 2: Complete Workflow + Metrics (2-3 hours)

**Goal:** Full 5-phase workflow with accurate scoring

**Tasks:**
1. Implement all 5 workflow phases
   - Phase 1: Project setup (2 tools)
   - Phase 2: Create cards (3 tools)
   - Phase 3: Add tasks (6-8 tools)
   - Phase 4: Start work (3 tools)
   - Phase 5: Complete work (3 tools)

2. Add detailed metrics tracking
   - Tool selection scoring (track expected vs actual)
   - Parameter validation (check lane slugs, required params)
   - Workflow logic analysis (detect out-of-order operations)
   - Task completion percentage

3. Improve error handling
   - Catch MCP errors gracefully
   - Continue workflow even if some calls fail
   - Report errors clearly in output

4. Add CLI options
   - `--model` to select Ollama model
   - `--verbose` for full LLM responses
   - `--json` for JSON output
   - `--pause` to set delay duration

**Success Criteria:**
- Full workflow completes (15 tool calls)
- Scoring algorithm is accurate
- Terminal output is readable and helpful
- Can identify specific failure patterns

### Phase 3: Multi-Model Support (Future - 1-2 hours)

**Goal:** Prepare for LMAPI integration to compare multiple models

**Tasks:**
1. Abstract model provider interface
   - `ModelProvider` interface (call method)
   - `OllamaProvider` implements interface
   - Placeholder for `LMAPIProvider`

2. Add comparison mode (future)
   - Run same scenario with multiple models sequentially
   - Compare scores side-by-side
   - Identify which models excel at which metrics

3. LMAPI integration (when user provides details)
   - Implement `LMAPIProvider`
   - Handle load balancing / observability
   - Test with multiple Ollama instances

4. Future goal: OpenRouter integration (likely through LMAPI but TBD)
  - Implement `OpenRouterProvider`

**Note:** Initial implementation focuses on single-model runs. Multi-model comparison is a future enhancement.

### Timeline

- Phase 1: 3-4 hours (core infrastructure)
- Phase 2: 2-3 hours (complete workflow)
- Phase 3: 1-2 hours (multi-model prep)
- **Total:** 6-9 hours

## Configuration and Usage

### Prerequisites

1. **Ollama installed and running:**
   ```bash
   brew install ollama
   ollama serve
   ollama pull qwen3
   ```

2. **DevPlanner server running:**
   ```bash
   bun run dev
   ```

3. **Frontend open in browser:**
   - Navigate to http://localhost:5173
   - This is where you'll watch the Kanban board update

### Running the Script

```bash
# Basic run (default: qwen3, 2s pauses)
bun scripts/verify-mcp-agent.ts

# With different model
bun scripts/verify-mcp-agent.ts --model llama3.1

# Verbose mode (show full LLM responses)
bun scripts/verify-mcp-agent.ts --verbose

# Custom pause duration
bun scripts/verify-mcp-agent.ts --pause 1000  # 1 second

# JSON output for CI/CD
bun scripts/verify-mcp-agent.ts --json > results.json
```

### Package.json Scripts

```json
{
  "scripts": {
    "verify:agent": "bun scripts/verify-mcp-agent.ts",
    "verify:agent:verbose": "bun scripts/verify-mcp-agent.ts --verbose",
    "verify:agent:llama": "bun scripts/verify-mcp-agent.ts --model llama3.1"
  }
}
```

## Expected Outcomes

### Success Criteria

**Excellent (90-100%):**
- Agent completes all 5 phases with minimal errors
- Lane slugs always correct (02-in-progress, not in-progress)
- Card slugs properly formatted (navigation-system, not Navigation System)
- Logical workflow (cards move Upcoming → In Progress → Complete)
- All required parameters provided

**Good (75-89%):**
- Most phases complete successfully
- Occasional parameter errors (e.g., missing optional tags)
- Minor formatting issues that don't break functionality
- Overall workflow makes sense

**Fair (60-74%):**
- Some phases fail due to parameter errors
- Lane slug confusion (in-progress vs 02-in-progress)
- Missing required parameters occasionally
- Workflow has logical gaps

**Poor (<60%):**
- Many tool calls fail
- Consistent parameter formatting issues
- Agent doesn't understand tool purposes
- Workflow is incoherent

### Target

With **qwen3** or **llama3.1**, we expect **80-95% scores** indicating the tools are ready for real human+agent collaboration.

## Related Files

- `/scripts/e2e-demo.ts` - Pattern for real-time visualization
- `/src/mcp-server.ts` - MCP server implementation
- `/src/mcp/schemas.ts` - Tool schemas to convert to Ollama format
- `/src/mcp/tool-handlers.ts` - Tool implementations

## Future Enhancements

1. **Additional scenarios:**
   - AI/ML Pipeline (data prep, training, deployment)
   - Web Application (frontend, backend, database)
   - IoT System (devices, cloud, dashboard)

2. **LMAPI multi-model testing:**
   - Run qwen3, llama3.1, mistral in parallel
   - Compare scores side-by-side
   - Identify model strengths/weaknesses

3. **Iterative improvement:**
   - Track score improvements after tool description changes
   - A/B test different system prompts
   - Optimize for specific models

## Conclusion

This verification script validates that DevPlanner's MCP tools are **production-ready for human+agent collaboration**. By watching an AI agent work through a realistic project in real-time, we gain confidence that the tools are intuitive, well-documented, and reliable.

**Next Steps After Implementation:**
1. Run with qwen3 and record baseline score
2. Iterate on tool descriptions if score < 80%
3. Test with llama3.1 and mistral for comparison
4. Use insights to improve MCP tool docs
5. Deploy to Claude Desktop/Code with confidence

