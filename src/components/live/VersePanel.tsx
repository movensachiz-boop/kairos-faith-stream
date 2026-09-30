import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { VerseSlide } from "@/lib/verse-stage";
import mist from "@/assets/mist-and-moss.jpg.asset.json";
import moon from "@/assets/moon-reflection.jpg.asset.json";
import leaves from "@/assets/rain-leaves.jpg.asset.json";
import road from "@/assets/forest-road.jpg.asset.json";
import eagles from "@/assets/three-eagles.jpg.asset.json";
import eyes from "@/assets/eagle-eyes.jpg.asset.json";
import profile from "@/assets/eagle-profile.jpg.asset.json";
import moonTree from "@/assets/moon-tree.jpg.asset.json";

const themes = [
  { name: "Misty mountain", url: mist.url },
  { name: "Moonlit water", url: moon.url },
  { name: "Rain on leaves", url: leaves.url },
  { name: "Forest road", url: road.url },
  { name: "Three eagles", url: eagles.url },
  { name: "Eagle eyes", url: eyes.url },
  { name: "Eagle profile", url: profile.url },
  { name: "Moon and tree", url: moonTree.url },
];
const firstUrl = mist.url;

type Result = { key: string; reference: string; text: string };
const looksLikeReference = (q: string) => /^\s*([1-3]\s*)?[a-z]+\.?\s+\d+(\s*:\s*\d+(\s*-\s*\d+)?)?\s*$/i.test(q);

async function searchScripture(q: string): Promise<Result[]> {
  const term = q.trim();
  if (!term) {
    const { data } = await supabase.from("bible_verses").select("*").limit(20);
    return (data ?? []).map((v) => ({ key: v.id, reference: `${v.book} ${v.chapter}:${v.verse}`, text: v.text }));
  }
  if (looksLikeReference(term)) {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(term)}?translation=web`);
    if (res.ok) {
      const json = (await res.json()) as { verses?: { book_name: string; chapter: number; verse: number; text: string }[] };
      return (json.verses ?? []).map((v) => ({
        key: `${v.book_name}-${v.chapter}-${v.verse}`,
        reference: `${v.book_name} ${v.chapter}:${v.verse}`,
        text: v.text.replace(/\s+/g, " ").trim(),
      }));
    }
  }
  const safe = term.replace(/[%,()]/g, " ");
  const { data } = await supabase.from("bible_verses").select("*").or(`text.ilike.%${safe}%,book.ilike.%${safe}%`).limit(40);
  return (data ?? []).map((v) => ({ key: v.id, reference: `${v.book} ${v.chapter}:${v.verse}`, text: v.text }));
}

export function VersePanel({ active, onShow, onClear }: {
  active: boolean;
  onShow: (slide: VerseSlide) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");
  const [theme, setTheme] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSearch(input), 350); return () => clearTimeout(t); }, [input]);
  const results = useQuery({ queryKey: ["scripture-search", search], queryFn: () => searchScripture(search) });
  const url = (i: number) => themes[i]?.url ?? firstUrl;

  async function show(t = text, r = reference, i = theme) {
    if (!t.trim() || !r.trim()) return;
    setBusy(true);
    try { await onShow({ text: t.trim(), reference: r.trim(), imageUrl: url(i) }); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 border-y border-border py-4" aria-label="Verse display">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold"><BookOpen className="size-4" /> Verses on screen</h3>
        {active ? <Button type="button" variant="outline" size="sm" onClick={onClear}><X /> Remove verse</Button> : null}
      </div>
      <input aria-label="Search Bible verses" value={input} onChange={(e) => setInput(e.target.value)} placeholder='Type a reference like "John 3:16" or "Psalm 23" — or a word' className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      <p className="text-xs text-muted-foreground">Tap a verse and it goes on screen straight away.</p>
      <div className="max-h-56 space-y-1 overflow-y-auto" aria-label="Available verses">
        {results.isFetching ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
        {(results.data ?? []).map((v) => (
          <Button key={v.key} type="button" variant="ghost" disabled={busy} className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => { setText(v.text); setReference(v.reference); void show(v.text, v.reference); }}>
            <span className="shrink-0 font-semibold text-primary">{v.reference}</span><span className="line-clamp-2 font-normal text-muted-foreground">{v.text}</span>
          </Button>
        ))}
        {!results.isFetching && !(results.data ?? []).length ? <p className="text-xs text-muted-foreground">No verses found. Try a reference like "Romans 8:28".</p> : null}
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label="Verse backgrounds">
        {themes.map((item, index) => (
          <Button key={item.name} type="button" variant="ghost" aria-label={item.name} aria-pressed={theme === index} className={`relative h-auto aspect-video overflow-hidden rounded-md border p-0 ${theme === index ? "border-primary ring-2 ring-primary" : "border-border"}`} onClick={() => { setTheme(index); if (active) void show(text, reference, index); }}>
            <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
            {theme === index ? <Check className="absolute right-1 top-1 rounded-sm bg-primary text-primary-foreground" /> : null}
          </Button>
        ))}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium">Type your own verse</summary>
        <div className="mt-2 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Verse text" className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference, e.g. Psalm 23:1" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
          <Button type="button" className="w-full" disabled={!text.trim() || !reference.trim() || busy} onClick={() => show()}>{active ? "Update verse on screen" : "Show verse on screen"}</Button>
        </div>
      </details>
      <div className="relative aspect-video overflow-hidden rounded-md bg-foreground">
        <img src={url(theme)} alt="Selected verse backdrop" className="absolute inset-0 h-full w-full object-cover brightness-50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-background">
          <p className="max-h-[65%] w-full overflow-hidden break-words font-verse-heavy text-base leading-snug sm:text-2xl">{text || "Your verse appears here"}</p>
          <p className="font-verse-heavy text-xs sm:text-base">{reference}</p>
        </div>
      </div>
    </section>
  );
}
