import { config } from "./config.ts";
import { writeHeadline } from "./headline.ts";
import { findTicketIds, getIssuesByIdentifier, issueToStory, type LinearIssue } from "./linear.ts";
import { store } from "./store.ts";
import type { Edition, Person, Story } from "../shared/types.ts";

type Listener = (edition: Edition, celebrate: boolean) => void;
const listeners = new Set<Listener>();
export const onEdition = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const broadcast = (edition: Edition, celebrate: boolean) => listeners.forEach((fn) => fn(edition, celebrate));

export interface Draft {
  id: string;
  source: Edition["source"];
  sourceLabel: string;
  url?: string;
  version?: string;
  shippedAt: string;
  shippedBy: Person[];
  /** Raw text to mine for ticket IDs (commit messages, release notes). */
  messages: string[];
  /** Tickets we already have in hand (e.g. from the Linear poller). */
  issues?: LinearIssue[];
}

const NOISE = /^(merge (branch|pull request|remote)|bump |chore\(deps|build\(deps|revert "revert)/i;

/** "[BDLS-123] Add the thing (#9518)" → "Add the thing" */
export function tidySubject(message: string): string {
  return message
    .split("\n")[0]
    .replace(/\[[A-Za-z]+-\d+\]\s*/g, "")
    .replace(/\s*\(#\d+\)\s*$/, "")
    .replace(/^[A-Za-z]+-\d+[:\s-]+/, "")
    .trim();
}

function uniquePeople(people: Person[]): Person[] {
  const seen = new Map<string, Person>();
  for (const p of people) {
    const key = p.name.toLowerCase();
    if (!p.name || /\[bot\]$|^github-actions|^dependabot/i.test(p.name)) continue;
    if (!seen.has(key) || (!seen.get(key)!.avatarUrl && p.avatarUrl)) seen.set(key, p);
  }
  return [...seen.values()].slice(0, 10);
}

/**
 * Turn a raw release into a finished edition: look up its tickets in Linear,
 * write the headline, store it and tell the screens.
 * Returns null when there's nothing worth printing (e.g. a re-deploy of the same commit).
 */
export async function publish(draft: Draft, celebrate: boolean): Promise<Edition | null> {
  const ticketIds = [...new Set(draft.messages.flatMap(findTicketIds))];
  let issues = draft.issues ?? [];
  if (!issues.length && ticketIds.length && config.linearApiKey) {
    try {
      issues = await getIssuesByIdentifier(ticketIds);
    } catch (err) {
      console.warn("[linear] lookup failed:", (err as Error).message);
    }
  }

  const found = new Set(issues.map((i) => i.identifier));
  const stories: Story[] = issues.map(issueToStory);
  // Messages that didn't resolve to a Linear ticket still count as news.
  const otherChanges = [
    ...new Set(
      draft.messages
        .filter((m) => !findTicketIds(m).some((id) => found.has(id)))
        .filter((m) => !NOISE.test(m))
        .map(tidySubject)
        .filter(Boolean),
    ),
  ];
  if (!config.linearApiKey && !stories.length) {
    // Without Linear, commits become the stories.
    stories.push(
      ...otherChanges.splice(0, 8).map((title, i) => ({ id: `${draft.id}#${i}`, title, media: [] as Story["media"] })),
    );
  }
  if (!stories.length && !otherChanges.length) return null;

  const ticketText = new Map(issues.map((i) => [i.id, (i.description ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 600)]));
  const { headline, lines } = await writeHeadline(stories, otherChanges, draft.sourceLabel, ticketText);
  for (const s of stories) s.line = lines.get(s.id);

  const edition: Edition = {
    id: draft.id,
    number: store.nextNumber(),
    source: draft.source,
    sourceLabel: draft.sourceLabel,
    url: draft.url,
    version: draft.version,
    shippedAt: draft.shippedAt,
    shippedBy: uniquePeople([...draft.shippedBy, ...stories.flatMap((s) => (s.assignee ? [s.assignee] : []))]),
    stories,
    otherChanges: otherChanges.slice(0, 20),
    headline,
  };

  store.addEdition(edition);
  store.markSeen(draft.id, ...stories.flatMap((s) => (s.identifier ? [`ticket:${s.identifier}`] : [])));
  console.log(`[press] Edition ${edition.number}: "${headline.headline}" (${stories.length} stories)${celebrate ? " 🎉" : ""}`);
  broadcast(edition, celebrate);
  return edition;
}
