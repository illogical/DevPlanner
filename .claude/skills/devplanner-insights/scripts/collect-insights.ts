#!/usr/bin/env bun
/**
 * DevPlanner Insights Collector
 * Usage: bun collect-insights.ts
 * Output: Structured JSON to stdout
 *
 * Stale detection: reads digestAnchor from /preferences.
 * If no activity since that anchor, outputs {stale:true} and exits early.
 * Otherwise collects full per-project data and outputs insights JSON.
 *
 * The agent is responsible for:
 *   1. Composing the digest from the JSON output
 *   2. Calling PATCH /preferences {"digestAnchor": <generatedAt>} after sending
 */

const BASE_URL = "http://192.168.7.45:17103/api";
const UPCOMING_LIMIT = 5;      // Top N upcoming cards per project (position = priority)
const IN_PROGRESS_DETAIL = 10; // Max in-progress cards to fetch full task detail for

// ── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  lastSelectedProject: string | null;
  digestAnchor: string | null;
}

interface CardFrontmatter {
  title: string;
  status?: "in-progress" | "blocked" | "review" | "testing";
  priority?: "low" | "medium" | "high";
  assignee?: "user" | "agent";
  created: string;
  updated: string;
  tags?: string[];
  cardNumber?: number;
  blockedReason?: string;
  taskMeta?: Array<{ addedAt: string; completedAt: string | null }>;
}

interface CardSummary {
  slug: string;
  filename: string;
  lane: string;
  frontmatter: CardFrontmatter;
  taskProgress: { total: number; checked: number };
}

interface TaskItem {
  index: number;
  text: string;
  checked: boolean;
  addedAt?: string;
  completedAt?: string | null;
}

interface Card extends CardSummary {
  content: string;
  tasks: TaskItem[];
}

interface ProjectStats {
  slug: string;
  completionsLast7Days: number;
  completionsLast30Days: number;
  avgDaysInProgress: number;
  wipCount: number;
  backlogDepth: number;
  blockedCount: number;
}

interface HistoryEvent {
  id: string;
  projectSlug: string;
  timestamp: string;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
}

interface ProjectSummary {
  slug: string;
  name: string;
  description?: string;
  created: string;
  updated: string;
  archived: boolean;
  cardCounts: Record<string, number>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const generatedAt = new Date().toISOString();

  // Step 1: Read digestAnchor from preferences
  let digestAnchor: string | null = null;
  try {
    const prefs = await get<Preferences>("/preferences");
    digestAnchor = prefs.digestAnchor;
  } catch {
    // Preferences may be unset on first run — treat as null
  }

  // Step 2: Determine reporting window
  const windowStart =
    digestAnchor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Step 3: Stale detection — check for any activity since last digest
  const activity = await get<{ events: HistoryEvent[]; total: number }>(
    `/activity?since=${encodeURIComponent(windowStart)}&limit=200`
  );

  if (activity.events.length === 0) {
    console.log(
      JSON.stringify(
        {
          stale: true,
          message: digestAnchor
            ? `No DevPlanner activity since last digest (${digestAnchor})`
            : "No DevPlanner activity in the last 24 hours",
          digestAnchor,
          generatedAt,
        },
        null,
        2
      )
    );
    return;
  }

  // Step 4: Collect all active projects
  const { projects } = await get<{ projects: ProjectSummary[] }>("/projects");
  const active = projects.filter((p) => !p.archived);

  // Step 5: Per-project data collection (parallel across projects)
  const projectData = await Promise.all(
    active.map(async (p) => {
      const slug = p.slug;
      const since = encodeURIComponent(windowStart);

      // Parallel per-project requests
      const [inProgressResp, upcomingResp, recentlyCompletedResp, stats, historyResp] =
        await Promise.all([
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=02-in-progress`),
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=01-upcoming`),
          get<{ cards: CardSummary[] }>(
            `/projects/${slug}/cards?lane=03-complete&since=${since}`
          ),
          get<ProjectStats>(`/projects/${slug}/stats`),
          get<{ events: HistoryEvent[] }>(
            `/projects/${slug}/history?limit=100&since=${since}`
          ),
        ]);

      // Fetch full task list for in-progress cards that have tasks
      const inProgressFull = await Promise.all(
        inProgressResp.cards.slice(0, IN_PROGRESS_DETAIL).map(async (card) => {
          if (card.taskProgress.total === 0) return card;
          try {
            const full = await get<Card>(`/projects/${slug}/cards/${card.slug}`);
            return { ...card, tasks: full.tasks };
          } catch {
            return card; // Fall back to summary if full fetch fails
          }
        })
      );

      // Agent-claimable: no assignee or explicitly agent-assigned, ordered by lane position
      const agentClaimable = upcomingResp.cards
        .filter(
          (c) => !c.frontmatter.assignee || c.frontmatter.assignee === "agent"
        )
        .slice(0, UPCOMING_LIMIT);

      // Filter global activity down to this project
      const projectActivity = activity.events.filter(
        (e) => e.projectSlug === slug
      );

      return {
        slug,
        name: p.name,
        stats,
        inProgress: inProgressFull,
        upcoming: {
          // Lane position = priority; slice preserves order
          cards: upcomingResp.cards.slice(0, UPCOMING_LIMIT),
          totalCount: upcomingResp.cards.length,
          hasMore: upcomingResp.cards.length > UPCOMING_LIMIT,
        },
        recentlyCompleted: recentlyCompletedResp.cards,
        recentHistory: historyResp.events,
        recentActivity: projectActivity,
        agentClaimable,
      };
    })
  );

  // Step 6: Aggregate summary + output
  const output = {
    stale: false,
    generatedAt,
    digestAnchor,
    windowStart,
    totalActivityEvents: activity.events.length,
    summary: {
      totalCompleted: projectData.reduce(
        (n, p) => n + p.recentlyCompleted.length,
        0
      ),
      totalInProgress: projectData.reduce(
        (n, p) => n + p.inProgress.length,
        0
      ),
      totalBlocked: projectData.reduce(
        (n, p) => n + p.stats.blockedCount,
        0
      ),
      agentClaimableCount: projectData.reduce(
        (n, p) => n + p.agentClaimable.length,
        0
      ),
    },
    projects: projectData,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: true, message: String(err) }));
  process.exit(1);
});
