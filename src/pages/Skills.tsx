/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { skills } from "../lib/skills";
import { usePageMeta } from "../hooks/usePageMeta";

export default function Skills() {
    usePageMeta({
        title: "Skills — LLM-ready Tezos reference docs — hack.tez",
        description: "Markdown reference docs for the hack.tez stack: SmartPy, Taquito, Tezos Domains, Beacon SDK, octez.connect, and the hack.tez API. Drop into Cursor, Claude, or your AI editor.",
        path: "/skills",
    });
    return (
        <div className="container" style={{ paddingBlock: "3rem" }}>
            <header style={{ marginBottom: "2.5rem" }}>
                <h1
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "clamp(1.4rem, 4vw, 2rem)",
                        letterSpacing: "-0.02em",
                        marginBottom: "0.5rem",
                    }}
                >
                    // SKILLS
                </h1>
                <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem" }}>
                    LLM-ready reference docs for the hack.tez stack.
                </p>
            </header>

            <ul
                style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                }}
            >
                {skills.map((skill) => (
                    <li key={skill.slug}>
                        <Link to={`/skills/${skill.slug}`} style={{ textDecoration: "none" }}>
                            <div
                                style={{
                                    border: "1px solid var(--border)",
                                    padding: "1.25rem 1.5rem",
                                    background: "var(--bg-card)",
                                    transition: "border-color 0.15s, background 0.15s",
                                }}
                                className="skill-card"
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "baseline",
                                        gap: "0.75rem",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontFamily: "var(--font-mono)",
                                            fontWeight: 600,
                                            fontSize: "1rem",
                                            color: "var(--fg)",
                                        }}
                                    >
                                        {skill.title}
                                    </span>
                                    <span
                                        style={{
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.75rem",
                                            color: "var(--fg-muted)",
                                        }}
                                    >
                                        /skills/{skill.slug}
                                    </span>
                                    <a
                                        href={`/skills/${skill.filename}`}
                                        download={skill.filename}
                                        onClick={(e) => e.stopPropagation()}
                                        title={`Download ${skill.filename}`}
                                        style={{
                                            marginLeft: "auto",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.3rem",
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.7rem",
                                            color: "var(--fg-muted)",
                                            border: "1px solid var(--border)",
                                            padding: "0.2em 0.55em",
                                            textDecoration: "none",
                                            background: "var(--bg)",
                                        }}
                                    >
                                        <Download size={12} aria-hidden="true" /> .md
                                    </a>
                                </div>
                                {skill.description && (
                                    <p
                                        style={{
                                            color: "var(--fg-muted)",
                                            fontSize: "0.875rem",
                                            marginTop: "0.5rem",
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {skill.description}
                                    </p>
                                )}
                                {skill.tags.length > 0 && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: "0.35rem",
                                            marginTop: "0.75rem",
                                        }}
                                    >
                                        {skill.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                style={{
                                                    fontFamily: "var(--font-mono)",
                                                    fontSize: "0.7rem",
                                                    padding: "0.15em 0.5em",
                                                    border: "1px solid var(--border)",
                                                    color: "var(--fg-muted)",
                                                    background: "var(--bg)",
                                                }}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
