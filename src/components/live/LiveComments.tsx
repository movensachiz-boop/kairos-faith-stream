import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Comment = { id: string; name: string; text: string; at: number };

// Live chat for a stream: messages travel over a realtime channel to everyone watching.
export function LiveComments({ streamId }: { streamId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`live-chat:${streamId}`, { config: { broadcast: { self: true } } });
    ch.on("broadcast", { event: "comment" }, ({ payload }) => {
      setComments((c) => [...c.slice(-99), payload as Comment]);
    }).subscribe();
    chRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [streamId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !chRef.current) return;
    const name =
      (user?.user_metadata?.["display_name"] as string) || user?.email?.split("@")[0] || "Guest";
    chRef.current.send({
      type: "broadcast",
      event: "comment",
      payload: { id: crypto.randomUUID(), name, text: t.slice(0, 300), at: Date.now() },
    });
    setText("");
  }

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-2 font-display text-sm font-semibold">💬 Live comments</h3>
      <div ref={listRef} className="h-56 space-y-2 overflow-y-auto pr-1">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet — say hello, share an Amen 🙏</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-semibold text-azure">{c.name}</span>{" "}
              <span className="text-foreground/90">{c.text}</span>
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          className="glass flex-1 rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button className="brand-mark rounded-xl px-4 text-sm font-semibold text-ink">Send</button>
      </form>
    </div>
  );
}
