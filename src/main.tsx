import { Buffer } from "buffer";
import process from "process";

// Ensure Node globals are available for Taquito/Beacon SDK
globalThis.Buffer = globalThis.Buffer ?? Buffer;
globalThis.process = globalThis.process ?? process;

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing its #root element");

// If the root already has SSR-rendered content, hydrate (attach event handlers
// to existing HTML). Otherwise create a fresh client-side render.
if (root.hasChildNodes()) {
    hydrateRoot(
        root,
        <StrictMode>
            <App />
        </StrictMode>,
    );
} else {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // SW registration failure is non-fatal
        });
        // When a new SW takes control, reload to pick up fresh assets
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.location.reload();
        });
    });
}
