import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { StrictMode } from "react";
import { TezosProvider } from "./context/TezosContext";
import { AppShell } from "./App";

export function render(url: string): string {
    return renderToString(
        <StrictMode>
            <StaticRouter location={url}>
                <TezosProvider>
                    <AppShell />
                </TezosProvider>
            </StaticRouter>
        </StrictMode>,
    );
}
