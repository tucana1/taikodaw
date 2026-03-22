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

// ─── Cached reverb (one shared convolver per AudioContext) ────────────────────

let cachedReverb: {
  ctx: AudioContext;
  convolver: ConvolverNode;
} | null = null;

function getReverbConvolver(ctx: AudioContext): ConvolverNode {
  if (cachedReverb && cachedReverb.ctx === ctx) {
    return cachedReverb.convolver;
  }
  // Build a simple synthetic impulse response (small room feel)
  const rate = ctx.sampleRate;
  const duration = 0.9; // seconds
  const impulse = ctx.createBuffer(2, Math.floor(rate * duration), rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-4.5 * i) / data.length);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;

  const returnGain = ctx.createGain();
  returnGain.gain.value = 0.1;
  convolver.connect(returnGain);
  returnGain.connect(ctx.destination);

  cachedReverb = { ctx, convolver };
  return convolver;
}

/** Small random factor for humanisation (±amount) */
function jitter(amount = 0.025): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

// ─── Don ─────────────────────────────────────────────────────────────────────

/**
 * Don — low resonant face hit.
 *
 * @param pitch  0–100: 0 = dead centre (deepest), 100 = near edge (brightest).
 *               Affects start/end frequency, decay length, sub level and attack.
 */
export function playDon(
  ctx: AudioContext,
  time: number,
  hitVol: number,
  trackVol: number,
  masterVol: number,
  pitch: number = 50
): void {
  const gain = (hitVol / 100) * (trackVol / 100) * (masterVol / 100);
  if (gain <= 0) return;

  const t = Math.max(0, Math.min(100, pitch)) / 100; // 0 = centre, 1 = edge

  // Position-dependent parameters
  const startFreq = (140 + t * 100) * jitter(0.025); // 140–240 Hz
  const endFreq   = (42  + t * 46)  * jitter(0.02);  //  42– 88 Hz
  const decay     = 0.55 - t * 0.18;                  // longer at centre
  const subLevel  = 0.65 - t * 0.3;                   // more sub at centre

  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  // Reverb send
  const convolver = getReverbConvolver(ctx);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.28;
  reverbSend.connect(convolver);

  // Main body — sine sweep
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + decay);

  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(1.0, time);
  oscEnv.gain.exponentialRampToValueAtTime(0.001, time + decay + 0.04);

  osc.connect(oscEnv);
  oscEnv.connect(master);
  oscEnv.connect(reverbSend);
  osc.start(time);
  osc.stop(time + decay + 0.05);

  // Triangle harmonic — adds warmth / wood body resonance
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(startFreq * 0.5 * jitter(0.03), time);
  body.frequency.exponentialRampToValueAtTime(
    endFreq * 0.55 * jitter(0.025),
    time + decay * 0.65
  );

  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.28 - t * 0.12, time);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.6);

  body.connect(bodyEnv);
  bodyEnv.connect(master);
  body.start(time);
  body.stop(time + decay * 0.62);

  // Sub — adds depth (more prominent at centre hits)
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(startFreq * 0.5 * jitter(0.02), time);
  sub.frequency.exponentialRampToValueAtTime(endFreq * 0.45 * jitter(0.02), time + 0.3);

  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(subLevel, time);
  subEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

  sub.connect(subEnv);
  subEnv.connect(master);
  sub.connect(reverbSend);
  sub.start(time);
  sub.stop(time + 0.36);

  // Attack click — noise burst (stronger at edge hits)
  const clickLen = Math.floor(ctx.sampleRate * (0.016 + t * 0.008));
  const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
  const clickData = clickBuf.getChannelData(0);
  for (let i = 0; i < clickLen; i++) {
    clickData[i] = (Math.random() * 2 - 1) * Math.exp((-6 * i) / clickLen);
  }
  const click = ctx.createBufferSource();
  click.buffer = clickBuf;

  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0.28 + t * 0.3, time);

  click.connect(clickEnv);
  clickEnv.connect(master);
  click.start(time);
}

// ─── Ka ──────────────────────────────────────────────────────────────────────

/** Ka — short sharp rim / edge hit */
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

  // Light reverb for Ka
  const convolver = getReverbConvolver(ctx);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.15;
  reverbSend.connect(convolver);

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
  hpf.frequency.value = 650 * jitter(0.05);

  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 1050 * jitter(0.04);
  bpf.Q.value = 1.8 + Math.random() * 0.5;

  const noiseDecay = 0.09 + Math.random() * 0.02;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(1.4, time);
  noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + noiseDecay);

  noise.connect(hpf);
  hpf.connect(bpf);
  bpf.connect(noiseEnv);
  noiseEnv.connect(master);
  noiseEnv.connect(reverbSend);
  noise.start(time);

  // High-pitched click oscillator
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(720 * jitter(0.03), time);
  osc.frequency.exponentialRampToValueAtTime(460 * jitter(0.025), time + 0.09);

  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(0.55, time);
  oscEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

  osc.connect(oscEnv);
  oscEnv.connect(master);
  osc.start(time);
  osc.stop(time + 0.1);
}
