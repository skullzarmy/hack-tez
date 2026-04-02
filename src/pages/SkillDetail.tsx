/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.min.css";
import { getSkill } from "../lib/skills";

export default function SkillDetail() {
    const { slug } = useParams<{ slug: string }>();
    const skill = slug ? getSkill(slug) : undefined;

    if (!skill) {
        return (
            <div className="container" style={{ paddingBlock: "3rem" }}>
                <p style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>
                    // 404 — skill not found: <span style={{ color: "var(--err, #ff6b6b)" }}>{slug ?? "unknown"}</span>
                </p>
                <Link
                    to="/skills"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--fg-muted)" }}
                >
                    ← back to skills
                </Link>
            </div>
        );
    }

    const downloadUrl = `/skills/${skill.filename}`;

    return (
        <div className="container" style={{ paddingBlock: "3rem" }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                    marginBottom: "2rem",
                    paddingBottom: "1.25rem",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <div>
                    <Link
                        to="/skills"
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.8rem",
                            color: "var(--fg-muted)",
                            textDecoration: "none",
                            display: "block",
                            marginBottom: "0.5rem",
                        }}
                    >
                        ← skills
                    </Link>
                    <h1
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "clamp(1.2rem, 3.5vw, 1.75rem)",
                            letterSpacing: "-0.02em",
                            marginBottom: "0.35rem",
                        }}
                    >
                        {skill.title}
                    </h1>
                    {skill.description && (
                        <p style={{ color: "var(--fg-muted)", fontSize: "0.875rem", maxWidth: "60ch" }}>
                            {skill.description}
                        </p>
                    )}
                </div>

                <a
                    href={downloadUrl}
                    download={skill.filename}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8rem",
                        padding: "0.5rem 1rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--fg)",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        transition: "border-color 0.15s",
                    }}
                >
                    ↓ {skill.filename}
                </a>
            </div>

            {/* Rendered Markdown */}
            <div className="prose prose-invert max-w-none skill-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {skill.raw}
                </ReactMarkdown>
            </div>

            {/* Footer download */}
            <div style={{ marginTop: "3rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
                <a
                    href={downloadUrl}
                    download={skill.filename}
                    style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8rem",
                        color: "var(--fg-muted)",
                        textDecoration: "none",
                    }}
                >
                    ↓ download {skill.filename}
                </a>
            </div>
        </div>
    );
}
