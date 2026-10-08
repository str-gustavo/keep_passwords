export async function copyWithAutoClear(text: string, ms = 30_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  setTimeout(async () => { try { if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText(''); } catch { /* permission denied: ignore */ } }, ms);
}
