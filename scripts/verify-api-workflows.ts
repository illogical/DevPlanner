#!/usr/bin/env bun
/**
 * API Workflow Verification Script
 * 
 * Tests DevPlanner API through real Kanban workflows with task integrity regression guards
 * 
 * Usage:
 *   bun scripts/verify-api-workflows.ts
 * 
 * Prerequisites:
 *   - DevPlanner server running on port 17103
 */

const API_BASE = 'http://localhost:17103/api';
const TEST_PROJECT_SLUG = 'api-workflow-test';
const TEST_PROJECT_NAME = 'API Workflow Test';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Test tracking
const testResults: { name: string; passed: boolean; reason?: string }[] = [];
let totalTests = 0;

function pass(testName: string): void {
  totalTests++;
  testResults.push({ name: testName, passed: true });
  console.log(`${colors.green}  [PASS] ${testName}${colors.reset}`);
}

function fail(testName: string, reason: string): void {
  totalTests++;
  testResults.push({ name: testName, passed: false, reason });
  console.log(`${colors.red}  [FAIL] ${testName}${colors.reset}`);
  console.log(`${colors.red}         ${reason}${colors.reset}`);
}

function section(title: string): void {
  console.log(`\n${colors.cyan}${'─'.repeat(80)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${'─'.repeat(80)}${colors.reset}`);
}

function subsection(title: string): void {
  console.log(`${colors.blue}\n${title}${colors.reset}`);
}

// Typed fetch wrapper
async function api<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`API request failed for ${path}: ${error}`);
  }
}

// Check if server is running
async function checkPrerequisites(): Promise<boolean> {
  try {
    await api('/projects');
    return true;
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Error: DevPlanner server is not running on port 17103${colors.reset}`);
    console.error(`${colors.yellow}Please start the server with: bun run dev${colors.reset}`);
    return false;
  }
}

// Setup test project
async function setupTestProject(): Promise<void> {
  try {
    // Check if project exists
    const response = await api<{ projects: any[] }>('/projects');
    const exists = response.projects.some((p) => p.slug === TEST_PROJECT_SLUG);
    
    if (!exists) {
      await api(`/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: TEST_PROJECT_NAME }),
      });
      console.log(`${colors.green}Created test project: ${TEST_PROJECT_NAME}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Using existing test project: ${TEST_PROJECT_NAME}${colors.reset}`);
    }
  } catch (error) {
    throw new Error(`Failed to setup test project: ${error}`);
  }
}

// Cleanup test project
async function cleanupTestProject(): Promise<void> {
  try {
    await api(`/projects/${TEST_PROJECT_SLUG}`, { method: 'DELETE' });
    console.log(`${colors.green}Cleaned up test project${colors.reset}`);
  } catch (error) {
    // Ignore cleanup errors
    console.log(`${colors.yellow}Cleanup warning: ${error}${colors.reset}`);
  }
}

