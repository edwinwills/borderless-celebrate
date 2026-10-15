import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import type { Edition } from "../shared/types.ts";

const FILE = path.resolve(config.dataDir, "state.json");
const MAX_EDITIONS = 150;
const MAX_SEEN = 5000;

interface State {
  counter: number;
  editions: Edition[];
  seen: string[];
  /** Arbitrary per-source bookmarks: last deployed SHA, last poll time, etc. */
  cursors: Record<string, string>;
}

function load(): State {
  try {
    return { counter: 0, editions: [], seen: [], cursors: {}, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return { counter: 0, editions: [], seen: [], cursors: {} };
  }
}

const state = load();
const seen = new Set(state.seen);

function save() {
  state.seen = [...seen].slice(-MAX_SEEN);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export const store = {
  hasSeen: (key: string) => seen.has(key),
  markSeen(...keys: string[]) {
    keys.forEach((k) => seen.add(k));
    save();
  },
  cursor: (key: string) => state.cursors[key],
  setCursor(key: string, value: string) {
    state.cursors[key] = value;
    save();
  },
  nextNumber: () => ++state.counter,
  addEdition(edition: Edition) {
    state.editions = [edition, ...state.editions.filter((e) => e.id !== edition.id)]
      .sort((a, b) => b.shippedAt.localeCompare(a.shippedAt))
      .slice(0, MAX_EDITIONS);
    save();
  },
  editions: (limit = 30) => state.editions.slice(0, limit),
};
