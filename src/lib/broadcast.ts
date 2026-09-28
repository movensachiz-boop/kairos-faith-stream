// Small-audience WebRTC broadcasting and QR-paired remote cameras.
import { supabase } from "@/integrations/supabase/client";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type ViewerSignal =
  | { type: "join"; from: string }
  | { type: "host-ready" }
  | { type: "offer"; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; to?: string; from?: string; candidate: RTCIceCandidateInit }
  | { type: "end" };

export type CameraSlot = 2 | 3;
export type CameraStatus = "waiting" | "connecting" | "connected" | "disconnected";

type CameraSignal =
  | { type: "camera-join"; from: string; slot: CameraSlot; token: string }
  | { type: "camera-offer"; to: string; slot: CameraSlot; sdp: RTCSessionDescriptionInit }
  | { type: "camera-answer"; from: string; slot: CameraSlot; sdp: RTCSessionDescriptionInit }
  | { type: "camera-ice"; to?: string; from?: string; slot: CameraSlot; candidate: RTCIceCandidateInit }
  | { type: "camera-leave"; from: string; slot: CameraSlot }
  | { type: "broadcast-end" };

function viewerChannel(streamId: string) {
  return supabase.channel(`live:${streamId}`, { config: { broadcast: { self: false } } });
}

function cameraChannel(streamId: string) {
  return supabase.channel(`live-cameras:${streamId}`, { config: { broadcast: { self: false } } });
}

export type HostController = {
  stop: () => void;
  useCamera: (slot: 1 | CameraSlot) => Promise<void>;
};

export function startHost(
  streamId: string,
  media: MediaStream,
  tokens: Record<CameraSlot, string>,
  onViewers: (count: number) => void,
  onCamera: (slot: CameraSlot, stream: MediaStream | null, status: CameraStatus) => void,
): HostController {
  const viewers = new Map<string, RTCPeerConnection>();
  const cameraPeers = new Map<CameraSlot, { id: string; pc: RTCPeerConnection }>();
  const remoteCameras = new Map<CameraSlot, MediaStream>();
  const mainVideo = media.getVideoTracks()[0] ?? null;
  let activeVideo = mainVideo;
  let activeSlot: 1 | CameraSlot = 1;
  const viewersChannel = viewerChannel(streamId);
  const camerasChannel = cameraChannel(streamId);
  const sendViewer = (payload: ViewerSignal) =>
    viewersChannel.send({ type: "broadcast", event: "signal", payload });
  const sendCamera = (payload: CameraSignal) =>
    camerasChannel.send({ type: "broadcast", event: "camera-signal", payload });

  function updateViewerCount() {
    onViewers([...viewers.values()].filter((peer) => peer.connectionState === "connected").length);
  }

  async function addViewer(id: string) {
    viewers.get(id)?.close();
    const pc = new RTCPeerConnection(ICE);
    viewers.set(id, pc);
    if (activeVideo) pc.addTrack(activeVideo, media);
    media.getAudioTracks().forEach((track) => pc.addTrack(track, media));
    pc.onicecandidate = (event) => {
      if (event.candidate) sendViewer({ type: "ice", to: id, candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        viewers.delete(id);
        pc.close();
      }
      updateViewerCount();
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendViewer({ type: "offer", to: id, sdp: offer });
  }

  async function addRemoteCamera(id: string, slot: CameraSlot, token: string) {
    if (tokens[slot] !== token) return;
    cameraPeers.get(slot)?.pc.close();
    remoteCameras.delete(slot);
    onCamera(slot, null, "connecting");
    const pc = new RTCPeerConnection(ICE);
    cameraPeers.set(slot, { id, pc });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      remoteCameras.set(slot, stream);
      onCamera(slot, stream, "connected");
      event.track.onended = () => disconnectCamera(slot);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCamera({ type: "camera-ice", to: id, slot, candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) disconnectCamera(slot);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendCamera({ type: "camera-offer", to: id, slot, sdp: offer });
  }

  function disconnectCamera(slot: CameraSlot) {
    const entry = cameraPeers.get(slot);
    entry?.pc.close();
    cameraPeers.delete(slot);
    remoteCameras.delete(slot);
    onCamera(slot, null, "disconnected");
    if (activeSlot === slot) void useCamera(1);
  }

  async function useCamera(slot: 1 | CameraSlot) {
    const nextTrack = slot === 1 ? mainVideo : remoteCameras.get(slot)?.getVideoTracks()[0];
    if (!nextTrack) return;
    activeVideo = nextTrack;
    activeSlot = slot;
    await Promise.all(
      [...viewers.values()].map(async (peer) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(nextTrack);
      }),
    );
  }

  viewersChannel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      const message = payload as ViewerSignal;
      if (message.type === "join") await addViewer(message.from);
      else if (message.type === "answer") await viewers.get(message.from)?.setRemoteDescription(message.sdp);
      else if (message.type === "ice" && message.from) {
        await viewers.get(message.from)?.addIceCandidate(message.candidate).catch(() => {});
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void sendViewer({ type: "host-ready" });
    });

  camerasChannel
    .on("broadcast", { event: "camera-signal" }, async ({ payload }) => {
      const message = payload as CameraSignal;
      if (message.type === "camera-join") {
        await addRemoteCamera(message.from, message.slot, message.token);
      } else if (message.type === "camera-answer") {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) await camera.pc.setRemoteDescription(message.sdp);
      } else if (message.type === "camera-ice" && message.from) {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) await camera.pc.addIceCandidate(message.candidate).catch(() => {});
      } else if (message.type === "camera-leave") {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) disconnectCamera(message.slot);
      }
    })
    .subscribe();

  function stop() {
    void sendViewer({ type: "end" });
    void sendCamera({ type: "broadcast-end" });
    viewers.forEach((peer) => peer.close());
    cameraPeers.forEach(({ pc }) => pc.close());
    viewers.clear();
    cameraPeers.clear();
    remoteCameras.clear();
    window.setTimeout(() => {
      void supabase.removeChannel(viewersChannel);
      void supabase.removeChannel(camerasChannel);
    }, 300);
  }

  return { stop, useCamera };
}

