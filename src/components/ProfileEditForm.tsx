/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { getDomainRecord } from "../lib/domains";
import { submitProfileUpdate } from "../lib/contract";
import type { DomainRecord } from "../lib/domains";
import type { HackProfile, ProjectEntry, BuilderStatus } from "../types/profile";
import { isValidUrl } from "../types/profile";

// ── Shared Input Styles ──────────────────────────────────────────────

const INPUT_BASE: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-2)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "0.5rem 0.65rem",
    color: "var(--fg)",
    fontFamily: "var(--font)",
    fontSize: "0.8rem",
    outline: "none",
    boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: "0.65rem",
    color: "var(--fg-3)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "0.35rem",
};

const SELECT_STYLE: React.CSSProperties = {
    ...INPUT_BASE,
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.6rem center",
    paddingRight: "1.8rem",
    cursor: "pointer",
};

const SECTION_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginBottom: "1.25rem",
};

const STATUS_OPTIONS: readonly { value: BuilderStatus | ""; label: string }[] = [
    { value: "", label: "None" },
    { value: "building", label: "Building" },
    { value: "open-to-collab", label: "Open to Collab" },
    { value: "available", label: "Available" },
    { value: "hiring", label: "Hiring" },
];

const ENVIRONMENT_OPTIONS: readonly { value: string; label: string }[] = [
    { value: "", label: "None" },
    { value: "web", label: "Web" },
    { value: "tezos", label: "Tezos" },
    { value: "etherlink", label: "Etherlink" },
    { value: "tezlink", label: "Tezlink" },
    { value: "other", label: "Other" },
];

const PROJECT_STATUS_OPTIONS: readonly { value: string; label: string }[] = [
    { value: "", label: "None" },
    { value: "live", label: "Live" },
    { value: "wip", label: "WIP" },
    { value: "archived", label: "Archived" },
    { value: "open-source", label: "Open Source" },
];

// ── Skill Tag Input ──────────────────────────────────────────────────

