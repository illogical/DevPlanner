# LMApi Background

### Server Management
- `GET /servers`: List all servers (Name, BaseURL, Status).
- `GET /servers/available`: List only available servers with their models.
- `GET /servers/:name/status`: Get status of a specific server.

### Model Discovery
- `GET /servers/:name/models`: Return available models for a server (uses cache/refresh).
- `GET /models/:model/servers`: Return list of servers supporting a specific model.

### Completions (OpenAI-Compatible Chat Completions)

The API supports OpenAI-compatible completions endpoints (`/v1/chat/completions` and `/api/chat/completions/*`), proxied through local Ollama servers or cloud providers (e.g., OpenRouter).

#### OpenAI-Compatible Endpoint
- `POST /v1/chat/completions`
  - **Body**: Standard OpenAI chat completion format (see below)
  - **Behavior**: Auto-routes to the best available local Ollama server. Falls back to cloud providers for non-streaming requests when no local servers are available (if configured).
  - **Response**: Standard OpenAI chat completion response (no LMAPI metadata).

#### LMAPI Routing Endpoints
These endpoints provide explicit routing control and include LMAPI metadata in responses:

- `POST /api/chat/completions/any`
  - **Body**: OpenAI format + LMAPI extensions (`serverName`, `models`, `groupId`, `maxParallelPerServer`, `provider`)
  - **Behavior**: Auto-selects best server via `ServerPoolService`. Falls back to cloud providers when configured. Use `provider` parameter to explicitly target a cloud provider.
  - **Response**: OpenAI format + `lmapi` metadata (`server_name`, `duration_ms`, `group_id`).

- `POST /api/chat/completions/server`
  - **Body**: OpenAI format + `serverName` (required)
  - **Behavior**: Routes to a specific named server.
  - **Response**: OpenAI format + `lmapi` metadata.

- `POST /api/chat/completions/batch`
  - **Body**: OpenAI format + `models` array (required)
  - **Behavior**: Sends same messages to multiple models in parallel.
  - **Response**: `{ results: [...], group_id: "uuid" }`

- `POST /api/chat/completions/all`
  - **Body**: OpenAI format + `model` (required)
  - **Behavior**: Broadcasts to all servers that have the model.
  - **Response**: `{ results: [...], group_id: "uuid" }`

#### Chat Completion Request Format
```json
{
  "model": "llama3.1",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "tools": [],
  "tool_choice": "auto",
  "temperature": 0.7,
  "max_tokens": 1000,
  "stream": false,
  "provider": "openrouter"
}
```

#### Provider Parameter
All chat completion endpoints support an optional `provider` parameter for explicit cloud provider targeting:

```json
{
  "model": "openai/gpt-3.5-turbo",
  "provider": "openrouter",
  "stream": true,
  "messages": [...]
}
```

When `provider` is specified:
- Request routes directly to the named provider (e.g., "openrouter")
- Bypasses local server routing and fallback logic
- Enables testing of cloud-only models with full LMAPI observability
- Returns 400 error if provider not found or model not supported
- Works with both streaming and non-streaming requests

#### Streaming Support
Set `"stream": true` to receive Server-Sent Events (SSE) instead of a buffered response.

- Streaming is supported on:
  - `POST /v1/chat/completions`
  - `POST /api/chat/completions/any`
  - `POST /api/chat/completions/server`
- Streaming is supported for:
  - Local Ollama servers
  - OpenRouter cloud provider (Phase 8+)
- All streaming requests are logged to `PromptHistory` upon completion

#### Tool/Function Calling
Tool/function calling is fully pass-through. LMAPI forwards `tools` and `tool_choice` and returns model-generated `tool_calls` unchanged. LMAPI does not execute tools or manage tool call state.


---

# Test Script Plan

## Overview

Create a comprehensive test harness (`scripts/test-mcp-tools.ts`) that evaluates how accurately different LLM models utilize MCP tools when processing prompts via LMAPI. The script will test all 17 DevPlanner MCP tools across multiple local models, tracking tool call accuracy and response times, then generate a dark-mode HTML dashboard displaying comparative results.

## Goals

1. **Tool Coverage**: Test all 17 MCP tools with targeted prompts
2. **Model Comparison**: Evaluate multiple local Ollama models sequentially (one at a time to minimize memory usage)
   - Target models: llama3-groq-tool-use, phi4, ministral-3, gemma3, qwen3, granite3.3
3. **Accuracy Metrics**: Track whether models correctly select the appropriate MCP tool
4. **Performance Metrics**: Record response duration for each completion
5. **Visualization**: Generate interactive HTML dashboard for results analysis
6. **Memory Efficiency**: Test one model at a time to avoid loading multiple large models into memory

## Implementation Steps

### Phase 1: Test Prompt Design

Create a comprehensive set of test cases that should trigger specific MCP tools. Each test case includes:

- **Prompt**: Natural language instruction that should trigger the tool
- **Expected Tool**: The MCP tool name that should be called
- **Tool Category**: CRUD, Smart/Workflow, or File Management
- **Difficulty**: Easy, Medium, or Hard (based on ambiguity/context needed)
- **Expected Parameters**: Key parameters that should be populated

#### Test Prompt Examples by Category

**CRUD Tools (10 tools)**

