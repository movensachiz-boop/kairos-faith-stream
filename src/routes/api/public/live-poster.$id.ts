import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/live-poster/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: live } = await supabaseAdmin.from("live_streams").select("thumbnail_url").eq("id", params.id).maybeSingle();
        if (!live?.thumbnail_url) return new Response("Not found", { status: 404 });
        const { data, error } = await supabaseAdmin.storage.from("live-posters").download(live.thumbnail_url);
        if (error || !data || !["image/jpeg", "image/png", "image/webp"].includes(data.type)) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(data, { headers: { "Content-Type": data.type, "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});