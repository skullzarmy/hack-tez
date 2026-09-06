import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useConsole } from "../../context/ConsoleContext";
import { commands, findCommand } from "./commands";

const HISTORY_KEY = "hacktez-console-history";
const HISTORY_LIMIT = 50;
const HEIGHT_KEY = "hacktez-console-height";
const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 320;
const HEIGHT_STEP = 24;
const BOTTOM_THRESHOLD = 8;

function maxHeight(): number {
	if (typeof window === "undefined") return 480;
	return Math.round(window.innerHeight * 0.85);
}

function clampHeight(px: number): number {
	return Math.min(maxHeight(), Math.max(MIN_HEIGHT, px));
}

function loadHeight(): number {
	if (typeof window === "undefined") return DEFAULT_HEIGHT;
	try {
		const stored = localStorage.getItem(HEIGHT_KEY);
		if (stored) return clampHeight(Number(stored));
	} catch {
		// localStorage can throw in private mode — fall through to default.
	}
	return clampHeight(DEFAULT_HEIGHT);
}

function saveHeight(px: number) {
	try {
		localStorage.setItem(HEIGHT_KEY, String(px));
	} catch {
		// localStorage can throw in private mode — height just won't persist.
	}
}

interface TranscriptEntry {
	id: number;
	command: string;
	output: ReactNode;
}

function loadHistory(): string[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		return raw ? (JSON.parse(raw) as string[]) : [];
	} catch {
		return [];
	}
}