1. **list_projects**
   - Prompt: "Show me all available projects"
   - Difficulty: Easy
   - Expected params: `{}`

2. **list_projects** (with archive filter)
   - Prompt: "List all projects including archived ones"
   - Difficulty: Medium
   - Expected params: `{ "includeArchived": true }`

3. **get_project**
   - Prompt: "Get details about the mobile-app project"
   - Difficulty: Easy
   - Expected params: `{ "projectSlug": "mobile-app" }`

4. **create_project**
   - Prompt: "Create a new project called 'E-commerce Platform' for building an online store"
   - Difficulty: Medium
   - Expected params: `{ "name": "E-commerce Platform", "description": "..." }`

5. **list_cards**
   - Prompt: "Show all cards in the mobile-app project"
   - Difficulty: Easy
   - Expected params: `{ "projectSlug": "mobile-app" }`

6. **list_cards** (with filters)
   - Prompt: "List high priority cards in the in-progress lane of mobile-app"
   - Difficulty: Hard
   - Expected params: `{ "projectSlug": "mobile-app", "lane": "02-in-progress", "priority": "high" }`

7. **get_card**
   - Prompt: "Get the full details of the authentication-flow card in mobile-app"
   - Difficulty: Medium
   - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow" }`

8. **create_card**
   - Prompt: "Create a new card 'Add payment gateway' in mobile-app as high priority in upcoming lane"
   - Difficulty: Hard
   - Expected params: `{ "projectSlug": "mobile-app", "title": "Add payment gateway", "lane": "01-upcoming", "priority": "high" }`

9. **update_card**
   - Prompt: "Update the authentication-flow card to mark it as blocked with high priority"
   - Difficulty: Hard
   - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow", "status": "blocked", "priority": "high" }`

10. **move_card**
    - Prompt: "Move the login-screen card from upcoming to in-progress in mobile-app"
    - Difficulty: Hard
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "login-screen", "targetLane": "02-in-progress" }`

11. **add_task**
    - Prompt: "Add a task 'Write unit tests for auth module' to the authentication-flow card"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow", "text": "Write unit tests for auth module" }`

12. **toggle_task**
    - Prompt: "Mark task #0 as completed on the authentication-flow card in mobile-app"
    - Difficulty: Hard
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow", "taskIndex": 0, "checked": true }`

**Smart/Workflow Tools (7 tools)**

13. **get_board_overview**
    - Prompt: "Give me an overview of the mobile-app board with card counts and task statistics"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app" }`

14. **get_next_tasks**
    - Prompt: "What are the next tasks I should work on in mobile-app?"
    - Difficulty: Easy
    - Expected params: `{ "projectSlug": "mobile-app" }`

15. **get_next_tasks** (with filters)
    - Prompt: "Show me the top 5 tasks assigned to agent in the in-progress lane of mobile-app"
    - Difficulty: Hard
    - Expected params: `{ "projectSlug": "mobile-app", "assignee": "agent", "lane": "02-in-progress", "limit": 5 }`

16. **batch_update_tasks**
    - Prompt: "Mark tasks 0, 1, and 2 as completed on the authentication-flow card"
    - Difficulty: Hard
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow", "updates": [{"taskIndex": 0, "checked": true}, ...] }`

17. **search_cards**
    - Prompt: "Search for all cards mentioning 'authentication' in mobile-app"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "query": "authentication" }`

18. **search_cards** (targeted)
    - Prompt: "Find cards with 'payment' in the title only in mobile-app"
    - Difficulty: Hard
    - Expected params: `{ "projectSlug": "mobile-app", "query": "payment", "searchIn": ["title"] }`

19. **update_card_content**
    - Prompt: "Replace the content of setup-database card with a detailed implementation plan"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "setup-database", "content": "..." }`

20. **get_project_progress**
    - Prompt: "Show me the overall progress statistics for the mobile-app project"
    - Difficulty: Easy
    - Expected params: `{ "projectSlug": "mobile-app" }`

21. **archive_card**
    - Prompt: "Archive the deprecated-feature card in mobile-app"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "deprecated-feature" }`

**File Management Tools (3 tools)**

22. **list_project_files**
    - Prompt: "Show me all files associated with the mobile-app project"
    - Difficulty: Easy
    - Expected params: `{ "projectSlug": "mobile-app" }`

23. **list_card_files**
    - Prompt: "What files are attached to the authentication-flow card?"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "cardSlug": "authentication-flow" }`

24. **read_file_content**
    - Prompt: "Read the content of api-spec.md file in mobile-app project"
    - Difficulty: Medium
    - Expected params: `{ "projectSlug": "mobile-app", "filename": "api-spec.md" }`

### Phase 2: Test Script Implementation

Create `scripts/test-mcp-tools.ts` with the following structure:

#### 2.1 Core Types and Interfaces

