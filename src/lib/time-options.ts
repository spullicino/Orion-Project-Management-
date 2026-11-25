/** Times in 15-minute steps, e.g. "07:00" … "23:45", for time pickers. */
export function quarterHours(fromHour = 0, toHour = 24): string[] {
  return Array.from({ length: (toHour - fromHour) * 4 }, (_, i) => {
    const m = fromHour * 60 + i * 15;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });
}

/** "16:30" → "16:30 (4:30 pm)". */
export function timeWithAmPm(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${t} (${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"})`;
}
