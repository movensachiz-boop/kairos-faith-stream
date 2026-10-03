import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import liveService from "@/assets/live-service.jpg";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { useAuth, initials } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { feedQuery, liveStreamsQuery, ministriesQuery, prayerQuery, bibleSearchQuery } from "@/lib/kairos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAIROS APP — Christian social, live services, Bible & giving" },
      {
        name: "description",
        content:
          "Watch live church services, read and search the Bible, follow ministries, share prayer requests and give securely on KAIROS APP.",
      },
      { property: "og:title", content: "KAIROS APP — Connect. Grow. Share. Give." },
      {
        property: "og:description",
        content: "The Christian platform for live services, Bible study, ministries, prayer and digital giving.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const feed = useQuery(feedQuery());
  const prayers = useQuery(prayerQuery());
  const ministries = useQuery(ministriesQuery());
  const streams = useQuery(liveStreamsQuery());
  const verses = useQuery(bibleSearchQuery("wait"));

  const liveNow = (streams.data ?? []).find((s) => s.is_live) ?? (streams.data ?? [])[0];

  async function toggleLike(postId: string, liked: boolean) {
    if (!user) { toast.error("Sign in to like posts."); return; }
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  }

  async function pray(prayerId: string, prayed: boolean) {
    if (!user) { toast.error("Sign in to pray for a request."); return; }
    if (prayed) {
      await supabase.from("prayer_intercessions").delete().eq("prayer_id", prayerId).eq("user_id", user.id);
    } else {
      await supabase.from("prayer_intercessions").insert({ prayer_id: prayerId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["prayers"] });
  }

  async function follow(ministryId: string, following: boolean) {
    if (!user) { toast.error("Sign in to follow ministries."); return; }
    if (following) {
      await supabase.from("follows").delete().eq("ministry_id", ministryId).eq("follower_id", user.id);
    } else {
      await supabase.from("follows").insert({ ministry_id: ministryId, follower_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["ministries"] });
  }

  return (
    <AppShell>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 space-y-5 lg:col-span-7">
          {/* Live service */}
          <div className="glass-strong overflow-hidden rounded-3xl">
            <div className="relative">
              <img
                src={liveNow?.thumbnail_url ? `/api/public/live-poster/${liveNow.id}` : liveService}
                alt={liveNow?.thumbnail_url ? `${liveNow.title} poster` : "Live worship service"}
                width={1280}
                height={720}
                className="aspect-video w-full object-contain bg-secondary"
              />
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="live-dot size-2.5 rounded-full bg-destructive" />
                <span className="rounded-full bg-ink/60 px-2.5 py-1 text-xs font-semibold tracking-wide">
                  {liveNow?.is_live ? "LIVE NOW" : "NO LIVE RIGHT NOW"}
                </span>
                <span className="rounded-full bg-ink/60 px-2.5 py-1 text-xs text-muted-foreground">
                  {liveNow?.viewer_count ?? 0} watching
                </span>
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">
                    {liveNow?.ministries?.name ?? "No stream scheduled"}
                  </div>
                  <div className="font-display text-lg font-semibold leading-tight">
                    {liveNow?.title ?? "Your ministry's next service will appear here"}
                  </div>
                </div>
                <Link to="/giving" className="glass-give shrink-0 rounded-xl px-4 py-2.5 text-center">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-gold">
                    Give / Seed
                  </span>
                  <span className="block font-display text-sm font-bold">Paynow · coming</span>
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className="brand-mark grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-ink">
                {initials(liveNow?.ministries?.name ?? "KA")}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{liveNow?.speaker ?? "KAIROS Live"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {liveNow?.scripture_ref ?? "Streaming not connected yet"}
                </div>
              </div>
              {liveNow?.is_live ? (
                <Link to="/live/$id" params={{ id: liveNow.id }} className="ml-auto rounded-md bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground">
                  ▶ Watch now
                </Link>
              ) : (
                <Link to="/live" className="glass ml-auto rounded-lg px-3 py-2 text-xs">
                  Open Live
                </Link>
              )}
            </div>
          </div>

          {/* Feed */}
          <SectionCard title="Your feed" icon="✝️" action={<Link to="/create" className="text-xs font-semibold text-azure">+ Post</Link>}>
            {feed.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading the feed…</p>
            ) : (feed.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No posts yet. Be the first to share a word with the KAIROS community.
              </p>
            ) : (
              <div className="space-y-3">
                {(feed.data ?? []).map((post) => {
                  const liked = !!post.post_likes?.some((l) => l.user_id === user?.id);
                  return (
                    <article key={post.id} className="glass rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <span className="brand-cool grid size-9 place-items-center rounded-full text-[10px] font-semibold">
                          {initials(post.profiles?.display_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {post.profiles?.display_name ?? "Believer"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {post.ministries?.name ? `${post.ministries.name} · ` : ""}
                            {new Date(post.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span className="ml-auto rounded-full bg-accent/20 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-accent">
                          {post.kind}
                        </span>
                      </div>
                      {post.title ? (
                        <h3 className="mt-3 font-display text-lg font-semibold leading-snug">{post.title}</h3>
                      ) : null}
                      {post.body ? <p className="mt-2 text-sm text-muted-foreground">{post.body}</p> : null}
                      {post.scripture_ref ? (
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">
                          {post.scripture_ref}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <button onClick={() => toggleLike(post.id, liked)} className="glass rounded-lg px-3 py-2">
                          {liked ? "💙" : "👍"} {post.post_likes?.length ?? 0}
                        </button>
                        <span className="glass rounded-lg px-3 py-2">💬 {post.comments?.length ?? 0}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Bible */}
          <SectionCard
            title="Bible · Scripture"
            icon="📖"
            action={
              <Link to="/bible" className="rounded-full bg-accent/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
                Open
              </Link>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(verses.data ?? []).slice(0, 2).map((v) => (
                <div key={v.id} className="glass rounded-2xl p-4">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-azure">
                    {v.book} {v.chapter}:{v.verse}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{v.text}</p>
                </div>
              ))}
              {(verses.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Search the Bible from the Bible page.</p>
              ) : null}
            </div>
          </SectionCard>
        </section>

        <aside className="col-span-12 space-y-5 lg:col-span-5">
          <SectionCard
            title="Digital Giving"
            icon="🕊️"
            tone="give"
            action={<span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold">Paynow soon</span>}
          >
            <p className="text-sm text-muted-foreground">
              Record seeds, tithes and offerings to any ministry. Card and mobile-money payment through Paynow is
              not connected yet.
            </p>
            <Link to="/giving" className="brand-mark mt-4 block rounded-xl py-2.5 text-center text-xs font-semibold text-ink">
              Give / Seed
            </Link>
          </SectionCard>

          <SectionCard
            title="Prayer Wall"
            icon="🙏"
            action={<Link to="/create" className="text-xs font-semibold text-azure">+ Request</Link>}
          >
            {(prayers.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No prayer requests yet.</p>
            ) : (
              <div className="space-y-3">
                {(prayers.data ?? []).slice(0, 4).map((p: any) => {
                  const prayed = !!p.prayer_intercessions?.some((i: any) => i.user_id === user?.id);
                  return (
                    <div key={p.id} className="glass rounded-2xl p-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="brand-cool grid size-6 place-items-center rounded-full text-[10px] font-semibold">
                          {initials(p.is_anonymous ? "A" : p.profiles?.display_name)}
                        </span>
                        <span className="text-muted-foreground">
                          {p.is_anonymous ? "Anonymous" : (p.profiles?.display_name ?? "Believer")}
                        </span>
                        <span className="ml-auto text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
                      <button
                        onClick={() => pray(p.id, prayed)}
                        className="glass mt-2 rounded-lg px-3 py-1.5 text-xs"
                      >
                        🙏 {prayed ? "Praying" : "Pray"} · {p.prayer_intercessions?.length ?? 0}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Discover Ministries" icon="✨">
            {(ministries.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ministries yet. Create one from your profile to start gathering your community.
              </p>
            ) : (
              <div className="space-y-3">
                {(ministries.data ?? []).slice(0, 5).map((m: any) => {
                  const following = !!m.follows?.some((f: any) => f.follower_id === user?.id);
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="brand-cool grid size-10 shrink-0 place-items-center rounded-xl text-xs font-semibold">
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.follows?.length ?? 0} followers{m.category ? ` · ${m.category}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => follow(m.id, following)}
                        className="rounded-lg bg-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-foreground/20"
                      >
                        {following ? "Following" : "Follow"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </AppShell>
  );
}
