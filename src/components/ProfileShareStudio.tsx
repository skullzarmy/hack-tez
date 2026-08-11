import { SiBluesky, SiX } from "@icons-pack/react-simple-icons";
import { Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import config, { siteUrl } from "../config/tezos";
import {
	buildProfileShareIntentText,
	formatShareStatus,
	getDefaultProfileShareState,
	getProfileShareUrl,
	PROFILE_SHARE_PRESETS,
	PROFILE_SHARE_SIZES,
	type ProfileShareFormat,
	type ProfileSharePreset,
	type ProfileShareState,
} from "../lib/profileShare";

interface ProfileShareStudioProps {
	label: string;
	fullName: string;
	displayName: string;
	avatarUrl?: string | null;
	bio?: string;
	status?: string;
}

const FIELD_LABEL: React.CSSProperties = {
	display: "block",
	marginBottom: "0.35rem",
	color: "var(--fg-3)",
	fontFamily: "var(--font-mono)",
	fontSize: "0.65rem",
	letterSpacing: "0.1em",
	textTransform: "uppercase",
};

const INPUT_STYLE: React.CSSProperties = {
	width: "100%",
	background: "var(--bg-2)",
	border: "1px solid var(--border)",
	borderRadius: "4px",
	color: "var(--fg)",
	padding: "0.5rem 0.65rem",
	fontFamily: "var(--font)",
	fontSize: "0.8rem",
	boxSizing: "border-box",
};

const ACTION_BUTTON: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "0.45rem",
	border: "1px solid var(--border)",
	background: "var(--bg-2)",
	color: "var(--fg)",
	borderRadius: "4px",
	padding: "0.55rem 0.8rem",
	cursor: "pointer",
	fontFamily: "var(--font)",
	fontSize: "0.72rem",
	letterSpacing: "0.06em",
	textTransform: "uppercase",
	fontWeight: 700,
};

const RANGE_STYLE: React.CSSProperties = {
	width: "100%",
	accentColor: "var(--fg)",
	cursor: "pointer",
};

const CHECKBOX_STYLE: React.CSSProperties = {
	width: "1rem",
	height: "1rem",
	accentColor: "var(--fg)",
	cursor: "pointer",
};

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
}

function hashSeed(input: string): number {
	let value = 0;
	for (let index = 0; index < input.length; index += 1) {
		value = (value * 31 + input.charCodeAt(index)) >>> 0;
	}
	return value;
}

function seededUnit(seed: number, salt: number): number {
	const value = Math.sin(seed * 0.013 + salt * 12.9898) * 43758.5453;
	return value - Math.floor(value);
}

