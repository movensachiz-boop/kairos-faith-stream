import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { bibleSearchQuery, verseRef } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/bible")({
  head: () => ({
    meta: [
      { title: "Bible — KAIROS APP" },
      { name: "description", content: "Read, search and bookmark Scripture inside KAIROS APP." },
      { property: "og:title", content: "Bible — KAIROS APP" },
      { property: "og:description", content: "Search Scripture and save the verses that speak to you." },
    ],
  }),
  component: BiblePage,
});

function BiblePage() {
  const [term, setTerm] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const verses = useQuery(bibleSearchQuery(term));

  const bookmarks = useQuery({
    queryKey: ["bookmarks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bible_bookmarks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function bookmark(reference: string) {
    if (!user) return toast.error("Sign in to save verses.");
    const { error } = await supabase.from("bible_bookmarks").insert({ user_id: user.id, reference });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Already saved." : error.message);
      return;
    }
    toast.success(`${reference} saved.`);
    queryClient.invalidateQueries({ queryKey: ["bookmarks", user.id] });
  }

  return (
    <AppShell>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 space-y-5 lg:col-span-8">
          <SectionCard title="Search Scripture" icon="📖">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search a word or phrase…"
              className="glass mb-4 w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {verses.isLoading ? (
              <p className="text-sm text-muted-foreground">Searching…</p>
            ) : (verses.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No verses matched that search.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(verses.data ?? []).map((v: any) => (
                  <div key={v.id} className="glass rounded-2xl p-4">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-azure">
                      {verseRef(v)}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{v.text}</p>
                    <button
                      onClick={() => bookmark(verseRef(v))}
                      className="glass mt-3 rounded-lg px-3 py-1.5 text-xs"
                    >
                      ✦ Save verse
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="About this Bible library" icon="ℹ️">
            <p className="text-sm text-muted-foreground">
              A starter set of public-domain verses is loaded. A full Bible import and AI verse detection or
              related-Scripture suggestions are not implemented yet.
            </p>
          </SectionCard>
        </section>

        <aside className="col-span-12 lg:col-span-4">
          <SectionCard title="Saved verses" icon="✦">
            {!user ? (
              <p className="text-sm text-muted-foreground">Sign in to save verses.</p>
            ) : (bookmarks.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
            ) : (
              <ul className="space-y-2">
                {(bookmarks.data ?? []).map((b: any) => (
                  <li key={b.id} className="glass rounded-xl px-3 py-2 text-sm">
                    {b.reference}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>
    </AppShell>
  );
}
