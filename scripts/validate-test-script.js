#!/usr/bin/env node
/**
 * Quick validation script to check the test-mcp-tools.ts structure
 * without requiring Bun runtime or LMAPI server
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating test-mcp-tools.ts structure...\n');

const scriptPath = path.join(__dirname, 'test-mcp-tools.ts');
const content = fs.readFileSync(scriptPath, 'utf-8');

// Check for key components
const checks = [
  { name: 'TestCase interface', pattern: /interface TestCase/m },
  { name: 'TestResult interface', pattern: /interface TestResult/m },
  { name: 'ModelStats interface', pattern: /interface ModelStats/m },
  { name: 'TestReport interface', pattern: /interface TestReport/m },
  { name: 'TEST_CASES array', pattern: /const TEST_CASES: TestCase\[\] = \[/m },
  { name: 'loadMCPTools function', pattern: /function loadMCPTools\(\)/m },
  { name: 'discoverAvailableModels function', pattern: /async function discoverAvailableModels/m },
  { name: 'validateModels function', pattern: /async function validateModels/m },
  { name: 'testModelWithPrompt function', pattern: /async function testModelWithPrompt/m },
  { name: 'runTests function', pattern: /async function runTests/m },
  { name: 'calculateStats function', pattern: /function calculateStats/m },
  { name: 'generateReport function', pattern: /function generateReport/m },
  { name: 'saveReport function', pattern: /async function saveReport/m },
  { name: 'printSummary function', pattern: /function printSummary/m },
  { name: 'generateHTMLDashboard function', pattern: /async function generateHTMLDashboard/m },
  { name: 'main function', pattern: /async function main\(\)/m },
  { name: 'Temperature option', pattern: /--temperature/m },
  { name: 'Delay option', pattern: /--delay/m },
  { name: 'Help option', pattern: /--help/m },
  { name: 'Verbose option', pattern: /--verbose/m },
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
  if (check.pattern.test(content)) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name}`);
    failed++;
  }
});

// Count test cases
const testCaseMatches = content.match(/\{[\s\S]*?id:\s*['"][\w_-]+['"]/g);
const testCaseCount = testCaseMatches ? testCaseMatches.length : 0;
console.log(`\n📊 Found ${testCaseCount} test cases`);

// Check for all 20 MCP tools
const toolNames = [
  'list_projects',
  'get_project',
  'create_project',
  'list_cards',
  'get_card',
  'create_card',
  'update_card',
  'move_card',
  'add_task',
  'toggle_task',
  'get_board_overview',
  'get_next_tasks',
  'batch_update_tasks',
  'search_cards',
  'update_card_content',
  'get_project_progress',
  'archive_card',
  'list_project_files',
  'list_card_files',
  'read_file_content',
];

console.log(`\n🔧 Checking for MCP tool coverage:`);
let toolsCovered = 0;
toolNames.forEach(tool => {
  const regex = new RegExp(`expectedTool:\\s*['"]${tool}['"]`, 'm');
  if (regex.test(content)) {
    toolsCovered++;
  } else {
    console.log(`⚠️  Missing test for: ${tool}`);
  }
});

console.log(`\n📈 Tool coverage: ${toolsCovered}/${toolNames.length} (${Math.round(toolsCovered/toolNames.length*100)}%)`);

// Summary
console.log('\n' + '═'.repeat(50));
console.log('VALIDATION SUMMARY');
console.log('═'.repeat(50));
console.log(`Structural checks: ${passed}/${checks.length} passed`);
console.log(`Test cases defined: ${testCaseCount}`);
console.log(`MCP tools covered: ${toolsCovered}/${toolNames.length}`);

if (failed === 0 && testCaseCount >= 20 && toolsCovered === toolNames.length) {
  console.log('\n✅ All validation checks passed!');
  console.log('The script structure is correct and ready for testing.\n');
  process.exit(0);
} else {
  console.log('\n❌ Some validation checks failed.');
  console.log('Please review the script structure.\n');
  process.exit(1);
}
