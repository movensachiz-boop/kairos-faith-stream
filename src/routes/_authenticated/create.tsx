import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Camera, Check, Link2, Radio, Smartphone } from "lucide-react";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startHost, type CameraSlot, type CameraStatus, type HostController } from "@/lib/broadcast";
import { LiveComments } from "@/components/live/LiveComments";

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
  const hostRef = useRef<HostController | null>(null);
  const [viewers, setViewers] = useState(0);
  const [activeCamera, setActiveCamera] = useState<1 | CameraSlot>(1);
  const cameraTokensRef = useRef<Record<CameraSlot, string>>({ 2: crypto.randomUUID(), 3: crypto.randomUUID() });
  const camera2Ref = useRef<HTMLVideoElement | null>(null);
  const camera3Ref = useRef<HTMLVideoElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<Record<CameraSlot, CameraStatus>>({
    2: "waiting",
    3: "waiting",
  });

  // Audio mixing: voice + background music -> one audio track sent to viewers
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mixedRef = useRef<MediaStream | null>(null);
  const [voiceVol, setVoiceVol] = useState(100);
  const [musicVol, setMusicVol] = useState(25);
  const [musicName, setMusicName] = useState("");
  const [musicPlaying, setMusicPlaying] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    musicElRef.current?.pause();
    setMusicPlaying(false);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    mixedRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => () => {
    hostRef.current?.stop();
    stopCamera();
  }, []);

  useEffect(() => {
    if (voiceGainRef.current) voiceGainRef.current.gain.value = voiceVol / 100;
  }, [voiceVol]);
  useEffect(() => {
    if (musicGainRef.current) musicGainRef.current.gain.value = musicVol / 100;
  }, [musicVol]);

  function buildMix(stream: MediaStream) {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = voiceVol / 100;
    if (stream.getAudioTracks().length) ctx.createMediaStreamSource(stream).connect(voiceGain);
    voiceGain.connect(dest);

    const musicGain = ctx.createGain();
    musicGain.gain.value = musicVol / 100;
    musicGain.connect(dest);
    musicGain.connect(ctx.destination); // so you can hear the music too

    const el = musicElRef.current ?? new Audio();
    el.loop = true;
    musicElRef.current = el;
    const musicSource = musicSourceRef.current ?? ctx.createMediaElementSource(el);
    musicSourceRef.current = musicSource;
    musicSource.connect(musicGain);

    audioCtxRef.current = ctx;
    voiceGainRef.current = voiceGain;
    musicGainRef.current = musicGain;
    mixedRef.current = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  }

  function pickMusic(file: File | undefined) {
    if (!file) return;
    if (!musicElRef.current) musicElRef.current = new Audio();
    musicElRef.current.src = URL.createObjectURL(file);
    musicElRef.current.loop = true;
    setMusicName(file.name);
    setMusicPlaying(false);
  }

  async function toggleMusic() {
    const el = musicElRef.current;
    if (!el?.src) {
      toast.error("Choose a song first.");
      return;
    }
    if (!audioCtxRef.current) {
      toast.error("Start the camera first.");
      return;
    }
    await audioCtxRef.current.resume();
    if (el.paused) {
      await el.play();
      setMusicPlaying(true);
    } else {
      el.pause();
      setMusicPlaying(false);
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      buildMix(stream);
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
    if (!streamRef.current) await startCamera();
    if (!streamRef.current) return;
    setBusy(true);
    let channelId = ministryId;
    if (!channelId) {
      // Personal live: use (or create) the user's own personal channel.
      const slug = `personal-${user.id}`;
      const existing = await supabase.from("ministries").select("id").eq("slug", slug).maybeSingle();
      if (existing.data) {
        channelId = existing.data.id;
      } else {
        const name = (user.user_metadata?.["display_name"] as string) || user.email?.split("@")[0] || "My";
        const created = await supabase
          .from("ministries")
          .insert({ slug, name: `${name}'s channel`, owner_id: user.id, category: "Personal" })
          .select("id")
          .single();
        if (created.error) {
          setBusy(false);
          toast.error(created.error.message);
          return;
        }
        channelId = created.data.id;
      }
    }
    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        created_by: user.id,
        ministry_id: channelId,
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
    hostRef.current = startHost(
      data.id,
      mixedRef.current ?? streamRef.current,
      cameraTokensRef.current,
      setViewers,
      (slot, remoteStream, status) => {
        setCameraStatus((current) => ({ ...current, [slot]: status }));
        const element = slot === 2 ? camera2Ref.current : camera3Ref.current;
        if (element) {
          element.srcObject = remoteStream;
          if (remoteStream) void element.play().catch(() => {});
        }
      },
    );
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
    hostRef.current?.stop();
    hostRef.current = null;
    setViewers(0);
    setActiveCamera(1);
    setCameraStatus({ 2: "waiting", 3: "waiting" });
    setLiveId(null);
    stopCamera();
    queryClient.invalidateQueries({ queryKey: ["live-streams"] });
    toast.success("Live ended.");
    navigate({ to: "/live" });
  }

  async function selectCamera(slot: 1 | CameraSlot) {
    await hostRef.current?.useCamera(slot);
    setActiveCamera(slot);
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
              <div className="relative overflow-hidden rounded-md border border-border">
                <video ref={videoRef} muted playsInline className="aspect-video w-full bg-ink object-cover" />
                {liveId ? (
                  <span className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-live px-3 py-1 text-xs font-bold text-destructive-foreground">
                    <span className="live-dot" /> LIVE · {viewers} watching
                  </span>
                ) : null}
                {!cameraOn ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Camera is off
                  </div>
                ) : null}
              </div>

              {liveId ? (
                <div className="space-y-3 border-y border-border py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-semibold">Camera control</h3>
                      <p className="text-xs text-muted-foreground">Switch the video shot. Camera 1 always supplies sound.</p>
                    </div>
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-primary">
                      Camera {activeCamera} on air
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CameraTile
                      slot={1}
                      active={activeCamera === 1}
                      connected
                      preview={<video muted playsInline ref={(node) => {
                        if (node && streamRef.current) {
                          node.srcObject = streamRef.current;
                          void node.play().catch(() => {});
                        }
                      }} className="h-full w-full object-cover" />}
                      onSelect={() => selectCamera(1)}
                    />
                    <CameraTile
                      slot={2}
                      active={activeCamera === 2}
                      connected={cameraStatus[2] === "connected"}
                      preview={<video ref={camera2Ref} muted playsInline className="h-full w-full object-cover" />}
                      onSelect={() => selectCamera(2)}
                    />
                    <CameraTile
                      slot={3}
                      active={activeCamera === 3}
                      connected={cameraStatus[3] === "connected"}
                      preview={<video ref={camera3Ref} muted playsInline className="h-full w-full object-cover" />}
                      onSelect={() => selectCamera(3)}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <PairingQR streamId={liveId} slot={2} token={cameraTokensRef.current[2]} status={cameraStatus[2]} />
                    <PairingQR streamId={liveId} slot={3} token={cameraTokensRef.current[3]} status={cameraStatus[3]} />
                  </div>
                </div>
              ) : null}

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
                <option value="">Personal live — no ministry (optional)</option>
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
                    className="flex-1 rounded-xl bg-live py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                  >
                    {busy ? "Ending…" : "End live"}
                  </button>
                )}
              </div>

              <div className="glass space-y-3 rounded-md p-4">
                <h3 className="font-display text-sm font-semibold">🎵 Background music</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="glass cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-azure">
                    Choose song
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => pickMusic(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={toggleMusic}
                    className="glass rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    {musicPlaying ? "⏸ Pause music" : "▶ Play music"}
                  </button>
                  <span className="truncate text-xs text-muted-foreground">{musicName || "No song chosen"}</span>
                </div>
                <label className="block text-xs text-muted-foreground">
                  Music volume · {musicVol}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVol}
                    onChange={(e) => setMusicVol(Number(e.target.value))}
                    className="mt-1 w-full accent-gold"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Your voice volume · {voiceVol}%
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={voiceVol}
                    onChange={(e) => setVoiceVol(Number(e.target.value))}
                    className="mt-1 w-full accent-azure"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Keep music low (around 15–30%) so your voice is clearly heard. Headphones stop the music echoing
                  into your microphone.
                </p>
              </div>

              {liveId ? <LiveComments streamId={liveId} /> : null}

              <p className="text-xs text-muted-foreground">
                When you go live, viewers receive the selected camera shot and Camera 1 sound. Scan the QR cards with up
                to two more phones, then keep this page open while broadcasting. Best for around 10–20 viewers.
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

