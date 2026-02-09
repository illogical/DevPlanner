#!/usr/bin/env bun

import { parseArgs } from "util";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync } from "fs";
import { MCPClient } from "./lib/mcp-client";
import { OllamaProvider, type MCPToolSchema } from "./lib/ollama-provider";
import { MetricsTracker } from "./lib/agent-metrics";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

interface CLIOptions {
  model: string;
  pause: number;
  verbose: boolean;
  json: boolean;
}

function parseCliArgs(): CLIOptions {
  const { values } = parseArgs({
    options: {
      model: { type: "string", default: "qwen2.5" },
      pause: { type: "string", default: "2000" },
      verbose: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    strict: false,
  });

  return {
    model: values.model as string,
    pause: parseInt(values.pause as string, 10),
    verbose: values.verbose as boolean,
    json: values.json as boolean,
  };
}

function log(message: string, color?: keyof typeof colors) {
  if (color) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  } else {
    console.log(message);
  }
}

function logSection(title: string) {
  console.log();
  log(`${"=".repeat(60)}`, "cyan");
  log(title, "bright");
  log(`${"=".repeat(60)}`, "cyan");
  console.log();
}

function logStep(step: string) {
  log(`→ ${step}`, "blue");
}

function logSuccess(message: string) {
  log(`✓ ${message}`, "green");
}

function logError(message: string) {
  log(`✗ ${message}`, "red");
}

function logWarning(message: string) {
  log(`⚠ ${message}`, "yellow");
}

function logToolCall(toolName: string, args: Record<string, unknown>) {
  log(`  🔧 Tool: ${toolName}`, "magenta");
  log(`     Args: ${JSON.stringify(args, null, 2).replace(/\n/g, "\n     ")}`, "dim");
}

function logToolResult(result: unknown, error?: string) {
  if (error) {
    log(`     ✗ Error: ${error}`, "red");
  } else {
    log(`     ✓ Result: ${JSON.stringify(result, null, 2).replace(/\n/g, "\n     ")}`, "dim");
  }
}

function convertMCPToolsToOllama(mcpTools: MCPToolSchema[]): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    },
  }));
}

async function executeWorkflow(
  mcpClient: MCPClient,
  ollama: OllamaProvider,
  metricsTracker: MetricsTracker,
  scenarioPrompt: string,
  options: CLIOptions
) {
  logSection("Phase 1: Loading MCP Tools");
  
  const mcpTools = await mcpClient.listTools();
  logSuccess(`Loaded ${mcpTools.length} MCP tools`);
  
  if (options.verbose) {
    mcpTools.forEach((tool) => {
      log(`  - ${tool.name}: ${tool.description}`, "dim");
    });
  }

  const ollamaTools = convertMCPToolsToOllama(mcpTools);
  logSuccess(`Converted ${ollamaTools.length} tools to Ollama format`);

  logSection("Phase 2: Starting Agent Workflow");
  
  const conversation: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: unknown[];
  }> = [
    {
      role: "system",
      content:
        "You are an AI agent managing a DevPlanner project. Use the provided tools to accomplish the user's request. Call tools as needed and respond based on their results.",
    },
    {
      role: "user",
      content: scenarioPrompt,
    },
  ];

  let turnCount = 0;
  const maxTurns = 20; // Prevent infinite loops
  let continueConversation = true;

  while (continueConversation && turnCount < maxTurns) {
    turnCount++;
    logSection(`Phase 3: Agent Turn ${turnCount}`);
    
    logStep("Calling Ollama with tools...");
    const response = await ollama.chat(conversation, ollamaTools);
    
    if (options.verbose) {
      log(`LLM Response: ${JSON.stringify(response, null, 2)}`, "dim");
    }

    conversation.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.tool_calls,
    });

    if (response.tool_calls && response.tool_calls.length > 0) {
      logSuccess(`Agent requested ${response.tool_calls.length} tool call(s)`);
      
      logSection(`Phase 4: Executing Tools (Turn ${turnCount})`);
      
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments;
        
        logToolCall(toolName, toolArgs);
        
        try {
          const startTime = Date.now();
          const result = await mcpClient.callTool(toolName, toolArgs);
          const duration = Date.now() - startTime;
          
          logToolResult(result);
          
          metricsTracker.recordToolCall(toolName, toolArgs, true, duration);
          
          // Add tool result to conversation
          conversation.push({
            role: "tool",
            content: JSON.stringify(result),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logToolResult(null, errorMessage);
          
          metricsTracker.recordToolCall(toolName, toolArgs, false, 0, errorMessage);
          
          // Add error to conversation
          conversation.push({
            role: "tool",
            content: JSON.stringify({ error: errorMessage }),
          });
        }
      }
      
      // Pause between turns
      if (options.pause > 0) {
        logStep(`Pausing for ${options.pause}ms...`);
        await new Promise((resolve) => setTimeout(resolve, options.pause));
      }
    } else {
      // No more tool calls - agent has finished
      logSuccess("Agent completed workflow (no more tool calls)");
      if (response.content) {
        log(`Final response: ${response.content}`, "cyan");
      }
      continueConversation = false;
    }
  }

  if (turnCount >= maxTurns) {
    logWarning(`Reached maximum turn limit (${maxTurns})`);
  }
}

