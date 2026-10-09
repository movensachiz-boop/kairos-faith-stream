import { createFileRoute } from "@tanstack/react-router";

// Fetches an outside picture server-side so the live canvas can draw it without CORS blocks.
// Only image hosts we search are allowed, so this cannot be used as an open proxy.
const ALLOWED_HOSTS = ["upload.wikimedia.org", "commons.wikimedia.org", "en.wikipedia.org", "wikipedia.org"];

export const Route = createFileRoute("/api/public/lookup-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        const host = target.hostname.toLowerCase();
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
          return new Response("Not found", { status: 404 });
        }
        const upstream = await fetch(target, { headers: { "User-Agent": "KairosApp/1.0 (live presentation)" } }).catch(() => null);
        const type = upstream?.headers.get("content-type") ?? "";
        if (!upstream?.ok || !type.startsWith("image/")) return new Response("Not found", { status: 404 });
        return new Response(upstream.body, {
          headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
