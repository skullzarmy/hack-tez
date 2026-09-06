import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

interface ConsoleContextValue {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((v) => !v), []);

	return <ConsoleContext.Provider value={{ isOpen, open, close, toggle }}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
	const ctx = useContext(ConsoleContext);
	if (!ctx) throw new Error("useConsole must be used within a ConsoleProvider");
	return ctx;
}
