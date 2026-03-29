import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function requireMainnetEnv(): Plugin {
    return {
        name: "require-mainnet-env",
        configResolved(config) {
            if (!config.env.VITE_REGISTRAR_ADDRESS) {
                throw new Error(
                    "[hack.tez] VITE_REGISTRAR_ADDRESS must be set.\n" +
                        "Set it in your .env file or CI/CD environment variables.",
                );
            }
        },
    };
}

/** Netlify CLI makes a probe TCP connection to Vite's HTTP server during startup.
 *  If the connection resets (e.g. timing, dep-optimization flush) before Vite
 *  finishes reading the request, Node emits ECONNRESET with no handler → crash.
 *  Attach error handlers on every incoming socket and via clientError so Vite
 *  ignores these transient disconnects instead of exiting. */
function handleProbeDisconnects(): Plugin {
    return {
        name: "handle-probe-disconnects",
        configureServer(server: ViteDevServer) {
            const swallow = (err: NodeJS.ErrnoException) => {
                if (err.code === "ECONNRESET" || err.code === "EPIPE") return;
                console.error(err);
            };
            server.httpServer?.on("connection", (socket) => {
                socket.on("error", swallow);
            });
            server.httpServer?.on("clientError", (err: NodeJS.ErrnoException, socket) => {
                if (err.code === "ECONNRESET" || err.code === "EPIPE") {
                    socket.destroy();
                    return;
                }
                socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
            });
        },
    };
}

export default defineConfig({
    plugins: [requireMainnetEnv(), handleProbeDisconnects(), react(), tailwindcss()],
    define: {
        global: "globalThis",
        "process.env": "{}",
    },
    resolve: {
        alias: {
            buffer: "buffer/",
            stream: "stream-browserify",
            util: "util/",
            process: "process",
        },
    },
    build: {
        // Generate source maps for the Best Practices audit
        sourcemap: true,
        // Disable the module preload polyfill — it injects an inline script,
        // which would require 'unsafe-inline' in CSP.  All target browsers
        // support <link rel="modulepreload"> natively.
        modulePreload: { polyfill: false },
        rollupOptions: {
                output: {
                    manualChunks(id: string) {
                        if (id.includes("node_modules")) {
                            if (
                                id.includes("/react/") ||
                                id.includes("/react-dom/") ||
                                id.includes("/react-router")
                            ) {
                                return "vendor-react";
                            }
                            if (
                                id.includes("/buffer/") ||
                                id.includes("stream-browserify") ||
                                id.includes("/util/") ||
                                id.includes("/process/") ||
                                id.includes("/events/")
                            ) {
                                return "vendor-polyfill";
                            }
                        }
                    },
                },
            },
    },
    optimizeDeps: {
        // Pre-bundle the ENTIRE dependency chain at startup.
        //
        // The @tezos-x SDK ESM barrel re-exports from all sub-packages, which
        // import CJS-only @walletconnect/* packages. Vite 8/Rolldown won't
        // convert those named CJS exports to ESM unless they are pre-bundled.
        // The ECONNRESET patch (scripts/netlify-dev-patch.cjs) handles the
        // transient socket drop that pre-bundling this large tree can trigger.
        include: [
            "react",
            "react-dom",
            "react-dom/client",
            "react-router-dom",
            "@taquito/michel-codec",
            "blakejs",
            "buffer",
            "stream-browserify",
            "util",
            "process",
            "events",
            // @walletconnect CJS-only packages
            "@walletconnect/time",
            "@walletconnect/environment",
            "@walletconnect/window-getters",
            "@walletconnect/window-metadata",
            // Full @tezos-x SDK chain — must be pre-bundled together
            // UI package is included despite fs/crypto warnings (they get
            // externalized safely; no browser code paths hit those modules)
            "@tezos-x/octez.connect-sdk",
            "@tezos-x/octez.connect-core",
            "@tezos-x/octez.connect-dapp",
            "@tezos-x/octez.connect-types",
            "@tezos-x/octez.connect-utils",
            "@tezos-x/octez.connect-wallet",
            "@tezos-x/octez.connect-blockchain-tezos",
            "@tezos-x/octez.connect-blockchain-substrate",
            "@tezos-x/octez.connect-transport-matrix",
            "@tezos-x/octez.connect-transport-postmessage",
            "@tezos-x/octez.connect-transport-walletconnect",
            "@tezos-x/octez.connect-ui",
        ],
    },
    server: {
        // When running through `netlify dev` (port 8888), tell the Vite HMR
        // client which port the browser actually sees so WS connects correctly.
        hmr: process.env.VITE_HMR_CLIENT_PORT
            ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
            : true,
    },
});
