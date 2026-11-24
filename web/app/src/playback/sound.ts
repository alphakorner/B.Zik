/**
 * Studio sonore B.Zik : chaîne Web Audio appliquée à CHAQUE lecteur (les deux « decks »), donc à tous les titres,
 * quelle que soit leur origine (album, playlist, recherche, file d'attente…). Les réglages sont enregistrés
 * (localStorage) et réappliqués automatiquement à chaque titre futur jusqu'à ce que l'utilisateur les change.
 *
 * Chaîne : préampli → égaliseur 10 bandes → basses (shelf + harmoniques) → master adaptatif (2 shelves pilotés par
 * l'analyse du spectre) → largeur stéréo (mid/side) → compresseur de nivellement → limiteur → sortie.
 *
 * Le « master adaptatif » est un traitement du signal temps réel (analyse spectrale + correction lente vers une
 * courbe cible type « son pro »), pas un modèle d'IA générative.
 */
import { create } from 'zustand';

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export type PresetId = 'flat' | 'studio' | 'concert' | 'bass' | 'vocal' | 'clarity' | 'night' | 'custom';

export const PRESETS: { id: PresetId; name: string; detail: string; bands: number[]; bass: number; width: number; leveling: boolean }[] = [
  { id: 'flat', name: 'Neutre', detail: 'Aucun traitement de couleur.', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: 0, width: 100, leveling: false },
  { id: 'studio', name: 'Studio', detail: 'Neutre et précis, un peu d’air dans les aigus.', bands: [1, 1, 0, -1, -0.5, 0, 0.5, 1.5, 2, 2.5], bass: 15, width: 110, leveling: true },
  { id: 'concert', name: 'Concert live', detail: 'Basses profondes, médiums ouverts, aigus brillants, scène large.', bands: [4, 4, 2.5, 0, -1, 0, 1, 2.5, 3.5, 3], bass: 40, width: 135, leveling: true },
  { id: 'bass', name: 'Basses +', detail: 'Grave puissant et rond.', bands: [6, 5.5, 4, 2, 0.5, 0, 0, 0, 0, 0], bass: 70, width: 100, leveling: true },
  { id: 'vocal', name: 'Voix', detail: 'Voix en avant, nette et chaude.', bands: [-2, -1.5, -1, 0, 1.5, 3, 3, 2, 1, 0], bass: 0, width: 100, leveling: true },
  { id: 'clarity', name: 'Aigus clairs', detail: 'Détails et brillance.', bands: [-1, -1, 0, 0, 0, 1, 2.5, 4, 4.5, 4], bass: 0, width: 115, leveling: true },
  { id: 'night', name: 'Nuit', detail: 'Volume constant, basses douces.', bands: [-2, -1, 0, 0, 0, 0, 0, 0, 0, 0], bass: 0, width: 100, leveling: true },
];

export interface SoundSettings {
  enabled: boolean;
  preset: PresetId;
  bands: number[];
  /** Punch des basses, 0–100. */
  bass: number;
  /** Largeur stéréo en %, 0 (mono) – 160. */
  width: number;
  /** Compresseur de nivellement : volume plus constant. */
  leveling: boolean;
  /** Master adaptatif (analyse temps réel). */
  adaptive: boolean;
}

export const DEFAULT_SOUND: SoundSettings = {
  enabled: true, preset: 'studio', bands: [...PRESETS[1]!.bands], bass: PRESETS[1]!.bass, width: PRESETS[1]!.width, leveling: true, adaptive: true,
};

const KEY = 'bzik:sound';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitize(value: unknown): SoundSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<SoundSettings>;
  const bands = Array.isArray(v.bands) && v.bands.length === BANDS.length ? v.bands.map((b) => clamp(Number(b) || 0, -12, 12)) : [...DEFAULT_SOUND.bands];
  const ids = ['flat', 'studio', 'concert', 'bass', 'vocal', 'clarity', 'night', 'custom'];
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SOUND.enabled,
    preset: ids.includes(v.preset ?? '') ? (v.preset as PresetId) : DEFAULT_SOUND.preset,
    bands,
    bass: clamp(Number(v.bass ?? DEFAULT_SOUND.bass), 0, 100),
    width: clamp(Number(v.width ?? DEFAULT_SOUND.width), 0, 160),
    leveling: typeof v.leveling === 'boolean' ? v.leveling : DEFAULT_SOUND.leveling,
    adaptive: typeof v.adaptive === 'boolean' ? v.adaptive : DEFAULT_SOUND.adaptive,
  };
}

