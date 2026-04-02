export interface SkillMeta {
    slug: string;
    filename: string;
    title: string;
    description: string;
    tags: string[];
    raw: string;
}

// Auto-discover all .md files in src/skills/ at build time
const modules = import.meta.glob("../skills/*.md", { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
>;

function slugFromPath(filePath: string): string {
    return filePath.replace(/^.*\//, "").replace(/\.md$/, "");
}

/** Minimal YAML frontmatter parser — handles title, description, tags only.
 *  Avoids gray-matter which requires Node's Buffer in the browser. */
function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; content: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: raw };
    const data: Record<string, string | string[]> = {};
    for (const line of match[1].split("\n")) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (!m) continue;
        const key = m[1];
        let val: string | string[] = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
            val = val
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        }
        data[key] = val;
    }
    return { data, content: match[2] };
}

function parseSkill(filePath: string, raw: string): SkillMeta {
    const { data, content } = parseFrontmatter(raw);
    const slug = slugFromPath(filePath);
    const tags = data["tags"];
    return {
        slug,
        filename: `${slug}.md`,
        title: (data["title"] as string | undefined) ?? slug,
        description: (data["description"] as string | undefined) ?? "",
        tags: Array.isArray(tags) ? tags : [],
        raw: content,
    };
}

export const skills: SkillMeta[] = Object.entries(modules)
    .map(([path, raw]) => parseSkill(path, raw))
    .sort((a, b) => a.title.localeCompare(b.title));

export function getSkill(slug: string): SkillMeta | undefined {
    return skills.find((s) => s.slug === slug);
}