function invertHexColor(hex: string): string {
	if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4))
		return hex;
	const normalized =
		hex.length === 4
			? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
			: hex;
	const red = 255 - Number.parseInt(normalized.slice(1, 3), 16);
	const green = 255 - Number.parseInt(normalized.slice(3, 5), 16);
	const blue = 255 - Number.parseInt(normalized.slice(5, 7), 16);
	return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue
		.toString(16)
		.padStart(2, "0")}`;
}

function wrapCanvasText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxLines: number,
): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const ellipsisWidth = ctx.measureText("…").width;
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		// Truncate a single word that already exceeds maxWidth
		let safeWord = word;
		if (ctx.measureText(safeWord).width > maxWidth) {
			while (
				safeWord.length > 1 &&
				ctx.measureText(safeWord).width + ellipsisWidth > maxWidth
			) {
				safeWord = safeWord.slice(0, -1);
			}
			safeWord = `${safeWord}…`;
		}
		const next = current ? `${current} ${safeWord}` : safeWord;
		if (ctx.measureText(next).width <= maxWidth) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		current = safeWord;
		if (lines.length === maxLines) break;
	}
	if (lines.length < maxLines && current) lines.push(current);
	if (
		lines.length === maxLines &&
		words.join(" ").length > lines.join(" ").length
	) {
		let last = lines[maxLines - 1] ?? "";
		while (
			last.length > 1 &&
			ctx.measureText(last).width + ellipsisWidth > maxWidth
		) {
			last = last.slice(0, -1);
		}
		lines[maxLines - 1] = `${last}…`;
	}
	return lines;
}

function drawPattern(
	ctx: CanvasRenderingContext2D,
	state: ProfileShareState,
	width: number,
	height: number,
	seed: number,
	accent: string,
	text: string,
) {
	const density = 0.35 + (state.circuitDensity / 100) * 1.1;
	const glow = 0.3 + (state.circuitGlow / 100) * 1.05;
	const glitch = state.glitchIntensity / 100;
	const isGlitchPreset = state.preset === "scanline-glitch";
	const isMonoPreset = state.preset === "mono-poster";

	const traceCount = Math.round(
		(isMonoPreset ? 8 : 14) + density * (isMonoPreset ? 16 : 22),
	);
	const nodeCount = Math.round(
		(isMonoPreset ? 10 : 16) + density * (isMonoPreset ? 14 : 26),
	);
	const minStep = Math.max(20, Math.round(width * 0.045));
	const maxStep = Math.max(minStep + 10, Math.round(width * 0.18));
	const traceAlpha = isMonoPreset ? "2c" : isGlitchPreset ? "55" : "44";
	const nodeAlpha = isMonoPreset ? "30" : isGlitchPreset ? "5a" : "3b";

	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = `${accent}${traceAlpha}`;
	ctx.lineWidth = Math.max(1.6, width * 0.0016 + glow * 1.7);

	for (let index = 0; index < traceCount; index += 1) {
		const startX = Math.round(seededUnit(seed, index + 11) * width);
		const startY = Math.round(seededUnit(seed, index + 47) * height);
		const segments =
			3 + Math.round(seededUnit(seed, index + 91) * (2 + density * 2));

		let x = startX;
		let y = startY;
		ctx.beginPath();
		ctx.moveTo(x, y);

		for (let step = 0; step < segments; step += 1) {
			const horizontal = seededUnit(seed, index * 13 + step * 17 + 3) > 0.42;
			const direction =
				seededUnit(seed, index * 19 + step * 29 + 5) > 0.5 ? 1 : -1;
			const distance = Math.round(
				minStep +
					seededUnit(seed, index * 7 + step * 23 + 9) * (maxStep - minStep),
			);
			const nx = horizontal
				? Math.max(0, Math.min(width, x + distance * direction))
				: x;
			const ny = horizontal
				? y
				: Math.max(0, Math.min(height, y + distance * direction));
			x = nx;
			y = ny;
			ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	ctx.fillStyle = `${accent}${nodeAlpha}`;
	for (let index = 0; index < nodeCount; index += 1) {
		const x = Math.round(seededUnit(seed, index + 301) * width);
		const y = Math.round(seededUnit(seed, index + 347) * height);
		const radius = 1.8 + seededUnit(seed, index + 401) * (2.4 + glow * 2.2);
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	if (isMonoPreset) {
		ctx.fillStyle = `${text}12`;
		ctx.fillRect(width * 0.63, 0, width * 0.37, height);
	}

	ctx.fillStyle = `${text}${(7 + Math.round(glitch * 11)).toString(16).padStart(2, "0")}`;
	const spacing = Math.max(
		3,
		Math.round((isGlitchPreset ? 7 : 9) - glitch * 3),
	);
	for (let y = 0; y < height; y += spacing) {
		ctx.fillRect(0, y, width, 1);
	}

	if (glitch > 0.02) {
		const snapshot = document.createElement("canvas");
		snapshot.width = width;
		snapshot.height = height;
		const snapshotCtx = snapshot.getContext("2d");
		if (snapshotCtx) {
			snapshotCtx.drawImage(ctx.canvas, 0, 0);

			const bandCount = Math.round(
				(isGlitchPreset ? 5 : 2) + glitch * (isGlitchPreset ? 12 : 8),
			);
			for (let index = 0; index < bandCount; index += 1) {
				const y = Math.round(seededUnit(seed, 521 + index * 3) * (height - 20));
				const bandHeight = Math.max(
					4,
					Math.round(
						height * (0.008 + seededUnit(seed, 607 + index * 5) * 0.028),
					),
				);
				const maxShift = Math.round(
					(isGlitchPreset ? 18 : 10) + glitch * (isGlitchPreset ? 54 : 34),
				);
				const direction = seededUnit(seed, 683 + index * 7) > 0.5 ? 1 : -1;
				const shift =
					direction *
					Math.round(
						(0.25 + seededUnit(seed, 727 + index * 11) * 0.75) * maxShift,
					);
				ctx.save();
				ctx.globalAlpha = isMonoPreset ? 0.18 : isGlitchPreset ? 0.38 : 0.28;
				ctx.drawImage(
					snapshot,
					0,
					y,
					width,
					bandHeight,
					shift,
					y,
					width,
					bandHeight,
				);
				ctx.restore();
			}

			const splitBands = Math.max(2, Math.round(2 + glitch * 8));
			const splitPx = Math.max(
				1,
				Math.round((isGlitchPreset ? 2 : 1) + glitch * 6),
			);
			for (let index = 0; index < splitBands; index += 1) {
				const y = Math.round(
					seededUnit(seed, 811 + index * 13) * (height - 16),
				);
				const bandHeight = Math.max(
					3,
					Math.round(
						height * (0.006 + seededUnit(seed, 877 + index * 17) * 0.016),
					),
				);
				ctx.save();
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = isMonoPreset ? 0.08 : 0.18 + glitch * 0.18;
				ctx.drawImage(
					snapshot,
					0,
					y,
					width,
					bandHeight,
					splitPx,
					y,
					width,
					bandHeight,
				);
				ctx.fillStyle = isMonoPreset ? `${text}2f` : `${accent}44`;
				ctx.fillRect(0, y, width, bandHeight);
				ctx.drawImage(
					snapshot,
					0,
					y,
					width,
					bandHeight,
					-splitPx,
					y,
					width,
					bandHeight,
				);
				ctx.fillStyle = isMonoPreset ? `${text}20` : "#59f4ff38";
				ctx.fillRect(0, y, width, bandHeight);
				ctx.restore();
			}
		}
	}

	const pulseCount = Math.max(
		1,
		Math.round(1 + glitch * (isGlitchPreset ? 10 : 6)),
	);
	for (let index = 0; index < pulseCount; index += 1) {
		const y = Math.round(seededUnit(seed, 941 + index * 19) * (height - 4));
		const pulseWidth = Math.max(
			40,
			Math.round(width * (0.14 + seededUnit(seed, 991 + index * 23) * 0.5)),
		);
		const x = Math.round(
			seededUnit(seed, 1069 + index * 29) * (width - pulseWidth),
		);
		const alpha = (0.08 + glitch * 0.22).toFixed(3);
		ctx.fillStyle = isMonoPreset
			? `${text}${Math.round((0.08 + glitch * 0.18) * 255)
					.toString(16)
					.padStart(2, "0")}`
			: `rgba(89,244,255,${alpha})`;
		ctx.fillRect(x, y, pulseWidth, 2);
	}

	if (isMonoPreset) {
		ctx.fillStyle = `${accent}16`;
		ctx.fillRect(0, height * 0.72, width, height * 0.28);
		ctx.strokeStyle = `${text}40`;
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(width * 0.58, 0);
		ctx.lineTo(width * 0.2, height);
		ctx.stroke();
	}

	if (glow > 0.36) {
		const bloom = ctx.createRadialGradient(
			width * 0.26,
			height * 0.24,
			0,
			width * 0.26,
			height * 0.24,
			width * 0.6,
		);
		bloom.addColorStop(
			0,
			`${accent}${(12 + Math.round(glow * 16)).toString(16).padStart(2, "0")}`,
		);
		bloom.addColorStop(1, "transparent");
		ctx.fillStyle = bloom;
		ctx.fillRect(0, 0, width, height);
	}

	if (glitch > 0.1) {
		const offset = Math.round((glitch + (isGlitchPreset ? 0.12 : 0)) * 9);
		ctx.save();
		ctx.globalAlpha = isMonoPreset ? 0.09 : isGlitchPreset ? 0.2 : 0.14;
		ctx.drawImage(ctx.canvas, offset, 0);
		ctx.restore();
	}

	if (isGlitchPreset) {
		ctx.fillStyle = `${accent}1f`;
		ctx.fillRect(0, height * 0.74, width, 2);
		ctx.fillStyle = "#59f4ff1c";
		ctx.fillRect(0, height * 0.76, width, 2);
	}
}

function drawCard(
	canvas: HTMLCanvasElement,
	state: ProfileShareState,
	fullName: string,
	profileUrl: string,
	statusLabel: string | undefined,
	avatarImage: HTMLImageElement | null,
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const { width, height } = PROFILE_SHARE_SIZES[state.format];
	const basePreset = PROFILE_SHARE_PRESETS[state.preset];
	const accentOverride =
		state.preset === "mono-poster" ? basePreset.accent : state.templateColor;
	const monoInverted = state.preset === "mono-poster" && state.monoInvert;
	const preset = monoInverted
		? {
				background: invertHexColor(basePreset.background),
				accent: invertHexColor(accentOverride),
				text: invertHexColor(basePreset.text),
				muted: invertHexColor(basePreset.muted),
				panel: invertHexColor(basePreset.panel),
			}
		: {
				...basePreset,
				accent: accentOverride,
			};
	const framePadding = Math.round(width * 0.07);
	const panelInset = Math.round(width * 0.048);
	const panelX = framePadding;
	const panelY = framePadding;
	const panelWidth = width - framePadding * 2;
	const panelHeight = height - framePadding * 2;
	const contentX = panelX + panelInset;
	const contentY = panelY + panelInset;
	const contentRight = panelX + panelWidth - panelInset;
	const seed = hashSeed(`${fullName}:${state.preset}`);

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = preset.background;
	ctx.fillRect(0, 0, width, height);
	drawPattern(ctx, state, width, height, seed, preset.accent, preset.text);

	ctx.fillStyle = preset.panel;
	drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 26);
	ctx.fill();

	ctx.strokeStyle = `${preset.muted}44`;
	ctx.lineWidth = 2;
	drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 26);
	ctx.stroke();

	ctx.fillStyle = preset.accent;
	ctx.fillRect(panelX, panelY, panelWidth, 8);

	const avatarSize = Math.round(Math.min(width, height) * 0.15);
	const avatarInsetX = Math.round(width * 0.055);
	const avatarInsetY = Math.round(height * 0.09);
	const avatarX = panelX + panelWidth - avatarInsetX - avatarSize;
	const avatarY = panelY + avatarInsetY;
	ctx.save();
	ctx.beginPath();
	ctx.arc(
		avatarX + avatarSize / 2,
		avatarY + avatarSize / 2,
		avatarSize / 2,
		0,
		Math.PI * 2,
	);
	ctx.closePath();
	ctx.clip();
	if (avatarImage) {
		// Center-crop ("cover") so non-square avatars are not squished into the circle.
		const naturalWidth = avatarImage.naturalWidth || avatarImage.width;
		const naturalHeight = avatarImage.naturalHeight || avatarImage.height;
		if (naturalWidth > 0 && naturalHeight > 0) {
			const side = Math.min(naturalWidth, naturalHeight);
			ctx.drawImage(
				avatarImage,
				(naturalWidth - side) / 2,
				(naturalHeight - side) / 2,
				side,
				side,
				avatarX,
				avatarY,
				avatarSize,
				avatarSize,
			);
		} else {
			ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
		}
	} else {
		ctx.fillStyle = `${preset.accent}35`;
		ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
		ctx.fillStyle = preset.text;
		ctx.font = `700 ${Math.round(avatarSize * 0.34)}px "Space Mono", "Courier New", monospace`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(
			fullName.slice(0, 2).toUpperCase(),
			avatarX + avatarSize / 2,
			avatarY + avatarSize / 2,
		);
	}
	ctx.restore();

	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	if (statusLabel) {
		ctx.fillStyle = preset.accent;
		ctx.font = `700 ${Math.round(width * 0.021)}px "Space Mono", "Courier New", monospace`;
		ctx.fillText(`// ${statusLabel.toUpperCase()}`, contentX, contentY + 2);
	}

	const titleTop = contentY + (statusLabel ? 54 : 34);
	ctx.fillStyle = preset.text;
	ctx.font = `700 ${Math.round(width * 0.062)}px "Space Mono", "Courier New", monospace`;
	const titleMaxWidth = avatarX - contentX - Math.round(width * 0.05);
	const titleLines = wrapCanvasText(
		ctx,
		state.title,
		titleMaxWidth,
		state.format === "og" ? 2 : 3,
	);
	titleLines.forEach((line, index) => {
		ctx.fillText(line, contentX, titleTop + index * Math.round(width * 0.076));
	});

	const subtitleTop =
		titleTop + titleLines.length * Math.round(width * 0.076) + 20;
	ctx.fillStyle = preset.muted;
	ctx.font = `${Math.round(width * 0.029)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	const subtitleLines = wrapCanvasText(
		ctx,
		state.subtitle,
		contentRight - contentX,
		state.format === "og" ? 3 : 4,
	);
	subtitleLines.forEach((line, index) => {
		ctx.fillText(
			line,
			contentX,
			subtitleTop + index * Math.round(width * 0.039),
		);
	});

	ctx.fillStyle = preset.accent;
	ctx.font = `700 ${Math.round(width * 0.022)}px "Space Mono", "Courier New", monospace`;
	ctx.fillText(state.cta, contentX, panelY + panelHeight - panelInset - 52);

	ctx.fillStyle = `${preset.text}bb`;
	ctx.font = `${Math.round(width * 0.024)}px "Space Mono", "Courier New", monospace`;
	ctx.fillText(
		`// ${fullName}`,
		contentX,
		panelY + panelHeight - panelInset - 14,
	);

	ctx.textAlign = "right";
	ctx.fillStyle = `${preset.text}70`;
	ctx.font = `${Math.round(width * 0.018)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	ctx.fillText(
		profileUrl,
		contentRight,
		panelY + panelHeight - panelInset - 16,
	);
}

export function ProfileShareStudio({
	label,
	fullName,
	displayName,
	avatarUrl,
	bio,
	status,
}: ProfileShareStudioProps) {
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<ProfileShareState>(() =>
		getDefaultProfileShareState({
			label,
			tld: config.tld,
			fullName,
			displayName,
			bio,
			status,
			siteUrl,
		}),
	);
	const [message, setMessage] = useState<string | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [avatarImage, setAvatarImage] = useState<HTMLImageElement | null>(null);
	const profileUrl = getProfileShareUrl(label, siteUrl);
	const statusLabel = formatShareStatus(status);

	useEffect(() => {
		setState(
			getDefaultProfileShareState({
				label,
				tld: config.tld,
				fullName,
				displayName,
				bio,
				status,
				siteUrl,
			}),
		);
	}, [bio, displayName, fullName, label, status]);

	useEffect(() => {
		let cancelled = false;

		const hackatarUrl = `/api/v1/hackatar/${encodeURIComponent(label)}?static=1`;
		const image = new Image();
		image.onload = () => {
			if (!cancelled) setAvatarImage(image);
		};
		image.onerror = () => {
			if (avatarUrl && image.src !== hackatarUrl) {
				image.src = hackatarUrl;
				return;
			}
			if (!cancelled) setAvatarImage(null);
		};

		image.src = avatarUrl ?? hackatarUrl;
		return () => {
			cancelled = true;
		};
	}, [avatarUrl, label]);

	useEffect(() => {
		if (!open || !canvasRef.current) return;
		const { width, height } = PROFILE_SHARE_SIZES[state.format];
		canvasRef.current.width = width;
		canvasRef.current.height = height;
		drawCard(
			canvasRef.current,
			state,
			fullName,
			profileUrl,
			statusLabel,
			avatarImage,
		);
	}, [avatarImage, fullName, open, profileUrl, state, statusLabel]);

	useEffect(() => {
		if (!message) return;
		const timer = window.setTimeout(() => setMessage(null), 2400);
		return () => window.clearTimeout(timer);
	}, [message]);

	async function loadLocalHackatarImage(): Promise<HTMLImageElement | null> {
		return await new Promise((resolve) => {
			const fallback = new Image();
			fallback.onload = () => resolve(fallback);
			fallback.onerror = () => resolve(null);
			fallback.src = `/api/v1/hackatar/${encodeURIComponent(label)}?static=1`;
		});
	}

	function redrawPreview(
		overrideAvatarImage: HTMLImageElement | null = avatarImage,
	) {
		if (!canvasRef.current) return;
		drawCard(
			canvasRef.current,
			state,
			fullName,
			profileUrl,
			statusLabel,
			overrideAvatarImage,
		);
	}

	async function handleCopyImage() {
		if (!canvasRef.current) return;
		if (!("ClipboardItem" in window) || !navigator.clipboard?.write) {
			setMessage("Image copy is not supported in this browser.");
			return;
		}

		const tryClipboardWrite = async () => {
			canvasRef.current?.toBlob(async (blob) => {
				if (!blob) {
					setMessage("Could not prepare image for clipboard.");
					return;
				}
				try {
					await navigator.clipboard.write([
						new ClipboardItem({ "image/png": blob }),
					]);
					setMessage("Image copied to clipboard.");
				} catch {
					setMessage("Clipboard copy failed.");
				}
			}, "image/png");
		};

		try {
			await tryClipboardWrite();
		} catch {
			const fallback = await loadLocalHackatarImage();
			if (!fallback) {
				setMessage("Clipboard copy failed.");
				return;
			}
			redrawPreview(fallback);
			try {
				await tryClipboardWrite();
				setMessage("Image copied (fallback avatar due to host restrictions).");
			} catch {
				setMessage("Clipboard copy failed.");
			} finally {
				redrawPreview();
			}
		}
	}

	async function handleDownload() {
		if (!canvasRef.current) return;
		try {
			const link = document.createElement("a");
			link.href = canvasRef.current.toDataURL("image/png");
			link.download = `${label}-share-card.png`;
			link.click();
			setMessage("PNG downloaded.");
		} catch {
			const fallback = await loadLocalHackatarImage();
			if (!fallback) {
				setMessage("Download failed.");
				return;
			}
			redrawPreview(fallback);
			try {
				const link = document.createElement("a");
				link.href = canvasRef.current.toDataURL("image/png");
				link.download = `${label}-share-card.png`;
				link.click();
				setMessage(
					"PNG downloaded (fallback avatar due to host restrictions).",
				);
			} catch {
				setMessage("Download failed.");
			} finally {
				redrawPreview();
			}
		}
	}

	function handleShareX() {
		const text = buildProfileShareIntentText(state, profileUrl);
		window.open(
			`https://x.com/intent/post?text=${encodeURIComponent(text)}`,
			"_blank",
			"noopener,noreferrer",
		);
	}

	function handleShareBsky() {
		const text = buildProfileShareIntentText(state, profileUrl);
		window.open(
			`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
			"_blank",
			"noopener,noreferrer",
		);
	}

	const { width, height } = PROFILE_SHARE_SIZES[state.format];
	const previewWidth = Math.min(420, width * 0.34);
	const previewScale = previewWidth / width;

	return (
		<section
			style={{
				marginBottom: "1.5rem",
				border: "1px solid var(--border)",
				borderRadius: "4px",
				padding: "0.9rem",
			}}
			aria-labelledby="profile-share-studio-title"
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: "1rem",
					alignItems: "center",
				}}
			>
				<div>
					<div
						id="profile-share-studio-title"
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "0.75rem",
							letterSpacing: "0.1em",
							textTransform: "uppercase",
							color: "var(--fg-3)",
							marginBottom: "0.35rem",
						}}
					>
						Share Studio
					</div>
					<p
						style={{
							margin: 0,
							color: "var(--fg-2)",
							fontSize: "0.8rem",
							lineHeight: 1.5,
						}}
					>
						Share your profile with a custom image.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					style={{
						border: "1px solid var(--border)",
						background: "transparent",
						color: "var(--fg)",
						borderRadius: "4px",
						padding: "0.45rem 0.7rem",
						cursor: "pointer",
						fontFamily: "var(--font)",
						fontSize: "0.72rem",
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						fontWeight: 700,
						flexShrink: 0,
					}}
				>
					{open ? "Hide" : "Share Image"}
				</button>
			</div>

			{open && (
				<div
					style={{
						marginTop: "0.9rem",
						display: "flex",
						flexWrap: "wrap",
						gap: "1rem",
						alignItems: "flex-start",
					}}
				>
					<div
						style={{
							flex: "1 1 320px",
							minWidth: "280px",
							display: "flex",
							flexDirection: "column",
							gap: "0.8rem",
						}}
					>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
								gap: "0.9rem",
							}}
						>
							<div>
								<label htmlFor="share-preset" style={FIELD_LABEL}>
									Preset
								</label>
								<select
									id="share-preset"
									value={state.preset}
									onChange={(event) =>
										setState((current) => {
											const nextPreset = event.target
												.value as ProfileSharePreset;
											const nextColor =
												nextPreset === "mono-poster"
													? current.templateColor
													: PROFILE_SHARE_PRESETS[nextPreset].accent;
											return {
												...current,
												preset: nextPreset,
												templateColor: nextColor,
											};
										})
									}
									style={INPUT_STYLE}
								>
									<option value="circuit-hero">Circuit Hero</option>
									<option value="scanline-glitch">Scanline Glitch</option>
									<option value="mono-poster">Mono Poster</option>
								</select>
							</div>
							<div>
								<label htmlFor="share-format" style={FIELD_LABEL}>
									Format
								</label>
								<select
									id="share-format"
									value={state.format}
									onChange={(event) =>
										setState((current) => ({
											...current,
											format: event.target.value as ProfileShareFormat,
										}))
									}
									style={INPUT_STYLE}
								>
									<option value="og">OG 1200x630</option>
									<option value="portrait">Portrait 1080x1350</option>
									<option value="square">Square 1080x1080</option>
								</select>
							</div>
						</div>

						<div>
							{state.preset === "mono-poster" ? (
								<label
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
										color: "var(--fg-2)",
										fontSize: "0.75rem",
									}}
								>
									<input
										type="checkbox"
										checked={state.monoInvert}
										onChange={(event) =>
											setState((current) => ({
												...current,
												monoInvert: event.target.checked,
											}))
										}
										style={CHECKBOX_STYLE}
									/>
									Invert mono palette
								</label>
							) : (
								<div>
									<label htmlFor="share-template-color" style={FIELD_LABEL}>
										Template Color
									</label>
									<input
										id="share-template-color"
										type="color"
										value={state.templateColor}
										onChange={(event) =>
											setState((current) => ({
												...current,
												templateColor: event.target.value,
											}))
										}
										style={{
											width: "100%",
											height: "2rem",
											border: "1px solid var(--border)",
											borderRadius: "4px",
											background: "var(--bg-2)",
											cursor: "pointer",
											padding: "0.2rem",
										}}
									/>
								</div>
							)}
						</div>

						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
								gap: "0.75rem",
							}}
						>
							<div>
								<label htmlFor="share-circuit-density" style={FIELD_LABEL}>
									Pattern {state.circuitDensity}
								</label>
								<input
									id="share-circuit-density"
									type="range"
									min={0}
									max={100}
									value={state.circuitDensity}
									onChange={(event) =>
										setState((current) => ({
											...current,
											circuitDensity: Number(event.target.value),
										}))
									}
									style={RANGE_STYLE}
								/>
							</div>
							<div>
								<label htmlFor="share-circuit-glow" style={FIELD_LABEL}>
									Energy {state.circuitGlow}
								</label>
								<input
									id="share-circuit-glow"
									type="range"
									min={0}
									max={100}
									value={state.circuitGlow}
									onChange={(event) =>
										setState((current) => ({
											...current,
											circuitGlow: Number(event.target.value),
										}))
									}
									style={RANGE_STYLE}
								/>
							</div>
							<div>
								<label htmlFor="share-glitch-intensity" style={FIELD_LABEL}>
									Glitch {state.glitchIntensity}
								</label>
								<input
									id="share-glitch-intensity"
									type="range"
									min={0}
									max={100}
									value={state.glitchIntensity}
									onChange={(event) =>
										setState((current) => ({
											...current,
											glitchIntensity: Number(event.target.value),
										}))
									}
									style={RANGE_STYLE}
								/>
							</div>
						</div>

						<div
							style={{
								color: "var(--fg-3)",
								fontSize: "0.68rem",
								lineHeight: 1.4,
							}}
						>
							All three sliders apply to every preset.
						</div>

						<div>
							<label htmlFor="share-title" style={FIELD_LABEL}>
								Title
							</label>
							<input
								id="share-title"
								type="text"
								maxLength={72}
								value={state.title}
								onChange={(event) =>
									setState((current) => ({
										...current,
										title: event.target.value,
									}))
								}
								style={INPUT_STYLE}
							/>
						</div>

						<div>
							<label htmlFor="share-subtitle" style={FIELD_LABEL}>
								Subtitle
							</label>
							<textarea
								id="share-subtitle"
								maxLength={180}
								value={state.subtitle}
								onChange={(event) =>
									setState((current) => ({
										...current,
										subtitle: event.target.value,
									}))
								}
								rows={4}
								style={{
									...INPUT_STYLE,
									resize: "vertical",
									minHeight: "6.5rem",
								}}
							/>
						</div>

						<div>
							<label htmlFor="share-cta" style={FIELD_LABEL}>
								CTA
							</label>
							<input
								id="share-cta"
								type="text"
								maxLength={64}
								value={state.cta}
								onChange={(event) =>
									setState((current) => ({
										...current,
										cta: event.target.value,
									}))
								}
								style={INPUT_STYLE}
							/>
						</div>

						<div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
							<button
								type="button"
								onClick={handleDownload}
								style={ACTION_BUTTON}
							>
								<Download size={14} /> Download
							</button>
							<button
								type="button"
								onClick={handleCopyImage}
								style={ACTION_BUTTON}
							>
								<Copy size={14} /> Copy Image
							</button>
							<button
								type="button"
								onClick={handleShareX}
								style={ACTION_BUTTON}
							>
								<SiX size={14} /> Share to X
							</button>
							<button
								type="button"
								onClick={handleShareBsky}
								style={ACTION_BUTTON}
							>
								<SiBluesky size={14} /> Share to Bluesky
							</button>
						</div>

						<div
							style={{
								color: "var(--fg-3)",
								fontSize: "0.72rem",
								lineHeight: 1.45,
							}}
						>
							Posts link to {profileUrl}. The exported image is local-only and
							is not stored server-side.
						</div>

						{message && (
							<div
								aria-live="polite"
								style={{
									color: "var(--fg-2)",
									fontSize: "0.72rem",
									letterSpacing: "0.02em",
								}}
							>
								{message}
							</div>
						)}
					</div>

					<div style={{ flex: "0 1 420px", minWidth: "280px", width: "100%" }}>
						<div
							style={{
								padding: "0.75rem",
								borderRadius: "4px",
								border: "1px solid var(--border)",
								background: "var(--bg-2)",
								display: "flex",
								flexDirection: "column",
								gap: "0.55rem",
								alignItems: "center",
							}}
						>
							<canvas
								ref={canvasRef}
								style={{
									width: width * previewScale,
									height: height * previewScale,
									maxWidth: "100%",
									borderRadius: "4px",
									border: "1px solid var(--border)",
									background: PROFILE_SHARE_PRESETS[state.preset].background,
								}}
							/>
							<div
								style={{
									color: "var(--fg-3)",
									fontSize: "0.65rem",
									fontFamily: "var(--font-mono)",
									letterSpacing: "0.06em",
								}}
							>
								Preview {width}x{height}
							</div>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
