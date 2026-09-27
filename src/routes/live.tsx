import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { liveStreamsQuery } from "@/lib/kairos";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live services — KAIROS APP" },
      { name: "description", content: "Watch live church services and sermons from ministries on KAIROS APP." },
      { property: "og:title", content: "Live services — KAIROS APP" },
      { property: "og:description", content: "Join live worship, sermons and Bible teaching as they happen." },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const streams = useQuery(liveStreamsQuery());
  const list = streams.data ?? [];

  return (
    <AppShell>
      <div className="space-y-5">
        <SectionCard
          title="Live now"
          icon="🔴"
          action={<Link to="/giving" className="text-xs font-semibold text-gold">Give / Seed</Link>}
        >
          {streams.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading services…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No services scheduled yet. Ministry leaders can announce a service from their ministry page. Go live from Create to broadcast.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s: any) => (
                <Link key={s.id} to="/live/$id" params={{ id: s.id }} className="glass block overflow-hidden rounded-2xl">
                  <div className="flex aspect-video items-center justify-center bg-foreground/5">
                    <span className="text-xs text-muted-foreground">
                      {s.is_live ? "▶ Tap to watch live" : "Ended"}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      {s.is_live ? <span className="live-dot size-2 rounded-full bg-destructive" /> : null}
                      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">
                        {s.ministries?.name}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-semibold leading-snug">{s.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.speaker ?? "Guest speaker"}
                      {s.scripture_ref ? ` · ${s.scripture_ref}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="What's not built yet" icon="🛠️">
          <p className="text-sm text-muted-foreground">
            Large-audience streaming and replays, sermon transcription, AI summaries, captions and audio enhancement are not
            implemented yet. The service listings, following, prayer and giving records below are live and stored
            in your database.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
