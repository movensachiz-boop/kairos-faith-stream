import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bibleSearchQuery, verseRef } from "@/lib/kairos";
import type { VerseSlide } from "@/lib/verse-stage";
import mist from "@/assets/mist-and-moss.jpg.asset.json";
import moon from "@/assets/moon-reflection.jpg.asset.json";
import leaves from "@/assets/rain-leaves.jpg.asset.json";

const themes = [
  { name: "Misty mountain", url: mist.url },
  { name: "Moonlit water", url: moon.url },
  { name: "Rain on leaves", url: leaves.url },
];
const firstTheme = themes[0];

export function VersePanel({ active, onShow, onClear }: {
  active: boolean;
  onShow: (slide: VerseSlide) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");
  const [theme, setTheme] = useState(0);
  const [busy, setBusy] = useState(false);
  const verses = useQuery(bibleSearchQuery(search));

  async function show() {
    if (!text.trim() || !reference.trim()) return;
    const selected = themes[theme] ?? firstTheme;
    if (!selected) return;
    setBusy(true);
    try { await onShow({ text: text.trim(), reference: reference.trim(), imageUrl: selected.url }); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 border-y border-border py-4" aria-label="Verse display">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold"><BookOpen className="size-4" /> Verses on screen</h3>
        {active ? <Button type="button" variant="outline" size="sm" onClick={onClear}><X /> Remove verse</Button> : null}
      </div>
      <input aria-label="Search Bible verses" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search available verses…" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      <div className="max-h-36 space-y-1 overflow-y-auto" aria-label="Available verses">
        {(verses.data ?? []).map((verse) => (
          <Button key={verse.id} type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => { setText(verse.text); setReference(verseRef(verse)); }}>
            <span className="shrink-0 font-semibold text-primary">{verseRef(verse)}</span><span className="line-clamp-1 font-normal text-muted-foreground">{verse.text}</span>
          </Button>
        ))}
        {!verses.isLoading && !(verses.data ?? []).length ? <p className="text-xs text-muted-foreground">No verses found. Enter one below.</p> : null}
      </div>
      <label className="block text-xs font-medium">Verse text
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} placeholder="Enter the verse to display" className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </label>
      <label className="block text-xs font-medium">Reference
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. Psalm 23:1" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </label>
      <div className="grid grid-cols-3 gap-2" aria-label="Verse backgrounds">
        {themes.map((item, index) => (
          <Button key={item.name} type="button" variant="ghost" aria-label={item.name} aria-pressed={theme === index} className={`relative h-auto aspect-video overflow-hidden rounded-md border p-0 ${theme === index ? "border-primary ring-2 ring-primary" : "border-border"}`} onClick={() => setTheme(index)}>
            <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
            {theme === index ? <Check className="absolute right-1 top-1 rounded-sm bg-primary text-primary-foreground" /> : null}
          </Button>
        ))}
      </div>
      <div className="relative aspect-video overflow-hidden rounded-md bg-foreground">
        <img src={(themes[theme] ?? firstTheme)?.url} alt="Selected verse backdrop" className="absolute inset-0 h-full w-full object-cover brightness-50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-background">
          <p className="max-h-[65%] w-full overflow-hidden break-words font-verse font-bold text-base leading-snug sm:text-2xl">{text || "Your verse appears here"}</p>
          <p className="font-verse text-xs font-bold sm:text-base">{reference}</p>
        </div>
      </div>
      <Button type="button" className="w-full" disabled={!text.trim() || !reference.trim() || busy} onClick={show}>{busy ? "Preparing…" : active ? "Update verse on screen" : "Show verse on screen"}</Button>
    </section>
  );
}