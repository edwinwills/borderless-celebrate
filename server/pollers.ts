import { config, type GithubSource } from "./config.ts";
import { publish, type Draft } from "./editions.ts";
import { getIssuesMovedInto } from "./linear.ts";
import { store } from "./store.ts";
import type { Person } from "../shared/types.ts";

interface GhUser {
  login: string;
  avatar_url: string;
}
interface GhCommit {
  sha: string;
  commit: { message: string; author?: { name: string } | null };
  author?: GhUser | null;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /not accessible by (personal access|integration)/i.test(body)) {
      const permission = /\/(commits|compare)\//.test(path)
        ? "Contents"
        : path.includes("/actions/")
          ? "Actions"
          : path.includes("/deployments")
            ? "Deployments"
            : "Contents";
      throw new Error(`GitHub token can't read ${path.split("?")[0]}. Give it "${permission}: Read-only" on this repo.`);
    }
    throw new Error(`GitHub ${path} responded ${res.status}: ${body.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

const person = (u?: GhUser | null): Person[] => (u ? [{ name: u.login, avatarUrl: u.avatar_url }] : []);

/** Commits between two SHAs (or just the head commit when there's no base). */
async function commitsBetween(repo: string, base: string | undefined, head: string): Promise<GhCommit[]> {
  if (base === head) return [];
  if (!base) return [await gh<GhCommit>(`/repos/${repo}/commits/${head}`)];
  try {
    const cmp = await gh<{ commits: GhCommit[]; status: string }>(`/repos/${repo}/compare/${base}...${head}`);
    return cmp.status === "behind" ? [] : cmp.commits;
  } catch {
    // Base vanished (force push, squashed branch): fall back to the head commit alone.
    return [await gh<GhCommit>(`/repos/${repo}/commits/${head}`)];
  }
}

/** One deploy-ish thing from any GitHub source, normalised. */
interface Shipment {
  key: string;
  sha: string;
  at: string;
  url: string;
  label: string;
  version?: string;
  by: Person[];
  /** Release notes, for releases. */
  notes?: string;
  /** The deployed commit's message, used if we can't read the commit range. */
  headMessage?: string;
  /** Still running: check again next poll. */
  pending?: boolean;
  /** Finished but not a success: skip for good. */
  failed?: boolean;
}

async function listShipments(source: GithubSource): Promise<Shipment[]> {
  const { repo } = source;
  if (source.kind === "actions") {
    const data = await gh<{
      workflow_runs: {
        id: number;
        name: string;
        head_sha: string;
        run_number: number;
        html_url: string;
        updated_at: string;
        conclusion: string | null;
        actor: GhUser;
        triggering_actor?: GhUser;
        head_commit?: { message: string } | null;
      }[];
    }>(`/repos/${repo}/actions/workflows/${encodeURIComponent(source.workflow)}/runs?status=success&per_page=10`);
    return data.workflow_runs.map((r) => ({
      key: `gh-run:${repo}:${r.id}`,
      sha: r.head_sha,
      at: r.updated_at,
      url: r.html_url,
      label: `${r.name} #${r.run_number}, ${repo}`,
      version: r.head_sha.slice(0, 7),
      by: person(r.triggering_actor ?? r.actor),
      headMessage: r.head_commit?.message,
    }));
  }

  if (source.kind === "deployments") {
    const deployments = await gh<{ id: number; sha: string; ref: string; created_at: string; creator: GhUser }[]>(
      `/repos/${repo}/deployments?environment=${encodeURIComponent(source.environment)}&per_page=10`,
    );
    return Promise.all(
      deployments.map(async (d) => {
        const [status] = await gh<{ state: string; created_at: string; log_url?: string; environment_url?: string }[]>(
          `/repos/${repo}/deployments/${d.id}/statuses?per_page=1`,
        );
        const state = status?.state ?? "pending";
        return {
          key: `gh-deploy:${repo}:${d.id}`,
          sha: d.sha,
          at: status?.created_at ?? d.created_at,
          url: status?.log_url || status?.environment_url || `https://github.com/${repo}/deployments`,
          label: `${source.environment} deploy of ${d.ref}, ${repo}`,
          version: d.ref.length > 20 ? d.sha.slice(0, 7) : d.ref,
          by: person(d.creator),
          pending: ["pending", "queued", "in_progress"].includes(state),
          // "inactive" = was live, since superseded. Fine for backfill.
          failed: !["success", "inactive", "pending", "queued", "in_progress"].includes(state),
        };
      }),
    );
  }

  const releases = await gh<
    {
      id: number;
      tag_name: string;
      name: string | null;
      body: string | null;
      draft: boolean;
      html_url: string;
      published_at: string;
      target_commitish: string;
      author: GhUser;
    }[]
  >(`/repos/${repo}/releases?per_page=10`);
  return releases
    .filter((r) => !r.draft && r.published_at)
    .map((r) => ({
      key: `gh-release:${repo}:${r.id}`,
      sha: r.tag_name,
      at: r.published_at,
      url: r.html_url,
      label: `${r.name || r.tag_name}, ${repo}`,
      version: r.tag_name,
      by: person(r.author),
      notes: r.body ?? "",
    }));
}

