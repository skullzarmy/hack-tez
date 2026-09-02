#!/usr/bin/env node
/**
 * Launcher for `netlify dev`.
 *
 * The preload in netlify-dev-patch.cjs has to be passed as an ABSOLUTE path.
 * With a relative one (`--require ./scripts/netlify-dev-patch.cjs`) the CLI
 * starts fine, but every child process it spawns inherits NODE_OPTIONS and
 * resolves that path against its own working directory. Netlify's plugin
 * install runs in `.netlify/plugins/`, where it does not exist, so the install
 * fails with MODULE_NOT_FOUND and the dev server can wedge on startup.
 *
 * Resolving from this file's own location fixes it for every child, and works
 * no matter where npm was invoked from.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const patch = join(here, "netlify-dev-patch.cjs");

const existing = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : "";

const child = spawn("netlify", ["dev", ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: true,
    env: {
        ...process.env,
        NODE_OPTIONS: `${existing}--require ${JSON.stringify(patch)}`,
        VITE_HMR_CLIENT_PORT: process.env.VITE_HMR_CLIENT_PORT ?? "8888",
    },
});

child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
});
