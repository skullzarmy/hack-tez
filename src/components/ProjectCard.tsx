/** biome-ignore-all lint/suspicious/noCommentText: <matches Profile> */

import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
    BADGE_STYLE,
    ENV_STYLES,
    PROJECT_STATUS_STYLES,
    projectLogoUrl,
    safeHref,
} from "../lib/profileDisplay";
import type { ProjectEntry } from "../types/profile";
import { projectSlug, tipJarIsLive } from "../types/profile";

/**
 * Project summary card shown on a builder's profile.
 * The title links through to the project's own page at /u/:label/p/:slug.
 */
export function ProjectCard({
    project,
    ownerLabel,
}: {
    project: ProjectEntry;
    /** Domain label of the profile this project belongs to. */
    ownerLabel: string;
}) {
    const envStyle = project.environment
        ? (ENV_STYLES[project.environment] ?? ENV_STYLES.other)
        : null;
    const statusStyle = project.status
        ? (PROJECT_STATUS_STYLES[project.status] ?? null)
        : null;
    const projectUrl = safeHref(project.url);
    const repoUrl = safeHref(project.repo);
    const logoUrl = projectLogoUrl(project.logo);
    const slug = projectSlug(project.name);
    const detailPath = slug ? `/u/${ownerLabel}/p/${slug}` : null;
    const acceptsTips = tipJarIsLive(project.tips);

    return (
        <div
            style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1.25rem",
                display: "flex",
                gap: "1rem",
            }}
        >
            {logoUrl && (
                <img
                    src={logoUrl}
                    alt={`${project.name} logo`}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: "6px",
                        objectFit: "cover",
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                    }}
                />
            )}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                    flex: 1,
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                    }}
                >
                    {detailPath ? (
                        <Link
                            to={detailPath}
                            style={{
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                color: "var(--fg)",
                                textDecoration: "none",
                            }}
                        >
                            {project.name}
                        </Link>
                    ) : (
                        <span
                            style={{
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                color: "var(--fg)",
                            }}
                        >
                            {project.name}
                        </span>
                    )}
                    {statusStyle && project.status && (
                        <span
                            style={{
                                ...BADGE_STYLE,
                                background: statusStyle.bg,
                                color: statusStyle.color,
                                textTransform: "uppercase",
                            }}
                        >
                            {project.status}
                        </span>
                    )}
                    {envStyle && project.environment && (
                        <span
                            style={{
                                ...BADGE_STYLE,
                                background: envStyle.bg,
                                color: envStyle.color,
                            }}
                        >
                            {project.environment}
                        </span>
                    )}
                    {acceptsTips && (
                        <span
                            style={{
                                ...BADGE_STYLE,
                                background: "var(--ok-bg)",
                                color: "var(--ok)",
                                textTransform: "uppercase",
                            }}
                        >
                            tips
                        </span>
                    )}
                </div>
                <p
                    style={{
                        color: "var(--fg-2)",
                        fontSize: "0.8rem",
                        lineHeight: 1.5,
                        margin: 0,
                    }}
                >
                    {project.desc}
                </p>
                <div
                    style={{
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        fontSize: "0.7rem",
                        alignItems: "center",
                    }}
                >
                    {projectUrl && (
                        <a
                            href={projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "var(--ok)",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35em",
                            }}
                        >
                            <ExternalLink size={14} aria-hidden="true" /> Website
                        </a>
                    )}
                    {repoUrl && (
                        <a
                            href={repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg-2)", textDecoration: "none" }}
                        >
                            ⌥ Repo
                        </a>
                    )}
                    {project.address && (
                        <span
                            style={{
                                color: "var(--fg-3)",
                                fontFamily: "var(--font)",
                                letterSpacing: "0.03em",
                            }}
                            title={project.address}
                        >
                            ◎ {project.address.slice(0, 8)}…
                        </span>
                    )}
                    {detailPath && (
                        <Link
                            to={detailPath}
                            style={{
                                color: "var(--fg-3)",
                                textDecoration: "none",
                                marginLeft: "auto",
                            }}
                        >
                            Details →
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
