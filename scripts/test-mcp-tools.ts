#!/usr/bin/env bun
/**
 * MCP Tool Calling Test Script
 * 
 * Evaluates how accurately different LLM models utilize MCP tools when processing
 * prompts via LMAPI. Tests all 20 DevPlanner MCP tools across multiple local models,
 * tracking tool call accuracy and response times, then generates a dark-mode HTML
 * dashboard displaying comparative results.
 * 
 * Usage:
 *   bun run scripts/test-mcp-tools.ts [model1] [model2] ...
 *   bun run test:mcp-tools
 * 
 * Options:
 *   --endpoint <url>    Override LMAPI endpoint (default: http://localhost:17103)
 *   --output <dir>      Override output directory (default: ./test-reports)
 *   --no-html           Skip HTML dashboard generation
 *   --verbose           Show detailed request/response information
 */

import * as schemas from '../src/mcp/schemas.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface TestCase {
  id: string;
  prompt: string;
  expectedTool: string;
  category: 'CRUD' | 'Smart' | 'FileManagement';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  expectedParams?: Record<string, any>;
  description: string;
}

interface TestResult {
  testId: string;
  model: string;
  prompt: string;
  expectedTool: string;
  actualTool: string | null;
  correct: boolean;
  durationMs: number;
  category: string;
  difficulty: string;
  timestamp: string;
  responseMetadata?: {
    server_name?: string;
    group_id?: string;
    lmapi_duration_ms?: number;
  };
  error?: string;
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

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// ============================================================================
// Test Case Definitions
// ============================================================================

const TEST_CASES: TestCase[] = [
  // CRUD Tools - Projects
  {
    id: 'list_projects_01',
    prompt: 'Show me all available projects',
    expectedTool: 'list_projects',
    category: 'CRUD',
    difficulty: 'Easy',
    expectedParams: {},
    description: 'Basic project listing',
  },
  {
    id: 'list_projects_02',
    prompt: 'List all projects including archived ones',
    expectedTool: 'list_projects',
    category: 'CRUD',
    difficulty: 'Medium',
    expectedParams: { includeArchived: true },
    description: 'Project listing with archive filter',
  },
  {
    id: 'get_project_01',
    prompt: 'Get details about the mobile-app project',
    expectedTool: 'get_project',
    category: 'CRUD',
    difficulty: 'Easy',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'Get specific project details',
  },
  {
    id: 'create_project_01',
    prompt: 'Create a new project called "E-commerce Platform" for building an online store',
    expectedTool: 'create_project',
    category: 'CRUD',
    difficulty: 'Medium',
    expectedParams: { name: 'E-commerce Platform' },
    description: 'Create new project with description',
  },

  // CRUD Tools - Cards
  {
    id: 'list_cards_01',
    prompt: 'Show all cards in the mobile-app project',
    expectedTool: 'list_cards',
    category: 'CRUD',
    difficulty: 'Easy',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'Basic card listing',
  },
  {
    id: 'list_cards_02',
    prompt: 'List high priority cards in the in-progress lane of mobile-app',
    expectedTool: 'list_cards',
    category: 'CRUD',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      lane: '02-in-progress', 
      priority: 'high' 
    },
    description: 'Card listing with multiple filters',
  },
  {
    id: 'get_card_01',
    prompt: 'Get the full details of the authentication-flow card in mobile-app',
    expectedTool: 'get_card',
    category: 'CRUD',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'authentication-flow' 
    },
    description: 'Get specific card details',
  },
  {
    id: 'create_card_01',
    prompt: 'Create a new card "Add payment gateway" in mobile-app as high priority in upcoming lane',
    expectedTool: 'create_card',
    category: 'CRUD',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      title: 'Add payment gateway',
      lane: '01-upcoming',
      priority: 'high'
    },
    description: 'Create card with multiple attributes',
  },
  {
    id: 'update_card_01',
    prompt: 'Update the authentication-flow card to mark it as blocked with high priority',
    expectedTool: 'update_card',
    category: 'CRUD',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'authentication-flow',
      status: 'blocked',
      priority: 'high'
    },
    description: 'Update card status and priority',
  },
  {
    id: 'move_card_01',
    prompt: 'Move the login-screen card from upcoming to in-progress in mobile-app',
    expectedTool: 'move_card',
    category: 'CRUD',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'login-screen',
      targetLane: '02-in-progress'
    },
    description: 'Move card between lanes',
  },

  // CRUD Tools - Tasks
  {
    id: 'add_task_01',
    prompt: 'Add a task "Write unit tests for auth module" to the authentication-flow card',
    expectedTool: 'add_task',
    category: 'CRUD',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'authentication-flow',
      text: 'Write unit tests for auth module'
    },
    description: 'Add new task to card',
  },
  {
    id: 'toggle_task_01',
    prompt: 'Mark task #0 as completed on the authentication-flow card in mobile-app',
    expectedTool: 'toggle_task',
    category: 'CRUD',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'authentication-flow',
      taskIndex: 0,
      checked: true
    },
    description: 'Toggle task completion status',
  },

  // Smart/Workflow Tools
  {
    id: 'get_board_overview_01',
    prompt: 'Give me an overview of the mobile-app board with card counts and task statistics',
    expectedTool: 'get_board_overview',
    category: 'Smart',
    difficulty: 'Medium',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'Get comprehensive board overview',
  },
  {
    id: 'get_next_tasks_01',
    prompt: 'What are the next tasks I should work on in mobile-app?',
    expectedTool: 'get_next_tasks',
    category: 'Smart',
    difficulty: 'Easy',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'Get prioritized next tasks',
  },
  {
    id: 'get_next_tasks_02',
    prompt: 'Show me the top 5 tasks assigned to agent in the in-progress lane of mobile-app',
    expectedTool: 'get_next_tasks',
    category: 'Smart',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app',
      assignee: 'agent',
      lane: '02-in-progress',
      limit: 5
    },
    description: 'Get next tasks with filters',
  },
  {
    id: 'batch_update_tasks_01',
    prompt: 'Mark tasks 0, 1, and 2 as completed on the authentication-flow card',
    expectedTool: 'batch_update_tasks',
    category: 'Smart',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app', 
      cardSlug: 'authentication-flow',
      updates: [
        { taskIndex: 0, checked: true },
        { taskIndex: 1, checked: true },
        { taskIndex: 2, checked: true }
      ]
    },
    description: 'Batch update multiple tasks',
  },
  {
    id: 'search_cards_01',
    prompt: 'Search for all cards mentioning "authentication" in mobile-app',
    expectedTool: 'search_cards',
    category: 'Smart',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app',
      query: 'authentication'
    },
    description: 'Search cards by keyword',
  },
  {
    id: 'search_cards_02',
    prompt: 'Find cards with "payment" in the title only in mobile-app',
    expectedTool: 'search_cards',
    category: 'Smart',
    difficulty: 'Hard',
    expectedParams: { 
      projectSlug: 'mobile-app',
      query: 'payment',
      searchIn: ['title']
    },
    description: 'Search cards with field filter',
  },
  {
    id: 'update_card_content_01',
    prompt: 'Replace the content of setup-database card with a detailed implementation plan',
    expectedTool: 'update_card_content',
    category: 'Smart',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app',
      cardSlug: 'setup-database'
    },
    description: 'Update card markdown content',
  },
  {
    id: 'get_project_progress_01',
    prompt: 'Show me the overall progress statistics for the mobile-app project',
    expectedTool: 'get_project_progress',
    category: 'Smart',
    difficulty: 'Easy',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'Get project completion metrics',
  },
  {
    id: 'archive_card_01',
    prompt: 'Archive the deprecated-feature card in mobile-app',
    expectedTool: 'archive_card',
    category: 'Smart',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app',
      cardSlug: 'deprecated-feature'
    },
    description: 'Archive completed or obsolete card',
  },

  // File Management Tools
  {
    id: 'list_project_files_01',
    prompt: 'Show me all files associated with the mobile-app project',
    expectedTool: 'list_project_files',
    category: 'FileManagement',
    difficulty: 'Easy',
    expectedParams: { projectSlug: 'mobile-app' },
    description: 'List all project files',
  },
  {
    id: 'list_card_files_01',
    prompt: 'What files are attached to the authentication-flow card?',
    expectedTool: 'list_card_files',
    category: 'FileManagement',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app',
      cardSlug: 'authentication-flow'
    },
    description: 'List files for specific card',
  },
  {
    id: 'read_file_content_01',
    prompt: 'Read the content of api-spec.md file in mobile-app project',
    expectedTool: 'read_file_content',
    category: 'FileManagement',
    difficulty: 'Medium',
    expectedParams: { 
      projectSlug: 'mobile-app',
      filename: 'api-spec.md'
    },
    description: 'Read text file content',
  },
];

