import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import { fetchImageForModel } from "./linear.ts";
import type { Headline, Story } from "../shared/types.ts";

let client: Anthropic | null = null;
let disabledReason = "";

function getClient(): Anthropic | null {
  if (disabledReason) return null;
  if (!client) {
    try {
      client = new Anthropic();
    } catch (err) {
      disabledReason = (err as Error).message;
      console.log(`[headline] No Anthropic credentials, using template headlines (${disabledReason})`);
      return null;
    }
  }
  return client;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kicker", "headline", "subhead", "blurb", "lines"],
  properties: {
    kicker: { type: "string", description: "1–3 words above the headline, e.g. 'Exclusive', 'Hold the front page'" },
    headline: { type: "string", description: "Tabloid headline, at most 7 words" },
    subhead: { type: "string", description: "One sentence, at most 22 words, saying plainly what is now live" },
    blurb: { type: "string", description: "Two short sentences, at most 50 words, for non-technical colleagues" },
    lines: {
      type: "array",
      description: "One entry per story, same order as given",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "line"],
        properties: {
          id: { type: "string" },
          line: { type: "string", description: "At most 12 words, plain English, what changed for users" },
        },
      },
    },
  },
} as const;

interface HeadlineResult extends Headline {
  lines: { id: string; line: string }[];
}

const SYSTEM = `You are the sub-editor of ${config.paperName}, a cheeky British tabloid-style company newspaper shown on the office TV whenever product changes go live.
${config.companyContext}

Write the front page for one release. Your readers are the whole office: sales, ops, customer success, engineers. Make them smile and tell them what's new.

- Headline: punchy, punny, tabloid energy, at most 7 words. Puns on the feature itself beat generic "shipped!" lines.
- Stay truthful. Only describe what the tickets and commits actually say. Don't invent numbers, customers or quotes.
- Lead with the most user-visible change; mention fixes and chores only if that's all there is.
- Plain English. No ticket IDs, PR numbers or internal jargon in the headline, subhead or blurb.
- British spelling. Celebratory, never sarcastic about colleagues.`;

function describe(stories: Story[], otherChanges: string[], context: string, ticketText: Map<string, string>): string {
  const parts = [`Release: ${context}`];
  if (stories.length) {
    parts.push(
      "Stories:",
      ...stories.map((s) =>
        [
          `- id: ${s.id}`,
          `  title: ${s.identifier ? `${s.identifier} ` : ""}${s.title}`,
          s.project ? `  project: ${s.project}` : "",
          ticketText.get(s.id) ? `  details: ${ticketText.get(s.id)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }
  if (otherChanges.length) parts.push("Other commits:", ...otherChanges.slice(0, 30).map((c) => `- ${c}`));
  return parts.join("\n");
}

function originalUrl(url: string): string {
  return url.startsWith("/api/media?u=") ? decodeURIComponent(url.slice("/api/media?u=".length)) : url;
}

/**
 * Ask Claude for a front page. `ticketText` maps story id → description text
 * (trimmed), giving the model more than just the title to go on.
 */
export async function writeHeadline(
  stories: Story[],
  otherChanges: string[],
  context: string,
  ticketText = new Map<string, string>(),
): Promise<{ headline: Headline; lines: Map<string, string> }> {
  const fallback = { headline: templateHeadline(stories, otherChanges), lines: new Map<string, string>() };
  const anthropic = getClient();
  if (!anthropic) return fallback;

  const images = (
    await Promise.all(
      stories
        .flatMap((s) => s.media.filter((m) => m.kind === "image"))
        .slice(0, 2)
        .map((m) => fetchImageForModel(originalUrl(m.url))),
    )
  ).filter((x) => x !== null);

  try {
    const response = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
            })),
            {
              type: "text" as const,
              text: `${images.length ? "Screenshots from the tickets are attached.\n\n" : ""}${describe(stories, otherChanges, context, ticketText)}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return fallback;
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const result = JSON.parse(text) as HeadlineResult;
    return {
      headline: { kicker: result.kicker, headline: result.headline, subhead: result.subhead, blurb: result.blurb },
      lines: new Map(result.lines.map((l) => [l.id, l.line])),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /authentication/i.test((err as Error).message)) {
      disabledReason = "no working Anthropic credentials";
      console.log("[headline] No working Anthropic credentials, so headlines come from templates. Set ANTHROPIC_API_KEY for proper ones.");
    } else {
      console.warn("[headline] Falling back to a template headline:", (err as Error).message);
    }
    return fallback;
  }
}

const KICKERS = ["Hold the front page", "Exclusive", "Stop the presses", "Hot off the press", "Read all about it"];
const SHOUTS = ["It's live!", "Shipped!", "Out now!", "Fresh off the press!", "Now showing!"];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function templateHeadline(stories: Story[], otherChanges: string[]): Headline {
  const lead = stories[0]?.title ?? otherChanges[0] ?? "A fresh release";
  const count = stories.length + otherChanges.length;
  return {
    kicker: pick(KICKERS),
    headline: pick(SHOUTS),
    subhead: lead,
    blurb:
      count > 1
        ? `This release carried ${count} changes. Have a look below and give the team a cheer.`
        : "Now live for everyone. Give the team a cheer.",
  };
}
