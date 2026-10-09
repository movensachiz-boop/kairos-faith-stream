import { useState } from "react";
import { BookA, Globe, Image as ImageIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VerseSlide } from "@/lib/verse-stage";
import mist from "@/assets/mist-and-moss.jpg.asset.json";

type TextResult = { title: string; text: string; source: string };
type Picture = { url: string; thumb: string; title: string };

async function dictionary(q: string): Promise<TextResult[]> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json() as { word: string; meanings: { partOfSpeech: string; definitions: { definition: string }[] }[] }[];
  return (data[0]?.meanings ?? []).slice(0, 4).flatMap((m) => m.definitions.slice(0, 1).map((d) => ({
    title: `${data[0]?.word ?? q} (${m.partOfSpeech})`, text: d.definition, source: "Dictionary",
  })));
}

async function encyclopedia(q: string): Promise<{ results: TextResult[]; picture: Picture | null }> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/\s+/g, "_"))}`);
  if (!res.ok) return { results: [], picture: null };
  const d = await res.json() as { type?: string; title: string; extract?: string; originalimage?: { source: string }; thumbnail?: { source: string } };
  if (!d.extract || d.type === "disambiguation") return { results: [], picture: null };
  const short = d.extract.split(/(?<=\.)\s/).slice(0, 2).join(" ");
  const img = d.originalimage?.source ?? d.thumbnail?.source;
  return { results: [{ title: d.title, text: short, source: "Encyclopedia" }], picture: img ? { url: img, thumb: d.thumbnail?.source ?? img, title: d.title } : null };
}

async function pictures(q: string): Promise<Picture[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(`filetype:bitmap ${q}`)}&prop=imageinfo&iiprop=url&iiurlwidth=1280`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json() as { query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; url: string }[] }> } };
  return Object.values(data.query?.pages ?? {}).flatMap((p) => {
    const info = p.imageinfo?.[0];
    return info ? [{ url: info.thumburl ?? info.url, thumb: info.thumburl ?? info.url, title: p.title.replace(/^File:/, "").replace(/\.\w+$/, "") }] : [];
  });
}

export function LiveLookupPanel({ onShow }: { onShow: (slide: VerseSlide) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [texts, setTexts] = useState<TextResult[]>([]);
  const [pics, setPics] = useState<Picture[]>([]);
  const [message, setMessage] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setMessage("");
    const [dict, wiki, imgs] = await Promise.all([
      dictionary(q).catch(() => []), encyclopedia(q).catch(() => ({ results: [], picture: null })), pictures(q).catch(() => []),
    ]);
    setTexts([...dict, ...wiki.results]);
    setPics(wiki.picture ? [wiki.picture, ...imgs] : imgs);
    if (!dict.length && !wiki.results.length && !imgs.length) setMessage("Nothing found. Try another word.");
    setLoading(false);
  }

  return <section className="space-y-3 border-y border-border py-4" aria-label="Search and show on screen">
    <div>
      <h3 className="text-sm font-semibold">Search anything — show it on screen</h3>
      <p className="text-xs text-muted-foreground">Look up a word, a topic or a picture. Tap a result and it appears on the live straight away.</p>
    </div>
    <form onSubmit={search} className="flex gap-2">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. grace, Jerusalem, lion" aria-label="Search words, topics or pictures" />
      <Button type="submit" disabled={loading}><Search /> {loading ? "Searching…" : "Search"}</Button>
    </form>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    {texts.length > 0 && <ul className="space-y-2">
      {texts.map((t, i) => <li key={i}>
        <button type="button" onClick={() => void onShow({ text: t.text, reference: t.title, imageUrl: mist.url })} className="w-full rounded-md border border-border p-3 text-left hover:border-primary">
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">{t.source === "Dictionary" ? <BookA className="size-3" /> : <Globe className="size-3" />} {t.source} · {t.title}</span>
          <span className="mt-1 block text-sm">{t.text}</span>
        </button>
      </li>)}
    </ul>}
    {pics.length > 0 && <div>
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold"><ImageIcon className="size-3" /> Pictures</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {pics.map((p, i) => <button key={i} type="button" onClick={() => void onShow({ text: "", reference: p.title, imageUrl: `/api/public/lookup-image?u=${encodeURIComponent(p.url)}`, picture: true })} className="aspect-video overflow-hidden rounded-md border border-border hover:border-primary" aria-label={`Show picture ${p.title}`}>
          <img src={p.thumb} alt={p.title} loading="lazy" className="size-full object-cover" />
        </button>)}
      </div>
    </div>}
  </section>;
}
