const ones: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, hundredth: 100, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

const BOOKS = "genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings chronicles ezra nehemiah esther job psalm psalms proverbs ecclesiastes isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans corinthians galatians ephesians philippians colossians thessalonians timothy titus philemon hebrews james peter jude revelation revelations".split(" ");
const PREFIXED = new Set(["samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "john"]);

// Turns "three", "twenty three", "one hundred nineteen" into digits.
function wordsToDigits(text: string): string {
  const out: string[] = [];
  let cur: number | null = null;
  const flush = () => { if (cur !== null) { out.push(String(cur)); cur = null; } };
  for (const word of text.split(" ")) {
    const value = ones[word];
    if (value === undefined || (value <= 3 && ["first", "second", "third"].includes(word))) { flush(); out.push(word); continue; }
    if (word === "hundred" || word === "hundredth") cur = (cur ?? 1) * 100;
    else if (cur !== null && ((cur >= 20 && cur % 10 === 0 && cur < 100 && value < 10) || (cur >= 100 && cur % 100 === 0 && value < 100))) cur += value;
    else { flush(); cur = value; }
  }
  flush();
  return out.join(" ");
}

// Finds a spoken Bible reference such as "John 3:16", "John three sixteen" or "first Corinthians chapter 13 verse 4".
export function spokenReference(transcript: string): string | null {
  let text = transcript.toLowerCase().replace(/(\d)\s*:\s*(\d)/g, "$1 $2").replace(/[.,!?;:-]/g, " ").replace(/\s+/g, " ").trim();
  text = wordsToDigits(text)
    .replace(/\b(first|1st)\b/g, "1").replace(/\b(second|2nd)\b/g, "2").replace(/\b(third|3rd)\b/g, "3")
    .replace(/\b(chapter|verses?|and verse|at)\b/g, " ").replace(/\s+/g, " ");
  const pattern = new RegExp(`(?:\\b([1-3])\\s+)?\\b(${BOOKS.join("|")})\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`, "g");
  let found: RegExpExecArray | null = null;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) found = m;
  if (!found) return null;
  const chapter = Number(found[3]), verse = Number(found[4]);
  if (!chapter || !verse || chapter > 150 || verse > 176) return null;
  let book = found[2] ?? "";
  if (book === "revelations") book = "revelation";
  const prefix = found[1] && PREFIXED.has(book) ? `${found[1]} ` : "";
  return `${prefix}${book} ${chapter}:${verse}`;
}

export async function lookupSpokenVerse(reference: string): Promise<{ text: string; reference: string } | null> {
  const response = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=web`);
  if (!response.ok) return null;
  const data = await response.json() as { verses?: { book_name: string; chapter: number; verse: number; text: string }[] };
  const verse = data.verses?.[0];
  return verse ? { text: verse.text.replace(/\s+/g, " ").trim(), reference: `${verse.book_name} ${verse.chapter}:${verse.verse}` } : null;
}