import { Buffer } from "buffer";
import process from "process";

// Ensure Node globals are available for Taquito/Beacon SDK
globalThis.Buffer = globalThis.Buffer ?? Buffer;
globalThis.process = globalThis.process ?? process;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

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
