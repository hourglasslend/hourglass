import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";

export type TocItem = { id: string; label: string };

/** Shell for the static reading pages (Docs, Risks, Terms, Privacy): marketing nav, sticky contents, footer.
 *  No wallet code is loaded here. */
export function DocPage({ eyebrow, title, intro, updated, toc, children }: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  updated?: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="m">
      <SiteNav />
      <div className="wrap doc">
        <aside className="toc">
          <div className="eyebrow">Contents</div>
          {toc.map((t) => <a key={t.id} href={`#${t.id}`}>{t.label}</a>)}
        </aside>
        <article className="prose">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {intro ? <p className="intro">{intro}</p> : null}
          {updated ? <p className="updated">Last updated · {updated}</p> : null}
          {children}
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}

export function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