function saveHistory(history: string[]) {
	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
	} catch {
		// localStorage can throw in private mode — history just won't persist.
	}
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function helpOutput(): ReactNode {
	const byCategory = new Map<string, typeof commands>();
	for (const def of commands) {
		if (def.hidden) continue;
		const list = byCategory.get(def.category) ?? [];
		list.push(def);
		byCategory.set(def.category, list);
	}
	return (
		<div>
			{Array.from(byCategory.entries()).map(([category, defs]) => (
				<div key={category} className="dev-console-help-section">
					<div className="dev-console-help-heading">{category}</div>
					{defs.map((def) => (
						<div key={def.aliases[0]} className="dev-console-help-row">
							<span className="dev-console-help-command">{def.aliases[0]}</span>
							<span className="dev-console-help-desc">{def.description}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export default function DevConsole() {
	const { isOpen, close, toggle } = useConsole();
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const outputRef = useRef<HTMLDivElement>(null);
	const previousActiveElement = useRef<HTMLElement | null>(null);
	const resizeHandleRef = useRef<HTMLDivElement>(null);
	const nextId = useRef(0);
	const heightRef = useRef(0);

	const [value, setValue] = useState("");
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const [history, setHistory] = useState<string[]>(() => loadHistory());
	const [historyCursor, setHistoryCursor] = useState<number | null>(null);
	const [height, setHeight] = useState<number>(() => loadHeight());
	const [pinnedToBottom, setPinnedToBottom] = useState(true);
	heightRef.current = height;

	// Global trigger: physical backtick key, ignored while typing elsewhere.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.code !== "Backquote" || e.metaKey || e.ctrlKey || e.altKey) return;
			if (!isOpen && isEditableTarget(e.target)) return;
			e.preventDefault();
			toggle();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen, toggle]);

	// Open/close side effects: focus capture + restore, background inert.
	useEffect(() => {
		const root = document.getElementById("root");
		if (isOpen) {
			previousActiveElement.current = document.activeElement as HTMLElement | null;
			root?.setAttribute("inert", "");
			setPinnedToBottom(true);
			const id = window.setTimeout(() => inputRef.current?.focus(), 0);
			return () => window.clearTimeout(id);
		}
		root?.removeAttribute("inert");
		const prev = previousActiveElement.current;
		if (prev && document.contains(prev)) {
			prev.focus();
		}
		previousActiveElement.current = null;
	}, [isOpen]);

	// Sticky-bottom scroll: only auto-follow new output while the user is
	// already at the bottom. Scrolling away leaves them alone; scrolling
	// hard back down to the bottom re-pins (handled in handleOutputScroll).
	// biome-ignore lint/correctness/useExhaustiveDependencies: transcript isn't read in the body — it's the trigger to re-check the scroll position on new output.
	useEffect(() => {
		if (pinnedToBottom && outputRef.current) {
			outputRef.current.scrollTop = outputRef.current.scrollHeight;
		}
	}, [transcript, pinnedToBottom]);

	function handleOutputScroll() {
		const el = outputRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		setPinnedToBottom(distanceFromBottom <= BOTTOM_THRESHOLD);
	}

	function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
		e.preventDefault();
		const startY = e.clientY;
		const startHeight = heightRef.current;

		function onMove(ev: PointerEvent) {
			const next = clampHeight(startHeight + (startY - ev.clientY));
			setHeight(next);
		}
		function onUp() {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			saveHeight(heightRef.current);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}

	function handleResizeKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			const next = clampHeight(heightRef.current + HEIGHT_STEP);
			setHeight(next);
			saveHeight(next);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = clampHeight(heightRef.current - HEIGHT_STEP);
			setHeight(next);
			saveHeight(next);
		} else if (e.key === "Home") {
			e.preventDefault();
			setHeight(MIN_HEIGHT);
			saveHeight(MIN_HEIGHT);
		} else if (e.key === "End") {
			e.preventDefault();
			const next = maxHeight();
			setHeight(next);
			saveHeight(next);
		}
	}

	const runCommand = useCallback(
		(raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed) return;

			const nextHistory = [...history, trimmed];
			setHistory(nextHistory);
			saveHistory(nextHistory);
			setHistoryCursor(null);

			const def = findCommand(trimmed);

			if (def?.aliases[0] === "help") {
				setTranscript((t) => [...t, { id: nextId.current++, command: trimmed, output: helpOutput() }]);
				return;
			}

			if (!def) {
				setTranscript((t) => [
					...t,
					{
						id: nextId.current++,
						command: trimmed,
						output: <div>{`Command not found: ${trimmed}. Type 'help' for available commands.`}</div>,
					},
				]);
				return;
			}

			const result = def.run({ close });
			if (result.clear) {
				setTranscript([]);
				return;
			}
			if (result.output !== undefined && result.output !== null) {
				setTranscript((t) => [...t, { id: nextId.current++, command: trimmed, output: result.output }]);
			}
		},
		[history, close],
	);

	function handleSubmit(e: ReactKeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			runCommand(value);
			setValue("");
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			if (history.length === 0) return;
			const nextCursor = historyCursor === null ? history.length - 1 : Math.max(0, historyCursor - 1);
			setHistoryCursor(nextCursor);
			setValue(history[nextCursor]);
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (historyCursor === null) return;
			const nextCursor = historyCursor + 1;
			if (nextCursor >= history.length) {
				setHistoryCursor(null);
				setValue("");
			} else {
				setHistoryCursor(nextCursor);
				setValue(history[nextCursor]);
			}
		}
	}

	function handleContainerKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
		if (e.key === "Escape") {
			e.preventDefault();
			close();
			return;
		}
		if (e.key !== "Tab") return;
		const focusables = [resizeHandleRef.current, inputRef.current, closeButtonRef.current].filter(
			(el): el is HTMLElement => el !== null,
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	if (!isOpen) return null;

	return createPortal(
		<div
			ref={containerRef}
			className="dev-console"
			role="dialog"
			aria-modal="true"
			aria-labelledby="dev-console-heading"
			onKeyDown={handleContainerKeyDown}
			style={{ height }}
		>
			<h2 id="dev-console-heading" className="sr-only">
				Developer console
			</h2>
			{/* biome-ignore lint/a11y/useSemanticElements: this is an interactive, keyboard/pointer-draggable splitter (ARIA APG "window splitter" pattern), not a static <hr> thematic break. */}
			<div
				ref={resizeHandleRef}
				className="dev-console-resize-handle"
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize console"
				aria-valuenow={Math.round(height)}
				aria-valuemin={MIN_HEIGHT}
				aria-valuemax={maxHeight()}
				tabIndex={0}
				onPointerDown={handleResizePointerDown}
				onKeyDown={handleResizeKeyDown}
			/>
			<div className="dev-console-output" ref={outputRef} onScroll={handleOutputScroll} aria-live="polite">
				{transcript.map((entry) => (
					<div key={entry.id} className="dev-console-entry">
						<div className="dev-console-line">
							<span className="dev-console-prompt-label">root@hack.tez:~$</span> {entry.command}
						</div>
						<div className="dev-console-result">{entry.output}</div>
					</div>
				))}
			</div>
			<div className="dev-console-input-row">
				<span className="dev-console-prompt-label" aria-hidden="true">
					root@hack.tez:~$
				</span>
				<input
					ref={inputRef}
					type="text"
					className="dev-console-input"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleSubmit}
					aria-label="Console command input"
					autoComplete="off"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
				/>
				<button
					ref={closeButtonRef}
					type="button"
					className="dev-console-close"
					onClick={close}
					aria-label="Close console"
				>
					✕
				</button>
			</div>
		</div>,
		document.body,
	);
}
