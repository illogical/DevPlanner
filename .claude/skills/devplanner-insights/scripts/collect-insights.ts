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
const RECENT_WINDOW_DAYS = 2;        // Days from NOW considered "recent" — triggers full detail display
const ACCOMPLISHMENTS_FALLBACK = 3;  // Completed cards to show when none in current window
const IDEAS_FALLBACK = 5;            // Cards to show in Latest Ideas when no recent activity
const IN_PROGRESS_DETAIL = 10;       // Max in-progress cards to fetch full task detail for

// ── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  lastSelectedProject: string | null;
  digestAnchor: string | null;
}

interface CardLink {
  title: string;
  url: string;
  kind?: "doc" | "spec" | "ticket" | "repo" | "reference" | "other";
}

interface CardFrontmatter {
  title: string;
  description?: string;
  status?: "in-progress" | "blocked" | "review" | "testing";
  priority?: "low" | "medium" | "high";
  assignee?: "user" | "agent";
  created: string;
  updated: string;
  tags?: string[];
  cardNumber?: number;
  blockedReason?: string;
  links?: CardLink[];
  taskMeta?: Array<{ addedAt: string; completedAt: string | null }>;
}

interface CardSummary {
  slug: string;
  filename: string;
  lane: string;
  cardId?: string | null;
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

async function fetchFullCard(slug: string, cardSlug: string): Promise<Card | CardSummary> {
  try {
    return await get<Card>(`/projects/${slug}/cards/${cardSlug}`);
  } catch {
    return { slug: cardSlug, filename: `${cardSlug}.md`, lane: "", frontmatter: { title: cardSlug, created: "", updated: "" }, taskProgress: { total: 0, checked: 0 }, content: "", tasks: [] };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const generatedAt = new Date().toISOString();
  const recentWindowCutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

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
      const [inProgressResp, upcomingResp, recentlyCompletedResp, allCompletedResp, stats, historyResp] =
        await Promise.all([
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=02-in-progress`),
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=01-upcoming`),
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=03-complete&since=${since}`),
          get<{ cards: CardSummary[] }>(`/projects/${slug}/cards?lane=03-complete`),
          get<ProjectStats>(`/projects/${slug}/stats`),
          get<{ events: HistoryEvent[] }>(`/projects/${slug}/history?limit=100&since=${since}`),
        ]);

      // Fetch full details for recently completed cards (description + tasks for the digest)
      const recentlyCompletedFull = await Promise.all(
        recentlyCompletedResp.cards.map((card) => fetchFullCard(slug, card.slug))
      );

      // Fallback: most recently updated completed cards when none in current window
      const completedFallback = allCompletedResp.cards
        .slice()
        .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
        .slice(0, ACCOMPLISHMENTS_FALLBACK);

      // Latest Ideas: combine all non-archive cards, sort by updated desc
      const allNonArchive: CardSummary[] = [
        ...upcomingResp.cards,
        ...inProgressResp.cards,
        ...allCompletedResp.cards,
      ];
      const sortedByUpdated = allNonArchive
        .slice()
        .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated));

      const recentCards = sortedByUpdated.filter(
        (c) => c.frontmatter.updated >= recentWindowCutoff
      );
      const isIdeasRecent = recentCards.length > 0;
      const ideasSource = isIdeasRecent
        ? recentCards
        : sortedByUpdated.slice(0, IDEAS_FALLBACK);

      // Fetch full details for ideas cards
      const latestIdeasFull = await Promise.all(
        ideasSource.map((card) => fetchFullCard(slug, card.slug))
      );

      // Fetch full task list for in-progress cards that have tasks
      const inProgressFull = await Promise.all(
        inProgressResp.cards.slice(0, IN_PROGRESS_DETAIL).map(async (card) => {
          if (card.taskProgress.total === 0) return card;
          try {
            const full = await get<Card>(`/projects/${slug}/cards/${card.slug}`);
            return { ...card, tasks: full.tasks };
          } catch {
            return card;
          }
        })
      );

      // Agent-claimable: no assignee or explicitly agent-assigned, ordered by lane position
      const agentClaimable = upcomingResp.cards.filter(
        (c) => !c.frontmatter.assignee || c.frontmatter.assignee === "agent"
      );

      // Filter global activity down to this project
      const projectActivity = activity.events.filter((e) => e.projectSlug === slug);

      return {
        slug,
        name: p.name,
        stats,
        recentWindowCutoff,
        recentlyCompleted: recentlyCompletedFull,
        completedFallback,
        latestIdeas: {
          cards: latestIdeasFull,
          isRecent: isIdeasRecent,
        },
        inProgress: inProgressFull,
        upcoming: {
          // Lane position = priority; slice preserves order
          cards: upcomingResp.cards.slice(0, 5),
          totalCount: upcomingResp.cards.length,
          hasMore: upcomingResp.cards.length > 5,
        },
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
    recentWindowCutoff,
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
