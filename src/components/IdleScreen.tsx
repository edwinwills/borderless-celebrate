import { useEffect, useState } from "react";
import type { Edition, PaperConfig, WireStatus } from "../../shared/types.ts";

function ago(iso: string, now: number) {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const numberWords = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** What's on the TV between releases: no paper, just the presses waiting. */
export function IdleScreen({
  paper,
  editions,
  status,
}: {
  paper: PaperConfig;
  editions: Edition[];
  status?: WireStatus;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const today = new Date(now);
  const todays = editions.filter((e) => sameDay(new Date(e.shippedAt), today)).length;
  const latest = editions[0];
  const countText =
    todays === 0
      ? "Nothing's gone live yet today."
      : `${numberWords[todays] ?? todays} release${todays === 1 ? "" : "s"} so far today.`;

  return (
    <div className="idle">
      <h1 className="idle-title">{paper.paperName}</h1>
      <p className="idle-motto">{paper.motto}</p>
      <p className="idle-clock">{today.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
      <p className="idle-date">
        {today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}. {countText}
      </p>
      {latest ? (
        <div className="idle-latest">
          <p>Last off the press, {ago(latest.shippedAt, now)}</p>
          <h2>{latest.headline.headline}</h2>
        </div>
      ) : (
        <div className="idle-latest">
          <p>The presses are warm</p>
          <h2>
            {status?.sources.length
              ? "Waiting for the first release"
              : "Set GITHUB_SOURCES in .env to start watching for releases"}
          </h2>
        </div>
      )}
    </div>
  );
}
