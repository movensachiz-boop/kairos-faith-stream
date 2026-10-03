const ones: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, hundredth: 100, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

function numberOf(input: string): number | null {
  const tokens = input.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && /^\d+$/.test(tokens[0] ?? "")) return Number(tokens[0]);
  if (!tokens.length || tokens.some((word) => ones[word] === undefined)) return null;
  let value = 0;
  for (const token of tokens) value += ones[token] ?? 0;
  return value;
}

// Only offer an explicit spoken reference, never guess from an ordinary sentence.
export function spokenReference(transcript: string): string | null {
  const normalized = transcript.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/(?:^|\s)((?:(?:first|second|third|[1-3])\s+)?[a-z]+(?:\s+[a-z]+){0,2}?)\s+chapter\s+([a-z\d -]+?)\s+verse\s+([a-z\d -]+?)(?=\s+(?:and|says|reads|where|which|the|is|let|for|in|it|we|you|he|she|god|jesus|lord)\b|$)/i);
  if (!match) return null;
  const chapter = numberOf(match[2] ?? "");
  const verse = numberOf(match[3] ?? "");
  if (!chapter || !verse || chapter > 150 || verse > 176) return null;
  const book = (match[1] ?? "").replace(/^first\b/, "1").replace(/^second\b/, "2").replace(/^third\b/, "3").trim();
  const known = new Set("genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings chronicles ezra nehemiah esther job psalm psalms proverbs ecclesiastes isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans corinthians galatians ephesians philippians colossians thessalonians timothy titus philemon hebrews james peter jude revelation".split(" "));
  const words = book.split(" ");
  const index = words.findIndex((word) => known.has(word));
  if (index < 0) return null;
  const prefix = index > 0 && /^[1-3]$/.test(words[index - 1] ?? "") ? `${words[index - 1]} ` : "";
  return `${prefix}${words[index]} ${chapter}:${verse}`;
}

export async function lookupSpokenVerse(reference: string): Promise<{ text: string; reference: string } | null> {
  const response = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=web`);
  if (!response.ok) return null;
  const data = await response.json() as { verses?: { book_name: string; chapter: number; verse: number; text: string }[] };
  const verse = data.verses?.[0];
  return verse ? { text: verse.text.replace(/\s+/g, " ").trim(), reference: `${verse.book_name} ${verse.chapter}:${verse.verse}` } : null;
}