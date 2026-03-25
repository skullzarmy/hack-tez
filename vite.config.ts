import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@netlify/vite-plugin";

export default defineConfig({
    plugins: [react(), tailwindcss(), netlify()],
    define: {
        // Node.js polyfills needed by Taquito/beacon
        global: "globalThis",
    },
    resolve: {
        alias: {
            // buffer polyfill for beacon-sdk
            buffer: "buffer",
        },
    },
});
