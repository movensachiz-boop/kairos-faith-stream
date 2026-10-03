import { supabase } from "@/integrations/supabase/client";

export type FeedPost = {
  id: string;
  author_id: string;
  ministry_id: string | null;
  kind: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  scripture_ref: string | null;
  created_at: string;
  profiles?: { display_name: string; username: string } | null;
  ministries?: { name: string; slug: string } | null;
  post_likes?: { user_id: string }[];
  comments?: { id: string }[];
};

export const feedQuery = () => ({
  queryKey: ["feed"],
  queryFn: async (): Promise<FeedPost[]> => {
    const { data, error } = await supabase
      .from("posts")
      .select(
        "*, profiles!posts_author_profile_fkey(display_name, username), ministries:ministry_id(name, slug), post_likes(user_id), comments(id)",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []) as unknown as FeedPost[];
  },
});

export const prayerQuery = () => ({
  queryKey: ["prayers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("prayer_requests")
      .select("*, profiles!prayer_author_profile_fkey(display_name, username), prayer_intercessions(user_id)")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
});

export const ministriesQuery = () => ({
  queryKey: ["ministries"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ministries")
      .select("*, follows(follower_id)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  },
});

export const liveStreamsQuery = () => ({
  queryKey: ["live-streams"],
  refetchInterval: 15000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("live_streams")
      .select("*, ministries:ministry_id(name, slug)")
      .order("is_live", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  },
});

export const eventsQuery = () => ({
  queryKey: ["events"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*, ministries:ministry_id(name, slug)")
      .order("starts_at", { ascending: true })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  },
});

export const bibleSearchQuery = (term: string) => ({
  queryKey: ["bible", term],
  queryFn: async (): Promise<{ id: string; book: string; chapter: number; verse: number; text: string }[]> => {
    const t = term.trim();
    if (/^\s*([1-3]\s*)?[a-z]+\.?\s+\d+(\s*:\s*\d+(\s*-\s*\d+)?)?\s*$/i.test(t)) {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(t)}?translation=web`);
      if (res.ok) {
        const json = (await res.json()) as { verses?: { book_name: string; chapter: number; verse: number; text: string }[] };
        return (json.verses ?? []).map((v) => ({
          id: `${v.book_name}-${v.chapter}-${v.verse}`, book: v.book_name, chapter: v.chapter, verse: v.verse,
          text: v.text.replace(/\s+/g, " ").trim(),
        }));
      }
    }
    let q = supabase.from("bible_verses").select("*").limit(40);
    if (t) { const s = t.replace(/[%,()]/g, " "); q = q.or(`text.ilike.%${s}%,book.ilike.%${s}%`); }
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
});

export function verseRef(v: { book: string; chapter: number; verse: number }) {
  return `${v.book} ${v.chapter}:${v.verse}`;
}