function CameraTile({
  slot,
  active,
  connected,
  preview,
  onSelect,
}: {
  slot: 1 | CameraSlot;
  active: boolean;
  connected: boolean;
  preview: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-md border ${active ? "border-primary" : "border-border"}`}>
      <div className="relative aspect-video bg-secondary">
        {preview}
        {!connected ? (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground"><Smartphone className="size-6" /></div>
        ) : null}
        {active ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            <Radio className="size-3" /> ON AIR
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="text-xs font-semibold">Camera {slot}</span>
        <Button type="button" size="sm" variant={active ? "secondary" : "outline"} disabled={!connected || active} onClick={onSelect}>
          {active ? <><Check /> Live</> : "Use shot"}
        </Button>
      </div>
    </div>
  );
}

function PairingQR({
  streamId,
  slot,
  token,
  status,
}: {
  streamId: string;
  slot: CameraSlot;
  token: string;
  status: CameraStatus;
}) {
  const [qr, setQr] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    const cameraLink = `${window.location.origin}/camera/${streamId}?slot=${slot}&token=${encodeURIComponent(token)}`;
    setLink(cameraLink);
    void QRCode.toDataURL(cameraLink, { width: 220, margin: 1 }).then(setQr);
  }, [slot, streamId, token]);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    toast.success(`Camera ${slot} link copied.`);
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4" />
          <span className="text-sm font-semibold">Connect Camera {slot}</span>
        </div>
        <span className={`text-xs font-medium ${status === "connected" ? "text-primary" : "text-muted-foreground"}`}>
          {status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Scan QR"}
        </span>
      </div>
      {status === "connected" ? (
        <div className="mt-3 flex h-28 items-center justify-center gap-2 bg-secondary text-sm text-primary">
          <Check className="size-5" /> Camera ready
        </div>
      ) : qr ? (
        <div className="mt-3 flex justify-center bg-background p-2"><img src={qr} alt={`QR code for Camera ${slot}`} className="size-32" /></div>
      ) : null}
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={copyLink}>
        <Link2 /> Copy camera link
      </Button>
    </div>
  );
}
