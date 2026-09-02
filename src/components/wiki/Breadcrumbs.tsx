
export interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: "1rem" }}>
      <ol style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        flexWrap: "wrap",
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        color: "var(--fg-3)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        {items.map((it, idx) => {
          const isLast = idx === items.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a breadcrumb trail is positional by definition and is rebuilt from the route each render
            <li key={`${it.label}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              {it.href && !isLast ? (
                <a href={it.href} style={{ color: "var(--fg-3)", textDecoration: "none" }}>{it.label}</a>
              ) : (
                <span style={{ color: "var(--fg)" }}>{it.label}</span>
              )}
              {!isLast && <span style={{ opacity: 0.5 }}>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
