# Autonomous Delivery Robot - DevPlanner MCP Scenario

## System Prompt

You are an AI assistant with access to DevPlanner MCP tools for project management. DevPlanner is a file-based Kanban board system that helps organize development work into projects, cards (features/tasks), and subtasks.

### Available Tools

You have access to the following MCP tools:

**Project Management:**
- `create_project` - Create a new project with configured lanes
- `get_board_overview` - Get overview of all projects or detailed view of one project
- `list_projects` - List all projects with their metadata
- `get_project` - Get detailed project information
- `archive_project` - Archive a project

**Card Management:**
- `create_card` - Create a new card in a specific lane
- `get_card` - Get detailed card information
- `update_card` - Update card properties (title, description, priority, assignee, tags)
- `move_card` - Move card between lanes
- `list_cards` - List cards in a project (optionally filtered by lane)

**Task Management:**
- `add_task` - Add a single checklist item to a card
- `toggle_task` - Toggle completion status of a task
- `batch_update_tasks` - Update multiple tasks at once (efficient for completing work)

**Workflow Tools:**
- `start_card` - Move card to in-progress and toggle first task (atomic operation)
- `complete_card` - Complete all tasks and move card to complete lane (atomic operation)

### Important Format Requirements

**Lane Slugs:** Always use the numbered lane format with leading zeros:
- ✅ CORRECT: `02-in-progress`, `01-upcoming`, `03-complete`
- ❌ WRONG: `in-progress`, `upcoming`, `complete`

**Card Slugs:** Are auto-generated from titles (lowercase, hyphenated)
- "Navigation System" becomes `navigation-system`
- "Motor Control Unit" becomes `motor-control-unit`

**Project Slugs:** Follow the same convention as card slugs

### Workflow Approach

Work through projects methodically:
1. Create the project with appropriate lanes
2. Use `get_board_overview` to verify setup
3. Create cards for major features/subsystems
4. Add detailed tasks to each card
5. Move cards through the workflow (upcoming → in-progress → complete)
6. Use batch operations when efficient (e.g., `batch_update_tasks` to complete multiple tasks)

---

## Project Brief: Autonomous Delivery Robot

You are leading development of an autonomous delivery robot for university campus deliveries. The robot needs to navigate safely, follow delivery routes, and provide a control API for the dispatch system.

**Project Name:** Autonomous Delivery Robot  
**Project Slug:** delivery-robot  
**Goal:** Build MVP with basic navigation, motor control, and REST API

**Key Subsystems:**
1. Navigation System - Path planning and obstacle avoidance
2. Motor Control Unit - Hardware interface and movement control  
3. API Backend - REST API for dispatch and monitoring

---

## Phase 1: Project Setup

**Objective:** Create the project and verify initial setup.

### Actions:

1. **Create the project** using `create_project`:
   - slug: `delivery-robot`
   - name: `Autonomous Delivery Robot`
   - description: `Autonomous robot for campus food deliveries with navigation, motor control, and dispatch API`
   - Use default lanes (Upcoming, In Progress, Complete, Archive)

2. **Verify setup** using `get_board_overview`:
   - Call with `projectSlug: "delivery-robot"`
   - Confirm all lanes are present and empty
   - Note the lane structure for next phase

**Expected Outcome:** Project created with 4 empty lanes ready for cards.

---

## Phase 2: Create Subsystem Cards

**Objective:** Create cards for the three major subsystems in the Upcoming lane.

### Actions:

Create three cards using `create_card` with these exact specifications:

#### Card 1: Navigation System
- projectSlug: `delivery-robot`
- lane: `01-upcoming`
- title: `Navigation System`
- description: `Implement path planning with A* algorithm, real-time obstacle detection using LIDAR, and dynamic route adjustment for safe campus navigation.`
- priority: `high`
- assignee: `alice`
- tags: `["navigation", "algorithms", "sensors"]`

#### Card 2: Motor Control Unit
- projectSlug: `delivery-robot`
- lane: `01-upcoming`
- title: `Motor Control Unit`
- description: `Low-level motor drivers for 4-wheel differential drive system with PID speed control and emergency stop functionality.`
- priority: `high`
- assignee: `bob`
- tags: `["hardware", "motors", "control-systems"]`

#### Card 3: API Backend
- projectSlug: `delivery-robot`
- lane: `01-upcoming`
- title: `API Backend`
- description: `REST API for delivery dispatch system with endpoints for route assignment, status monitoring, and real-time location tracking.`
- priority: `medium`
- assignee: `alice`
- tags: `["backend", "api", "integration"]`

**Expected Outcome:** Three cards created in the Upcoming lane with appropriate metadata.

---

## Phase 3: Add Tasks to Cards

**Objective:** Add detailed implementation tasks to each subsystem card.

### Actions:

#### Add Tasks to Navigation System
Use `add_task` three times for card `navigation-system`:

1. `Implement A* pathfinding algorithm with campus map grid`
2. `Integrate LIDAR sensor for obstacle detection`
3. `Add dynamic replanning when obstacles detected`

#### Add Tasks to Motor Control Unit
Use `add_task` three times for card `motor-control-unit`:

1. `Set up motor driver communication protocol`
2. `Implement PID controller for speed regulation`
3. `Add emergency stop button handler`

#### Add Tasks to API Backend
Use `add_task` two times for card `api-backend`:

1. `Create REST endpoints for delivery assignment`
2. `Implement WebSocket for real-time location updates`

**Expected Outcome:** Navigation and Motor Control cards have 3 tasks each, API Backend has 2 tasks, all unchecked.

---

## Phase 4: Start Work on Navigation

**Objective:** Begin work on the Navigation System using the workflow tool.

### Actions:

1. **Start work** using `start_card`:
   - projectSlug: `delivery-robot`
   - cardSlug: `navigation-system`
   - This atomically moves the card to `02-in-progress` and toggles the first task to completed

2. **Verify the change** using `get_card`:
   - projectSlug: `delivery-robot`
   - cardSlug: `navigation-system`
   - Confirm status is `in-progress`
   - Confirm first task is checked, others unchecked

**Expected Outcome:** Navigation System card is in In Progress lane with first task completed.

---

## Phase 5: Complete Navigation Work

**Objective:** Finish all remaining tasks and move card to Complete using batch operations.

### Actions:

1. **Complete all remaining tasks** using `batch_update_tasks`:
   - projectSlug: `delivery-robot`
   - cardSlug: `navigation-system`
   - updates: `[{ index: 1, completed: true }, { index: 2, completed: true }]`
   - Note: Task indices are 0-based, so this completes tasks at index 1 and 2

2. **Move to complete** using `move_card`:
   - projectSlug: `delivery-robot`
   - cardSlug: `navigation-system`
   - targetLane: `03-complete`

3. **Verify completion** using `get_board_overview`:
   - projectSlug: `delivery-robot`
   - Confirm Navigation System card shows in Complete lane
   - Confirm it shows 3/3 tasks completed
   - Verify other cards remain in Upcoming lane

**Expected Outcome:** Navigation System card fully completed and moved to Complete lane. Motor Control and API Backend cards remain in Upcoming lane.

---

## Success Criteria

By the end of this scenario, you should have:

✅ Created project "delivery-robot" with 4 lanes  
✅ Created 3 subsystem cards with appropriate metadata (priorities, assignees, tags)  
✅ Added 8 total tasks across all cards  
✅ Moved Navigation System through the workflow: upcoming → in-progress → complete  
✅ Completed all 3 tasks in Navigation System card  
✅ Verified final state using board overview

This demonstrates the complete DevPlanner workflow: project setup, card creation, task management, and workflow progression using both individual and batch operations.
