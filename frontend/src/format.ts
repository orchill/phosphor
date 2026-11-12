/** Small display helpers shared by the shell and pages. */

/** Shorten the middle of a long string (paths): "C:\Users\ana\…\outputs".
 *  Keeps the start (drive / first folder) and the end (the folder that matters). */
export function middleTruncate(text: string, max = 36): string {
  if (text.length <= max || max < 8) return text;
  const keep = max - 1; // room for the ellipsis
  const head = Math.ceil(keep * 0.4);
  const tail = keep - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Copy text to the clipboard. Resolves false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