// Workflow 1: Task lifecycle through title and description updates
async function testWorkflow1_TaskLifecycleWithEdits(): Promise<void> {
  section('Workflow 1: Task lifecycle through title and description updates');
  
  const cardSlug = `wf1-${Date.now()}`;
  
  try {
    // 1. Create card
    const card = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards`, {
      method: 'POST',
      body: JSON.stringify({ title: 'WF1 Test Card' }),
    });
    
    if (card.slug && card.frontmatter?.title === 'WF1 Test Card') {
      pass('WF1: card created successfully');
    } else {
      fail('WF1: card created successfully', 'Invalid card structure');
      return;
    }
    
    // 2. Add task "Alpha"
    const taskAlpha = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Alpha' }),
    });
    
    if (taskAlpha.text === 'Alpha' && taskAlpha.checked === false) {
      pass('WF1: task Alpha added');
    } else {
      fail('WF1: task Alpha added', `Expected text="Alpha", checked=false, got ${JSON.stringify(taskAlpha)}`);
    }
    
    // 3. Add task "Beta"
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Beta' }),
    });
    
    let cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    if (cardState.tasks?.length === 2) {
      pass('WF1: task Beta added (count = 2)');
    } else {
      fail('WF1: task Beta added (count = 2)', `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    // 4. Toggle task 0 to checked
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks/0`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    if (cardState.tasks?.[0]?.checked === true) {
      pass('WF1: task Alpha toggled to checked');
    } else {
      fail('WF1: task Alpha toggled to checked', 'Task not checked');
    }
    
    // 5. Verify initial state
    if (cardState.tasks?.length === 2 && cardState.tasks[0].checked && !cardState.tasks[1].checked) {
      pass('WF1: initial state verified (2 tasks, correct states)');
    } else {
      fail('WF1: initial state verified', 'Incorrect state');
    }
    
    // 6-7. REGRESSION GUARD: Update title only
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title WF1' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('WF1 [REGRESSION GUARD]: tasks.length === 2 after title-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: tasks.length === 2 after title-only PATCH', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.checked === true) {
      pass('WF1 [REGRESSION GUARD]: task[0].checked === true after title-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: task[0].checked === true after title-only PATCH', 'Task state lost');
    }
    
    if (cardState.tasks?.[1]?.checked === false) {
      pass('WF1 [REGRESSION GUARD]: task[1].checked === false after title-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: task[1].checked === false after title-only PATCH', 'Task state lost');
    }
    
    // 8-9. REGRESSION GUARD: Update description only (no ## Tasks)
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Updated description only' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('WF1 [REGRESSION GUARD]: tasks.length === 2 after description-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: tasks.length === 2 after description-only PATCH', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.checked === true) {
      pass('WF1 [REGRESSION GUARD]: task[0].checked === true after description-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: task[0].checked === true after description-only PATCH', 'Task state lost');
    }
    
    if (cardState.tasks?.[1]?.checked === false) {
      pass('WF1 [REGRESSION GUARD]: task[1].checked === false after description-only PATCH');
    } else {
      fail('WF1 [REGRESSION GUARD]: task[1].checked === false after description-only PATCH', 'Task state lost');
    }
    
    // 10-11. Move to complete
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ lane: '03-complete' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    if (cardState.tasks?.length === 2) {
      pass('WF1: tasks survived lane move');
    } else {
      fail('WF1: tasks survived lane move', 'Tasks lost during move');
    }
    
    // 12. Cleanup
    await api(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, { method: 'DELETE' });
    
  } catch (error) {
    fail('WF1: workflow execution', String(error));
  }
}

// Workflow 2: Create card, add description, then tasks
async function testWorkflow2_CreateAndComplete(): Promise<void> {
  section('Workflow 2: Create card, add description, then tasks');
  
  const cardSlug = `wf2-${Date.now()}`;
  
  try {
    // 1. Create card with no content
    const card = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards`, {
      method: 'POST',
      body: JSON.stringify({ title: 'WF2 Card' }),
    });
    
    // 2-3. Add initial description
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Initial description' }),
    });
    
    let cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    if (cardState.tasks?.length === 0 && cardState.content?.includes('Initial description')) {
      pass('WF2: initial description set, no tasks yet');
    } else {
      fail('WF2: initial description set', 'Unexpected state');
    }
    
    // 4-5. Add tasks
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Gamma' }),
    });
    
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Delta' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    if (cardState.tasks?.length === 2) {
      pass('WF2: 2 tasks added');
    } else {
      fail('WF2: 2 tasks added', `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    // 6-7. Check both tasks
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks/0`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
    
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks/1`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
    
    // 8-9. REGRESSION GUARD: Update title
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'WF2 Card Title' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('WF2 [REGRESSION GUARD]: tasks.length === 2 after title update');
    } else {
      fail('WF2 [REGRESSION GUARD]: tasks.length === 2 after title update', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.checked === true && cardState.tasks?.[1]?.checked === true) {
      pass('WF2 [REGRESSION GUARD]: both tasks still checked');
    } else {
      fail('WF2 [REGRESSION GUARD]: both tasks still checked', 'Task states lost');
    }
    
    if (cardState.frontmatter?.title === 'WF2 Card Title') {
      pass('WF2 [REGRESSION GUARD]: title updated correctly');
    } else {
      fail('WF2 [REGRESSION GUARD]: title updated correctly', 'Title not updated');
    }
    
    // 10. Move to in-progress
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ lane: '02-in-progress' }),
    });
    
    // 11-12. REGRESSION GUARD: Update description after tasks exist
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Different description after tasks exist' }),
    });
    
    cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('WF2 [REGRESSION GUARD]: tasks.length === 2 after description update');
    } else {
      fail('WF2 [REGRESSION GUARD]: tasks.length === 2 after description update', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.checked === true && cardState.tasks?.[1]?.checked === true) {
      pass('WF2 [REGRESSION GUARD]: both tasks still checked after description update');
    } else {
      fail('WF2 [REGRESSION GUARD]: both tasks still checked after description update', 'Task states lost');
    }
    
    if (cardState.content?.includes('Different description after tasks exist')) {
      pass('WF2 [REGRESSION GUARD]: description updated correctly');
    } else {
      fail('WF2 [REGRESSION GUARD]: description updated correctly', 'Description not updated');
    }
    
    // 13. Move to complete
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ lane: '03-complete' }),
    });
    
    // 14. Cleanup
    await api(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, { method: 'DELETE' });
    
  } catch (error) {
    fail('WF2: workflow execution', String(error));
  }
}

// Regression guard: Title-only PATCH must not erase tasks
async function testRegressionGuard_TitleOnlyPatch(): Promise<void> {
  section('Regression guard: title-only PATCH must not erase tasks');
  
  try {
    // 1. Create card
    const card = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Title Guard Card' }),
    });
    
    // 2-3. Add tasks
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Task 1' }),
    });
    
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Task 2' }),
    });
    
    // 4. Check task 1
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks/1`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
    
    // 5. Update title only
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Regression Title Guard' }),
    });
    
    // 6. Verify
    const cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('GUARD: tasks.length === 2 after title-only PATCH');
    } else {
      fail('GUARD: tasks.length === 2 after title-only PATCH', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.text === 'Task 1' && cardState.tasks?.[0]?.checked === false) {
      pass('GUARD: task[0] intact (text="Task 1", checked=false)');
    } else {
      fail('GUARD: task[0] intact', `Got ${JSON.stringify(cardState.tasks?.[0])}`);
    }
    
    if (cardState.tasks?.[1]?.text === 'Task 2' && cardState.tasks?.[1]?.checked === true) {
      pass('GUARD: task[1] intact (text="Task 2", checked=true)');
    } else {
      fail('GUARD: task[1] intact', `Got ${JSON.stringify(cardState.tasks?.[1])}`);
    }
    
    // 7. Cleanup
    await api(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, { method: 'DELETE' });
    
  } catch (error) {
    fail('GUARD: title-only PATCH test', String(error));
  }
}

