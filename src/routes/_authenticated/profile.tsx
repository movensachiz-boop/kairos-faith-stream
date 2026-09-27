import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — KAIROS APP" },
      { name: "description", content: "Manage your KAIROS profile, posts and ministries." },
      { property: "og:title", content: "Your profile — KAIROS APP" },
      { property: "og:description", content: "Your KAIROS identity, posts and ministries." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const myPosts = useQuery({
    queryKey: ["my-posts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("author_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setBio(profile.data.bio ?? "");
    }
  }, [profile.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, bio })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated.");
    queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  return (
    <AppShell>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 lg:col-span-5">
          <SectionCard title="Your profile" icon="👤">
            <div className="mb-4 flex items-center gap-3">
              <span className="brand-mark grid size-14 place-items-center rounded-2xl font-display text-lg font-bold text-ink">
                {initials(profile.data?.display_name ?? user?.email)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-base font-semibold">
                  {profile.data?.display_name ?? "Believer"}
                </div>
                <div className="truncate text-xs text-muted-foreground">@{profile.data?.username ?? "kairos"}</div>
              </div>
            </div>
            <form onSubmit={save} className="space-y-3">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Tell the community about your walk…"
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button className="brand-mark w-full rounded-xl py-2.5 text-sm font-semibold text-ink">
                Save profile
              </button>
            </form>
          </SectionCard>
        </section>

        <section className="col-span-12 lg:col-span-7">
          <SectionCard title="Your posts" icon="📝">
            {(myPosts.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't published anything yet.</p>
            ) : (
              <div className="space-y-3">
                {(myPosts.data ?? []).map((p: any) => (
                  <article key={p.id} className="glass rounded-2xl p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">{p.kind}</div>
                    <h3 className="mt-1 font-display text-base font-semibold">{p.title ?? "Untitled"}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </section>
      </div>
    </AppShell>
  );
}
