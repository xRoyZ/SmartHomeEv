import type { ReactNode } from "react";

export interface PageHeadProps {
  /** The page's one h1 (page-title). */
  title: ReactNode;
  /** The lead paragraph under it (page-intro). */
  intro?: ReactNode;
  children?: ReactNode;
}

/** The design's `.page-head`: page title and intro (e.g. design/mockups/alarme.html:43). */
export function PageHead({ title, intro, children }: PageHeadProps) {
  return (
    <section className="page-head">
      <h1 className="page-title">{title}</h1>
      {intro !== undefined && <p className="page-intro">{intro}</p>}
      {children}
    </section>
  );
}

export default PageHead;