// ============================================================================
// MCP Tool Schema Loader
// ============================================================================

function loadMCPTools(): OpenAITool[] {
  const schemaMap: Record<string, { schema: any; description: string }> = {
    list_projects: {
      schema: schemas.LIST_PROJECTS_SCHEMA,
      description: 'List all projects in the workspace. Optionally include archived projects.',
    },
    get_project: {
      schema: schemas.GET_PROJECT_SCHEMA,
      description: 'Get detailed information about a specific project by its slug.',
    },
    create_project: {
      schema: schemas.CREATE_PROJECT_SCHEMA,
      description: 'Create a new project with a name and optional description.',
    },
    list_cards: {
      schema: schemas.LIST_CARDS_SCHEMA,
      description: 'List cards in a project with optional filters (lane, priority, assignee, tags, status).',
    },
    get_card: {
      schema: schemas.GET_CARD_SCHEMA,
      description: 'Get full details of a specific card including tasks and metadata.',
    },
    create_card: {
      schema: schemas.CREATE_CARD_SCHEMA,
      description: 'Create a new card in a project with title, lane, priority, and other attributes.',
    },
    update_card: {
      schema: schemas.UPDATE_CARD_SCHEMA,
      description: 'Update card attributes like priority, status, assignee, or tags.',
    },
    move_card: {
      schema: schemas.MOVE_CARD_SCHEMA,
      description: 'Move a card from one lane to another.',
    },
    add_task: {
      schema: schemas.ADD_TASK_SCHEMA,
      description: 'Add a new task to a card\'s checklist.',
    },
    toggle_task: {
      schema: schemas.TOGGLE_TASK_SCHEMA,
      description: 'Toggle a task\'s completion status (check or uncheck).',
    },
    get_board_overview: {
      schema: schemas.GET_BOARD_OVERVIEW_SCHEMA,
      description: 'Get a comprehensive overview of a project board including lane summaries and task statistics.',
    },
    get_next_tasks: {
      schema: schemas.GET_NEXT_TASKS_SCHEMA,
      description: 'Get prioritized list of next tasks to work on, with optional filters.',
    },
    batch_update_tasks: {
      schema: schemas.BATCH_UPDATE_TASKS_SCHEMA,
      description: 'Update multiple tasks at once (bulk check/uncheck).',
    },
    search_cards: {
      schema: schemas.SEARCH_CARDS_SCHEMA,
      description: 'Search for cards by keyword in title, content, or tags.',
    },
    update_card_content: {
      schema: schemas.UPDATE_CARD_CONTENT_SCHEMA,
      description: 'Replace the markdown content of a card.',
    },
    get_project_progress: {
      schema: schemas.GET_PROJECT_PROGRESS_SCHEMA,
      description: 'Get progress statistics for a project (total cards, completed cards, task completion percentage).',
    },
    archive_card: {
      schema: schemas.ARCHIVE_CARD_SCHEMA,
      description: 'Archive a card by moving it to the archive lane.',
    },
    list_project_files: {
      schema: schemas.LIST_PROJECT_FILES_SCHEMA,
      description: 'List all files associated with a project.',
    },
    list_card_files: {
      schema: schemas.LIST_CARD_FILES_SCHEMA,
      description: 'List files attached to a specific card.',
    },
    read_file_content: {
      schema: schemas.READ_FILE_CONTENT_SCHEMA,
      description: 'Read the content of a text file in a project.',
    },
  };

  return Object.entries(schemaMap).map(([name, { schema, description }]) => ({
    type: 'function' as const,
    function: {
      name,
      description,
      parameters: schema,
    },
  }));
}