function read(): SoundSettings {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...DEFAULT_SOUND, bands: [...DEFAULT_SOUND.bands] }; }
}

interface SoundStore extends SoundSettings {
  update: (patch: Partial<SoundSettings>) => void;
  applyPreset: (id: PresetId) => void;
  setBand: (index: number, gain: number) => void;
  reset: () => void;
}

export const useSound = create<SoundStore>((set, get) => ({
  ...read(),
  update: (patch) => set(patch),
  applyPreset: (id) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    set({ preset: id, bands: [...p.bands], bass: p.bass, width: p.width, leveling: p.leveling });
  },
  setBand: (index, gain) => {
    const bands = [...get().bands];
    bands[index] = clamp(gain, -12, 12);
    set({ bands, preset: 'custom' });
  },
  reset: () => set({ ...DEFAULT_SOUND, bands: [...DEFAULT_SOUND.bands] }),
}));

useSound.subscribe((s) => {
  try {
    const { enabled, preset, bands, bass, width, leveling, adaptive } = s;
    localStorage.setItem(KEY, JSON.stringify({ enabled, preset, bands, bass, width, leveling, adaptive }));
  } catch { /* stockage indisponible : les réglages restent valables pour la session */ }
  applyAll();
});

// ---- Graphe audio -----------------------------------------------------------------------------

class Chain {
  readonly pre: GainNode;
  readonly eq: BiquadFilterNode[];
  readonly bassShelf: BiquadFilterNode;
  readonly bassThump: BiquadFilterNode;
  readonly adaptLow: BiquadFilterNode;
  readonly adaptHigh: BiquadFilterNode;
  readonly sideGain: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly probe: AnalyserNode;
  readonly meter: AnalyserNode;
  private adaptLowDb = 0;
  private adaptHighDb = 0;
  private freq: Float32Array<ArrayBuffer>;
  private time: Float32Array<ArrayBuffer>;
  private spec: Uint8Array<ArrayBuffer>;