function SkillTagInput({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
    const [input, setInput] = useState("");

    const addSkill = useCallback(
        (raw: string) => {
            const tag = raw.trim().slice(0, 30).toLowerCase();
            if (!tag || skills.includes(tag) || skills.length >= 10) return;
            onChange([...skills, tag]);
        },
        [skills, onChange],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill(input);
                setInput("");
            } else if (e.key === "Backspace" && input === "" && skills.length > 0) {
                onChange(skills.slice(0, -1));
            }
        },
        [input, skills, addSkill, onChange],
    );

    return (
        <div>
            <label style={LABEL_STYLE}>Skills ({skills.length}/10)</label>
            <div
                style={{
                    ...INPUT_BASE,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.3rem",
                    padding: "0.35rem 0.5rem",
                    minHeight: "2.2rem",
                    alignItems: "center",
                }}
            >
                {skills.map((skill) => (
                    <span
                        key={skill}
                        style={{
                            background: "rgba(148,163,184,0.15)",
                            color: "var(--fg-2)",
                            border: "1px solid var(--border)",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "9999px",
                            fontSize: "0.7rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {skill}
                        <button
                            type="button"
                            onClick={() => onChange(skills.filter((s) => s !== skill))}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--fg-3)",
                                cursor: "pointer",
                                padding: 0,
                                fontSize: "0.75rem",
                                lineHeight: 1,
                            }}
                            aria-label={`Remove ${skill}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {skills.length < 10 && (
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => {
                            if (input.trim()) {
                                addSkill(input);
                                setInput("");
                            }
                        }}
                        placeholder={skills.length === 0 ? "Type a skill, press Enter…" : ""}
                        style={{
                            background: "none",
                            border: "none",
                            outline: "none",
                            color: "var(--fg)",
                            fontFamily: "var(--font)",
                            fontSize: "0.8rem",
                            flex: 1,
                            minWidth: "80px",
                            padding: "0.15rem 0",
                        }}
                        maxLength={30}
                    />
                )}
            </div>
        </div>
    );
}

// ── Project Editor ───────────────────────────────────────────────────

function emptyProject(): ProjectEntry {
    return { name: "", desc: "" };
}

function ProjectEditor({
    project,
    index,
    onChange,
    onRemove,
}: {
    project: ProjectEntry;
    index: number;
    onChange: (p: ProjectEntry) => void;
    onRemove: () => void;
}) {
    const update = useCallback(
        (field: keyof ProjectEntry, value: string) => {
            onChange({ ...project, [field]: value || undefined });
        },
        [project, onChange],
    );

    return (
        <div
            style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--fg-3)" }}>
                    PROJECT {index + 1}
                </span>
                <button
                    type="button"
                    onClick={onRemove}
                    style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--fg-3)",
                        cursor: "pointer",
                        fontSize: "0.65rem",
                        padding: "0.15rem 0.5rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                    }}
                >
                    Remove
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label style={LABEL_STYLE}>Name *</label>
                    <input
                        type="text"
                        value={project.name}
                        onChange={(e) => update("name", e.target.value.slice(0, 60))}
                        style={INPUT_BASE}
                        maxLength={60}
                        placeholder="Project name"
                    />
                </div>
                <div>
                    <label style={LABEL_STYLE}>Status</label>
                    <select
                        value={project.status ?? ""}
                        onChange={(e) => update("status", e.target.value)}
                        style={SELECT_STYLE}
                    >
                        {PROJECT_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label style={LABEL_STYLE}>Description * ({(project.desc ?? "").length}/120)</label>
                <textarea
                    value={project.desc}
                    onChange={(e) => update("desc", e.target.value.slice(0, 120))}
                    style={{ ...INPUT_BASE, resize: "vertical", minHeight: "2.5rem" }}
                    maxLength={120}
                    rows={2}
                    placeholder="Short project description"
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label style={LABEL_STYLE}>Website URL</label>
                    <input
                        type="url"
                        value={project.url ?? ""}
                        onChange={(e) => update("url", e.target.value)}
                        style={INPUT_BASE}
                        placeholder="https://..."
                    />
                </div>
                <div>
                    <label style={LABEL_STYLE}>Repo URL</label>
                    <input
                        type="url"
                        value={project.repo ?? ""}
                        onChange={(e) => update("repo", e.target.value)}
                        style={INPUT_BASE}
                        placeholder="https://github.com/..."
                    />
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label style={LABEL_STYLE}>Environment</label>
                    <select
                        value={project.environment ?? ""}
                        onChange={(e) => update("environment", e.target.value)}
                        style={SELECT_STYLE}
                    >
                        {ENVIRONMENT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={LABEL_STYLE}>Address</label>
                    <input
                        type="text"
                        value={project.address ?? ""}
                        onChange={(e) => update("address", e.target.value)}
                        style={INPUT_BASE}
                        placeholder={project.environment === "tezos" ? "KT1… or tz1…" : "Contract address"}
                    />
                </div>
            </div>

            <div>
                <label style={LABEL_STYLE}>Logo URL</label>
                <input
                    type="text"
                    value={project.logo ?? ""}
                    onChange={(e) => update("logo", e.target.value)}
                    style={INPUT_BASE}
                    placeholder="https://... or ipfs://..."
                />
            </div>
        </div>
    );
}

// ── Validation ───────────────────────────────────────────────────────

interface ValidationErrors {
    website?: string;
    projects?: Record<number, Record<string, string>>;
}

function validateForm(form: HackProfile): ValidationErrors {
    const errors: ValidationErrors = {};

    if (form.website && !isValidUrl(form.website)) {
        errors.website = "Must start with https:// or ipfs://";
    }

    if (form.projects && form.projects.length > 0) {
        const projectErrors: Record<number, Record<string, string>> = {};
        form.projects.forEach((p, i) => {
            const pErr: Record<string, string> = {};
            if (!p.name.trim()) pErr.name = "Name is required";
            if (!p.desc.trim()) pErr.desc = "Description is required";
            if (p.url && !isValidUrl(p.url)) pErr.url = "Must start with https:// or ipfs://";
            if (p.repo && !isValidUrl(p.repo)) pErr.repo = "Must start with https:// or ipfs://";
            if (p.logo && !isValidUrl(p.logo)) pErr.logo = "Must start with https:// or ipfs://";
            if (Object.keys(pErr).length > 0) projectErrors[i] = pErr;
        });
        if (Object.keys(projectErrors).length > 0) errors.projects = projectErrors;
    }

    return errors;
}

function hasValidationErrors(errors: ValidationErrors): boolean {
    return !!(errors.website || (errors.projects && Object.keys(errors.projects).length > 0));
}

// ── Deep clone for snapshot ──────────────────────────────────────────

function snapshotProfile(p: HackProfile): HackProfile {
    return JSON.parse(JSON.stringify(p));
}

function profilesEqual(a: HackProfile, b: HackProfile): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

// ── Main Hook ────────────────────────────────────────────────────────

export interface ProfileEditState {
    editing: boolean;
    form: HackProfile;
    submitting: boolean;
    submitError: string | null;
    submitSuccess: boolean;
    staleWarning: boolean;
    hasChanges: boolean;
    enterEditMode: (profile: HackProfile) => void;
    exitEditMode: () => void;
    updateField: <K extends keyof HackProfile>(key: K, value: HackProfile[K]) => void;
    updateProject: (index: number, project: ProjectEntry) => void;
    removeProject: (index: number) => void;
    addProject: () => void;
    handleSubmit: () => Promise<void>;
    confirmStaleOverwrite: () => void;
}

export function useProfileEdit(
    label: string,
    fullName: string,
    record: DomainRecord | null,
    onRefresh: () => void,
): ProfileEditState {
    const [searchParams, setSearchParams] = useSearchParams();
    const { address: walletAddress, client } = useTezos();
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<HackProfile>({});
    const [snapshot, setSnapshot] = useState<HackProfile>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [staleWarning, setStaleWarning] = useState(false);
    const staleOverrideRef = useRef(false);

    const hasChanges = editing && !profilesEqual(form, snapshot);

    // Enter edit mode from ?edit=true
    useEffect(() => {
        if (searchParams.get("edit") === "true" && record && !editing) {
            const isOwner = walletAddress !== null && walletAddress === record.owner;
            if (isOwner) {
                const copy = snapshotProfile(record.profile);
                setForm(copy);
                setSnapshot(snapshotProfile(record.profile));
                setEditing(true);
                setSubmitError(null);
                setSubmitSuccess(false);
                setStaleWarning(false);
                staleOverrideRef.current = false;
                setSearchParams({}, { replace: true });
            }
        }
    }, [searchParams, record, walletAddress, editing, setSearchParams]);

    // Unsaved changes warning
    useEffect(() => {
        if (!hasChanges) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [hasChanges]);

    // Clear success message
    useEffect(() => {
        if (!submitSuccess) return;
        const t = setTimeout(() => setSubmitSuccess(false), 4000);
        return () => clearTimeout(t);
    }, [submitSuccess]);

    function enterEditMode(profile: HackProfile) {
        const copy = snapshotProfile(profile);
        setForm(copy);
        setSnapshot(snapshotProfile(profile));
        setEditing(true);
        setSubmitError(null);
        setSubmitSuccess(false);
        setStaleWarning(false);
        staleOverrideRef.current = false;
    }

    function exitEditMode() {
        setEditing(false);
        setForm({});
        setSnapshot({});
        setSubmitError(null);
        setStaleWarning(false);
        staleOverrideRef.current = false;
    }

    function updateField<K extends keyof HackProfile>(key: K, value: HackProfile[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function updateProject(index: number, project: ProjectEntry) {
        setForm((prev) => {
            const projects = [...(prev.projects ?? [])];
            projects[index] = project;
            return { ...prev, projects };
        });
    }

    function removeProject(index: number) {
        setForm((prev) => {
            const projects = [...(prev.projects ?? [])];
            projects.splice(index, 1);
            return { ...prev, projects: projects.length > 0 ? projects : undefined };
        });
    }

    function addProject() {
        setForm((prev) => ({
            ...prev,
            projects: [...(prev.projects ?? []), emptyProject()],
        }));
    }

    async function handleSubmit() {
        if (!client || !record) return;

        const errors = validateForm(form);
        if (hasValidationErrors(errors)) {
            const messages: string[] = [];
            if (errors.website) messages.push(`Website: ${errors.website}`);
            if (errors.projects) {
                for (const [idx, pErr] of Object.entries(errors.projects)) {
                    for (const msg of Object.values(pErr)) {
                        messages.push(`Project ${Number(idx) + 1}: ${msg}`);
                    }
                }
            }
            setSubmitError(messages.join(". "));
            return;
        }

        // Stale data check
        if (!staleOverrideRef.current) {
            try {
                const current = await getDomainRecord(fullName);
                if (current && !profilesEqual(current.profile, snapshot)) {
                    setStaleWarning(true);
                    return;
                }
            } catch {
                // If we can't check, proceed anyway
            }
        }

        setSubmitting(true);
        setSubmitError(null);
        setStaleWarning(false);

        try {
            await submitProfileUpdate(label, form, client);
            setSubmitSuccess(true);
            exitEditMode();
            onRefresh();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Transaction failed";
            setSubmitError(msg);
        } finally {
            setSubmitting(false);
        }
    }

    function confirmStaleOverwrite() {
        staleOverrideRef.current = true;
        setStaleWarning(false);
        handleSubmit();
    }

    return {
        editing,
        form,
        submitting,
        submitError,
        submitSuccess,
        staleWarning,
        hasChanges,
        enterEditMode,
        exitEditMode,
        updateField,
        updateProject,
        removeProject,
        addProject,
        handleSubmit,
        confirmStaleOverwrite,
    };
}

// ── Edit Form Renderer ───────────────────────────────────────────────

export function ProfileEditFormBody({ state }: { state: ProfileEditState }) {
    const {
        form,
        submitting,
        submitError,
        staleWarning,
        updateField,
        updateProject,
        removeProject,
        addProject,
        handleSubmit,
        exitEditMode,
        confirmStaleOverwrite,
    } = state;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {/* ── Bio ─────────────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <div>
                    <label style={LABEL_STYLE}>Bio ({(form.bio ?? "").length}/160)</label>
                    <textarea
                        value={form.bio ?? ""}
                        onChange={(e) => updateField("bio", e.target.value.slice(0, 160) || undefined)}
                        style={{ ...INPUT_BASE, resize: "vertical", minHeight: "3.5rem" }}
                        maxLength={160}
                        rows={3}
                        placeholder="Tell people about yourself…"
                    />
                </div>
            </div>

            {/* ── Location + Status ───────────────────────────── */}
            <div style={{ ...SECTION_STYLE, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label style={LABEL_STYLE}>Location ({(form.location ?? "").length}/60)</label>
                    <input
                        type="text"
                        value={form.location ?? ""}
                        onChange={(e) => updateField("location", e.target.value.slice(0, 60) || undefined)}
                        style={INPUT_BASE}
                        maxLength={60}
                        placeholder="City, Country"
                    />
                </div>
                <div>
                    <label style={LABEL_STYLE}>Status</label>
                    <select
                        value={form.status ?? ""}
                        onChange={(e) => {
                            const val = e.target.value as BuilderStatus | "";
                            updateField("status", val || undefined);
                        }}
                        style={SELECT_STYLE}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Social Links ────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                        <label style={LABEL_STYLE}>GitHub</label>
                        <input
                            type="text"
                            value={form.github ?? ""}
                            onChange={(e) => {
                                const val = e.target.value.replace(/^@/, "");
                                updateField("github", val || undefined);
                            }}
                            style={INPUT_BASE}
                            placeholder="username"
                        />
                    </div>
                    <div>
                        <label style={LABEL_STYLE}>Twitter / X</label>
                        <input
                            type="text"
                            value={form.twitter ?? ""}
                            onChange={(e) => {
                                const val = e.target.value.replace(/^@/, "");
                                updateField("twitter", val || undefined);
                            }}
                            style={INPUT_BASE}
                            placeholder="handle"
                        />
                    </div>
                </div>
                <div>
                    <label style={LABEL_STYLE}>Website</label>
                    <input
                        type="url"
                        value={form.website ?? ""}
                        onChange={(e) => updateField("website", e.target.value || undefined)}
                        style={INPUT_BASE}
                        placeholder="https://..."
                    />
                </div>
            </div>

            {/* ── Skills ──────────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <SkillTagInput
                    skills={form.skills ?? []}
                    onChange={(skills) => updateField("skills", skills.length > 0 ? skills : undefined)}
                />
            </div>

            {/* ── Projects ────────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <label style={LABEL_STYLE}>Projects</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(form.projects ?? []).map((project, i) => (
                        <ProjectEditor
                            key={i}
                            project={project}
                            index={i}
                            onChange={(p) => updateProject(i, p)}
                            onRemove={() => removeProject(i)}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={addProject}
                    style={{
                        alignSelf: "flex-start",
                        background: "none",
                        border: "1px dashed var(--border)",
                        borderRadius: "6px",
                        color: "var(--fg-3)",
                        cursor: "pointer",
                        fontSize: "0.7rem",
                        padding: "0.4rem 0.8rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        marginTop: "0.25rem",
                    }}
                >
                    + Add Project
                </button>
            </div>

            {/* ── Avatar notice ───────────────────────────────── */}
            <div
                style={{
                    background: "rgba(148,163,184,0.06)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.7rem",
                    color: "var(--fg-3)",
                    marginBottom: "0.75rem",
                }}
            >
                Avatar upload coming soon. Your current avatar is shown above.
            </div>

            {/* ── Stale data warning ──────────────────────────── */}
            {staleWarning && (
                <div
                    style={{
                        background: "rgba(234,179,8,0.1)",
                        border: "1px solid rgba(234,179,8,0.3)",
                        borderRadius: "6px",
                        padding: "0.75rem 1rem",
                        fontSize: "0.8rem",
                        color: "#facc15",
                        marginBottom: "0.75rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                    }}
                >
                    <span>Profile was updated by another session. Overwrite?</span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                            type="button"
                            onClick={confirmStaleOverwrite}
                            style={{
                                background: "rgba(234,179,8,0.2)",
                                border: "1px solid rgba(234,179,8,0.4)",
                                borderRadius: "4px",
                                color: "#facc15",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                padding: "0.3rem 0.8rem",
                                fontWeight: 700,
                            }}
                        >
                            Overwrite
                        </button>
                        <button
                            type="button"
                            onClick={exitEditMode}
                            style={{
                                background: "none",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                color: "var(--fg-3)",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                padding: "0.3rem 0.8rem",
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Error ───────────────────────────────────────── */}
            {submitError && (
                <div
                    style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: "6px",
                        padding: "0.6rem 0.8rem",
                        fontSize: "0.8rem",
                        color: "#f87171",
                        marginBottom: "0.75rem",
                    }}
                >
                    {submitError}
                </div>
            )}

            {/* ── Action buttons ──────────────────────────────── */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                        background: "var(--fg)",
                        color: "var(--bg)",
                        border: "none",
                        borderRadius: "4px",
                        padding: "0.5rem 1.25rem",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: submitting ? "wait" : "pointer",
                        opacity: submitting ? 0.6 : 1,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontFamily: "var(--font)",
                    }}
                >
                    {submitting ? "Saving…" : "Save"}
                </button>
                <button
                    type="button"
                    onClick={exitEditMode}
                    disabled={submitting}
                    style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        color: "var(--fg-3)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        padding: "0.5rem 1.25rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontFamily: "var(--font)",
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