async function main() {
  const options = parseCliArgs();
  
  if (!options.json) {
    logSection("MCP Agent Verification");
    log(`Model: ${options.model}`, "cyan");
    log(`Pause: ${options.pause}ms`, "cyan");
    log(`Verbose: ${options.verbose}`, "cyan");
  }

  let tempWorkspace: string | null = null;
  let mcpClient: MCPClient | null = null;

  try {
    // Create temporary workspace
    if (!options.json) logStep("Creating temporary workspace...");
    tempWorkspace = await mkdtemp(join(tmpdir(), "devplanner-verify-"));
    if (!options.json) logSuccess(`Workspace: ${tempWorkspace}`);

    // Initialize MCP client
    if (!options.json) logStep("Starting MCP server...");
    process.env.DEVPLANNER_WORKSPACE = tempWorkspace;
    mcpClient = new MCPClient();
    await mcpClient.start();
    if (!options.json) logSuccess("MCP server started");

    // Initialize Ollama provider
    if (!options.json) logStep("Connecting to Ollama...");
    const ollama = new OllamaProvider(options.model);
    await ollama.checkConnection();
    if (!options.json) logSuccess("Connected to Ollama");

    // Load scenario
    if (!options.json) logStep("Loading scenario...");
    const scenarioPath = join(process.cwd(), "scripts", "prompts", "scenarios", "delivery-robot.md");
    const scenarioContent = readFileSync(scenarioPath, "utf-8");
    
    // Extract the scenario prompt (everything after "## Scenario")
    const scenarioMatch = scenarioContent.match(/## Scenario\n\n([\s\S]+?)(?=\n## |$)/);
    const scenarioPrompt = scenarioMatch
      ? scenarioMatch[1].trim()
      : "Set up a delivery robot project with proper task management.";
    
    if (!options.json) logSuccess("Scenario loaded");

    // Initialize metrics tracker
    const metricsTracker = new MetricsTracker();

    // Execute workflow
    await executeWorkflow(mcpClient, ollama, metricsTracker, scenarioPrompt, options);

    // Generate report
    if (!options.json) {
      logSection("Phase 5: Final Report");
      
      // Define expected tools for the delivery robot scenario
      const expectedTools = [
        'create_project',
        'create_card',
        'add_task',
        'move_card',
        'toggle_task',
      ];
      
      const scenarioPhases: Array<{ phase: string; expectedTools: string[]; minCalls: number; maxCalls: number }> = [
        { phase: 'setup', expectedTools: ['create_project', 'create_card'], minCalls: 2, maxCalls: 5 },
        { phase: 'task-management', expectedTools: ['add_task', 'toggle_task'], minCalls: 3, maxCalls: 10 },
        { phase: 'workflow', expectedTools: ['move_card'], minCalls: 1, maxCalls: 3 },
      ];
      
      const scores = metricsTracker.calculateScores(expectedTools, scenarioPhases);
      const detailedReport = metricsTracker.getDetailedReport();
      const scoringReport = metricsTracker.getScoringReport(scores);
      
      console.log(detailedReport);
      console.log(scoringReport);
      
      const exitCode = scores.finalScore >= 0.75 ? 0 : 1;
      
      if (exitCode === 0) {
        logSuccess("\nVerification PASSED ✓");
      } else {
        logError("\nVerification FAILED ✗");
      }
      
      process.exit(exitCode);
    } else {
      // JSON output mode
      const expectedTools = [
        'create_project',
        'create_card',
        'add_task',
        'move_card',
        'toggle_task',
      ];
      
      const scenarioPhases: Array<{ phase: string; expectedTools: string[]; minCalls: number; maxCalls: number }> = [
        { phase: 'setup', expectedTools: ['create_project', 'create_card'], minCalls: 2, maxCalls: 5 },
        { phase: 'task-management', expectedTools: ['add_task', 'toggle_task'], minCalls: 3, maxCalls: 10 },
        { phase: 'workflow', expectedTools: ['move_card'], minCalls: 1, maxCalls: 3 },
      ];
      
      const scores = metricsTracker.calculateScores(expectedTools, scenarioPhases);
      
      console.log(JSON.stringify({
        detailed: metricsTracker.exportJSON(),
        scoring: scores,
      }, null, 2));
      
      const exitCode = scores.finalScore >= 0.75 ? 0 : 1;
      process.exit(exitCode);
    }

  } catch (error) {
    if (!options.json) {
      logError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
    } else {
      console.error(JSON.stringify({ error: String(error) }));
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (mcpClient) {
      if (!options.json) logStep("Stopping MCP server...");
      await mcpClient.stop();
      if (!options.json) logSuccess("MCP server stopped");
    }
    
    if (tempWorkspace) {
      if (!options.json) logStep("Cleaning up workspace...");
      await rm(tempWorkspace, { recursive: true, force: true });
      if (!options.json) logSuccess("Workspace cleaned up");
    }
  }
}

main();