  constructor(readonly ctx: AudioContext, readonly audio: HTMLAudioElement, source: MediaElementAudioSourceNode) {
    this.pre = ctx.createGain();
    this.eq = BANDS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      return b;
    });
    this.bassShelf = ctx.createBiquadFilter(); this.bassShelf.type = 'lowshelf'; this.bassShelf.frequency.value = 95;
    this.bassThump = ctx.createBiquadFilter(); this.bassThump.type = 'peaking'; this.bassThump.frequency.value = 55; this.bassThump.Q.value = 0.9;
    this.adaptLow = ctx.createBiquadFilter(); this.adaptLow.type = 'lowshelf'; this.adaptLow.frequency.value = 140;
    this.adaptHigh = ctx.createBiquadFilter(); this.adaptHigh.type = 'highshelf'; this.adaptHigh.frequency.value = 7000;

    // Largeur stéréo mid/side.
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const mid = ctx.createGain(); const side = ctx.createGain(); this.sideGain = ctx.createGain();
    const lMid = ctx.createGain(); lMid.gain.value = 0.5; const rMid = ctx.createGain(); rMid.gain.value = 0.5;
    const lSide = ctx.createGain(); lSide.gain.value = 0.5; const rSide = ctx.createGain(); rSide.gain.value = -0.5;
    const outL = ctx.createGain(); const outR = ctx.createGain(); const neg = ctx.createGain(); neg.gain.value = -1;

    this.comp = ctx.createDynamicsCompressor();
    this.limiter = ctx.createDynamicsCompressor();
    this.probe = ctx.createAnalyser(); this.probe.fftSize = 2048; this.probe.smoothingTimeConstant = 0.9;
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 1024; this.meter.smoothingTimeConstant = 0.7;
    this.freq = new Float32Array(this.probe.frequencyBinCount);
    this.time = new Float32Array(this.meter.fftSize);
    this.spec = new Uint8Array(this.meter.frequencyBinCount);

    // source → pre → (sonde) → eq… → basses → adaptatif → M/S → comp → limiteur → sortie
    source.connect(this.pre);
    this.pre.connect(this.probe);
    let node: AudioNode = this.pre;
    for (const f of [...this.eq, this.bassShelf, this.bassThump, this.adaptLow, this.adaptHigh]) { node.connect(f); node = f; }
    node.connect(split);
    split.connect(lMid, 0); split.connect(rMid, 1); split.connect(lSide, 0); split.connect(rSide, 1);
    lMid.connect(mid); rMid.connect(mid); lSide.connect(side); rSide.connect(side);
    side.connect(this.sideGain);
    mid.connect(outL); this.sideGain.connect(outL);
    mid.connect(outR); this.sideGain.connect(neg); neg.connect(outR);
    outL.connect(merge, 0, 0); outR.connect(merge, 0, 1);
    merge.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(this.meter); this.meter.connect(ctx.destination);
    this.apply();
  }

  apply() {
    const s = useSound.getState();
    const on = s.enabled;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.04);
    const gains = this.eq.map((_, i) => (on ? s.bands[i] ?? 0 : 0));
    gains.forEach((g, i) => set(this.eq[i]!.gain, g));
    const bass = on ? s.bass / 100 : 0;
    set(this.bassShelf.gain, bass * 6);
    set(this.bassThump.gain, bass * 4);
    // Préampli : compense les boosts pour ne pas saturer (jamais de gain positif).
    const boost = on ? Math.max(0, ...gains) + bass * 6 : 0;
    set(this.pre.gain, Math.pow(10, -(boost * 0.65) / 20));
    set(this.sideGain.gain, on ? s.width / 100 : 1);
    const lv = on && s.leveling;
    set(this.comp.threshold, lv ? -26 : 0);
    set(this.comp.knee, lv ? 30 : 0);
    set(this.comp.ratio, lv ? 3 : 1);
    set(this.comp.attack, 0.012);
    set(this.comp.release, 0.28);
    set(this.limiter.threshold, on ? -1.5 : 0);
    set(this.limiter.knee, 0);
    set(this.limiter.ratio, on ? 20 : 1);
    set(this.limiter.attack, 0.003);
    set(this.limiter.release, 0.12);
    if (!(on && s.adaptive)) { this.adaptLowDb = 0; this.adaptHighDb = 0; set(this.adaptLow.gain, 0); set(this.adaptHigh.gain, 0); }
  }

  /** Mesure le spectre d'entrée et rapproche lentement le grave et l'aigu d'une courbe cible « pro ». */
  adapt() {
    const s = useSound.getState();
    if (!(s.enabled && s.adaptive) || this.audio.paused || this.ctx.state !== 'running') return;
    this.probe.getFloatFrequencyData(this.freq);
    const hz = this.ctx.sampleRate / this.probe.fftSize;
    const avg = (lo: number, hi: number) => {
      let sum = 0, n = 0;
      for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(this.freq.length - 1, Math.ceil(hi / hz)); i++) { const v = this.freq[i]!; if (Number.isFinite(v)) { sum += v; n++; } }
      return n ? sum / n : -120;
    };
    const low = avg(60, 200), mid = avg(500, 2000), high = avg(6000, 12000);
    if (mid < -75) return; // silence
    // Cible : grave ≈ médiums +3 dB, aigu ≈ médiums −7 dB.
    const wantLow = clamp(3 - (low - mid), -4, 4);
    const wantHigh = clamp(-7 - (high - mid), -4, 4);
    this.adaptLowDb += (wantLow - this.adaptLowDb) * 0.08;
    this.adaptHighDb += (wantHigh - this.adaptHighDb) * 0.08;
    const t = this.ctx.currentTime;
    this.adaptLow.gain.setTargetAtTime(this.adaptLowDb, t, 0.3);
    this.adaptHigh.gain.setTargetAtTime(this.adaptHighDb, t, 0.3);
  }

  level(): number {
    this.meter.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (const v of this.time) sum += v * v;
    return Math.sqrt(sum / this.time.length);
  }

  spectrum(): Uint8Array {
    this.meter.getByteFrequencyData(this.spec);
    return this.spec;
  }
}

