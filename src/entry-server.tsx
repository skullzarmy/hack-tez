import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import { StrictMode } from "react";
import { TezosProvider } from "./context/TezosContext";
import { OnboardingProvider } from "./context/OnboardingContext";
import { ConsoleProvider } from "./context/ConsoleContext";
import { AppShell } from "./App";
import { Writable } from "node:stream";

export function render(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        let html = "";
        const writable = new Writable({
            write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
                html += chunk.toString();
                cb();
            },
        });
        const { pipe } = renderToPipeableStream(
            <StrictMode>
                <StaticRouter location={url}>
                    <TezosProvider>
                        <OnboardingProvider>
                            <ConsoleProvider>
                                <AppShell />
                            </ConsoleProvider>
                        </OnboardingProvider>
                    </TezosProvider>
                </StaticRouter>
            </StrictMode>,
            {
                onAllReady() {
                    pipe(writable);
                    writable.on("finish", () => resolve(html));
                },
                onError: reject,
            },
        );
    });
}