// ============================================================================
// LMAPI Client Functions
// ============================================================================

async function discoverAvailableModels(
  lmapiBaseUrl: string
): Promise<Map<string, string[]>> {
  try {
    const response = await fetch(`${lmapiBaseUrl}/servers/available`);
    const data = await response.json();

    const serverModels = new Map<string, string[]>();

    for (const server of data.servers || []) {
      serverModels.set(server.name, server.models || []);
    }

    return serverModels;
  } catch (error) {
    console.error('Failed to discover available models:', error);
    return new Map();
  }
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

  if (allModels.size === 0) {
    console.error('❌ No models available on any LMAPI server!');
    console.log('Make sure Ollama is running and models are pulled.');
    process.exit(1);
  }

  // Filter requested models to only those available
  const validModels = requestedModels.filter(m => allModels.has(m));

  if (validModels.length === 0) {
    console.error('❌ No requested models are available on any LMAPI server!');
    console.log(`Available models: ${Array.from(allModels).join(', ')}`);
    console.log(`Requested models: ${requestedModels.join(', ')}`);
    process.exit(1);
  }

  if (validModels.length < requestedModels.length) {
    const missing = requestedModels.filter(m => !allModels.has(m));
    console.warn(`⚠️  Warning: Some models are not available: ${missing.join(', ')}`);
  }

  return validModels;
}

