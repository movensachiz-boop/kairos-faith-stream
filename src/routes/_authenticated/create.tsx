import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { BookOpen, Camera, Check, ImagePlus, Link2, Maximize2, Minimize2, Music, Radio, Search, Settings2, Smartphone, Square, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startHost, type CameraSlot, type CameraStatus, type HostController, type LogoPosition } from "@/lib/broadcast";
import { LiveComments } from "@/components/live/LiveComments";
import { LiveFaces } from "@/components/live/LiveFaces";
import { VersePanel } from "@/components/live/VersePanel";
import type { VerseSlide } from "@/lib/verse-stage";
import { elapsedLiveTime } from "@/lib/live-time";
import { LiveSpeechControls } from "@/components/live/LiveSpeechControls";
import { LiveLookupPanel } from "@/components/live/LiveLookupPanel";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create — KAIROS APP" },
      { name: "description", content: "Share a word, a sermon, a testimony, go live or send a prayer request." },
      { property: "og:title", content: "Create — KAIROS APP" },
      { property: "og:description", content: "Publish Christian content to the KAIROS community." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

  const [liveTool, setLiveTool] = useState<"bible" | "search" | "music" | "setup">("bible");
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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraStartRef = useRef<Promise<void> | null>(null);
  const [videoDevices, setVideoDevices] = useState<{ id: string; label: string }[]>([]);
  const [mainDeviceId, setMainDeviceId] = useState("");
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      void md.enumerateDevices().then((all) => setVideoDevices(all.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })))).catch(() => {});
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, []);
  const [cameraOn, setCameraOn] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveTitle, setLiveTitle] = useState("");
  const [allowFaces, setAllowFaces] = useState(true);
  const [poster, setPoster] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<VerseSlide | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const hostRef = useRef<HostController | null>(null);
  const [viewers, setViewers] = useState(0);
  const [activeCamera, setActiveCamera] = useState<1 | CameraSlot>(1);
  const [showCameraGrid, setShowCameraGrid] = useState(false);
  const [verseOnScreen, setVerseOnScreen] = useState(false);
  const [recording, setRecording] = useState<{ url: string; name: string } | null>(null);
  const [churchLogo, setChurchLogo] = useState<HTMLImageElement | null>(null);
  const [churchLogoPreview, setChurchLogoPreview] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("top-right");
  const [logoSize, setLogoSize] = useState(16);
  const [liveCaption, setLiveCaption] = useState("");
  const cameraTokensRef = useRef<Record<CameraSlot, string>>({ 2: crypto.randomUUID(), 3: crypto.randomUUID() });
  const camera2Ref = useRef<HTMLVideoElement | null>(null);
  const camera3Ref = useRef<HTMLVideoElement | null>(null);
  const remoteStreamsRef = useRef<Partial<Record<CameraSlot, MediaStream>>>({});
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
    musicElRef.current = null;
    musicSourceRef.current = null;
    voiceGainRef.current = null;
    musicGainRef.current = null;
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
    if (!startedAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => () => { if (posterPreview) URL.revokeObjectURL(posterPreview); }, [posterPreview]);

  useEffect(() => {
    if (voiceGainRef.current) voiceGainRef.current.gain.value = voiceVol / 100;
  }, [voiceVol]);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = verseOnScreen && hostRef.current
      ? hostRef.current.verseCanvas.captureStream(24)
      : activeCamera === 1 ? streamRef.current : (remoteStreamsRef.current[activeCamera] ?? streamRef.current);
    void videoRef.current.play().catch(() => {});
  }, [verseOnScreen, activeCamera, cameraStatus]);
  useEffect(() => {
    if (!showCameraGrid) return;
    for (const slot of [2, 3] as const) {
      const element = slot === 2 ? camera2Ref.current : camera3Ref.current;
      if (element) {
        element.srcObject = remoteStreamsRef.current[slot] ?? null;
        if (element.srcObject) void element.play().catch(() => {});
      }
    }
  }, [showCameraGrid, cameraStatus]);
  useEffect(() => {
    if (musicGainRef.current) musicGainRef.current.gain.value = musicVol / 100;
  }, [musicVol]);

  useEffect(() => { hostRef.current?.setLogo(churchLogo, logoPosition, logoSize); }, [churchLogo, logoPosition, logoSize]);
  useEffect(() => { hostRef.current?.setCaption(liveCaption); }, [liveCaption]);

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

  function buildMix(stream: MediaStream) {
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      musicSourceRef.current = null;
    }
    const ctx = new AudioContext({ latencyHint: "playback", sampleRate: 48000 });
    const dest = ctx.createMediaStreamDestination();
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = voiceVol / 100;
    if (stream.getAudioTracks().length) ctx.createMediaStreamSource(stream).connect(voiceGain);
    voiceGain.connect(dest);

    const musicGain = ctx.createGain();
    musicGain.gain.value = musicVol / 100;
    musicGain.connect(dest);
    // Quieter local monitor so the microphone doesn't re-capture the speakers and chop the music.
    const monitor = ctx.createGain();
    monitor.gain.value = 0.35;
    musicGain.connect(monitor);
    monitor.connect(ctx.destination);

    const el = musicElRef.current ?? new Audio();
    el.loop = true;
    musicElRef.current = el;
    const musicSource = musicSourceRef.current ?? ctx.createMediaElementSource(el);
    musicSourceRef.current = musicSource;
    musicSource.connect(musicGain);

    audioCtxRef.current = ctx;
    voiceGainRef.current = voiceGain;
    musicGainRef.current = musicGain;
    dest.stream.getAudioTracks().forEach((t) => { t.contentHint = "music"; });
    mixedRef.current = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  }

  function setMusicSrc(src: string, name: string) {
    if (!musicElRef.current) musicElRef.current = new Audio();
    const el = musicElRef.current;
    el.crossOrigin = "anonymous";
    el.src = src;
    el.loop = true;
    setMusicName(name);
    setMusicPlaying(false);
  }

  function pickMusic(file: File | undefined) {
    if (!file) return;
    setMusicSrc(URL.createObjectURL(file), file.name);
  }

  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<{ id: string; title: string; artist: string; art: string | null }[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);

  async function searchMusic() {
    const q = musicQuery.trim();
    if (!q) return;
    setMusicSearching(true);
    try {
      const res = await fetch(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=KAIROS&limit=12`);
      const json = (await res.json()) as { data?: any[] };
      const list = (json.data ?? []).filter((t) => t.is_streamable !== false).map((t) => ({
        id: String(t.id), title: String(t.title), artist: String(t.user?.name ?? ""),
        art: (t.artwork?.["150x150"] as string | undefined) ?? null,
      }));
      setMusicResults(list);
      if (!list.length) toast.error("No songs found.");
    } catch {
      toast.error("Music search failed. Try again.");
    } finally {
      setMusicSearching(false);
    }
  }

  async function playTrack(t: { id: string; title: string; artist: string }) {
    // Download the whole song first so it plays smoothly instead of stopping to buffer mid-live.
    const loading = toast.loading("Loading song…");
    let src = `https://api.audius.co/v1/tracks/${t.id}/stream?app_name=KAIROS`;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("download failed");
      src = URL.createObjectURL(await res.blob());
    } catch {
      // Fall back to streaming if the full download isn't possible.
    } finally {
      toast.dismiss(loading);
    }
    const old = musicElRef.current?.src;
    if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
    setMusicSrc(src, `${t.title} — ${t.artist}`);
    const el = musicElRef.current;
    if (!el) return;
    if (audioCtxRef.current) await audioCtxRef.current.resume();
    try {
      await el.play();
      setMusicPlaying(true);
    } catch {
      toast.error("Couldn't play this song.");
    }
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

  async function acquireCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } },
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 },
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

  function startCamera() {
    if (cameraStartRef.current) return cameraStartRef.current;
    if (streamRef.current) return Promise.resolve();
    const pending = acquireCamera().finally(() => { cameraStartRef.current = null; void refreshVideoDevices(); });
    cameraStartRef.current = pending;
    return pending;
  }

  async function refreshVideoDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(all.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch { /* ignore */ }
  }

  async function chooseMainCamera(deviceId: string) {
    const stream = streamRef.current;
    if (!stream) { toast.error("Start the camera first."); return; }
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const track = fresh.getVideoTracks()[0];
      if (!track) return;
      stream.getVideoTracks().forEach((old) => { stream.removeTrack(old); old.stop(); });
      stream.addTrack(track);
      hostRef.current?.setMainVideo(track);
      if (videoRef.current && videoRef.current.srcObject === stream) {
        videoRef.current.srcObject = null;
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      setMainDeviceId(deviceId);
      toast.success("Main camera changed. Sound still comes from this device's microphone.");
    } catch (err: any) {
      toast.error(err?.message ?? "That camera could not be opened.");
    }
  }

  async function pickPoster(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a JPG, PNG or WebP image under 5 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (image.naturalWidth <= image.naturalHeight) {
        toast.error("Please choose a landscape poster (wider than it is tall).");
        URL.revokeObjectURL(url);
        return;
      }
      setPoster(file);
      setPosterPreview(url);
    } catch {
      URL.revokeObjectURL(url);
      toast.error("This image could not be opened.");
    }
  }

  async function pickChurchLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a logo image under 5 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (churchLogoPreview) URL.revokeObjectURL(churchLogoPreview);
      setChurchLogo(image);
      setChurchLogoPreview(url);
    } catch {
      URL.revokeObjectURL(url);
      toast.error("This logo could not be opened.");
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
    let posterPath: string | null = null;
    if (poster) {
      posterPath = `${user.id}/${crypto.randomUUID()}.${poster.type === "image/png" ? "png" : poster.type === "image/webp" ? "webp" : "jpg"}`;
      const { error: uploadError } = await supabase.storage.from("live-posters").upload(posterPath, poster, { contentType: poster.type });
      if (uploadError) {
        setBusy(false);
        toast.error(`Poster upload failed: ${uploadError.message}`);
        return;
      }
    }
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
          if (posterPath) void supabase.storage.from("live-posters").remove([posterPath]);
          setBusy(false);
          toast.error(created.error.message);
          return;
        }
        channelId = created.data.id;
      }
    }
    const startTime = new Date().toISOString();
    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        created_by: user.id,
        ministry_id: channelId,
        title: liveTitle || "Live service",
        is_live: true,
        started_at: startTime,
        thumbnail_url: posterPath,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      if (posterPath) void supabase.storage.from("live-posters").remove([posterPath]);
      toast.error(error.message);
      return;
    }
    setLiveId(data.id);
    setStartedAt(startTime);
    setClock(Date.now());
    hostRef.current = startHost(
      data.id,
      mixedRef.current ?? streamRef.current,
      cameraTokensRef.current,
      setViewers,
      (slot, remoteStream, status) => {
        if (remoteStream) remoteStreamsRef.current[slot] = remoteStream;
        else delete remoteStreamsRef.current[slot];
        if (status === "disconnected") setActiveCamera((current) => current === slot ? 1 : current);
        setCameraStatus((current) => ({ ...current, [slot]: status }));
        const element = slot === 2 ? camera2Ref.current : camera3Ref.current;
        if (element) {
          element.srcObject = remoteStream;
          if (remoteStream) void element.play().catch(() => {});
        }
      },
    );
    hostRef.current.setLogo(churchLogo, logoPosition, logoSize);
    hostRef.current.setCaption(liveCaption);
    if (selectedVerse) {
      try { await hostRef.current.showVerse(selectedVerse); setVerseOnScreen(true); }
      catch { toast.error("The verse could not be shown. Camera 1 is still live."); }
    }
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
    const blob = await hostRef.current?.finishRecording().catch(() => null);
    hostRef.current?.stop();
    hostRef.current = null;
    setViewers(0);
    setActiveCamera(1);
    setVerseOnScreen(false);
    setShowCameraGrid(false);
    setCameraStatus({ 2: "waiting", 3: "waiting" });
    remoteStreamsRef.current = {};
    setLiveId(null);
    setStartedAt(null);
    stopCamera();
    queryClient.invalidateQueries({ queryKey: ["live-streams"] });
    if (blob) {
      if (recording) URL.revokeObjectURL(recording.url);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const safe = (liveTitle || "kairos-live").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      setRecording({ url: URL.createObjectURL(blob), name: `${safe}.${ext}` });
      toast.success("Live ended. Your recording is ready to download.");
      return;
    }
    toast.success("Live ended.");
    navigate({ to: "/live" });
  }

  async function selectCamera(slot: 1 | CameraSlot) {
    await hostRef.current?.useCamera(slot);
    setActiveCamera(slot);
    if (verseOnScreen) { await hostRef.current?.showVerse(null); setVerseOnScreen(false); setSelectedVerse(null); }
  }

  async function showVerse(slide: VerseSlide) {
    setSelectedVerse(slide);
    if (hostRef.current) {
      await hostRef.current.showVerse(slide);
      setVerseOnScreen(true);
    } else {
      toast.info("Start the live first — then tap a result and it shows straight away.");
    }
  }

  async function clearVerse() {
    await hostRef.current?.showVerse(null);
    setVerseOnScreen(false);
    setSelectedVerse(null);
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
      <div className={`mx-auto space-y-5 ${tab === "live" ? "max-w-7xl" : "max-w-2xl"}`}>
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Create</h2>
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
            <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="min-w-0 space-y-3">
              <div className="space-y-3 bg-background md:sticky md:top-28 md:z-10">
              <div
                ref={shellRef}
                className={`relative aspect-video overflow-hidden ${expanded ? "flex h-full w-full items-center justify-center bg-ink" : "rounded-md border border-border"}`}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full bg-ink object-contain"
                />
                {liveId ? (
                  <span className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-live px-3 py-1 text-xs font-bold text-destructive-foreground">
                    <span className="live-dot" /> LIVE · {elapsedLiveTime(startedAt, clock)} · {viewers} watching
                  </span>
                ) : null}
                {churchLogoPreview ? <img src={churchLogoPreview} alt="Church logo on video" className={`pointer-events-none absolute w-[var(--logo-width)] max-w-[30%] object-contain ${logoPosition === "top-left" ? "left-3 top-3" : logoPosition === "top-right" ? "right-3 top-3" : logoPosition === "bottom-left" ? "bottom-3 left-3" : "bottom-3 right-3"}`} style={{ "--logo-width": `${logoSize}%` } as React.CSSProperties} /> : null}
                 {liveCaption && !verseOnScreen ? <p className="pointer-events-none absolute bottom-6 left-1/2 max-w-[84%] -translate-x-1/2 bg-foreground px-4 py-2 text-center font-verse-heavy text-sm text-background sm:text-lg">{liveCaption}</p> : null}
                {!cameraOn ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    Camera is off
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={toggleExpand}
                  aria-label={expanded ? "Exit full screen" : "Full screen"}
                  className="glass-strong absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {expanded ? "Exit full screen" : "Full screen"}
                </button>
              </div>

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
                   <div className="flex flex-wrap gap-2">
                     <Button type="button" variant={activeCamera === 1 && !verseOnScreen ? "default" : "outline"} onClick={() => selectCamera(1)}><Camera /> Camera 1{activeCamera === 1 && !verseOnScreen ? " · On air" : ""}</Button>
                     <Button type="button" variant="outline" aria-expanded={showCameraGrid} onClick={() => setShowCameraGrid((open) => !open)}>{showCameraGrid ? "Hide cameras" : "View all cameras"}</Button>
                   </div>
                   {showCameraGrid ? <div className="grid gap-3 sm:grid-cols-3">
                    <CameraTile
                      slot={1}
                      active={activeCamera === 1}
                      connected
                      preview={<video muted playsInline ref={(node) => {
                        if (node && streamRef.current) {
                          node.srcObject = streamRef.current;
                          void node.play().catch(() => {});
                        }
                      }} className="h-full w-full object-contain" />}
                      onSelect={() => selectCamera(1)}
                    />
                    <CameraTile
                      slot={2}
                      active={activeCamera === 2}
                      connected={cameraStatus[2] === "connected"}
                      preview={<video ref={camera2Ref} muted playsInline className="h-full w-full object-contain" />}
                      onSelect={() => selectCamera(2)}
                    />
                    <CameraTile
                      slot={3}
                      active={activeCamera === 3}
                      connected={cameraStatus[3] === "connected"}
                      preview={<video ref={camera3Ref} muted playsInline className="h-full w-full object-contain" />}
                      onSelect={() => selectCamera(3)}
                    />
                   </div> : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <PairingQR streamId={liveId} slot={2} token={cameraTokensRef.current[2]} status={cameraStatus[2]} />
                    <PairingQR streamId={liveId} slot={3} token={cameraTokensRef.current[3]} status={cameraStatus[3]} />
                  </div>
                </div>
              ) : null}


              {recording && !liveId ? (
                <div className="glass-give space-y-2 rounded-md p-4">
                  <h3 className="font-display text-sm font-semibold">Your live recording is ready</h3>
                  <video src={recording.url} controls playsInline className="aspect-video w-full rounded-md bg-ink" />
                  <a href={recording.url} download={recording.name} className="brand-mark block rounded-md py-3 text-center text-sm font-semibold text-primary-foreground">Download video</a>
                  <p className="text-xs text-muted-foreground">Saved on this device only — download it before leaving this page.</p>
                </div>
              ) : null}


              {liveId ? <LiveFaces streamId={liveId} isHost allowed={allowFaces} /> : null}
              {liveId ? <LiveComments streamId={liveId} /> : null}

              </div>
              <aside className="min-w-0 self-start border border-border rounded-md md:sticky md:top-28" aria-label="Live tools">
              <div className="flex flex-wrap gap-2 border-b border-border bg-background p-3" aria-label="Live actions">
                {!cameraOn ? <Button type="button" variant="outline" onClick={() => void startCamera()} className="flex-1"><Camera /> Start camera</Button> : null}
                {!liveId ? <Button type="button" onClick={() => void goLive()} disabled={busy} className="flex-1"><Radio /> {busy ? "Starting…" : "Go live now"}</Button> : <Button type="button" variant="destructive" onClick={() => void endLive()} disabled={busy} className="flex-1"><Square /> {busy ? "Ending…" : "End live"}</Button>}
                {cameraOn ? (
                  <div className="w-full space-y-1">
                    <label htmlFor="main-camera-source" className="text-xs font-medium text-muted-foreground">Main camera (Camera 1) — this device or a cable camera</label>
                    <div className="flex gap-2">
                      <select id="main-camera-source" value={mainDeviceId} onChange={(e) => { if (e.target.value) void chooseMainCamera(e.target.value); }} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm">
                        <option value="">Built-in camera (default)</option>
                        {videoDevices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                      <Button type="button" variant="outline" size="sm" onClick={() => void refreshVideoDevices()}>Refresh</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Plug in a USB camera or HDMI capture card, tap Refresh, then pick it. Phones 2 and 3 still join by QR.</p>
                  </div>
                ) : null}
              </div>
                <div className="grid grid-cols-4 gap-1 border-b border-border bg-background p-2" role="tablist" aria-label="Broadcast tools">
                  {([{ key: "bible", label: "Bible", icon: BookOpen }, { key: "search", label: "Search", icon: Search }, { key: "music", label: "Music", icon: Music }, { key: "setup", label: "Setup", icon: Settings2 }] as const).map(({ key, label, icon: Icon }) => <Button key={key} id={`live-tool-${key}`} type="button" variant={liveTool === key ? "secondary" : "ghost"} role="tab" aria-selected={liveTool === key} aria-controls={`live-panel-${key}`} onClick={() => setLiveTool(key)} className="h-auto flex-col gap-1 px-1 py-2 text-xs"><Icon />{label}</Button>)}
                </div>
                <div className="space-y-3 p-3 md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto md:overscroll-contain">
                  <div id="live-panel-bible" role="tabpanel" aria-labelledby="live-tool-bible" hidden={liveTool !== "bible"}>
                    <VersePanel active={verseOnScreen} selected={Boolean(selectedVerse)} onShow={showVerse} onClear={clearVerse} />
                  </div>
                  <div id="live-panel-search" role="tabpanel" aria-labelledby="live-tool-search" hidden={liveTool !== "search"}>
                    <LiveLookupPanel onShow={showVerse} />
                  </div>
                  <div id="live-panel-music" role="tabpanel" aria-labelledby="live-tool-music" hidden={liveTool !== "music"}>
              <div className="glass space-y-3 rounded-md p-4">
                <h3 className="font-display text-sm font-semibold">🎵 Background music</h3>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); void searchMusic(); }}
                >
                  <input
                    value={musicQuery}
                    onChange={(e) => setMusicQuery(e.target.value)}
                    placeholder="Search songs, e.g. worship piano"
                    className="glass min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                    {musicSearching ? "Searching…" : "Search"}
                  </button>
                </form>
                {musicResults.length > 0 && (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {musicResults.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => void playTrack(t)}
                          className="glass flex w-full items-center gap-3 rounded-lg p-2 text-left"
                        >
                          {t.art ? <img src={t.art} alt="" className="size-10 rounded object-cover" /> : <span className="size-10 rounded bg-secondary" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{t.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{t.artist}</span>
                          </span>
                          <span className="text-xs font-semibold text-primary">▶ Play</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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

                  </div>
                  <div id="live-panel-setup" role="tabpanel" aria-labelledby="live-tool-setup" hidden={liveTool !== "setup"} className="space-y-3">
              <input
                value={liveTitle}
                onChange={(e) => setLiveTitle(e.target.value)}
                placeholder="Live title (e.g. Sunday Service)"
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />

              <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                <input type="checkbox" checked={allowFaces} onChange={(e) => setAllowFaces(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                Let viewers show their faces in a side panel everyone can see
              </label>

              {!liveId ? <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="live-poster">Landscape live poster (optional)</label>
                <label htmlFor="live-poster" className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"><ImagePlus className="size-4" /> {poster ? poster.name : "Choose poster"}</label>
                <input id="live-poster" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void pickPoster(event.target.files?.[0])} />
                {posterPreview ? <img src={posterPreview} alt="Live poster preview" className="aspect-video w-full rounded-md border border-border object-contain" /> : null}
              </div> : null}

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

                <section className="space-y-3 border-y border-border py-4" aria-label="Church logo on video">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Church logo on video</h3>
                    {churchLogo ? <Button type="button" variant="outline" size="sm" onClick={() => { setChurchLogo(null); setChurchLogoPreview(null); }} >Remove</Button> : null}
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">
                    <Upload className="size-4" /> {churchLogo ? "Change logo" : "Choose church logo"}
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => void pickChurchLogo(event.target.files?.[0])} />
                  </label>
                  {churchLogo ? <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Logo position">
                      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((position) => <Button key={position} type="button" size="sm" variant={logoPosition === position ? "default" : "outline"} onClick={() => setLogoPosition(position)}>{position.replace("-", " ")}</Button>)}
                    </div>
                    <label className="block text-xs text-muted-foreground">Logo size · {logoSize}%<input type="range" min={8} max={30} value={logoSize} onChange={(event) => setLogoSize(Number(event.target.value))} className="mt-1 w-full accent-primary" /></label>
                  </> : <p className="text-xs text-muted-foreground">A transparent PNG works best. The logo appears for viewers and in the downloaded recording.</p>}
                </section>

                  </div>
                  <LiveSpeechControls onCaption={setLiveCaption} onApprove={showVerse} imageUrl={selectedVerse?.imageUrl} />
                </div>
              </aside>
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
        </section>

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
        <div className="mt-3 flex justify-center bg-background p-2"><img src={qr} alt={`QR code for Camera ${slot}`} className="size-56 max-w-full" /></div>
      ) : null}
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={copyLink}>
        <Link2 /> Copy camera link
      </Button>
    </div>
  );
}
