let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

/** Don — low resonant face hit */
export function playDon(
  ctx: AudioContext,
  time: number,
  hitVol: number,
  trackVol: number,
  masterVol: number
): void {
  const gain = (hitVol / 100) * (trackVol / 100) * (masterVol / 100);
  if (gain <= 0) return;

  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  // Main body — sine sweep
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(60, time + 0.4);

  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(1.0, time);
  oscEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(time);
  osc.stop(time + 0.56);

  // Sub — adds depth
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(90, time);
  sub.frequency.exponentialRampToValueAtTime(40, time + 0.3);

  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.6, time);
  subEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

  sub.connect(subEnv);
  subEnv.connect(master);
  sub.start(time);
  sub.stop(time + 0.36);

  // Attack click — short noise burst
  const clickSamples = Math.floor(ctx.sampleRate * 0.018);
  const clickBuf = ctx.createBuffer(1, clickSamples, ctx.sampleRate);
  const clickData = clickBuf.getChannelData(0);
  for (let i = 0; i < clickSamples; i++) {
    clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickSamples);
  }
  const click = ctx.createBufferSource();
  click.buffer = clickBuf;

  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0.45, time);

  click.connect(clickEnv);
  clickEnv.connect(master);
  click.start(time);
}

/** Ka — short sharp rim/edge hit */
export function playKa(
  ctx: AudioContext,
  time: number,
  hitVol: number,
  trackVol: number,
  masterVol: number
): void {
  const gain = (hitVol / 100) * (trackVol / 100) * (masterVol / 100);
  if (gain <= 0) return;

  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  // Noise burst — filtered
  const noiseSamples = Math.floor(ctx.sampleRate * 0.13);
  const noiseBuf = ctx.createBuffer(1, noiseSamples, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseSamples; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 700;

  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 1100;
  bpf.Q.value = 2;

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(1.4, time);
  noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

  noise.connect(hpf);
  hpf.connect(bpf);
  bpf.connect(noiseEnv);
  noiseEnv.connect(master);
  noise.start(time);

  // High-pitched click oscillator
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(750, time);
  osc.frequency.exponentialRampToValueAtTime(480, time + 0.09);

  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(0.55, time);
  oscEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(time);
  osc.stop(time + 0.1);
}
