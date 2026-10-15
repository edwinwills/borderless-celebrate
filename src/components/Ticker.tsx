import type { Edition, WireStatus } from "../../shared/types.ts";

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

export function Ticker({ editions, status, position }: { editions: Edition[]; status?: WireStatus; position?: string }) {
  const items = editions.slice(0, 12).flatMap((e) =>
    e.stories.length
      ? e.stories.slice(0, 4).map((s) => `${s.identifier ? `${s.identifier}  ` : ""}${s.line || s.title}`)
      : [e.headline.headline],
  );
  const text = items.length ? items : ["Waiting for the first release of the day"];

  return (
    <footer className="ticker">
      <div className="ticker-label">Latest</div>
      <div className="ticker-track">
        {/* Two copies so the loop is seamless */}
        <div className="ticker-run" style={{ animationDuration: `${Math.max(30, text.join("").length / 6)}s` }}>
          {[0, 1].map((copy) => (
            <span key={copy} aria-hidden={copy === 1}>
              {text.map((t, i) => (
                <span key={i} className="ticker-item">
                  {t}
                  <span className="ticker-sep">◆</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className={`wire ${status && !status.ok ? "wire-down" : ""}`} title={status?.errors.join("\n")}>
        <span className="wire-dot" />
        {status
          ? status.ok
            ? `Wire checked ${time(status.lastPollAt)}`
            : `Wire trouble: ${status.errors[0]?.slice(0, 60)}`
          : "Connecting to the wire"}
        {position && <span className="wire-position">{position}</span>}
      </div>
    </footer>
  );
}
