import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { joinAsViewer } from "@/lib/broadcast";
import { LiveComments } from "@/components/live/LiveComments";

export const Route = createFileRoute("/live/$id")({
  head: () => ({
    meta: [
      { title: "Watch live — KAIROS APP" },
      { name: "description", content: "Watch a live church service on KAIROS APP." },
      { property: "og:title", content: "Watch live — KAIROS APP" },
      { property: "og:description", content: "Join this live service as it happens." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"connecting" | "playing" | "ended">("connecting");
  const [muted, setMuted] = useState(true);

  const stream = useQuery({
    queryKey: ["live-stream", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_streams")
        .select("*, ministries(name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!stream.data?.is_live) return;
    const leave = joinAsViewer(
      id,
      (s) => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setStatus("playing");
      },
      () => setStatus("ended"),
    );
    return leave;
  }, [id, stream.data?.is_live]);

  const s = stream.data;
  const ended = status === "ended" || (s && !s.is_live);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="relative overflow-hidden rounded-2xl glass">
          <video ref={videoRef} playsInline muted={muted} className="aspect-video w-full bg-ink object-cover" />
          {!ended && status === "playing" ? (
            <span className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-live px-3 py-1 text-xs font-bold text-destructive-foreground">
              <span className="live-dot" /> LIVE
            </span>
          ) : null}
          {status !== "playing" || ended ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {stream.isLoading ? "Loading…" : ended ? "This live has ended." : "Connecting to the live video…"}
            </div>
          ) : null}
          {status === "playing" && !ended ? (
            <button
              onClick={() => setMuted((m) => !m)}
              className="glass-strong absolute bottom-3 right-3 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              {muted ? "🔇 Tap for sound" : "🔊 Sound on"}
            </button>
          ) : null}
        </div>

        <SectionCard
          title={s?.title ?? "Live service"}
          icon="🔴"
          tone="give"
          action={<Link to="/giving" className="brand-mark rounded-full px-4 py-1.5 text-xs font-bold text-ink">Give / Seed</Link>}
        >
          <p className="text-sm text-muted-foreground">
            {s?.ministries?.name ?? ""} · Live video goes straight from the host to each viewer, best for small
            gatherings (around 10–20 viewers).
          </p>
        </SectionCard>

        <LiveComments streamId={id} />
      </div>
    </AppShell>
  );
}
