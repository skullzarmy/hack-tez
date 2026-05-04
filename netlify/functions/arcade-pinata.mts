/**
 * Pinata directory pinning — upload a multi-file game bundle and get back a
 * single traversable directory CID.
 *
 * Pinata's /pinning/pinFileToIPFS accepts a multipart body with one `file`
 * part per entry. Each part carries a `filename` containing the relative path
 * (e.g. "my-game/index.html"). When multiple files share a top-level segment,
 * Pinata wraps them in a directory and returns the wrapper's CID. Browsers can
 * then fetch `gateway/<cid>/index.html` etc.
 */

const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export interface DirEntry {
    /** Relative path inside the bundle, e.g. "index.html" or "assets/foo.png". */
    path: string;
    bytes: Uint8Array;
}

export interface PinDirOptions {
    /** Pinata JWT (server-only env var). */
    pinataJwt: string;
    /** Top-level wrapper folder name — included in every file's `filename`. */
    folderName: string;
    /** Optional human-friendly name shown in Pinata dashboard. */
    pinataName?: string;
    /** Optional extra metadata key/values. */
    keyvalues?: Record<string, string>;
}

export interface PinDirResult {
    cid: string;
    fileCount: number;
    totalBytes: number;
}

/** Pin a directory of files to IPFS, returning a single directory CID. */
export async function pinDirectoryToIPFS(files: DirEntry[], opts: PinDirOptions): Promise<PinDirResult> {
    if (!opts.pinataJwt) throw new Error("Missing PINATA_JWT");
    if (!files.length) throw new Error("No files to pin");

    const folder = opts.folderName.replace(/^\/+|\/+$/g, "");
    if (!folder) throw new Error("folderName required");

    const form = new FormData();
    let totalBytes = 0;
    for (const f of files) {
        const filename = `${folder}/${f.path.replace(/^\/+/, "")}`;
        // Upcast Uint8Array → BlobPart. Use application/octet-stream — Pinata
        // ignores the content-type per file when building the directory.
        const blob = new Blob([new Uint8Array(f.bytes)], { type: "application/octet-stream" });
        form.append("file", blob, filename);
        totalBytes += f.bytes.byteLength;
    }

    form.append(
        "pinataMetadata",
        JSON.stringify({
            name: opts.pinataName ?? folder,
            keyvalues: opts.keyvalues ?? {},
        }),
    );
    // wrapWithDirectory is implicit when multiple files share a top-level dir,
    // but we ask for it explicitly anyway.
    form.append("pinataOptions", JSON.stringify({ wrapWithDirectory: false, cidVersion: 1 }));

    const res = await fetch(PINATA_PIN_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.pinataJwt}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Pinata HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { IpfsHash?: string };
    if (!data.IpfsHash) throw new Error("Pinata response missing IpfsHash");

    return { cid: data.IpfsHash, fileCount: files.length, totalBytes };
}
