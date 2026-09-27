// Peer-to-peer live broadcasting: WebRTC video, signalling over realtime channels.
import { supabase } from "@/integrations/supabase/client";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type Signal =
  | { type: "join"; from: string }
  | { type: "host-ready" }
  | { type: "offer"; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; to?: string; from?: string; candidate: RTCIceCandidateInit }
  | { type: "end" };

function channelFor(streamId: string) {
  return supabase.channel(`live:${streamId}`, { config: { broadcast: { self: false } } });
}

export function startHost(streamId: string, media: MediaStream, onViewers: (n: number) => void) {
  const peers = new Map<string, RTCPeerConnection>();
  const ch = channelFor(streamId);
  const send = (payload: Signal) => ch.send({ type: "broadcast", event: "signal", payload });

  async function addViewer(id: string) {
    peers.get(id)?.close();
    const pc = new RTCPeerConnection(ICE);
    peers.set(id, pc);
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    pc.onicecandidate = (e) => e.candidate && send({ type: "ice", to: id, candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        peers.delete(id);
        pc.close();
      }
      onViewers([...peers.values()].filter((p) => p.connectionState === "connected").length);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", to: id, sdp: offer });
  }

  ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
    const msg = payload as Signal;
    if (msg.type === "join") await addViewer(msg.from);
    else if (msg.type === "answer") await peers.get(msg.from)?.setRemoteDescription(msg.sdp);
    else if (msg.type === "ice" && msg.from) await peers.get(msg.from)?.addIceCandidate(msg.candidate).catch(() => {});
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") send({ type: "host-ready" });
  });

  return () => {
    send({ type: "end" });
    peers.forEach((p) => p.close());
    peers.clear();
    setTimeout(() => supabase.removeChannel(ch), 300);
  };
}

export function joinAsViewer(
  streamId: string,
  onStream: (s: MediaStream) => void,
  onEnd: () => void,
) {
  const me = crypto.randomUUID();
  let pc: RTCPeerConnection | null = null;
  const ch = channelFor(streamId);
  const send = (payload: Signal) => ch.send({ type: "broadcast", event: "signal", payload });

  ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
    const msg = payload as Signal;
    if (msg.type === "host-ready") send({ type: "join", from: me });
    else if (msg.type === "end") onEnd();
    else if (msg.type === "offer" && msg.to === me) {
      pc?.close();
      pc = new RTCPeerConnection(ICE);
      pc.ontrack = (e) => e.streams[0] && onStream(e.streams[0]);
      pc.onicecandidate = (e) => e.candidate && send({ type: "ice", from: me, candidate: e.candidate.toJSON() });
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", from: me, sdp: answer });
    } else if (msg.type === "ice" && msg.to === me) {
      await pc?.addIceCandidate(msg.candidate).catch(() => {});
    }
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") send({ type: "join", from: me });
  });

  return () => {
    pc?.close();
    supabase.removeChannel(ch);
  };
}