export function joinAsViewer(streamId: string, onStream: (stream: MediaStream) => void, onEnd: () => void) {
  const me = crypto.randomUUID();
  let pc: RTCPeerConnection | null = null;
  const channel = viewerChannel(streamId);
  const send = (payload: ViewerSignal) => channel.send({ type: "broadcast", event: "signal", payload });

  channel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      const message = payload as ViewerSignal;
      if (message.type === "host-ready") void send({ type: "join", from: me });
      else if (message.type === "end") onEnd();
      else if (message.type === "offer" && message.to === me) {
        pc?.close();
        pc = new RTCPeerConnection(ICE);
        pc.ontrack = (event) => {
          const stream = event.streams[0];
          if (stream) onStream(stream);
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) void send({ type: "ice", from: me, candidate: event.candidate.toJSON() });
        };
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send({ type: "answer", from: me, sdp: answer });
      } else if (message.type === "ice" && message.to === me) {
        await pc?.addIceCandidate(message.candidate).catch(() => {});
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void send({ type: "join", from: me });
    });

  return () => {
    pc?.close();
    void supabase.removeChannel(channel);
  };
}

export function joinAsRemoteCamera(
  streamId: string,
  slot: CameraSlot,
  token: string,
  media: MediaStream,
  onStatus: (status: CameraStatus | "ended") => void,
) {
  const me = `camera-${slot}-${crypto.randomUUID()}`;
  let pc: RTCPeerConnection | null = null;
  const channel = cameraChannel(streamId);
  const send = (payload: CameraSignal) => channel.send({ type: "broadcast", event: "camera-signal", payload });

  channel
    .on("broadcast", { event: "camera-signal" }, async ({ payload }) => {
      const message = payload as CameraSignal;
      if (message.type === "broadcast-end") {
        onStatus("ended");
      } else if (message.type === "camera-offer" && message.to === me && message.slot === slot) {
        pc?.close();
        pc = new RTCPeerConnection(ICE);
        const track = media.getVideoTracks()[0];
        if (!track) return;
        pc.addTrack(track, media);
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void send({ type: "camera-ice", from: me, slot, candidate: event.candidate.toJSON() });
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === "connected") onStatus("connected");
          else if (pc && ["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            onStatus("disconnected");
          }
        };
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send({ type: "camera-answer", from: me, slot, sdp: answer });
        onStatus("connected");
      } else if (message.type === "camera-ice" && message.to === me && message.slot === slot) {
        await pc?.addIceCandidate(message.candidate).catch(() => {});
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus("connecting");
        void send({ type: "camera-join", from: me, slot, token });
      }
    });

  return () => {
    void send({ type: "camera-leave", from: me, slot });
    pc?.close();
    void supabase.removeChannel(channel);
  };
}