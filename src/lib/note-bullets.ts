/**
 * Bullet lists for plain-text personal notes. Pure helpers working on
 * (text, selectionStart, selectionEnd) so they're easy to test.
 */
export const BULLET = "• ";

export type Edit = { text: string; start: number; end: number };

const lineStart = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
const lineEnd = (text: string, pos: number) => {
  const i = text.indexOf("\n", pos);
  return i === -1 ? text.length : i;
};

/** Turns the selected lines into a bullet list, or back into plain lines if they all are bullets. */
export function toggleBullets(text: string, start: number, end: number): Edit {
  const from = lineStart(text, start);
  const to = lineEnd(text, Math.max(start, end > start && text[end - 1] === "\n" ? end - 1 : end));
  const lines = text.slice(from, to).split("\n");
  const allBulleted = lines.some((l) => l.startsWith(BULLET)) && lines.every((l) => l.startsWith(BULLET) || l.trim() === "");
  const changed = lines.map((l) => {
    if (allBulleted) return l.startsWith(BULLET) ? l.slice(BULLET.length) : l;
    if (l.startsWith(BULLET) || (l.trim() === "" && lines.length > 1)) return l;
    return BULLET + l;
  });
  const block = changed.join("\n");
  const next = text.slice(0, from) + block + text.slice(to);
  if (start === end) {
    // Keep the cursor on the same character of the line.
    const shift = allBulleted ? -Math.min(BULLET.length, start - from) : BULLET.length;
    const pos = Math.max(from, start + shift);
    return { text: next, start: pos, end: pos };
  }
  return { text: next, start: from, end: from + block.length };
}

/**
 * Enter inside a bullet: start a new bullet. Enter on an empty bullet: end the list.
 * Returns null when Enter should behave normally.
 */
export function enterInBullet(text: string, start: number, end: number): Edit | null {
  const from = lineStart(text, start);
  const line = text.slice(from, lineEnd(text, start));
  if (!line.startsWith(BULLET) || start < from + BULLET.length) return null;
  if (line.trim() === BULLET.trim()) {
    const next = text.slice(0, from) + text.slice(from + line.length);
    return { text: next, start: from, end: from };
  }
  const insert = "\n" + BULLET;
  const next = text.slice(0, start) + insert + text.slice(end);
  const pos = start + insert.length;
  return { text: next, start: pos, end: pos };
}

/** Typing "- " or "* " at the start of a line turns it into a bullet. */
export function autoBullet(text: string, cursor: number): Edit | null {
  const from = lineStart(text, cursor);
  const typed = text.slice(from, cursor);
  if (typed !== "- " && typed !== "* ") return null;
  const next = text.slice(0, from) + BULLET + text.slice(cursor);
  const pos = from + BULLET.length;
  return { text: next, start: pos, end: pos };
}
