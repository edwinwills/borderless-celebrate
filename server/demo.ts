import type { Edition } from "../shared/types.ts";

type DemoEdition = Omit<Edition, "id" | "number" | "shippedAt">;

const people = {
  priya: { name: "Priya Shah" },
  tom: { name: "Tom Okafor" },
  mei: { name: "Mei Lin" },
  sam: { name: "Sam Rees" },
};

export const DEMO_EDITIONS: DemoEdition[] = [
  {
    source: "demo",
    sourceLabel: "Deploy Prod #812, getborderless/borderless",
    version: "a41c9e2",
    shippedBy: [people.priya, people.tom],
    headline: {
      kicker: "Hold the front page",
      headline: "CoS-mic! Certificates in half the clicks",
      subhead: "Employers can now request a Certificate of Sponsorship from the candidate's profile in one go.",
      blurb:
        "No more hopping between three screens. The new request flow pre-fills everything we already know, so HR teams spend minutes, not afternoons.",
    },
    stories: [
      {
        id: "d1",
        identifier: "BDLS-14310",
        title: "One-step CoS request from candidate profile",
        line: "Request a CoS straight from the candidate page",
        media: [
          { url: "/demo/cos-request.svg", kind: "image", caption: "BDLS-14310: the new one-step CoS request" },
          { url: "/demo/dashboard.svg", kind: "image", caption: "BDLS-14322: sponsor dashboard, now with deadlines" },
        ],
        assignee: people.priya,
      },
      {
        id: "d2",
        identifier: "BDLS-14322",
        title: "Show visa expiry deadlines on sponsor dashboard",
        line: "Upcoming visa expiries now sit on the dashboard",
        media: [],
        assignee: people.tom,
      },
      {
        id: "d3",
        identifier: "BDLS-14329",
        title: "Fix date picker jumping a month on Safari",
        line: "Safari's date picker stops time-travelling",
        media: [],
      },
    ],
    otherChanges: ["Upgrade CDK to 2.190", "Tidy sponsor licence fixtures"],
  },
  {
    source: "demo",
    sourceLabel: "Moved to Done in Linear",
    shippedBy: [people.mei],
    headline: {
      kicker: "Exclusive",
      headline: "Right to Work checks get a speed boost",
      subhead: "Share codes are now checked automatically the moment a candidate enters one.",
      blurb: "Ops no longer need to copy share codes across by hand. Results land on the candidate's timeline within seconds.",
    },
    stories: [
      {
        id: "d4",
        identifier: "BDLS-14288",
        title: "Automatic share code verification",
        line: "Share codes get checked the moment they're entered",
        media: [{ url: "/demo/dashboard.svg", kind: "image", caption: "BDLS-14288: verification result on the timeline" }],
        assignee: people.mei,
      },
    ],
    otherChanges: [],
  },
  {
    source: "demo",
    sourceLabel: "Deploy Prod #809, getborderless/borderless",
    version: "77b0d1f",
    shippedBy: [people.sam],
    headline: {
      kicker: "Read all about it",
      headline: "Bug squashed: emails stop playing hide and seek",
      subhead: "Invite emails to candidates with plus-addresses now arrive first time.",
      blurb: "A small fix with a big sigh of relief for customer success. Fewer 'I never got the email' chats this week.",
    },
    stories: [
      {
        id: "d5",
        identifier: "BDLS-14301",
        title: "Plus-addressed emails rejected by invite form",
        line: "Invites to name+tag@ addresses now go through",
        media: [],
        assignee: people.sam,
      },
    ],
    otherChanges: ["Add retry to SES bounce handler"],
  },
];
