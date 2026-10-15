export interface Media {
  url: string;
  kind: "image" | "video";
  caption?: string;
}

export interface Person {
  name: string;
  avatarUrl?: string;
}

/** One ticket (or commit) that went out in a release. */
export interface Story {
  id: string;
  identifier?: string;
  title: string;
  /** One plain-English line, written for the whole office. */
  line?: string;
  url?: string;
  team?: string;
  project?: string;
  assignee?: Person;
  media: Media[];
}

export interface Headline {
  kicker: string;
  headline: string;
  subhead: string;
  blurb: string;
}

/** One release = one edition of the paper. */
export interface Edition {
  id: string;
  number: number;
  source: "github" | "linear" | "announce" | "demo";
  sourceLabel: string;
  url?: string;
  version?: string;
  shippedAt: string;
  shippedBy: Person[];
  stories: Story[];
  /** Commit subjects that didn't map to a ticket. */
  otherChanges: string[];
  headline: Headline;
}

export interface PaperConfig {
  paperName: string;
  motto: string;
  celebrateSeconds: number;
  demo: boolean;
}

export interface WireStatus {
  ok: boolean;
  lastPollAt?: string;
  errors: string[];
  sources: string[];
}