```typescript
interface TestCase {
  id: string;                    // Unique identifier (e.g., "list_projects_01")
  prompt: string;                // Natural language prompt
  expectedTool: string;          // MCP tool name
  category: 'CRUD' | 'Smart' | 'FileManagement';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  expectedParams?: Record<string, any>;  // Key expected parameters
  description: string;           // Human-readable description
}

interface TestResult {
  testId: string;
  model: string;
  prompt: string;
  expectedTool: string;
  actualTool: string | null;     // null if no tool was called
  correct: boolean;              // true if actualTool === expectedTool
  durationMs: number;            // Response time in milliseconds
  category: string;
  difficulty: string;
  timestamp: string;
  responseMetadata?: {           // LMAPI metadata
    server_name?: string;
    group_id?: string;
    lmapi_duration_ms?: number;
  };
  error?: string;                // Error message if test failed
}

interface ModelStats {
  model: string;
  totalTests: number;
  correctCalls: number;
  accuracyPercent: number;
  avgDurationMs: number;
  byCategory: Record<string, {
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;
  byDifficulty: Record<string, {
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;
}

interface TestReport {
  generatedAt: string;
  totalTests: number;
  modelsCount: number;
  models: ModelStats[];
  allResults: TestResult[];
  testCases: TestCase[];
}
```

#### 2.2 Test Case Definitions

Create a constant array `TEST_CASES` containing all 24+ test cases defined in Phase 1.

#### 2.3 MCP Tool Definitions Loader

Load the actual MCP tool schemas from `src/mcp/schemas.ts` to pass as `tools` array in the chat completion request. Convert JSON schemas to OpenAI function calling format:

```typescript
function loadMCPTools(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}> {
  // Load from schemas.ts and format for OpenAI API
  // Each MCP tool becomes a function definition
}
```

#### 2.4 Server and Model Discovery (New)

Leverage LMAPI server management endpoints to validate availability before running tests:

```typescript
async function discoverAvailableModels(
  lmapiBaseUrl: string = 'http://localhost:17103'
): Promise<Map<string, string[]>> {
  // GET /servers/available to list all available servers and their models
  const response = await fetch(`${lmapiBaseUrl}/servers/available`);
  const data = await response.json();

  // Returns Map<serverName, modelNames[]>
  const serverModels = new Map<string, string[]>();

  for (const server of data.servers) {
    serverModels.set(server.name, server.models || []);
  }

  return serverModels;
}

async function validateModels(
  requestedModels: string[],
  lmapiBaseUrl: string
): Promise<string[]> {
  const availableServers = await discoverAvailableModels(lmapiBaseUrl);

  // Flatten all available models
  const allModels = new Set<string>();
  for (const models of availableServers.values()) {
    models.forEach(m => allModels.add(m));
  }

  // Filter requested models to only those available
  const validModels = requestedModels.filter(m => allModels.has(m));

  if (validModels.length === 0) {
    console.error('❌ No requested models are available on any LMAPI server!');
    console.log(`Available models: ${Array.from(allModels).join(', ')}`);
    process.exit(1);
  }

  if (validModels.length < requestedModels.length) {
    const missing = requestedModels.filter(m => !allModels.has(m));
    console.warn(`⚠️  Warning: Some models are not available: ${missing.join(', ')}`);
  }

  return validModels;
}
```

#### 2.5 LMAPI Client

Create functions to interact with LMAPI endpoints:

```typescript
async function testModelWithPrompt(
  model: string,
  prompt: string,
  tools: any[],
  lmapiEndpoint: string = 'http://localhost:17103/api/chat/completions/any'
): Promise<{
  toolCalls: Array<{ name: string; arguments: any }>;
  durationMs: number;
  metadata?: any;
}> {
  const startTime = Date.now();

  const response = await fetch(lmapiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for DevPlanner, a file-based Kanban board. Use the available tools to complete user requests.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      tools,
      tool_choice: 'auto',
      stream: false,
      temperature: 0.1,  // Low temperature for deterministic tool selection
    }),
  });

  const endTime = Date.now();
  const data = await response.json();

  return {
    toolCalls: data.choices[0]?.message?.tool_calls || [],
    durationMs: endTime - startTime,
    metadata: data.lmapi,  // LMAPI-specific metadata
  };
}
```

#### 2.6 Test Runner