function sourceKey(s: GithubSource) {
  return `src:${s.repo}:${s.kind}:${s.kind === "actions" ? s.workflow : s.kind === "deployments" ? s.environment : ""}`;
}
/** Deploys of the same repo/env share a "last live SHA", whichever workflow did them. */
function liveShaKey(s: GithubSource) {
  return `live:${s.repo}:${s.kind === "deployments" ? s.environment : s.kind}`;
}

async function pollGithubSource(source: GithubSource) {
  const key = sourceKey(source);
  const firstRun = !store.cursor(key);
  // Newest first from the API; work oldest → newest so ranges chain correctly.
  const all = (await listShipments(source)).sort((a, b) => a.at.localeCompare(b.at));
  const live = all.filter((s) => !s.failed && !s.pending);

  const oldest = Date.now() - config.backfillDays * 86_400_000;
  const backfill = firstRun
    ? new Set(
        live
          .filter((s) => Date.parse(s.at) >= oldest)
          .slice(-config.backfill)
          .map((s) => s.key),
      )
    : new Set<string>();

  for (const [i, ship] of all.entries()) {
    if (store.hasSeen(ship.key) || ship.pending) continue;
    if (ship.failed || (firstRun && !backfill.has(ship.key))) {
      store.markSeen(ship.key);
      continue;
    }
    const previous = all.slice(0, i).reverse().find((s) => !s.failed && !s.pending);
    // Live: compare against whatever was last on screen. Backfill: against the previous run in the list.
    const base = firstRun ? previous?.sha : (store.cursor(liveShaKey(source)) ?? previous?.sha);

    let messages: string[];
    let by = ship.by;
    if (ship.notes?.trim()) {
      messages = ship.notes.split("\n").map((l) => l.replace(/^[\s*-]+/, "").trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("```"));
    } else {
      try {
        const commits = await commitsBetween(source.repo, base, ship.sha);
        messages = commits.map((c) => c.commit.message);
        by = [...by, ...commits.flatMap((c) => person(c.author))];
      } catch (err) {
        // Without commit access we can still print the deployed commit's message.
        if (!ship.headMessage) throw err;
        warnings.add((err as Error).message);
        messages = [ship.headMessage];
      }
    }

    const draft: Draft = {
      id: ship.key,
      source: "github",
      sourceLabel: ship.label,
      url: ship.url,
      version: ship.version,
      shippedAt: ship.at,
      shippedBy: by,
      messages,
    };
    const edition = await publish(draft, !firstRun);
    if (!edition) store.markSeen(ship.key);
    store.setCursor(liveShaKey(source), ship.sha);
  }
  store.setCursor(key, new Date().toISOString());
}

async function pollLinear() {
  const key = "src:linear";
  const since = store.cursor(key);
  const now = new Date();
  const firstRun = !since;
  const issues = await getIssuesMovedInto(config.linearWatchStates, since ?? new Date(now.getTime() - 86_400_000).toISOString());

  const fresh = issues.filter((issue) => {
    const k = `linear:${issue.id}:${issue.state.name}`;
    if (store.hasSeen(k)) return false;
    store.markSeen(k);
    // Already celebrated as part of a GitHub deploy, or an old ticket that was merely edited.
    if (store.hasSeen(`ticket:${issue.identifier}`)) return false;
    if (issue.completedAt && now.getTime() - Date.parse(issue.completedAt) > 2 * 86_400_000) return false;
    return !firstRun;
  });

  // Everything that landed in the same poll goes out as one edition.
  if (fresh.length) {
    const draft: Draft = {
      id: `linear:${fresh.map((i) => i.identifier).sort().join(",")}:${now.getTime()}`,
      source: "linear",
      sourceLabel: `Moved to ${[...new Set(fresh.map((i) => i.state.name))].join(" / ")} in Linear`,
      url: fresh.length === 1 ? fresh[0].url : undefined,
      shippedAt: now.toISOString(),
      shippedBy: [],
      messages: fresh.map((i) => `${i.identifier} ${i.title}`),
      issues: fresh,
    };
    await publish(draft, true);
  }
  // Small overlap so nothing slips between polls; seen-keys stop duplicates.
  store.setCursor(key, new Date(now.getTime() - 60_000).toISOString());
}

export const wire = { ok: true, lastPollAt: undefined as string | undefined, errors: [] as string[] };
/** Problems that didn't stop a poll but are worth showing on screen. */
const warnings = new Set<string>();

let running = false;
export async function pollAll() {
  if (running) return;
  running = true;
  const errors: string[] = [];
  warnings.clear();
  for (const source of config.githubSources) {
    try {
      await pollGithubSource(source);
    } catch (err) {
      errors.push(`${source.repo} (${source.kind}): ${(err as Error).message}`);
    }
  }
  if (config.linearApiKey && config.linearWatchStates.length) {
    try {
      await pollLinear();
    } catch (err) {
      errors.push(`Linear: ${(err as Error).message}`);
    }
  }
  errors.push(...warnings);
  errors.forEach((e) => console.warn("[wire]", e));
  Object.assign(wire, { ok: errors.length === 0, errors, lastPollAt: new Date().toISOString() });
  running = false;
}
