// @mentions: "@Full Name" in a note or message points at a teammate.

export type Mentionable = { userId: string; name: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Teammates whose "@Name" appears in the text (longest names first, so "@Ann Lee" isn't read as "@Ann"). */
export function findMentions(text: string, people: Mentionable[]): Mentionable[] {
  const found: Mentionable[] = [];
  let rest = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name.trim()) continue;
    const re = new RegExp(`@${escape(p.name.trim())}(?![\\p{L}\\p{N}_])`, 'giu');
    if (re.test(rest)) {
      found.push(p);
      rest = rest.replace(re, ' ');
    }
  }
  return found;
}

/** Splits text into plain parts and mention parts, for highlighting. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const sorted = names.map((n) => n.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!sorted.length) return [{ text, mention: false }];
  const re = new RegExp(`(@(?:${sorted.map(escape).join('|')}))(?![\\p{L}\\p{N}_])`, 'giu');
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), mention: false });
    parts.push({ text: m[0], mention: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}
