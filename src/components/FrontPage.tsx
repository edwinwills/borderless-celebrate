import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Edition, Media, PaperConfig, Person } from "../../shared/types.ts";

/** Shrink text until it fits its box. Headlines vary from 2 words to 12. */
function useFitText<T extends HTMLElement>(text: string, max: number, min: number) {
  const ref = useRef<T>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    let size = max;
    el.style.fontSize = `${size}px`;
    // Tight line-height lets glyphs overhang the box slightly, so allow a little slack;
    // a genuinely overflowing extra line is a whole line-height over.
    const overflows = () => el.scrollHeight > el.clientHeight + size * 0.3 || el.scrollWidth > el.clientWidth + 1;
    while (size > min && overflows()) {
      size -= 4;
      el.style.fontSize = `${size}px`;
    }
  };
  useLayoutEffect(fit, [text, max, min]);
  useEffect(() => {
    document.fonts?.ready.then(fit);
  }, [text]);
  return ref;
}

function MediaReel({ media }: { media: Media[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (media.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % media.length), 8000);
    return () => clearInterval(t);
  }, [media]);
  return (
    <figure className="reel">
      <div className="reel-frame">
        {media.map((m, n) => (
          <div key={m.url} className={`reel-slide ${n === i ? "is-on" : ""}`}>
            {m.kind === "video" ? (
              <video src={m.url} autoPlay muted loop playsInline />
            ) : (
              <img src={m.url} alt={m.caption ?? ""} />
            )}
          </div>
        ))}
      </div>
      <figcaption>
        <span className="reel-pictured">Pictured</span> {media[i]?.caption}
        {media.length > 1 && (
          <span className="reel-count">
            {i + 1} of {media.length}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function initials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function Byline({ people }: { people: Person[] }) {
  if (!people.length) return null;
  const names = people.map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return (
    <div className="byline">
      <div className="byline-faces">
        {people.slice(0, 6).map((p) =>
          p.avatarUrl ? (
            <img key={p.name} src={p.avatarUrl} alt="" />
          ) : (
            <span key={p.name}>{initials(p.name)}</span>
          ),
        )}
      </div>
      <p>
        Shipped by <strong>{list}</strong>
      </p>
    </div>
  );
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function FrontPage({
  edition,
  paper,
  celebrating,
}: {
  edition: Edition;
  paper: PaperConfig;
  celebrating: boolean;
}) {
  const media = edition.stories.flatMap((s) => s.media).slice(0, 8);
  const hasMedia = media.length > 0;
  const headlineRef = useFitText<HTMLHeadingElement>(edition.headline.headline, hasMedia ? 132 : 210, 60);
  const shown = edition.stories.slice(0, hasMedia ? 4 : 6);
  const hidden = edition.stories.length - shown.length + edition.otherChanges.length;

  return (
    <article className={`paper ${hasMedia ? "has-media" : "no-media"}`}>
      <header className="masthead">
        <div className="masthead-ear">
          {celebrating ? (
            <div className="extra">Extra!</div>
          ) : (
            <>
              <span className="ear-big">No. {edition.number}</span>
              <span>Late edition</span>
            </>
          )}
        </div>
        <h1 className="masthead-title">{paper.paperName}</h1>
        <div className="masthead-ear masthead-ear-right">
          <span className="ear-big">{clock(edition.shippedAt)}</span>
          <span>Price: one round of applause</span>
        </div>
      </header>
      <div className="dateline">
        <span>{longDate(edition.shippedAt)}</span>
        <em>{paper.motto}</em>
        <span>{edition.version ? `Build ${edition.version}` : edition.source === "linear" ? "Via Linear" : "Now live"}</span>
      </div>

      <section className="lead">
        <p className="kicker">{edition.headline.kicker}</p>
        <h2 className="headline" ref={headlineRef}>
          {edition.headline.headline}
        </h2>
        <p className="subhead">{edition.headline.subhead}</p>
      </section>

      <section className="body">
        {hasMedia && <MediaReel media={media} />}
        <div className="columns">
          <p className="blurb">{edition.headline.blurb}</p>
          {shown.length > 0 && (
            <div className="contents">
              <h3>In this edition</h3>
              <ul>
                {shown.map((s) => (
                  <li key={s.id}>
                    {s.identifier && <span className="ticket">{s.identifier}</span>}
                    <span>{s.line || s.title}</span>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <p className="more">
                  Plus {hidden} more {hidden === 1 ? "change" : "changes"} in this release
                </p>
              )}
            </div>
          )}
          <Byline people={edition.shippedBy} />
        </div>
      </section>
      <p className="source">{edition.sourceLabel}</p>
    </article>
  );
}