// Regression guard: Description-only PATCH must not erase tasks
async function testRegressionGuard_DescriptionOnlyPatch(): Promise<void> {
  section('Regression guard: description-only PATCH must not erase tasks');
  
  try {
    // 1. Create card
    const card = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Description Guard Card' }),
    });
    
    // 2-3. Add tasks
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Task 1' }),
    });
    
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Task 2' }),
    });
    
    // 4. Check task 1
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}/tasks/1`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
    
    // 5. Update description only (no ## Tasks section)
    await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Brand new description — no tasks section here' }),
    });
    
    // 6. Verify
    const cardState = await api<any>(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`);
    
    if (cardState.tasks?.length === 2) {
      pass('GUARD: tasks.length === 2 after description-only PATCH');
    } else {
      fail('GUARD: tasks.length === 2 after description-only PATCH', 
           `Expected 2 tasks, got ${cardState.tasks?.length}`);
    }
    
    if (cardState.tasks?.[0]?.checked === false) {
      pass('GUARD: task[0].checked === false');
    } else {
      fail('GUARD: task[0].checked === false', 'Task state lost');
    }
    
    if (cardState.tasks?.[1]?.checked === true) {
      pass('GUARD: task[1].checked === true');
    } else {
      fail('GUARD: task[1].checked === true', 'Task state lost');
    }
    
    if (cardState.content?.includes('Brand new description')) {
      pass('GUARD: description text was updated');
    } else {
      fail('GUARD: description text was updated', 'Description not updated');
    }
    
    if (cardState.content?.includes('## Tasks')) {
      pass('GUARD: ## Tasks section still present in card body');
    } else {
      fail('GUARD: ## Tasks section still present in card body', 'Tasks section missing');
    }
    
    // 7. Cleanup
    await api(`/projects/${TEST_PROJECT_SLUG}/cards/${card.slug}`, { method: 'DELETE' });
    
  } catch (error) {
    fail('GUARD: description-only PATCH test', String(error));
  }
}

// Print summary
function printSummary(): void {
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bold}  Results: ${passedCount} passed | ${failedCount} failed${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  
  if (failedCount > 0) {
    console.log(`${colors.red}${colors.bold}Failed tests:${colors.reset}`);
    testResults.filter(t => !t.passed).forEach(t => {
      console.log(`${colors.red}  ✗ ${t.name}${colors.reset}`);
      if (t.reason) {
        console.log(`${colors.red}    ${t.reason}${colors.reset}`);
      }
    });
    console.log('');
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}All tests passed!${colors.reset}\n`);
    process.exit(0);
  }
}

// Main test runner
async function runTests(): Promise<void> {
  console.log(`${colors.cyan}${colors.bold}`);
  console.log('='.repeat(80));
  console.log('  DevPlanner API Workflow Verification');
  console.log('='.repeat(80));
  console.log(colors.reset);
  
  try {
    // Check prerequisites
    if (!(await checkPrerequisites())) {
      process.exit(1);
    }
    
    // Setup
    await setupTestProject();
    
    // Run workflow tests
    await testWorkflow1_TaskLifecycleWithEdits();
    await testWorkflow2_CreateAndComplete();
    
    // Run regression guard tests
    await testRegressionGuard_TitleOnlyPatch();
    await testRegressionGuard_DescriptionOnlyPatch();
    
    // Print summary
    printSummary();
    
  } catch (error) {
    console.error(`${colors.red}${colors.bold}Unexpected error:${colors.reset}`, error);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanupTestProject();
  }
}

// Run the tests
runTests();
