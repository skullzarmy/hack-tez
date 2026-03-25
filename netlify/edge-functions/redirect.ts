/**
 * Netlify Edge Function: Wildcard redirect handler for *.hack.tez.page
 *
 * Extracts the subdomain from the hostname, looks up the redirect URL
 * in Netlify Blobs, and returns a 302 redirect.
 */
import { getStore } from "https://esm.sh/@netlify/blobs@10";
import type { Context } from "https://edge.netlify.com";

export default async (req: Request, context: Context) => {
    const hostname = new URL(req.url).hostname;

    // Extract subdomain from *.hack.tez.page
    const match = hostname.match(/^([^.]+)\.hack\.tez\.page$/);
    if (!match) {
        // Not a subdomain request — pass through to the SPA
        return context.next();
    }

    const subdomain = match[1].toLowerCase();

    try {
        const store = getStore({ name: "redirects", consistency: "strong" });
        const data = await store.get(subdomain);

        if (!data) {
            // No redirect configured — show a branded fallback
            return new Response(
                `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subdomain}.hack.tez</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111827; color: #9ca3af; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { text-align: center; padding: 2rem; }
    h1 { color: #fff; font-size: 2rem; margin-bottom: 0.5rem; }
    .domain { color: #34d399; }
    a { color: #34d399; }
  </style>
</head>
<body>
  <div class="card">
    <h1><span class="domain">${subdomain}.hack.tez</span></h1>
    <p>This subdomain exists but has no redirect configured.</p>
    <p style="margin-top: 1rem;"><a href="https://hack.tez.page/manage">Configure it →</a></p>
  </div>
</body>
</html>`,
                {
                    status: 200,
                    headers: { "Content-Type": "text/html" },
                },
            );
        }

        const parsed = JSON.parse(data);
        return Response.redirect(parsed.redirectUrl, 302);
    } catch (error) {
        console.error("Edge redirect error:", error);
        return context.next();
    }
};

export const config = {
    path: "/*",
    onError: "bypass",
};
