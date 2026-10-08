// Signal sonore généré (pas de fichier audio) : deux bips type « ding-dong » de cuisine.
let ctx: AudioContext | null = null;

/** À appeler suite à un geste utilisateur : les navigateurs bloquent l'audio sinon. */
export async function unlockAudio(): Promise<boolean> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx.state === "running";
}

export function playNewOrderChime() {
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  [
    { freq: 880, at: 0 },
    { freq: 660, at: 0.22 },
  ].forEach(({ freq, at }) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.45);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.5);
  });
}