let ctx: AudioContext | null = null;
const chains = new Map<HTMLAudioElement, Chain>();
let timer = 0;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor({ latencyHint: 'playback' }); } catch { return null; }
  return ctx;
}

function applyAll() { for (const c of chains.values()) c.apply(); }

/** À appeler dans un geste de l'utilisateur (tap) : crée/réveille le contexte audio (sinon le son reste muet sur mobile). */
export function unlockSound(): void {
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => {});
}

/** Branche un lecteur sur la chaîne. À appeler une fois par élément <audio> (il garde la chaîne pour tous ses titres). */
export function attachSound(audio: HTMLAudioElement): void {
  if (chains.has(audio)) return;
  const c = context();
  if (!c) return;
  try {
    const source = c.createMediaElementSource(audio);
    chains.set(audio, new Chain(c, audio, source));
  } catch { return; /* déjà branché ou non supporté : le lecteur joue normalement */ }
  if (c.state !== 'running') void c.resume().catch(() => {});
  audio.addEventListener('play', () => { if (c.state !== 'running') void c.resume().catch(() => {}); });
  if (!timer) timer = window.setInterval(() => { if (document.visibilityState === 'visible') for (const ch of chains.values()) ch.adapt(); }, 250);
  Object.defineProperty(window, '__bzSound', { value: { level: () => Math.max(0, ...[...chains.values()].map((ch) => ch.level())), state: () => c.state, chains: () => chains.size }, configurable: true });
}

/** Spectre de sortie (0–255) du lecteur qui joue, pour l'affichage. */
export function soundSpectrum(): Uint8Array | null {
  for (const ch of chains.values()) if (!ch.audio.paused) return ch.spectrum();
  return null;
}


// ---- Petit son de chargement (bulle douce) ------------------------------------------------------
// Synthétisé en direct (aucun fichier) : une goutte sinusoïdale très légère + un écho filtré, niveau bas.
let loadBus: { out: GainNode; timer: number } | null = null;

function bubble(c: AudioContext, dest: AudioNode, t: number, f: number) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(dest); o.start(t); o.stop(t + 0.2);
}

export function startLoadingSound(): void {
  if (loadBus) return;
  const c = context();
  if (!c || c.state !== 'running') return;
  const out = c.createGain();
  out.gain.value = 0.0001;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  const echo = c.createDelay(0.5); echo.delayTime.value = 0.18;
  const fb = c.createGain(); fb.gain.value = 0.28;
  const wet = c.createGain(); wet.gain.value = 0.35;
  lp.connect(out); lp.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(out);
  out.connect(c.destination);
  out.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.12); // très léger
  const notes = [523.25, 659.25, 783.99, 659.25];
  let i = 0;
  const tick = () => { bubble(c, lp, c.currentTime + 0.02, notes[i++ % notes.length]!); };
  tick();
  loadBus = { out, timer: window.setInterval(tick, 620) };
}

export function stopLoadingSound(): void {
  const b = loadBus; if (!b) return;
  loadBus = null;
  clearInterval(b.timer);
  const c = context();
  try {
    if (c) { b.out.gain.cancelScheduledValues(c.currentTime); b.out.gain.setValueAtTime(Math.max(b.out.gain.value, 0.0001), c.currentTime); b.out.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08); }
    setTimeout(() => { try { b.out.disconnect(); } catch { /* ignoré */ } }, 200);
  } catch { /* ignoré */ }
}
