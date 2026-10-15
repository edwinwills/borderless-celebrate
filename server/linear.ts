import { config } from "./config.ts";
import type { Media, Story } from "../shared/types.ts";

const ENDPOINT = "https://api.linear.app/graphql";

/** Hosts whose files need our Linear API key to load. */
export const LINEAR_UPLOAD_HOSTS = ["uploads.linear.app"];

const ISSUE_FIELDS = `
  id identifier title description url completedAt updatedAt
  state { name type }
  team { key name }
  project { name }
  assignee { name displayName avatarUrl }
  attachments(first: 20) { nodes { title url } }
  comments(first: 15) { nodes { body } }
`;

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  completedAt?: string | null;
  updatedAt: string;
  state: { name: string; type: string };
  team: { key: string; name: string };
  project?: { name: string } | null;
  assignee?: { name: string; displayName: string; avatarUrl?: string | null } | null;
  attachments: { nodes: { title: string; url: string }[] };
  comments: { nodes: { body: string }[] };
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: config.linearApiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  // Aliased lookups return partial data plus "not found" errors for bad IDs; that's fine.
  if (!body.data) throw new Error(`Linear: ${body.errors?.map((e) => e.message).join("; ")}`);
  return body.data;
}

const TICKET_RE = /\b([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,7})\b/g;

/** Pull ticket identifiers (BDLS-123) out of commit messages, branch names, release notes. */
export function findTicketIds(text: string): string[] {
  const ids = new Set<string>();
  for (const [, team, number] of text.matchAll(TICKET_RE)) {
    const key = team.toUpperCase();
    if (config.linearTeamKeys.length && !config.linearTeamKeys.includes(key)) continue;
    ids.add(`${key}-${number}`);
  }
  return [...ids];
}

export async function getIssuesByIdentifier(identifiers: string[]): Promise<LinearIssue[]> {
  if (!config.linearApiKey || !identifiers.length) return [];
  const ids = identifiers.slice(0, 40);
  const query = `query { ${ids.map((id, i) => `i${i}: issue(id: ${JSON.stringify(id)}) { ...F }`).join("\n")} }
    fragment F on Issue { ${ISSUE_FIELDS} }`;
  const data = await gql<Record<string, LinearIssue | null>>(query);
  return ids.map((_, i) => data[`i${i}`]).filter((x): x is LinearIssue => Boolean(x));
}

export async function getIssuesMovedInto(states: string[], since: string): Promise<LinearIssue[]> {
  const filter: Record<string, unknown> = {
    updatedAt: { gt: since },
    state: { name: { in: states } },
  };
  if (config.linearTeamKeys.length) filter.team = { key: { in: config.linearTeamKeys } };
  const data = await gql<{ issues: { nodes: LinearIssue[] } }>(
    `query($filter: IssueFilter) { issues(filter: $filter, first: 50, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } } }`,
    { filter },
  );
  return data.issues.nodes;
}

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
const MD_LINK = /(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

/** Screenshots and screen recordings from a ticket's description, comments and attachments. */
export function extractMedia(issue: LinearIssue): Media[] {
  const found: Media[] = [];
  const add = (url: string, kind: Media["kind"]) => {
    if (!found.some((m) => m.url === url)) found.push({ url, kind, caption: `${issue.identifier}: ${issue.title}` });
  };
  const texts = [issue.description ?? "", ...issue.comments.nodes.map((c) => c.body)];
  for (const text of texts) {
    for (const [, bang, label, url] of text.matchAll(MD_LINK)) {
      if (VIDEO_EXT.test(label) || VIDEO_EXT.test(url)) add(url, "video");
      else if (bang || IMAGE_EXT.test(label) || IMAGE_EXT.test(url)) add(url, "image");
    }
  }
  for (const a of issue.attachments.nodes) {
    if (VIDEO_EXT.test(a.url)) add(a.url, "video");
    else if (IMAGE_EXT.test(a.url)) add(a.url, "image");
  }
  return found.slice(0, 6);
}

/** Linear uploads need our API key, so the browser loads them through /api/media. */
export function publicMediaUrl(url: string): string {
  try {
    if (LINEAR_UPLOAD_HOSTS.includes(new URL(url).hostname)) return `/api/media?u=${encodeURIComponent(url)}`;
  } catch {
    /* not a URL; leave as is */
  }
  return url;
}

export function issueToStory(issue: LinearIssue): Story {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    team: issue.team.name,
    project: issue.project?.name,
    assignee: issue.assignee
      ? { name: issue.assignee.displayName || issue.assignee.name, avatarUrl: issue.assignee.avatarUrl ?? undefined }
      : undefined,
    media: extractMedia(issue).map((m) => ({ ...m, url: publicMediaUrl(m.url) })),
  };
}

/** Fetch an image with Linear auth if needed, for sending to Claude. */
export async function fetchImageForModel(
  url: string,
): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" } | null> {
  try {
    const host = new URL(url).hostname;
    const res = await fetch(url, {
      headers: LINEAR_UPLOAD_HOSTS.includes(host) && config.linearApiKey ? { Authorization: config.linearApiKey } : {},
    });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024) return null;
    return { data: buf.toString("base64"), mediaType: type as "image/png" };
  } catch {
    return null;
  }
}
