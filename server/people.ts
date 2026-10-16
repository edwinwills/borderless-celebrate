import type { Person } from "../shared/types.ts";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 1);
const capitalise = (w: string) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w);

/**
 * Tidy a name as it arrives from git or Linear:
 * "Nwike, Chisom Ogechukwu" → "Chisom Ogechukwu Nwike", "chisom@getborderless.co.uk" → "Chisom",
 * "tom" → "Tom". GitHub logins (name === login) are left alone.
 */
export function normaliseName(name: string, login?: string): string {
  let n = name.trim();
  if (login && n === login) return n;
  if (n.includes("@")) n = n.split("@")[0].replace(/[._-]+/g, " ");
  const comma = n.match(/^([^,]+),\s*(.+)$/);
  if (comma) n = `${comma[2]} ${comma[1]}`;
  // A lone lowercase word this long is probably a login ("edwinwills"); don't dress it up.
  if (!name.includes("@") && looksLikeLogin(n) && n.length > 7) return n;
  return n.split(/\s+/).map(capitalise).join(" ");
}

/**
 * True when a login is made from the person's name: "nwikechisom" (whole parts, any order)
 * or "yanvill" (Yannick Villanueva: the start of each part, in order).
 */
function nameMatchesLogin(name: string, login: string): boolean {
  const parts = words(name);
  const l = squash(login);
  if (!parts.length) return false;
  if (parts.every((p) => l.includes(p))) return true;
  const fromPrefixes = (rest: string, i: number): boolean => {
    if (!rest) return true;
    if (i >= parts.length) return false;
    for (let k = parts[i].length; k >= 3; k--) {
      if (rest.startsWith(parts[i].slice(0, k)) && fromPrefixes(rest.slice(k), i + 1)) return true;
    }
    return fromPrefixes(rest, i + 1); // middle names are often skipped
  };
  return l.length >= 5 && fromPrefixes(l, 0);
}

/** "Tom" and "Tom Hext" in the same release are almost certainly one person. */
const firstNameOf = (short: string, full: string) => {
  const s = words(short);
  const f = words(full);
  return s.length === 1 && f.length > 1 && f[0] === s[0];
};

function samePerson(a: Person, b: Person): boolean {
  if (a.login && b.login) return a.login === b.login;
  if (squash(a.name) === squash(b.name)) return true;
  if (a.login && nameMatchesLogin(b.name, a.login)) return true;
  if (b.login && nameMatchesLogin(a.name, b.login)) return true;
  // Older editions stored logins without saying so ("nwikechisom" next to "chisom").
  if (looksLikeLogin(a.name) && nameMatchesLogin(b.name, a.name)) return true;
  if (looksLikeLogin(b.name) && nameMatchesLogin(a.name, b.name)) return true;
  return firstNameOf(a.name, b.name) || firstNameOf(b.name, a.name);
}

const BOT = /\[bot\]$|^github-actions|^dependabot|^renovate/i;
const looksLikeLogin = (name: string) => /^[a-z0-9-]+$/i.test(name) && name.length >= 5;
const isLogin = (p: Person) => Boolean(p.login && p.name === p.login);
/** Prefer a real full name over a login or a first name. */
const better = (a: Person, b: Person) => {
  if (isLogin(a) !== isLogin(b)) return !isLogin(a);
  const wa = words(a.name).length;
  const wb = words(b.name).length;
  if (wa !== wb) return wa > wb;
  // Two single words: the one inside the other is the name, the longer one a login.
  return squash(b.name).includes(squash(a.name)) && a.name.length < b.name.length;
};

/**
 * One entry per human. The same person can arrive as a GitHub login (whoever
 * pressed deploy), a git author name and a Linear assignee; keep the fullest
 * real name and whichever avatar we found.
 */
export function uniquePeople(people: Person[]): Person[] {
  const merged: Person[] = [];
  for (const raw of people) {
    if (!raw?.name || BOT.test(raw.name) || (raw.login && BOT.test(raw.login))) continue;
    const p = { ...raw, name: normaliseName(raw.name, raw.login) };
    const match = merged.find((m) => samePerson(m, p));
    if (!match) {
      merged.push(p);
      continue;
    }
    if (better(p, match)) match.name = p.name;
    match.login ??= p.login;
    // A GitHub avatar beats a Linear placeholder.
    if (!match.avatarUrl || (p.login && p.avatarUrl)) match.avatarUrl = p.avatarUrl ?? match.avatarUrl;
  }
  return merged.slice(0, 10);
}
