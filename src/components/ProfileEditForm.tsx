/** biome-ignore-all lint/suspicious/noCommentText: <I said so> */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTezos } from "../context/TezosContext";
import { getDomainRecord } from "../lib/domains";
import { submitProfileUpdate, waitForOperation } from "../lib/contract";
import { ipfsUriToGatewayUrl } from "../lib/pin";
import type { DomainRecord } from "../lib/domains";
import type { HackProfile, ProjectEntry, BuilderStatus } from "../types/profile";
import { isValidUrl } from "../types/profile";
import Select from "./ui/Select";

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
                                padding: "0.15rem 0.25rem",
                                fontSize: "0.85rem",
                                lineHeight: 1,
                                minWidth: "1.5rem",
                                minHeight: "1.5rem",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
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

// ── Avatar Upload ────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
];
const ACCEPT_STRING = ALLOWED_IMAGE_TYPES.join(",");
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

function AvatarUpload({
    currentUri,
    pendingFile,
    onFileSelected,
}: {
    currentUri: string | undefined;
    pendingFile: File | null;
    onFileSelected: (file: File | null) => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Revoke object URL on cleanup
    useEffect(() => {
        return () => {
            if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    // Create blob preview when pending file changes externally (e.g. cleared after save)
    useEffect(() => {
        if (!pendingFile) {
            if (preview && preview.startsWith("blob:")) {
                URL.revokeObjectURL(preview);
                setPreview(null);
            }
            return;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingFile]);

    const displayUrl = preview
        ?? (currentUri ? ipfsUriToGatewayUrl(currentUri) : null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setError("Unsupported format. Use JPEG, PNG, GIF, WebP, or SVG.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setError("File too large. Max 4 MB.");
            return;
        }

        if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(file));
        onFileSelected(file);
    }, [preview, onFileSelected]);

    return (
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            {/* Preview */}
            <div
                style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "var(--bg-2)",
                    border: "2px solid var(--border)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {displayUrl ? (
                    <img
                        src={displayUrl}
                        alt="Avatar preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    <span style={{ color: "var(--fg-3)", fontSize: "0.65rem" }}>No image</span>
                )}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
                <label style={LABEL_STYLE}>Avatar</label>
                <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                />
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        style={{
                            background: "none",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            color: "var(--fg-2)",
                            cursor: "pointer",
                            fontSize: "0.7rem",
                            padding: "0.4rem 0.8rem",
                            minHeight: "1.75rem",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            fontFamily: "var(--font)",
                        }}
                    >
                        {pendingFile ? "Change image" : "Choose image"}
                    </button>
                </div>
                {pendingFile && (
                    <span style={{ fontSize: "0.65rem", color: "var(--ok)" }}>
                        ✓ {pendingFile.name} — will be uploaded on save
                    </span>
                )}
                {error && (
                    <span style={{ fontSize: "0.65rem", color: "var(--err)" }}>{error}</span>
                )}
                <span style={{ fontSize: "0.6rem", color: "var(--fg-3)", opacity: 0.7 }}>
                    JPEG, PNG, GIF, WebP, or SVG · Max 4 MB
                </span>
            </div>
        </div>
    );
}

// ── Project Logo Upload ─────────────────────────────────────────────

function ProjectLogoUpload({
    currentUri,
    onLogoChange,
    onFileSelected,
    pendingFile,
}: {
    currentUri: string | undefined;
    onLogoChange: (value: string) => void;
    onFileSelected: (file: File) => void;
    pendingFile: File | undefined;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    const pendingUrl = useMemo(
        () => pendingFile ? URL.createObjectURL(pendingFile) : null,
        [pendingFile],
    );
    useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);

    const displayUrl = pendingUrl
        ?? (currentUri
            ? (currentUri.startsWith("ipfs://") ? ipfsUriToGatewayUrl(currentUri) : currentUri)
            : null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setError("Unsupported format");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setError("Max 4 MB");
            return;
        }

        onFileSelected(file);
    }, [onFileSelected]);

    return (
        <div>
            <label style={LABEL_STYLE}>Logo</label>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {/* Preview */}
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: "6px",
                        overflow: "hidden",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {displayUrl ? (
                        <img
                            src={displayUrl}
                            alt="Logo"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    ) : (
                        <span style={{ color: "var(--fg-3)", fontSize: "0.5rem" }}>—</span>
                    )}
                </div>

                {/* Upload or URL */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={ACCEPT_STRING}
                            onChange={handleFileSelect}
                            style={{ display: "none" }}
                        />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            style={{
                                background: "none",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                color: "var(--fg-2)",
                                cursor: "pointer",
                                fontSize: "0.65rem",
                                padding: "0.35rem 0.7rem",
                                minHeight: "1.5rem",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                fontFamily: "var(--font)",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                            }}
                        >
                            {pendingFile ? "Change" : "Upload"}
                        </button>
                        <span style={{ color: "var(--fg-3)", fontSize: "0.6rem", flexShrink: 0 }}>or</span>
                        <input
                            type="text"
                            value={pendingFile ? `📎 ${pendingFile.name}` : (currentUri ?? "")}
                            onChange={(e) => onLogoChange(e.target.value)}
                            style={{ ...INPUT_BASE, flex: 1 }}
                            placeholder="https://... or ipfs://..."
                            readOnly={!!pendingFile}
                        />
                    </div>
                    {pendingFile && (
                        <span style={{ fontSize: "0.6rem", color: "var(--ok)" }}>
                            ✓ will be uploaded on save
                        </span>
                    )}
                    {error && (
                        <span style={{ fontSize: "0.6rem", color: "var(--err)" }}>{error}</span>
                    )}
                </div>
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
    pendingLogo,
    onLogoFileSelected,
}: {
    project: ProjectEntry;
    index: number;
    onChange: (p: ProjectEntry) => void;
    onRemove: () => void;
    pendingLogo: File | undefined;
    onLogoFileSelected: (file: File) => void;
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
                        padding: "0.3rem 0.6rem",
                        minHeight: "1.5rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                    }}
                >
                    Remove
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label htmlFor={`project-${index}-name`} style={LABEL_STYLE}>Name *</label>
                    <input
                        id={`project-${index}-name`}
                        type="text"
                        value={project.name}
                        onChange={(e) => update("name", e.target.value.slice(0, 60))}
                        style={INPUT_BASE}
                        maxLength={60}
                        placeholder="Project name"
                        aria-required="true"
                    />
                </div>
                <div>
                    <label htmlFor={`project-${index}-status`} style={LABEL_STYLE}>Status</label>
                    <Select
                        id={`project-${index}-status`}
                        options={PROJECT_STATUS_OPTIONS}
                        value={project.status ?? ""}
                        onChange={(val) => update("status", val)}
                        fullWidth
                    />
                </div>
            </div>

            <div>
                <label htmlFor={`project-${index}-desc`} style={LABEL_STYLE}>Description * ({(project.desc ?? "").length}/120)</label>
                <textarea
                    id={`project-${index}-desc`}
                    value={project.desc}
                    onChange={(e) => update("desc", e.target.value.slice(0, 120))}
                    style={{ ...INPUT_BASE, resize: "vertical", minHeight: "2.5rem" }}
                    maxLength={120}
                    rows={2}
                    placeholder="Short project description"
                    aria-required="true"
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                    <label htmlFor={`project-${index}-url`} style={LABEL_STYLE}>Website URL</label>
                    <input
                        id={`project-${index}-url`}
                        type="url"
                        value={project.url ?? ""}
                        onChange={(e) => update("url", e.target.value)}
                        style={INPUT_BASE}
                        placeholder="https://..."
                    />
                </div>
                <div>
                    <label htmlFor={`project-${index}-repo`} style={LABEL_STYLE}>Repo URL</label>
                    <input
                        id={`project-${index}-repo`}
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
                    <label htmlFor={`project-${index}-env`} style={LABEL_STYLE}>Environment</label>
                    <Select
                        id={`project-${index}-env`}
                        options={ENVIRONMENT_OPTIONS}
                        value={project.environment ?? ""}
                        onChange={(val) => update("environment", val)}
                        fullWidth
                    />
                </div>
                <div>
                    <label htmlFor={`project-${index}-address`} style={LABEL_STYLE}>Address</label>
                    <input
                        id={`project-${index}-address`}
                        type="text"
                        value={project.address ?? ""}
                        onChange={(e) => update("address", e.target.value)}
                        style={INPUT_BASE}
                        placeholder={project.environment === "tezos" ? "KT1… or tz1…" : "Contract address"}
                    />
                </div>
            </div>

            <ProjectLogoUpload
                currentUri={project.logo}
                onLogoChange={(val) => update("logo", val)}
                onFileSelected={onLogoFileSelected}
                pendingFile={pendingLogo}
            />
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
    saveStatus: string | null;
    staleWarning: boolean;
    hasChanges: boolean;
    pendingAvatar: File | null;
    pendingLogos: Record<number, File>;
    enterEditMode: (profile: HackProfile) => void;
    exitEditMode: () => void;
    updateField: <K extends keyof HackProfile>(key: K, value: HackProfile[K]) => void;
    updateProject: (index: number, project: ProjectEntry) => void;
    removeProject: (index: number) => void;
    addProject: () => void;
    setPendingAvatar: (file: File | null) => void;
    setPendingLogo: (index: number, file: File) => void;
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
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [staleWarning, setStaleWarning] = useState(false);
    const staleOverrideRef = useRef(false);
    const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
    const [pendingLogos, setPendingLogos] = useState<Record<number, File>>({});

    const hasChanges = editing && (
        !profilesEqual(form, snapshot) ||
        pendingAvatar !== null ||
        Object.keys(pendingLogos).length > 0
    );

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

    // Unsaved changes warning — suppressed during wallet operations (mobile deep-links
    // to the wallet app, which triggers beforeunload)
    const walletActiveRef = useRef(false);
    useEffect(() => {
        if (!hasChanges) return;
        const handler = (e: BeforeUnloadEvent) => {
            if (walletActiveRef.current) return;
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
        setPendingAvatar(null);
        setPendingLogos({});
    }

    function exitEditMode() {
        setEditing(false);
        setForm({});
        setSnapshot({});
        setSubmitError(null);
        setStaleWarning(false);
        staleOverrideRef.current = false;
        setPendingAvatar(null);
        setPendingLogos({});
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
        // Clean up pending logo for removed project, shift higher indices down
        setPendingLogos((prev) => {
            const next: Record<number, File> = {};
            for (const [k, v] of Object.entries(prev)) {
                const idx = Number(k);
                if (idx < index) next[idx] = v;
                else if (idx > index) next[idx - 1] = v;
            }
            return next;
        });
    }

    function setPendingLogo(index: number, file: File) {
        setPendingLogos((prev) => ({ ...prev, [index]: file }));
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
        setSaveStatus(null);

        try {
            // Pin any pending files first (single wallet signature for all)
            const filesToPin: File[] = [];
            const fileMap: { type: "avatar" | "logo"; index?: number }[] = [];

            if (pendingAvatar) {
                filesToPin.push(pendingAvatar);
                fileMap.push({ type: "avatar" });
            }
            for (const [idx, file] of Object.entries(pendingLogos)) {
                filesToPin.push(file);
                fileMap.push({ type: "logo", index: Number(idx) });
            }

            let finalForm = { ...form };

            if (filesToPin.length > 0) {
                setSaveStatus("Uploading images to IPFS…");
                walletActiveRef.current = true;
                const { pinFiles } = await import("../lib/pin");
                const results = await pinFiles(filesToPin, client);
                walletActiveRef.current = false;

                for (let i = 0; i < results.length; i++) {
                    const ipfsUri = `ipfs://${results[i].cid}`;
                    const mapping = fileMap[i];
                    if (mapping.type === "avatar") {
                        finalForm = { ...finalForm, picture: ipfsUri };
                    } else if (mapping.type === "logo" && mapping.index !== undefined) {
                        const projects = [...(finalForm.projects ?? [])];
                        if (projects[mapping.index]) {
                            projects[mapping.index] = { ...projects[mapping.index], logo: ipfsUri };
                            finalForm = { ...finalForm, projects };
                        }
                    }
                }
            }

            setSaveStatus("Confirm transaction in wallet…");
            walletActiveRef.current = true;
            const opHash = await submitProfileUpdate(label, finalForm, client);
            walletActiveRef.current = false;
            setSubmitSuccess(true);
            exitEditMode();

            setSaveStatus("Transaction submitted — waiting for confirmation…");
            try {
                await waitForOperation(opHash);
                setSaveStatus("Confirmed! Refreshing profile…");
                await new Promise((r) => setTimeout(r, 5000));
            } catch {
                // Timeout is non-fatal — data will appear on next manual refresh
            }
            onRefresh();

            // Post-save verification: re-read and check our writes landed
            try {
                const updated = await getDomainRecord(fullName);
                if (updated) {
                    const wrote = finalForm;
                    const got = updated.profile;
                    const mismatches: string[] = [];
                    if (wrote.bio && wrote.bio !== got.bio) mismatches.push("bio");
                    if (wrote.status && wrote.status !== got.status) mismatches.push("status");
                    if (wrote.picture && wrote.picture !== got.picture) mismatches.push("avatar");
                    if (wrote.name && wrote.name !== got.name) mismatches.push("name");
                    if (mismatches.length > 0) {
                        setSaveStatus(`⚠ Some changes may not have saved (${mismatches.join(", ")}). Another update may have overwritten yours.`);
                        await new Promise((r) => setTimeout(r, 6000));
                    }
                }
            } catch {
                // Verification is best-effort
            }
            setSaveStatus(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Transaction failed";
            setSubmitError(msg);
            setSaveStatus(null);
        } finally {
            walletActiveRef.current = false;
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
        saveStatus,
        staleWarning,
        hasChanges,
        pendingAvatar,
        pendingLogos,
        enterEditMode,
        exitEditMode,
        updateField,
        updateProject,
        removeProject,
        addProject,
        setPendingAvatar,
        setPendingLogo,
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
        pendingAvatar,
        pendingLogos,
        updateField,
        updateProject,
        removeProject,
        addProject,
        setPendingAvatar,
        setPendingLogo,
        handleSubmit,
        exitEditMode,
        confirmStaleOverwrite,
    } = state;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {/* ── Bio ─────────────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <div>
                    <label htmlFor="profile-bio" style={LABEL_STYLE}>Bio ({(form.bio ?? "").length}/160)</label>
                    <textarea
                        id="profile-bio"
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
                    <label htmlFor="profile-location" style={LABEL_STYLE}>Location ({(form.location ?? "").length}/60)</label>
                    <input
                        id="profile-location"
                        type="text"
                        value={form.location ?? ""}
                        onChange={(e) => updateField("location", e.target.value.slice(0, 60) || undefined)}
                        style={INPUT_BASE}
                        maxLength={60}
                        placeholder="City, Country"
                    />
                </div>
                <div>
                    <label htmlFor="profile-status" style={LABEL_STYLE}>Status</label>
                    <Select
                        id="profile-status"
                        options={STATUS_OPTIONS}
                        value={form.status ?? ""}
                        onChange={(val) => {
                            updateField("status", (val as BuilderStatus) || undefined);
                        }}
                        fullWidth
                    />
                </div>
            </div>

            {/* ── Social Links ────────────────────────────────── */}
            <div style={SECTION_STYLE}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                        <label htmlFor="profile-github" style={LABEL_STYLE}>GitHub</label>
                        <input
                            id="profile-github"
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
                        <label htmlFor="profile-twitter" style={LABEL_STYLE}>Twitter / X</label>
                        <input
                            id="profile-twitter"
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
                    <label htmlFor="profile-website" style={LABEL_STYLE}>Website</label>
                    <input
                        id="profile-website"
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
                            pendingLogo={pendingLogos[i]}
                            onLogoFileSelected={(file) => setPendingLogo(i, file)}
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

            {/* ── Avatar Upload ─────────────────────────────── */}
            <div style={{ ...SECTION_STYLE, marginBottom: "1rem" }}>
                <AvatarUpload
                    currentUri={form.picture}
                    pendingFile={pendingAvatar}
                    onFileSelected={setPendingAvatar}
                />
            </div>

            {/* ── Stale data warning ──────────────────────────── */}
            {staleWarning && (
                <div
                    style={{
                        background: "var(--warn-bg)",
                        border: "1px solid var(--warn)",
                        borderRadius: "6px",
                        padding: "0.75rem 1rem",
                        fontSize: "0.8rem",
                        color: "var(--warn)",
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
                                background: "var(--warn-bg)",
                                border: "1px solid var(--warn)",
                                borderRadius: "4px",
                                color: "var(--warn)",
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
                        background: "var(--err-bg)",
                        border: "1px solid var(--err)",
                        borderRadius: "6px",
                        padding: "0.6rem 0.8rem",
                        fontSize: "0.8rem",
                        color: "var(--err)",
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
                    {submitting ? "Saving…" : (pendingAvatar || Object.keys(pendingLogos).length > 0 ? "Upload & Save" : "Save")}
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
