# The Borderless Bugle 📰

A newspaper front page for the office TV. Every time something goes live, a fresh edition comes whirling out of the middle of the screen like an old newsreel spinner, with a tabloid headline, screenshots from the Linear tickets, who shipped it, and confetti. After the celebration it spins away again.

Between releases there's no paper on screen, just the masthead, a big clock, how many releases have gone out today and the last headline.

## Quick start

```bash
npm install
cp .env.example .env      # then fill in the tokens
npm run dev               # http://localhost:5173
```

Want to see it before setting up any tokens? `DEMO=true npm run dev`, then press **T** to print a test edition.

For the TV, build once and run the single server:

```bash
npm run build
npm start                 # http://<this machine>:8787
```

Open that URL on the TV's browser (or a Chromecast / Fire Stick / spare laptop) and press **F** for fullscreen.

## Where releases come from

| Source | How it works |
| --- | --- |
| GitHub Actions (default) | Each successful run of a deploy workflow counts as a release. The commits since the previous deploy are scanned for ticket IDs (`BDLS-123`). |
| GitHub Deployments | `owner/repo:deployments:production`. A deployment whose latest status is `success`. |
| GitHub Releases | `owner/repo:releases`. Published releases; ticket IDs come from the release notes. |
| Linear states | Optional. Set `LINEAR_WATCH_STATES=Done` to also celebrate tickets moved into those states. Tickets already celebrated through a deploy are skipped. |
| `POST /api/announce` | For anything else: have CI post `{ "title": "…", "tickets": ["BDLS-1"], "by": "name" }` with `Authorization: Bearer $ANNOUNCE_TOKEN`. |

The default `.env.example` watches `deploy-prod.yml` and `deploy-preprod-to-prod.yml` in `getborderless/borderless`. Prod promotions run the deploy as a reusable workflow, so the runs show up under the calling workflow. That's why both are listed.

With `LINEAR_API_KEY` set, ticket IDs become real titles, assignees and media. Images and screen recordings in the ticket description, comments and attachments go into the photo reel. Linear uploads need auth, so the server proxies them through `/api/media`. Only `uploads.linear.app` is proxied.

## Headlines

With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5-5`, low effort) writes each front page from the ticket titles, descriptions and up to two screenshots: kicker, headline, subhead, blurb, and a one-line plain-English summary per ticket. It's told to stay truthful and avoid jargon. Server-side refusal fallback (`fallbacks: "default"`) is switched on. Without a key, or if the call fails, you get template headlines ("It's live!") with the ticket title as the subhead.

Set `COMPANY_CONTEXT` so the puns land.

## On the screen

| Key | Does |
| --- | --- |
| T | Print a test edition (with celebration) |
| R | Replay the latest release's celebration, on this screen only (for demos) |
| F | Fullscreen |
| S | Fanfare on/off (browsers block sound until the page has had a key press or click) |
| ← | Go back through past releases, newest first |
| → | Come forward again; past the newest it returns to the clock (it also does after 30 seconds) |
| Space / Esc | Spin the current paper away |

The ticker at the bottom shows recent changes and when the server last checked for releases. The dot turns red with the error if GitHub or Linear can't be reached.

## Notes

- State lives in `data/state.json`. Delete it to start over. On first run each source backfills its last `BACKFILL` deploys from the past `BACKFILL_DAYS` days (14 by default) without celebrating, so the screen isn't empty.
- Polling runs every `POLL_SECONDS` (60 by default). A GitHub token is needed for private repos. Fine-grained with read access to Actions, Contents and Deployments is enough.
- The page is laid out at 1920×1080 and scales to fit any screen.

## Hosting it

It needs a host that keeps one Node process running, so not Vercel or Netlify.

### Render (free)

`render.yaml` sets it up on Render's free plan. In Render: **New → Blueprint**, pick this repo, and paste in `GITHUB_TOKEN`, `LINEAR_API_KEY`, `ANTHROPIC_API_KEY` and a long random `BASIC_AUTH_PASSWORD` when asked.

The free plan sleeps after 15 minutes without requests. The TV page checks in every 30 seconds, so it's awake whenever the TV is on; when it's off, nothing is watched. There's no disk on the free plan either, so editions reset on each restart and the first poll rebuilds the last `BACKFILL_DAYS` of releases. For an always-on paper with lasting history, use Render's Starter plan with a disk at `/data`, or Railway.

### Railway

Railway keeps it running with a persistent disk for about $5 a month:

1. Push this folder to a private GitHub repo. `.env` and `data/` are gitignored, and `.dockerignore` keeps them out of the image.
2. In Railway: **New project → Deploy from GitHub repo**. It finds the `Dockerfile`.
3. **Variables**: add everything from your `.env`, plus a long random `BASIC_AUTH_PASSWORD`. Don't set `PORT`; Railway provides it.
4. **Volume**: add one mounted at `/data`, so editions survive redeploys.
5. **Settings → Networking → Generate domain**, and set the health check path to `/healthz`.

Secrets are only ever read by the server. The browser code never sees environment variables, and nothing in the API sends them back.

With `BASIC_AUTH_PASSWORD` set, everything except `/healthz` and `/api/announce` (which has its own token) asks for a username and password. Sign in once on the TV's browser and it remembers.