async function testModelWithPrompt(
  model: string,
  prompt: string,
  tools: OpenAITool[],
  lmapiEndpoint: string,
  verbose: boolean = false
): Promise<{
  toolCalls: Array<{ function: { name: string; arguments: any } }>;
  durationMs: number;
  metadata?: any;
}> {
  const startTime = Date.now();

  const requestBody = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant for DevPlanner, a file-based Kanban board. Use the available tools to complete user requests. Always call the most appropriate tool based on the user\'s request.',
      },
      {
        role: 'user',
        content: prompt,
      }
    ],
    tools,
    tool_choice: 'auto',
    stream: false,
    temperature: 0.1, // Low temperature for deterministic tool selection
  };

  if (verbose) {
    console.log('\n📤 Request:', JSON.stringify(requestBody, null, 2));
  }

  const response = await fetch(lmapiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const endTime = Date.now();
  const data = await response.json();

  if (verbose) {
    console.log('📥 Response:', JSON.stringify(data, null, 2));
  }

  if (!response.ok) {
    throw new Error(`LMAPI error: ${data.error || response.statusText}`);
  }

  return {
    toolCalls: data.choices?.[0]?.message?.tool_calls || [],
    durationMs: endTime - startTime,
    metadata: data.lmapi,
  };
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTests(
  models: string[],
  testCases: TestCase[],
  lmapiEndpoint: string,
  verbose: boolean = false
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const tools = loadMCPTools();

  console.log(`\nStarting tests for ${models.length} model(s) × ${testCases.length} test cases = ${models.length * testCases.length} total tests\n`);
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
          tools,
          lmapiEndpoint,
          verbose
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
        const color = correct ? '\x1b[32m' : '\x1b[31m'; // green or red
        const reset = '\x1b[0m';
        console.log(`  ${color}${icon}${reset} ${testCase.id} (${durationMs}ms)${!correct ? ` - Got: ${actualTool || 'null'}` : ''}`);

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

// ============================================================================
// Statistics Calculator
// ============================================================================

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

// ============================================================================
// Report Generation
// ============================================================================

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

async function saveReport(report: TestReport, outputDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mcp-tool-test-report-${timestamp}.json`;
  const filepath = `${outputDir}/${filename}`;

  await Bun.write(filepath, JSON.stringify(report, null, 2));

  console.log(`\n✓ Report saved to: ${filepath}`);
  return filepath;
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

  console.log('\n' + '═'.repeat(60));
}

// ============================================================================
// HTML Dashboard Generator
// ============================================================================

async function generateHTMLDashboard(report: TestReport, outputDir: string): Promise<string> {
  const avgAccuracy = report.models.length > 0
    ? Math.round(report.models.reduce((sum, m) => sum + m.accuracyPercent, 0) / report.models.length)
    : 0;

  const timestamp = new Date(report.generatedAt).toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Tool Calling Test Report - ${timestamp}</title>
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

    .badge-info {
      background: var(--accent-blue);
      color: white;
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
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .details.open {
      display: block;
    }

    code {
      background: var(--bg-primary);
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .icon {
      display: inline-block;
      width: 1.2em;
      text-align: center;
    }

    details {
      background: var(--bg-secondary);
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      margin-bottom: 0.5rem;
    }

    summary {
      cursor: pointer;
      font-weight: 600;
      user-select: none;
    }

    summary:hover {
      color: var(--accent-blue);
    }

    details[open] summary {
      margin-bottom: 0.75rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧪 MCP Tool Calling Test Report</h1>
      <p class="subtitle">Generated ${timestamp}</p>
    </header>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Total Tests</h3>
        <div class="value">${report.totalTests}</div>
      </div>
      <div class="summary-card">
        <h3>Models Tested</h3>
        <div class="value">${report.modelsCount}</div>
      </div>
      <div class="summary-card">
        <h3>Average Accuracy</h3>
        <div class="value">${avgAccuracy}%</div>
      </div>
      <div class="summary-card">
        <h3>Test Cases</h3>
        <div class="value">${report.testCases.length}</div>
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
        </tbody>
      </table>
    </section>

    <!-- Test Cases Reference -->
    <section class="section">
      <h2 class="section-title">📋 Test Cases Reference</h2>
      <div id="test-cases-list">
      </div>
    </section>
  </div>

  <script>
    // Embed report data
    const REPORT_DATA = ${JSON.stringify(report)};

    // Initialize dashboard
    function init() {
      populateModelTable();
      populateResultsTable();
      populateTestCasesList();
      renderCharts();
      populateModelFilter();
    }

    function populateModelTable() {
      const tbody = document.getElementById('model-tbody');
      tbody.innerHTML = '';

      for (const model of REPORT_DATA.models) {
        const row = document.createElement('tr');

        const accuracyClass = model.accuracyPercent >= 80 ? 'accuracy-high' :
                             model.accuracyPercent >= 50 ? 'accuracy-medium' : 'accuracy-low';

        row.innerHTML = \`
          <td><strong>\${model.model}</strong></td>
          <td class="\${accuracyClass}">\${model.accuracyPercent}%</td>
          <td>\${model.avgDurationMs}ms</td>
          <td>\${model.byCategory.CRUD?.accuracyPercent || 0}%</td>
          <td>\${model.byCategory.Smart?.accuracyPercent || 0}%</td>
          <td>\${model.byCategory.FileManagement?.accuracyPercent || 0}%</td>
          <td>\${model.byDifficulty.Easy?.accuracyPercent || 0}%</td>
          <td>\${model.byDifficulty.Medium?.accuracyPercent || 0}%</td>
          <td>\${model.byDifficulty.Hard?.accuracyPercent || 0}%</td>
        \`;

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

        row.innerHTML = \`
          <td>\${statusIcon}</td>
          <td><code>\${result.testId}</code></td>
          <td>\${result.model}</td>
          <td><span class="badge badge-info">\${result.category}</span></td>
          <td><span class="badge">\${result.difficulty}</span></td>
          <td>\${promptTrunc}</td>
          <td><code>\${result.expectedTool}</code></td>
          <td><code>\${result.actualTool || 'null'}</code></td>
          <td>\${result.durationMs}ms</td>
        \`;

        row.onclick = () => toggleDetails(result.testId);
        tbody.appendChild(row);

        // Details row
        const detailsRow = document.createElement('tr');
        detailsRow.innerHTML = \`
          <td colspan="9">
            <div class="details" id="details-\${result.testId}">
<strong>Full Prompt:</strong>
\${result.prompt}

\${result.error ? '<strong>Error:</strong> ' + result.error : ''}
\${result.responseMetadata ? '<strong>Metadata:</strong> ' + JSON.stringify(result.responseMetadata, null, 2) : ''}
            </div>
          </td>
        \`;
        tbody.appendChild(detailsRow);
      }
    }

    function toggleDetails(testId) {
      const details = document.getElementById(\`details-\${testId}\`);
      details.classList.toggle('open');
    }

    function populateTestCasesList() {
      const container = document.getElementById('test-cases-list');
      container.innerHTML = '';

      for (const tc of REPORT_DATA.testCases) {
        const details = document.createElement('details');
        details.innerHTML = \`
          <summary>
            <code>\${tc.id}</code> - \${tc.expectedTool}
            <span class="badge badge-info">\${tc.category}</span>
            <span class="badge">\${tc.difficulty}</span>
          </summary>
          <div style="margin-top: 0.5rem; color: var(--text-secondary);">
            <strong>Prompt:</strong> \${tc.prompt}<br>
            <strong>Description:</strong> \${tc.description}
          </div>
        \`;
        container.appendChild(details);
      }
    }

    function populateModelFilter() {
      const modelSelect = document.getElementById('filter-model');
      for (const model of REPORT_DATA.models) {
        const option = document.createElement('option');
        option.value = model.model;
        option.textContent = model.model;
        modelSelect.appendChild(option);
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
      // Simple sorting - can be enhanced
      console.log('Sorting by column', columnIndex);
    }

    function renderCharts() {
      const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: {
              color: '#c9d1d9'
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#8b949e' },
            grid: { color: '#30363d' }
          },
          y: {
            ticks: { color: '#8b949e' },
            grid: { color: '#30363d' }
          }
        }
      };

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
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: { ...chartOptions.scales.y, beginAtZero: true, max: 100 }
          },
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
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: { ...chartOptions.scales.y, beginAtZero: true, max: 100 }
          }
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
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: { ...chartOptions.scales.y, beginAtZero: true, max: 100 }
          }
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
          ...chartOptions,
          scales: {
            ...chartOptions.scales,
            y: { ...chartOptions.scales.y, beginAtZero: true }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // Initialize on load
    init();
  </script>
</body>
</html>`;

  const htmlTimestamp = new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-');
  const filename = `mcp-tool-test-dashboard-${htmlTimestamp}.html`;
  const filepath = `${outputDir}/${filename}`;

  await Bun.write(filepath, html);

  console.log(`\n✓ HTML Dashboard: ${filepath}`);
  return filepath;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  let lmapiBaseUrl = 'http://localhost:17103';
  let outputDir = './test-reports';
  let generateHtml = true;
  let verbose = false;
  const requestedModels: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--endpoint' && i + 1 < args.length) {
      lmapiBaseUrl = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      outputDir = args[++i];
    } else if (arg === '--no-html') {
      generateHtml = false;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
MCP Tool Calling Test Script

Usage:
  bun run scripts/test-mcp-tools.ts [options] [model1] [model2] ...

Options:
  --endpoint <url>    LMAPI base URL (default: http://localhost:17103)
  --output <dir>      Output directory (default: ./test-reports)
  --no-html           Skip HTML dashboard generation
  --verbose           Show detailed request/response information
  --help, -h          Show this help message

Examples:
  bun run scripts/test-mcp-tools.ts
  bun run scripts/test-mcp-tools.ts llama3.1 qwen2.5
  bun run scripts/test-mcp-tools.ts --endpoint http://localhost:8000
      `);
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      requestedModels.push(arg);
    }
  }

  // Default models if none specified
  if (requestedModels.length === 0) {
    requestedModels.push(
      'llama3-groq-tool-use:latest',
      'phi4:latest',
      'qwen2.5:latest',
    );
  }

  // Verify LMAPI is reachable
  try {
    const response = await fetch(`${lmapiBaseUrl}/servers`);
    if (!response.ok) {
      throw new Error(`LMAPI returned ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Cannot reach LMAPI at ${lmapiBaseUrl}`);
    console.log('Make sure LMAPI is running before starting tests.');
    console.log('Example: bun run dev:backend');
    process.exit(1);
  }

  // Validate models against available servers
  const models = await validateModels(requestedModels, lmapiBaseUrl);

  console.log('═'.repeat(60));
  console.log('  MCP Tool Calling Test Suite');
  console.log('═'.repeat(60));
  console.log(`LMAPI Endpoint: ${lmapiBaseUrl}`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log(`Total Tests: ${models.length * TEST_CASES.length}`);
  console.log(`Output Directory: ${outputDir}`);
  console.log('═'.repeat(60));

  // Run tests
  const lmapiEndpoint = `${lmapiBaseUrl}/api/chat/completions/any`;
  const results = await runTests(models, TEST_CASES, lmapiEndpoint, verbose);

  // Generate report
  const report = generateReport(results, TEST_CASES);

  // Save JSON report
  const reportPath = await saveReport(report, outputDir);

  // Print summary to console
  printSummary(report);

  // Generate HTML dashboard
  if (generateHtml) {
    const htmlPath = await generateHTMLDashboard(report, outputDir);
    console.log(`\nOpen in browser: file://${process.cwd()}/${htmlPath}\n`);
  }

  console.log('✅ Test suite completed successfully!\n');
}

// Run main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
