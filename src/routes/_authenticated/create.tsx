import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startHost } from "@/lib/broadcast";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create — KAIROS APP" },
      { name: "description", content: "Share a word, a sermon, a testimony, go live or send a prayer request." },
      { property: "og:title", content: "Create — KAIROS APP" },
      { property: "og:description", content: "Publish Christian content to the KAIROS community." },
    ],
  }),
  component: CreatePage,
});

const kinds = ["text", "sermon", "testimony", "video"] as const;

function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ministries = useQuery(ministriesQuery());

  const [tab, setTab] = useState<"post" | "prayer" | "live">("post");
  const [kind, setKind] = useState<(typeof kinds)[number]>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scripture, setScripture] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  // Live state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveTitle, setLiveTitle] = useState("");
  const stopBroadcastRef = useRef<null | (() => void)>(null);
  const [viewers, setViewers] = useState(0);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => () => {
    stopBroadcastRef.current?.();
    stopCamera();
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Camera access was denied.");
    }
  }

  async function goLive() {
    if (!user) {
      toast.error("Sign in to go live.");
      return;
    }
    if (!ministryId) {
      toast.error("Pick a ministry you lead to go live from.");
      return;
    }
    if (!streamRef.current) await startCamera();
    if (!streamRef.current) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        created_by: user.id,
        ministry_id: ministryId,
        title: liveTitle || "Live service",
        is_live: true,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLiveId(data.id);
    stopBroadcastRef.current = startHost(data.id, streamRef.current, setViewers);
    queryClient.invalidateQueries({ queryKey: ["live-streams"] });
    toast.success("You are live!");
  }

  async function endLive() {
    if (!liveId) return;
    setBusy(true);
    const { error } = await supabase.from("live_streams").update({ is_live: false }).eq("id", liveId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    stopBroadcastRef.current?.();
    stopBroadcastRef.current = null;
    setViewers(0);
    setLiveId(null);
    stopCamera();
    queryClient.invalidateQueries({ queryKey: ["live-streams"] });
    toast.success("Live ended.");
    navigate({ to: "/live" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    if (tab === "post") {
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        ministry_id: ministryId || null,
        kind,
        title: title || null,
        body: body || null,
        scripture_ref: scripture || null,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Published to your feed.");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    } else {
      const { error } = await supabase.from("prayer_requests").insert({
        author_id: user.id,
        ministry_id: ministryId || null,
        body,
        is_anonymous: anonymous,
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Prayer request shared.");
      queryClient.invalidateQueries({ queryKey: ["prayers"] });
    }
    navigate({ to: "/" });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <SectionCard title="Create" icon="➕">
          <div className="mb-4 flex gap-2">
            {(["post", "prayer", "live"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize ${
                  tab === t ? "bg-gold text-ink" : "glass text-muted-foreground"
                }`}
              >
                {t === "post" ? "Post / Sermon" : t === "prayer" ? "Prayer request" : "🔴 Go Live"}
              </button>
            ))}
          </div>

          {tab === "live" ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl">
                <video ref={videoRef} muted playsInline className="aspect-video w-full bg-ink object-cover" />
                {liveId ? (
                  <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-live px-3 py-1 text-xs font-bold text-white">
                    <span className="live-dot" /> LIVE · {viewers} watching
                  </span>
                ) : null}
                {!cameraOn ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Camera is off
                  </div>
                ) : null}
              </div>

              <input
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="Live title (e.g. Sunday Service)"
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />

              <select
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
                className="glass w-full rounded-xl bg-card px-4 py-3 text-sm outline-none"
              >
                <option value="">Choose a ministry you lead…</option>
                {(ministries.data ?? []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                {!cameraOn ? (
                  <button
                    onClick={startCamera}
                    className="glass flex-1 rounded-xl py-3 text-sm font-semibold text-azure"
                  >
                    Start camera
                  </button>
                ) : null}
                {!liveId ? (
                  <button
                    onClick={goLive}
                    disabled={busy}
                    className="brand-mark flex-1 rounded-xl py-3 text-sm font-semibold text-ink disabled:opacity-60"
                  >
                    {busy ? "Starting…" : "🔴 Go live now"}
                  </button>
                ) : (
                  <button
                    onClick={endLive}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-live py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Ending…" : "End live"}
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                When you go live, your video is broadcast to anyone who opens your stream on the Live page. Video goes
                straight from your device to each viewer, so it works best for around 10–20 viewers. Keep this page open
                while live.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {tab === "post" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {kinds.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                          kind === k ? "bg-foreground/15" : "glass text-muted-foreground"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </>
              ) : null}

              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder={
                  tab === "post" ? "Share the word God gave you…" : "What can the community pray with you about?"
                }
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />

              {tab === "post" ? (
                <input
                  value={scripture}
                  onChange={(e) => setScripture(e.target.value)}
                  placeholder="Scripture reference (e.g. Psalm 46:10)"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              ) : (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  Post anonymously
                </label>
              )}

              <select
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
                className="glass w-full rounded-xl bg-card px-4 py-3 text-sm outline-none"
              >
                <option value="">No ministry (personal)</option>
                {(ministries.data ?? []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <button
                disabled={busy}
                className="brand-mark w-full rounded-xl py-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
            </form>
          )}
        </SectionCard>

        <SectionCard title="Video recording" icon="🎥">
          <p className="text-sm text-muted-foreground">
            In-app video recording with background music, voice balancing, noise removal and automatic captions is
            not built yet. For now you can publish written posts, sermons and testimonies.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
