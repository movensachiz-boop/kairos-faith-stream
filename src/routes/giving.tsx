import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/giving")({
  head: () => ({
    meta: [
      { title: "Giving — KAIROS APP" },
      { name: "description", content: "Record seeds, tithes and offerings to the ministries you support." },
      { property: "og:title", content: "Giving — KAIROS APP" },
      { property: "og:description", content: "Support ministries with seeds, tithes and offerings." },
    ],
  }),
  component: GivingPage,
});

const kinds = ["seed", "tithe", "offering"] as const;

function GivingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ministries = useQuery(ministriesQuery());
  const [kind, setKind] = useState<(typeof kinds)[number]>("seed");
  const [ministryId, setMinistryId] = useState("");
  const [amount, setAmount] = useState("25");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const gifts = useQuery({
    queryKey: ["gifts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifts")
        .select("*, ministries:ministry_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { toast.error("Sign in to give."); return; }
    if (!ministryId) { toast.error("Choose a ministry."); return; }
    setBusy(true);
    const { error } = await supabase.from("gifts").insert({
      giver_id: user.id,
      ministry_id: ministryId,
      kind,
      amount: Number(amount),
      note: note || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Gift recorded as pending — payment is not processed yet.");
    setNote("");
    queryClient.invalidateQueries({ queryKey: ["gifts", user.id] });
  }

  const total = (gifts.data ?? []).reduce((sum: number, g: any) => sum + Number(g.amount), 0);

  return (
    <AppShell>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 lg:col-span-7">
          <SectionCard title="Give / Seed" icon="🕊️" tone="give">
            {!user ? (
              <p className="text-sm text-muted-foreground">
                <Link to="/auth" className="text-gold">Sign in</Link> to give to a ministry.
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="flex gap-2">
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize ${
                        kind === k ? "bg-gold text-ink" : "glass text-muted-foreground"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <select
                  value={ministryId}
                  onChange={(e) => setMinistryId(e.target.value)}
                  className="glass w-full rounded-xl bg-card px-4 py-3 text-sm outline-none"
                >
                  <option value="">Choose a ministry…</option>
                  {(ministries.data ?? []).map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  disabled={busy}
                  className="brand-mark w-full rounded-xl py-3 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {busy ? "Recording…" : "Record gift"}
                </button>
                <p className="text-xs text-muted-foreground">
                  Paynow card and mobile-money checkout is not connected yet, so gifts are saved as pending
                  records instead of being charged.
                </p>
              </form>
            )}
          </SectionCard>
        </section>

        <aside className="col-span-12 lg:col-span-5">
          <SectionCard title="Your giving" icon="📊">
            {!user ? (
              <p className="text-sm text-muted-foreground">Sign in to see your giving history.</p>
            ) : (
              <>
                <div className="glass mb-3 flex items-center justify-between rounded-xl p-3">
                  <span className="text-[11px] text-muted-foreground">Recorded total</span>
                  <span className="font-display text-lg font-bold">${total.toFixed(2)}</span>
                </div>
                {(gifts.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No gifts recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {(gifts.data ?? []).map((g: any) => (
                      <li key={g.id} className="glass flex items-center justify-between rounded-xl px-3 py-2 text-sm">
                        <span className="capitalize">
                          {g.kind} · {g.ministries?.name}
                        </span>
                        <span className="text-muted-foreground">
                          ${Number(g.amount).toFixed(2)} · {g.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </SectionCard>
        </aside>
      </div>
    </AppShell>
  );
}