```typescript
async function runTests(
  models: string[],
  testCases: TestCase[]
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const tools = loadMCPTools();

  console.log(`\nStarting tests for ${models.length} models × ${testCases.length} test cases = ${models.length * testCases.length} total tests\n`);
  console.log('Note: Testing one model at a time to minimize memory usage\n');

  // Test models sequentially (one at a time) to keep memory usage low
  for (const model of models) {
    console.log(`\nTesting model: ${model}`);
    console.log('─'.repeat(60));

    for (const testCase of testCases) {
      try {
        const { toolCalls, durationMs, metadata } = await testModelWithPrompt(
          model,
          testCase.prompt,
          tools
        );

        const actualTool = toolCalls[0]?.function?.name || null;
        const correct = actualTool === testCase.expectedTool;

        const result: TestResult = {
          testId: testCase.id,
          model,
          prompt: testCase.prompt,
          expectedTool: testCase.expectedTool,
          actualTool,
          correct,
          durationMs,
          category: testCase.category,
          difficulty: testCase.difficulty,
          timestamp: new Date().toISOString(),
          responseMetadata: metadata,
        };

        results.push(result);

        // Real-time feedback
        const icon = correct ? '✓' : '✗';
        const color = correct ? '\x1b[32m' : '\x1b[31m';  // green or red
        console.log(`  ${color}${icon}\x1b[0m ${testCase.id} (${durationMs}ms)`);

      } catch (error) {
        // Handle errors gracefully
        results.push({
          testId: testCase.id,
          model,
          prompt: testCase.prompt,
          expectedTool: testCase.expectedTool,
          actualTool: null,
          correct: false,
          durationMs: 0,
          category: testCase.category,
          difficulty: testCase.difficulty,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });

        console.log(`  \x1b[31m✗\x1b[0m ${testCase.id} (ERROR: ${error})`);
      }

      // Small delay to avoid overwhelming LMAPI/Ollama
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
```

#### 2.7 Statistics Calculator

```typescript
function calculateStats(results: TestResult[]): ModelStats[] {
  const modelMap = new Map<string, TestResult[]>();

  // Group by model
  for (const result of results) {
    if (!modelMap.has(result.model)) {
      modelMap.set(result.model, []);
    }
    modelMap.get(result.model)!.push(result);
  }

  // Calculate stats for each model
  const stats: ModelStats[] = [];

  for (const [model, modelResults] of modelMap) {
    const totalTests = modelResults.length;
    const correctCalls = modelResults.filter(r => r.correct).length;
    const accuracyPercent = Math.round((correctCalls / totalTests) * 100);
    const avgDurationMs = Math.round(
      modelResults.reduce((sum, r) => sum + r.durationMs, 0) / totalTests
    );

    // By category
    const byCategory: Record<string, any> = {};
    for (const cat of ['CRUD', 'Smart', 'FileManagement']) {
      const catResults = modelResults.filter(r => r.category === cat);
      const catCorrect = catResults.filter(r => r.correct).length;
      byCategory[cat] = {
        total: catResults.length,
        correct: catCorrect,
        accuracyPercent: catResults.length > 0
          ? Math.round((catCorrect / catResults.length) * 100)
          : 0,
      };
    }

    // By difficulty
    const byDifficulty: Record<string, any> = {};
    for (const diff of ['Easy', 'Medium', 'Hard']) {
      const diffResults = modelResults.filter(r => r.difficulty === diff);
      const diffCorrect = diffResults.filter(r => r.correct).length;
      byDifficulty[diff] = {
        total: diffResults.length,
        correct: diffCorrect,
        accuracyPercent: diffResults.length > 0
          ? Math.round((diffCorrect / diffResults.length) * 100)
          : 0,
      };
    }

    stats.push({
      model,
      totalTests,
      correctCalls,
      accuracyPercent,
      avgDurationMs,
      byCategory,
      byDifficulty,
    });
  }

  // Sort by accuracy descending
  stats.sort((a, b) => b.accuracyPercent - a.accuracyPercent);

  return stats;
}
```

#### 2.8 Report Generator

```typescript
function generateReport(
  results: TestResult[],
  testCases: TestCase[]
): TestReport {
  const stats = calculateStats(results);

  return {
    generatedAt: new Date().toISOString(),
    totalTests: results.length,
    modelsCount: new Set(results.map(r => r.model)).size,
    models: stats,
    allResults: results,
    testCases,
  };
}

async function saveReport(report: TestReport): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mcp-tool-test-report-${timestamp}.json`;
  const filepath = `./test-reports/${filename}`;

  // Ensure directory exists
  await Bun.write(filepath, JSON.stringify(report, null, 2));

  console.log(`\n✓ Report saved to: ${filepath}`);
  return filepath;
}
```

#### 2.9 Main Entry Point

```typescript
async function main() {
  const LMAPI_BASE_URL = 'http://localhost:17103';

  // Verify LMAPI is reachable
  try {
    await fetch(`${LMAPI_BASE_URL}/servers`);
  } catch (error) {
    console.error(`❌ Cannot reach LMAPI at ${LMAPI_BASE_URL}`);
    console.log('Make sure LMAPI is running before starting tests.');
    process.exit(1);
  }

  // Models to test (configurable via CLI args)
  // Testing one model at a time to minimize memory usage
  const requestedModels = process.argv.slice(2);
  if (requestedModels.length === 0) {
    requestedModels.push(
      'llama3-groq-tool-use:latest',
      'phi4:latest',
      'ministral-3:latest',
      'gemma3:latest',
      'qwen3:latest',
      'granite3.3:latest'
    );
  }

  // Validate models against available servers
  const models = await validateModels(requestedModels, LMAPI_BASE_URL);

  console.log('═'.repeat(60));
  console.log('  MCP Tool Calling Test Suite');
  console.log('═'.repeat(60));
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Total Tests: ${models.length * TEST_CASES.length}`);
  console.log('═'.repeat(60));

  // Run tests
  const results = await runTests(models, TEST_CASES);

  // Generate report
  const report = generateReport(results, TEST_CASES);

  // Save JSON report
  const reportPath = await saveReport(report);

  // Print summary to console
  printSummary(report);

  // Generate HTML dashboard
  const htmlPath = await generateHTMLDashboard(report, reportPath);
  console.log(`\n✓ HTML Dashboard: ${htmlPath}`);
  console.log(`\nOpen in browser: file://${process.cwd()}/${htmlPath}\n`);
}

function printSummary(report: TestReport) {
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(60));

  for (const model of report.models) {
    console.log(`\n${model.model}`);
    console.log(`  Overall: ${model.correctCalls}/${model.totalTests} (${model.accuracyPercent}%)`);
    console.log(`  Avg Duration: ${model.avgDurationMs}ms`);
    console.log(`  By Category:`);
    for (const [cat, stats] of Object.entries(model.byCategory)) {
      console.log(`    ${cat}: ${stats.correct}/${stats.total} (${stats.accuracyPercent}%)`);
    }
    console.log(`  By Difficulty:`);
    for (const [diff, stats] of Object.entries(model.byDifficulty)) {
      console.log(`    ${diff}: ${stats.correct}/${stats.total} (${stats.accuracyPercent}%)`);
    }
  }
}

main().catch(console.error);
```

### Phase 3: HTML Dashboard Generation

Create `generateHTMLDashboard(report: TestReport, reportPath: string): Promise<string>` that generates a standalone dark-mode HTML file with embedded CSS and JavaScript.

#### 3.1 Dashboard Features

1. **Overall Summary Card**
   - Total tests run
   - Models compared
   - Average accuracy across all models
   - Test completion timestamp

2. **Model Comparison Table**
   - Sortable columns: Model Name, Overall Accuracy, Avg Duration, CRUD %, Smart %, File Mgmt %
   - Color-coded cells (green for high accuracy, red for low)
   - Clickable rows to drill down

3. **Accuracy Charts**
   - Bar chart: Model accuracy comparison (overall)
   - Grouped bar chart: Accuracy by category per model
   - Grouped bar chart: Accuracy by difficulty per model

4. **Performance Charts**
   - Bar chart: Average response duration per model
   - Scatter plot: Accuracy vs Speed (bubble size = test count)

5. **Detailed Test Results Table**
   - Filterable by: Model, Category, Difficulty, Pass/Fail
   - Columns: Test ID, Model, Prompt (truncated), Expected Tool, Actual Tool, Status (✓/✗), Duration
   - Expandable rows showing full prompt and parameters

6. **Test Case Reference**
   - Accordion list of all test cases
   - Shows prompt, expected tool, category, difficulty
   - Click to filter results table to that test case

#### 3.2 Technology Stack

- **No Dependencies**: Pure HTML/CSS/JS (no build step, no external libraries except optional Chart.js via CDN)
- **Dark Mode**: Default dark theme with high contrast
- **Responsive**: Works on desktop and mobile
- **Accessible**: Proper ARIA labels, keyboard navigation

#### 3.3 HTML Structure Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Tool Calling Test Report - {{TIMESTAMP}}</title>
  <style>
    /* Dark mode CSS variables */
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --text-primary: #c9d1d9;
      --text-secondary: #8b949e;
      --border: #30363d;
      --accent-green: #238636;
      --accent-red: #da3633;
      --accent-blue: #1f6feb;
      --accent-yellow: #d29922;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 3rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid var(--border);
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: var(--text-primary);
    }

    .subtitle {
      font-size: 1.1rem;
      color: var(--text-secondary);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .summary-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
    }

    .summary-card h3 {
      font-size: 0.875rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .summary-card .value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .section {
      margin-bottom: 3rem;
    }

    .section-title {
      font-size: 1.75rem;
      margin-bottom: 1.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-secondary);
      border-radius: 8px;
      overflow: hidden;
    }

    thead {
      background: var(--bg-tertiary);
    }

    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
    }

    th:hover {
      color: var(--text-primary);
    }

    tbody tr:hover {
      background: var(--bg-tertiary);
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .badge-success {
      background: var(--accent-green);
      color: white;
    }

    .badge-error {
      background: var(--accent-red);
      color: white;
    }

    .badge-warning {
      background: var(--accent-yellow);
      color: black;
    }

    .accuracy-high { color: var(--accent-green); font-weight: 600; }
    .accuracy-medium { color: var(--accent-yellow); font-weight: 600; }
    .accuracy-low { color: var(--accent-red); font-weight: 600; }

    .chart-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    canvas {
      max-height: 400px;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    select, input {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 1rem;
      font-size: 0.95rem;
    }

    select:focus, input:focus {
      outline: 2px solid var(--accent-blue);
    }

    .expandable {
      cursor: pointer;
    }

    .details {
      display: none;
      padding: 1rem;
      background: var(--bg-primary);
      margin-top: 0.5rem;
      border-radius: 6px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
    }

    .details.open {
      display: block;
    }

    code {
      background: var(--bg-primary);
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
    }

    .icon {
      display: inline-block;
      width: 1.2em;
      text-align: center;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧪 MCP Tool Calling Test Report</h1>
      <p class="subtitle">Generated {{TIMESTAMP}}</p>
    </header>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Total Tests</h3>
        <div class="value">{{TOTAL_TESTS}}</div>
      </div>
      <div class="summary-card">
        <h3>Models Tested</h3>
        <div class="value">{{MODELS_COUNT}}</div>
      </div>
      <div class="summary-card">
        <h3>Average Accuracy</h3>
        <div class="value">{{AVG_ACCURACY}}%</div>
      </div>
      <div class="summary-card">
        <h3>Test Cases</h3>
        <div class="value">{{TEST_CASES_COUNT}}</div>
      </div>
    </div>

    <!-- Model Comparison Table -->
    <section class="section">
      <h2 class="section-title">📊 Model Comparison</h2>
      <table id="model-table">
        <thead>
          <tr>
            <th onclick="sortTable(0)">Model</th>
            <th onclick="sortTable(1)">Overall Accuracy</th>
            <th onclick="sortTable(2)">Avg Duration (ms)</th>
            <th onclick="sortTable(3)">CRUD</th>
            <th onclick="sortTable(4)">Smart/Workflow</th>
            <th onclick="sortTable(5)">File Mgmt</th>
            <th onclick="sortTable(6)">Easy</th>
            <th onclick="sortTable(7)">Medium</th>
            <th onclick="sortTable(8)">Hard</th>
          </tr>
        </thead>
        <tbody id="model-tbody">
          <!-- Generated from report.models -->
        </tbody>
      </table>
    </section>

    <!-- Charts -->
    <section class="section">
      <h2 class="section-title">📈 Visualization</h2>

      <div class="chart-container">
        <h3>Overall Accuracy by Model</h3>
        <canvas id="accuracy-chart"></canvas>
      </div>

      <div class="chart-container">
        <h3>Accuracy by Category</h3>
        <canvas id="category-chart"></canvas>
      </div>

      <div class="chart-container">
        <h3>Accuracy by Difficulty</h3>
        <canvas id="difficulty-chart"></canvas>
      </div>

      <div class="chart-container">
        <h3>Performance (Avg Duration)</h3>
        <canvas id="performance-chart"></canvas>
      </div>
    </section>

    <!-- Detailed Results -->
    <section class="section">
      <h2 class="section-title">🔍 Detailed Test Results</h2>

      <div class="filters">
        <select id="filter-model" onchange="filterResults()">
          <option value="">All Models</option>
          <!-- Generated from models -->
        </select>
        <select id="filter-category" onchange="filterResults()">
          <option value="">All Categories</option>
          <option value="CRUD">CRUD</option>
          <option value="Smart">Smart/Workflow</option>
          <option value="FileManagement">File Management</option>
        </select>
        <select id="filter-difficulty" onchange="filterResults()">
          <option value="">All Difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select id="filter-status" onchange="filterResults()">
          <option value="">All Results</option>
          <option value="pass">Pass Only</option>
          <option value="fail">Fail Only</option>
        </select>
        <input type="search" id="search-prompt" placeholder="Search prompts..." oninput="filterResults()">
      </div>

      <table id="results-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Test ID</th>
            <th>Model</th>
            <th>Category</th>
            <th>Difficulty</th>
            <th>Prompt</th>
            <th>Expected Tool</th>
            <th>Actual Tool</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody id="results-tbody">
          <!-- Generated from report.allResults -->
        </tbody>
      </table>
    </section>

    <!-- Test Cases Reference -->
    <section class="section">
      <h2 class="section-title">📋 Test Cases Reference</h2>
      <div id="test-cases-list">
        <!-- Generated from report.testCases -->
      </div>
    </section>
  </div>

  <script>
    // Embed report data
    const REPORT_DATA = {{REPORT_JSON}};

    // Initialize dashboard
    function init() {
      populateModelTable();
      populateResultsTable();
      populateTestCasesList();
      renderCharts();
    }

    function populateModelTable() {
      const tbody = document.getElementById('model-tbody');
      tbody.innerHTML = '';

      for (const model of REPORT_DATA.models) {
        const row = document.createElement('tr');

        const accuracyClass = model.accuracyPercent >= 80 ? 'accuracy-high' :
                             model.accuracyPercent >= 50 ? 'accuracy-medium' : 'accuracy-low';

        row.innerHTML = `
          <td><strong>${model.model}</strong></td>
          <td class="${accuracyClass}">${model.accuracyPercent}%</td>
          <td>${model.avgDurationMs}ms</td>
          <td>${model.byCategory.CRUD?.accuracyPercent || 0}%</td>
          <td>${model.byCategory.Smart?.accuracyPercent || 0}%</td>
          <td>${model.byCategory.FileManagement?.accuracyPercent || 0}%</td>
          <td>${model.byDifficulty.Easy?.accuracyPercent || 0}%</td>
          <td>${model.byDifficulty.Medium?.accuracyPercent || 0}%</td>
          <td>${model.byDifficulty.Hard?.accuracyPercent || 0}%</td>
        `;

        tbody.appendChild(row);
      }
    }

    function populateResultsTable() {
      const tbody = document.getElementById('results-tbody');
      tbody.innerHTML = '';

      for (const result of REPORT_DATA.allResults) {
        const row = document.createElement('tr');
        row.className = 'expandable';
        row.dataset.testId = result.testId;
        row.dataset.model = result.model;
        row.dataset.category = result.category;
        row.dataset.difficulty = result.difficulty;
        row.dataset.status = result.correct ? 'pass' : 'fail';

        const statusIcon = result.correct
          ? '<span class="icon" style="color: var(--accent-green)">✓</span>'
          : '<span class="icon" style="color: var(--accent-red)">✗</span>';

        const promptTrunc = result.prompt.length > 60
          ? result.prompt.substring(0, 60) + '...'
          : result.prompt;

        row.innerHTML = `
          <td>${statusIcon}</td>
          <td><code>${result.testId}</code></td>
          <td>${result.model}</td>
          <td><span class="badge">${result.category}</span></td>
          <td><span class="badge">${result.difficulty}</span></td>
          <td>${promptTrunc}</td>
          <td><code>${result.expectedTool}</code></td>
          <td><code>${result.actualTool || 'null'}</code></td>
          <td>${result.durationMs}ms</td>
        `;

        row.onclick = () => toggleDetails(result.testId);
        tbody.appendChild(row);

        // Details row
        const detailsRow = document.createElement('tr');
        detailsRow.innerHTML = `
          <td colspan="9">
            <div class="details" id="details-${result.testId}">
              <strong>Full Prompt:</strong>
              <pre>${result.prompt}</pre>
              ${result.error ? `<strong>Error:</strong> ${result.error}` : ''}
            </div>
          </td>
        `;
        tbody.appendChild(detailsRow);
      }
    }

    function toggleDetails(testId) {
      const details = document.getElementById(`details-${testId}`);
      details.classList.toggle('open');
    }

    function populateTestCasesList() {
      const container = document.getElementById('test-cases-list');
      container.innerHTML = '';

      for (const tc of REPORT_DATA.testCases) {
        const div = document.createElement('div');
        div.style.marginBottom = '1rem';
        div.innerHTML = `
          <details style="background: var(--bg-secondary); padding: 1rem; border-radius: 6px; border: 1px solid var(--border);">
            <summary style="cursor: pointer; font-weight: 600;">
              <code>${tc.id}</code> - ${tc.expectedTool}
              <span class="badge">${tc.category}</span>
              <span class="badge">${tc.difficulty}</span>
            </summary>
            <div style="margin-top: 0.5rem; color: var(--text-secondary);">
              <strong>Prompt:</strong> ${tc.prompt}<br>
              <strong>Description:</strong> ${tc.description}
            </div>
          </details>
        `;
        container.appendChild(div);
      }
    }

    function filterResults() {
      const modelFilter = document.getElementById('filter-model').value;
      const categoryFilter = document.getElementById('filter-category').value;
      const difficultyFilter = document.getElementById('filter-difficulty').value;
      const statusFilter = document.getElementById('filter-status').value;
      const searchQuery = document.getElementById('search-prompt').value.toLowerCase();

      const rows = document.querySelectorAll('#results-tbody tr.expandable');

      for (const row of rows) {
        let show = true;

        if (modelFilter && row.dataset.model !== modelFilter) show = false;
        if (categoryFilter && row.dataset.category !== categoryFilter) show = false;
        if (difficultyFilter && row.dataset.difficulty !== difficultyFilter) show = false;
        if (statusFilter && row.dataset.status !== statusFilter) show = false;

        if (searchQuery) {
          const result = REPORT_DATA.allResults.find(r => r.testId === row.dataset.testId);
          if (!result.prompt.toLowerCase().includes(searchQuery)) show = false;
        }

        row.style.display = show ? '' : 'none';
        row.nextElementSibling.style.display = show ? '' : 'none';
      }
    }

    function sortTable(columnIndex) {
      // Implement sorting logic
    }

    function renderCharts() {
      // Accuracy by Model
      new Chart(document.getElementById('accuracy-chart'), {
        type: 'bar',
        data: {
          labels: REPORT_DATA.models.map(m => m.model),
          datasets: [{
            label: 'Accuracy (%)',
            data: REPORT_DATA.models.map(m => m.accuracyPercent),
            backgroundColor: 'rgba(35, 134, 54, 0.8)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { y: { beginAtZero: true, max: 100 } },
          plugins: {
            legend: { display: false }
          }
        }
      });

      // Accuracy by Category
      const categories = ['CRUD', 'Smart', 'FileManagement'];
      new Chart(document.getElementById('category-chart'), {
        type: 'bar',
        data: {
          labels: REPORT_DATA.models.map(m => m.model),
          datasets: categories.map((cat, i) => ({
            label: cat,
            data: REPORT_DATA.models.map(m => m.byCategory[cat]?.accuracyPercent || 0),
            backgroundColor: ['rgba(31, 111, 235, 0.8)', 'rgba(35, 134, 54, 0.8)', 'rgba(210, 153, 34, 0.8)'][i],
          }))
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, max: 100 } }
        }
      });

      // Accuracy by Difficulty
      const difficulties = ['Easy', 'Medium', 'Hard'];
      new Chart(document.getElementById('difficulty-chart'), {
        type: 'bar',
        data: {
          labels: REPORT_DATA.models.map(m => m.model),
          datasets: difficulties.map((diff, i) => ({
            label: diff,
            data: REPORT_DATA.models.map(m => m.byDifficulty[diff]?.accuracyPercent || 0),
            backgroundColor: ['rgba(35, 134, 54, 0.8)', 'rgba(210, 153, 34, 0.8)', 'rgba(218, 54, 51, 0.8)'][i],
          }))
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, max: 100 } }
        }
      });

      // Performance (Duration)
      new Chart(document.getElementById('performance-chart'), {
        type: 'bar',
        data: {
          labels: REPORT_DATA.models.map(m => m.model),
          datasets: [{
            label: 'Avg Duration (ms)',
            data: REPORT_DATA.models.map(m => m.avgDurationMs),
            backgroundColor: 'rgba(31, 111, 235, 0.8)',
          }]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true } },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // Populate model filter dropdown
    const modelSelect = document.getElementById('filter-model');
    for (const model of REPORT_DATA.models) {
      const option = document.createElement('option');
      option.value = model.model;
      option.textContent = model.model;
      modelSelect.appendChild(option);
    }

    // Initialize on load
    init();
  </script>
</body>
</html>
```

#### 3.4 HTML Generator Function

```typescript
async function generateHTMLDashboard(report: TestReport, reportPath: string): Promise<string> {
  const template = `<!-- HTML template from above -->`;

  // Calculate average accuracy
  const avgAccuracy = Math.round(
    report.models.reduce((sum, m) => sum + m.accuracyPercent, 0) / report.models.length
  );

  // Replace template placeholders
  let html = template
    .replace('{{TIMESTAMP}}', new Date(report.generatedAt).toLocaleString())
    .replace('{{TOTAL_TESTS}}', report.totalTests.toString())
    .replace('{{MODELS_COUNT}}', report.modelsCount.toString())
    .replace('{{AVG_ACCURACY}}', avgAccuracy.toString())
    .replace('{{TEST_CASES_COUNT}}', report.testCases.length.toString())
    .replace('{{REPORT_JSON}}', JSON.stringify(report));

  // Save HTML file
  const timestamp = new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `mcp-tool-test-dashboard-${timestamp}.html`;
  const filepath = `./test-reports/${filename}`;

  await Bun.write(filepath, html);

  return filepath;
}
```

### Phase 4: Usage and CLI Integration

#### 4.1 Add npm scripts to package.json

```json
{
  "scripts": {
    "test:mcp-tools": "bun run scripts/test-mcp-tools.ts",
    "test:mcp-tools:quick": "bun run scripts/test-mcp-tools.ts llama3.1",
    "test:mcp-tools:all": "bun run scripts/test-mcp-tools.ts llama3.1 qwen2.5:7b mistral gemma2:9b phi3:14b"
  }
}
```

#### 4.2 CLI Arguments

Support the following command-line arguments:

- `bun run test:mcp-tools [model1] [model2] ...` - Test specific models
- `--endpoint <url>` - Override LMAPI endpoint (default: `http://localhost:17103/api/chat/completions/any`)
- `--output <dir>` - Override output directory (default: `./test-reports`)
- `--filter <category|difficulty|testId>` - Run only specific tests
- `--verbose` - Show full request/response details during testing
- `--no-html` - Skip HTML dashboard generation

### Phase 5: Testing and Validation

Before considering the implementation complete:

1. **Verify LMAPI is running**: Script should check if LMAPI endpoint is reachable via `GET /servers`
2. **Verify Ollama models**: Use `GET /servers/available` to confirm models are available
3. **Graceful error handling**: Network errors, model errors, timeout handling
4. **Progress indicators**: Real-time console output with spinners/progress bars
5. **Resume capability**: Optionally save partial results and resume if interrupted

### Phase 6: Extensions and Future Enhancements

Optional improvements for future iterations:

1. **Historical comparison**: Compare current test run against previous runs
2. **Regression detection**: Alert if accuracy drops below baseline
3. **Parameter validation**: Check if models populate expected parameters correctly
4. **Multi-turn conversations**: Test tools that require follow-up context
5. **Cloud provider comparison**: Test LMAPI provider parameter with OpenRouter models
6. **Streaming tests**: Validate streaming responses with tool calls
7. **Cost tracking**: If using cloud providers, track token usage and costs
8. **CI/CD integration**: Run tests automatically on MCP schema changes

## Success Criteria

The implementation will be considered complete when:

- ✅ Test script runs successfully with at least 3 local models
- ✅ All 17 MCP tools have at least one test case (targeting 24+ total cases)
- ✅ JSON report is generated with complete statistics
- ✅ HTML dashboard renders correctly with all charts and tables
- ✅ Dashboard is fully functional (filtering, sorting, expanding details)
- ✅ Script completes full test suite in under 5 minutes (depending on model count)
- ✅ Console output provides clear progress and summary
- ✅ Error handling prevents script crashes on individual test failures

## Implementation Notes for AI Agent

When implementing this plan:

1. **Create directory structure first**: `mkdir -p test-reports scripts`
2. **Implement incrementally**: Start with test case definitions, then runner, then dashboard
3. **Test with single model first**: Validate logic before scaling to multiple models
4. **Use TypeScript types**: Leverage the interfaces defined for type safety
5. **Handle edge cases**: Empty responses, malformed tool calls, timeouts
6. **Make dashboard self-contained**: Embed all data and scripts inline (no external dependencies except Chart.js CDN)
7. **Validate against real MCP server**: Ensure tool schemas match actual MCP implementation
8. **Follow Bun conventions**: Use `Bun.write()`, `Bun.file()`, native fetch
9. **Adhere to project patterns**: Follow existing DevPlanner code style and structure
10. **Document assumptions**: Add comments explaining any heuristics or scoring logic

## Related Files

- MCP tool handlers: [src/mcp/tool-handlers.ts](../../src/mcp/tool-handlers.ts)
- MCP schemas: [src/mcp/schemas.ts](../../src/mcp/schemas.ts)
- LMAPI server management endpoints: See Server Management section above
- LMAPI completions endpoints: See Completions section above

