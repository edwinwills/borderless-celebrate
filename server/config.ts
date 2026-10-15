import "dotenv/config";

export type GithubSource =
  | { repo: string; kind: "actions"; workflow: string }
  | { repo: string; kind: "deployments"; environment: string }
  | { repo: string; kind: "releases" };

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function parseGithubSources(value: string | undefined): GithubSource[] {
  return list(value).map((entry) => {
    const [repo, kind, target] = entry.split(":");
    if (!repo?.includes("/")) throw new Error(`GITHUB_SOURCES: "${entry}" needs to start with owner/repo`);
    if (kind === "actions" && target) return { repo, kind, workflow: target };
    if (kind === "deployments") return { repo, kind, environment: target || "production" };
    if (kind === "releases") return { repo, kind };
    throw new Error(
      `GITHUB_SOURCES: "${entry}" isn't recognised. Use repo:actions:<workflow.yml>, repo:deployments:<env> or repo:releases`,
    );
  });
}

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 8787),
  paperName: process.env.PAPER_NAME || "The Borderless Bugle",
  motto: process.env.PAPER_MOTTO || "All the code that's fit to ship",
  companyContext: process.env.COMPANY_CONTEXT || "",

  githubToken: process.env.GITHUB_TOKEN || "",
  githubSources: parseGithubSources(process.env.GITHUB_SOURCES),

  linearApiKey: process.env.LINEAR_API_KEY || "",
  linearTeamKeys: list(process.env.LINEAR_TEAM_KEYS).map((k) => k.toUpperCase()),
  linearWatchStates: list(process.env.LINEAR_WATCH_STATES),

  pollSeconds: num(process.env.POLL_SECONDS, 60),
  celebrateSeconds: num(process.env.CELEBRATE_SECONDS, 90),
  backfill: Math.max(0, Number(process.env.BACKFILL ?? 5) || 0),
  /** Don't backfill anything older than this, so a dormant workflow doesn't fill the screen with old news. */
  backfillDays: num(process.env.BACKFILL_DAYS, 14),
  announceToken: process.env.ANNOUNCE_TOKEN || "",
  basicAuthUser: process.env.BASIC_AUTH_USER || "bugle",
  basicAuthPassword: process.env.BASIC_AUTH_PASSWORD || "",
  dataDir: process.env.DATA_DIR || "data",
  demo: /^(1|true|yes)$/i.test(process.env.DEMO ?? ""),
};

export function describeSources(): string[] {
  const out = config.githubSources.map((s) =>
    s.kind === "actions"
      ? `${s.repo} → ${s.workflow}`
      : s.kind === "deployments"
        ? `${s.repo} → ${s.environment} deployments`
        : `${s.repo} → releases`,
  );
  if (config.linearApiKey && config.linearWatchStates.length) {
    out.push(`Linear → ${config.linearWatchStates.join(" / ")}`);
  }
  if (config.demo) out.push("Demo stories");
  return out;
}
