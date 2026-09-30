import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"connecting" | "playing" | "ended">("connecting");
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onChange = () => setExpanded(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleExpand() {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    // iPhone Safari only allows fullscreen on the video element itself
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!shell.requestFullscreen) {
      video?.webkitEnterFullscreen?.();
      return;
    }
    await shell.requestFullscreen().catch(() => {});
  }

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
        <div
          ref={shellRef}
          className={`relative overflow-hidden ${expanded ? "flex h-full w-full items-center justify-center bg-ink" : "rounded-2xl glass"}`}
        >
          <video
            ref={videoRef}
            playsInline
            muted={muted}
            className={expanded ? "h-full w-full bg-ink object-contain" : "aspect-video w-full bg-ink object-cover"}
          />
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
          <div className="absolute bottom-3 right-3 flex gap-2">
            {status === "playing" && !ended ? (
              <button
                onClick={() => setMuted((m) => !m)}
                className="glass-strong rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                {muted ? "🔇 Tap for sound" : "🔊 Sound on"}
              </button>
            ) : null}
            <button
              onClick={toggleExpand}
              aria-label={expanded ? "Exit full screen" : "Full screen"}
              className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {expanded ? "Exit full screen" : "Full screen"}
            </button>
          </div>
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
