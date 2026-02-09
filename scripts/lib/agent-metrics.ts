/**
 * Agent Performance Tracking and Scoring
 * 
 * Tracks tool calls and calculates 4 metrics:
 * 1. Tool Selection Accuracy (25%)
 * 2. Parameter Correctness (25%)
 * 3. Workflow Logic (25%)
 * 4. Task Completion Rate (25%)
 */

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  timestamp: number;
  toolName: string;
  parameters: Record<string, any>;
  success: boolean;
  duration: number;
  error?: string;
  phase?: string;
}

export interface MetricScore {
  toolSelection: {
    score: number;
    details: string;
    correct: number;
    incorrect: number;
    unnecessary: number;
  };
  parameterCorrectness: {
    score: number;
    details: string;
    perfect: number;
    minor: number;
    major: number;
  };
  workflowLogic: {
    score: number;
    details: string;
    logical: number;
    suboptimal: number;
    illogical: number;
  };
  taskCompletion: {
    score: number;
    details: string;
    succeeded: number;
    failed: number;
    rate: number;
  };
  finalScore: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface PhaseExpectation {
  phase: string;
  expectedTools: string[];
  minCalls: number;
  maxCalls: number;
  requiredSequence?: string[];
}

export interface AgentMetrics {
  toolCalls: ToolCall[];
  scores: MetricScore | null;
  totalDuration: number;
  avgCallTime: number;
  successRate: number;
}

// ============================================================================
// Terminal Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ============================================================================
// Lane and Parameter Validation Utilities
// ============================================================================

// Valid lane slugs - should match the workspace structure
// TODO: Consider importing from '../src/constants.ts' to keep in sync
const VALID_LANES = ['01-upcoming', '02-in-progress', '03-complete', '04-archive'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const VALID_STATUSES = ['pending', 'in-progress', 'blocked', 'complete'];

function isValidLaneSlug(lane: string): boolean {
  return VALID_LANES.includes(lane);
}

function isValidSlugFormat(slug: string): boolean {
  // Check if slug is lowercase, uses hyphens, no special chars
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

function validateParameters(toolName: string, params: Record<string, any>): 'perfect' | 'minor' | 'major' {
  // Check for required parameters based on tool
  const requiredParams: Record<string, string[]> = {
    create_project: ['name'],
    create_card: ['projectSlug', 'title'],
    update_card: ['projectSlug', 'cardSlug'],
    move_card: ['projectSlug', 'cardSlug', 'targetLane'],
    add_task: ['projectSlug', 'cardSlug', 'text'],
    toggle_task: ['projectSlug', 'cardSlug', 'taskIndex'],
    batch_update_tasks: ['projectSlug', 'cardSlug', 'updates'],
    get_card: ['projectSlug', 'cardSlug'],
    list_cards: ['projectSlug'],
    get_board_overview: ['projectSlug'],
    get_project_progress: ['projectSlug'],
    get_next_tasks: ['projectSlug'],
    search_cards: ['projectSlug', 'query'],
    update_card_content: ['projectSlug', 'cardSlug', 'content'],
    archive_card: ['projectSlug', 'cardSlug'],
  };

  const required = requiredParams[toolName] || [];
  const missing = required.filter(p => !(p in params));

  if (missing.length > 0) {
    return 'major'; // Missing required params
  }

  // Check lane slug format
  if ('lane' in params && params.lane && !isValidLaneSlug(params.lane)) {
    return 'minor'; // Wrong lane format
  }

  if ('targetLane' in params && params.targetLane && !isValidLaneSlug(params.targetLane)) {
    return 'minor';
  }

  // Check slug formats
  if ('projectSlug' in params && params.projectSlug && !isValidSlugFormat(params.projectSlug)) {
    return 'minor';
  }

  if ('cardSlug' in params && params.cardSlug && !isValidSlugFormat(params.cardSlug)) {
    return 'minor';
  }

  // Check enum values
  if ('priority' in params && params.priority && !VALID_PRIORITIES.includes(params.priority)) {
    return 'minor';
  }

  if ('status' in params && params.status && !VALID_STATUSES.includes(params.status)) {
    return 'minor';
  }

  return 'perfect';
}

// ============================================================================
// Workflow Logic Analysis
// ============================================================================

/**
 * Analyzes the sequence of tool calls for logical workflow patterns
 * 
 * Categorizes each action as:
 * - Logical: Good practice (e.g., get_card before toggle_task, cards moved in order)
 * - Suboptimal: Works but inefficient (e.g., missing get_card, redundant calls)
 * - Illogical: Problematic patterns (e.g., moving cards backward in workflow)
 * 
 * Scoring criteria:
 * - Logical: +1 point (100%)
 * - Suboptimal: +0.5 points (50%)
 * - Illogical: 0 points (0%)
 */
function analyzeWorkflowLogic(calls: ToolCall[]): { logical: number; suboptimal: number; illogical: number } {
  let logical = 0;
  let suboptimal = 0;
  let illogical = 0;

  const cardLanes: Record<string, string> = {}; // Track card positions

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const prev = i > 0 ? calls[i - 1] : null;

    // Check for logical sequences
    if (call.toolName === 'toggle_task' || call.toolName === 'add_task') {
      // Should check card state before modifying tasks
      const hasGetCard = calls.slice(0, i).some(
        c => c.toolName === 'get_card' && c.parameters.cardSlug === call.parameters.cardSlug
      );
      if (hasGetCard) {
        logical++;
      } else {
        suboptimal++; // Works but didn't verify state first
      }
    }

    // Check card movement order
    if (call.toolName === 'move_card') {
      const cardSlug = call.parameters.cardSlug;
      const targetLane = call.parameters.targetLane;
      const currentLane = cardLanes[cardSlug] || '01-upcoming';

      const laneOrder = ['01-upcoming', '02-in-progress', '03-complete', '04-archive'];
      const currentIdx = laneOrder.indexOf(currentLane);
      const targetIdx = laneOrder.indexOf(targetLane);

      if (targetIdx === currentIdx + 1) {
        logical++; // Moving to next lane (expected flow)
        cardLanes[cardSlug] = targetLane;
      } else if (targetIdx > currentIdx) {
        logical++; // Skipping lanes (forward progress)
        cardLanes[cardSlug] = targetLane;
      } else if (targetIdx < currentIdx) {
        suboptimal++; // Moving backward (valid but unusual)
        cardLanes[cardSlug] = targetLane;
      } else {
        illogical++; // Same lane or invalid
      }
    }

    // Check for batch operations vs multiple singles
    if (call.toolName === 'batch_update_tasks') {
      logical++; // Good choice for multiple updates
    } else if (call.toolName === 'toggle_task' && prev?.toolName === 'toggle_task') {
      // Multiple toggle_task calls in a row - should use batch
      if (prev.parameters.cardSlug === call.parameters.cardSlug) {
        suboptimal++;
      } else {
        logical++; // Different cards, okay
      }
    }

    // Check for redundant calls
    if (prev && call.toolName === prev.toolName) {
      if (call.toolName === 'get_card' || call.toolName === 'get_board_overview') {
        if (JSON.stringify(call.parameters) === JSON.stringify(prev.parameters)) {
          illogical++; // Duplicate read call
          continue;
        }
      }
    }

    // General success = logical
    if (call.success && !['toggle_task', 'move_card', 'batch_update_tasks'].includes(call.toolName)) {
      logical++;
    }
  }

  return { logical, suboptimal, illogical };
}

// ============================================================================
// MetricsTracker Class
// ============================================================================

export class MetricsTracker {
  private toolCalls: ToolCall[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  recordToolCall(
    toolName: string,
    parameters: Record<string, any>,
    success: boolean,
    duration: number,
    error?: string,
    phase?: string
  ): void {
    this.toolCalls.push({
      timestamp: Date.now(),
      toolName,
      parameters,
      success,
      duration,
      error,
      phase,
    });
  }

  calculateScores(expectedTools: string[], scenarioPhases: PhaseExpectation[]): MetricScore {
    // 1. Tool Selection Accuracy (25%)
    let toolSelectionScore = 0;
    let correct = 0;
    let incorrect = 0;
    let unnecessary = 0;

    const expectedSet = new Set(expectedTools);
    const usedTools = this.toolCalls.map(c => c.toolName);

    for (const call of this.toolCalls) {
      if (expectedSet.has(call.toolName)) {
        correct++;
        toolSelectionScore += 1;
      } else {
        // Check if tool is reasonable but not in expected list
        const reasonableTools = [
          'list_projects', 'get_project', 'get_card', 'list_cards',
          'get_board_overview', 'get_project_progress', 'get_next_tasks'
        ];
        if (reasonableTools.includes(call.toolName)) {
          unnecessary++;
          toolSelectionScore -= 0.5;
        } else {
          incorrect++;
          toolSelectionScore -= 1;
        }
      }
    }

    const toolSelectionMax = Math.max(this.toolCalls.length, expectedTools.length);
    const toolSelectionNormalized = toolSelectionMax > 0
      ? Math.max(0, Math.min(1, toolSelectionScore / toolSelectionMax))
      : 0;

    // 2. Parameter Correctness (25%)
    let perfect = 0;
    let minor = 0;
    let major = 0;

    for (const call of this.toolCalls) {
      const result = validateParameters(call.toolName, call.parameters);
      if (result === 'perfect') perfect++;
      else if (result === 'minor') minor++;
      else major++;
    }

    const paramScore = this.toolCalls.length > 0
      ? (perfect + minor * 0.5) / this.toolCalls.length
      : 0;

    // 3. Workflow Logic (25%)
    const { logical, suboptimal, illogical } = analyzeWorkflowLogic(this.toolCalls);
    const logicTotal = logical + suboptimal + illogical;
    const logicScore = logicTotal > 0
      ? (logical + suboptimal * 0.5) / logicTotal
      : 0;

    // 4. Task Completion Rate (25%)
    const succeeded = this.toolCalls.filter(c => c.success).length;
    const failed = this.toolCalls.filter(c => !c.success).length;
    const completionRate = this.toolCalls.length > 0
      ? succeeded / this.toolCalls.length
      : 0;

    // Map completion rate to score
    let completionScore = 0;
    if (completionRate >= 1.0) completionScore = 1.0;
    else if (completionRate >= 0.75) completionScore = 0.75;
    else if (completionRate >= 0.5) completionScore = 0.5;
    else completionScore = 0;

    // Final Score (weighted average)
    const finalScore = (
      toolSelectionNormalized * 0.25 +
      paramScore * 0.25 +
      logicScore * 0.25 +
      completionScore * 0.25
    );

    // Rating
    let rating: 'excellent' | 'good' | 'fair' | 'poor';
    if (finalScore >= 0.9) rating = 'excellent';
    else if (finalScore >= 0.75) rating = 'good';
    else if (finalScore >= 0.6) rating = 'fair';
    else rating = 'poor';

    return {
      toolSelection: {
        score: toolSelectionNormalized,
        details: `${correct}/${this.toolCalls.length} correct`,
        correct,
        incorrect,
        unnecessary,
      },
      parameterCorrectness: {
        score: paramScore,
        details: `${perfect}/${this.toolCalls.length} perfect`,
        perfect,
        minor,
        major,
      },
      workflowLogic: {
        score: logicScore,
        details: `${logical}/${logicTotal} logical`,
        logical,
        suboptimal,
        illogical,
      },
      taskCompletion: {
        score: completionScore,
        details: `${succeeded}/${this.toolCalls.length} succeeded`,
        succeeded,
        failed,
        rate: completionRate,
      },
      finalScore,
      rating,
    };
  }

  getDetailedReport(): string {
    if (this.toolCalls.length === 0) {
      return `${colors.yellow}⚠️  No tool calls recorded${colors.reset}\n`;
    }

    const totalDuration = Date.now() - this.startTime;
    const avgDuration = this.toolCalls.reduce((sum, c) => sum + c.duration, 0) / this.toolCalls.length;
    const succeeded = this.toolCalls.filter(c => c.success).length;
    const failed = this.toolCalls.filter(c => !c.success).length;

    let report = `${colors.bold}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`;
    report += `${colors.bold}${colors.cyan}  METRICS SUMMARY${colors.reset}\n`;
    report += `${colors.cyan}${'='.repeat(80)}${colors.reset}\n\n`;

    report += `${colors.bold}Tool Calls:${colors.reset}\n`;
    report += `  Total:        ${this.toolCalls.length}\n`;
    report += `  ${colors.green}✅ Succeeded:${colors.reset}  ${succeeded}  (${(succeeded / this.toolCalls.length * 100).toFixed(1)}%)\n`;
    report += `  ${colors.red}❌ Failed:${colors.reset}     ${failed}  (${(failed / this.toolCalls.length * 100).toFixed(1)}%)\n\n`;

    report += `${colors.bold}Performance:${colors.reset}\n`;
    report += `  Total Duration:    ${(totalDuration / 1000).toFixed(1)}s\n`;
    report += `  Avg Call Time:     ${(avgDuration / 1000).toFixed(2)}s\n\n`;

    // Tool call breakdown by phase
    const phases = [...new Set(this.toolCalls.map(c => c.phase).filter(Boolean))];
    if (phases.length > 0) {
      report += `${colors.bold}Phases:${colors.reset}\n`;
      for (const phase of phases) {
        const phaseCalls = this.toolCalls.filter(c => c.phase === phase);
        const phaseSuccess = phaseCalls.filter(c => c.success).length;
        const icon = phaseSuccess === phaseCalls.length ? colors.green + '✅' : colors.yellow + '⚠️';
        report += `  ${icon} ${phase}${colors.reset}: ${phaseSuccess}/${phaseCalls.length} succeeded\n`;
      }
      report += '\n';
    }

    // Errors
    const errors = this.toolCalls.filter(c => !c.success);
    if (errors.length > 0) {
      report += `${colors.bold}${colors.red}Errors:${colors.reset}\n`;
      for (const error of errors) {
        report += `  ${colors.red}❌${colors.reset} ${error.toolName}`;
        if (error.phase) report += ` (${error.phase})`;
        report += `\n     ${colors.dim}${error.error || 'Unknown error'}${colors.reset}\n`;
      }
      report += '\n';
    }

    return report;
  }

  getScoringReport(scores: MetricScore): string {
    let report = `${colors.bold}${colors.magenta}${'='.repeat(80)}${colors.reset}\n`;
    report += `${colors.bold}${colors.magenta}  SCORING BREAKDOWN${colors.reset}\n`;
    report += `${colors.magenta}${'='.repeat(80)}${colors.reset}\n\n`;

    // 1. Tool Selection
    const ts = scores.toolSelection;
    const tsPercent = (ts.score * 100).toFixed(1);
    const tsWeighted = (ts.score * 0.25).toFixed(3);
    const tsIcon = ts.score >= 0.9 ? colors.green + '✅' : ts.score >= 0.75 ? colors.yellow + '⚠️' : colors.red + '❌';
    report += `${colors.bold}1. Tool Selection Accuracy:${colors.reset}\n`;
    report += `   ${tsIcon} ${tsPercent}%${colors.reset} → ${ts.score.toFixed(3)} * 0.25 = ${tsWeighted}\n`;
    report += `   ${colors.dim}${ts.details}${colors.reset}\n`;
    if (ts.incorrect > 0) report += `   ${colors.red}${ts.incorrect} incorrect tool choices${colors.reset}\n`;
    if (ts.unnecessary > 0) report += `   ${colors.yellow}${ts.unnecessary} unnecessary calls${colors.reset}\n`;
    report += '\n';

    // 2. Parameter Correctness
    const pc = scores.parameterCorrectness;
    const pcPercent = (pc.score * 100).toFixed(1);
    const pcWeighted = (pc.score * 0.25).toFixed(3);
    const pcIcon = pc.score >= 0.9 ? colors.green + '✅' : pc.score >= 0.75 ? colors.yellow + '⚠️' : colors.red + '❌';
    report += `${colors.bold}2. Parameter Correctness:${colors.reset}\n`;
    report += `   ${pcIcon} ${pcPercent}%${colors.reset} → ${pc.score.toFixed(3)} * 0.25 = ${pcWeighted}\n`;
    report += `   ${colors.dim}${pc.details}${colors.reset}\n`;
    if (pc.minor > 0) report += `   ${colors.yellow}${pc.minor} minor errors (fixable)${colors.reset}\n`;
    if (pc.major > 0) report += `   ${colors.red}${pc.major} major errors (call fails)${colors.reset}\n`;
    report += '\n';

    // 3. Workflow Logic
    const wl = scores.workflowLogic;
    const wlPercent = (wl.score * 100).toFixed(1);
    const wlWeighted = (wl.score * 0.25).toFixed(3);
    const wlIcon = wl.score >= 0.9 ? colors.green + '✅' : wl.score >= 0.75 ? colors.yellow + '⚠️' : colors.red + '❌';
    report += `${colors.bold}3. Workflow Logic:${colors.reset}\n`;
    report += `   ${wlIcon} ${wlPercent}%${colors.reset} → ${wl.score.toFixed(3)} * 0.25 = ${wlWeighted}\n`;
    report += `   ${colors.dim}${wl.details}${colors.reset}\n`;
    if (wl.suboptimal > 0) report += `   ${colors.yellow}${wl.suboptimal} suboptimal sequences${colors.reset}\n`;
    if (wl.illogical > 0) report += `   ${colors.red}${wl.illogical} illogical operations${colors.reset}\n`;
    report += '\n';

    // 4. Task Completion
    const tc = scores.taskCompletion;
    const tcPercent = (tc.rate * 100).toFixed(1);
    const tcWeighted = (tc.score * 0.25).toFixed(3);
    const tcIcon = tc.score >= 0.9 ? colors.green + '✅' : tc.score >= 0.75 ? colors.yellow + '⚠️' : colors.red + '❌';
    report += `${colors.bold}4. Task Completion Rate:${colors.reset}\n`;
    report += `   ${tcIcon} ${tcPercent}%${colors.reset} → ${tc.score.toFixed(3)} * 0.25 = ${tcWeighted}\n`;
    report += `   ${colors.dim}${tc.details}${colors.reset}\n\n`;

    // Final Score
    const finalPercent = (scores.finalScore * 100).toFixed(0);
    const ratingColor = scores.rating === 'excellent' ? colors.green :
                        scores.rating === 'good' ? colors.blue :
                        scores.rating === 'fair' ? colors.yellow : colors.red;
    const ratingIcon = scores.rating === 'excellent' ? '✅' :
                       scores.rating === 'good' ? '✓' :
                       scores.rating === 'fair' ? '⚠️' : '❌';

    report += `${colors.bold}${colors.cyan}${'='.repeat(80)}${colors.reset}\n`;
    report += `${colors.bold}  FINAL SCORE: ${ratingColor}${finalPercent}%${colors.reset} ${colors.bold}(${scores.finalScore.toFixed(2)})${colors.reset} - ${ratingColor}${scores.rating.toUpperCase()} ${ratingIcon}${colors.reset}\n`;
    report += `${colors.cyan}${'='.repeat(80)}${colors.reset}\n\n`;

    return report;
  }

  exportJSON(): object {
    const totalDuration = Date.now() - this.startTime;
    const avgDuration = this.toolCalls.length > 0
      ? this.toolCalls.reduce((sum, c) => sum + c.duration, 0) / this.toolCalls.length
      : 0;
    const succeeded = this.toolCalls.filter(c => c.success).length;
    const failed = this.toolCalls.filter(c => !c.success).length;

    return {
      timestamp: new Date().toISOString(),
      metrics: {
        totalCalls: this.toolCalls.length,
        succeeded,
        failed,
        successRate: this.toolCalls.length > 0 ? succeeded / this.toolCalls.length : 0,
        totalDuration,
        avgCallTime: avgDuration,
      },
      toolCalls: this.toolCalls.map(call => ({
        timestamp: new Date(call.timestamp).toISOString(),
        phase: call.phase,
        tool: call.toolName,
        params: call.parameters,
        success: call.success,
        duration: call.duration,
        error: call.error,
      })),
    };
  }

  getMetrics(): AgentMetrics {
    const totalDuration = Date.now() - this.startTime;
    const avgCallTime = this.toolCalls.length > 0
      ? this.toolCalls.reduce((sum, c) => sum + c.duration, 0) / this.toolCalls.length
      : 0;
    const succeeded = this.toolCalls.filter(c => c.success).length;
    const successRate = this.toolCalls.length > 0 ? succeeded / this.toolCalls.length : 0;

    return {
      toolCalls: this.toolCalls,
      scores: null,
      totalDuration,
      avgCallTime,
      successRate,
    };
  }
}
