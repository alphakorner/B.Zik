import { useEffect, useRef } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BANDS, PRESETS, soundSpectrum, useSound } from '@/playback/sound';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const hzLabel = (f: number) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

/** Spectre de sortie en direct : 32 barres, couleur d'accent. */
function Spectrum() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    let raf = 0;
    const color = getComputedStyle(canvas).getPropertyValue('--keyColor').trim() || '#e53935';
    const bars = 32;
    const heights = new Array<number>(bars).fill(0);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      g.clearRect(0, 0, w, h);
      const data = soundSpectrum();
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        // Échelle logarithmique : plus de barres pour le grave et le médium.
        const idx = data ? Math.floor(Math.pow(i / bars, 2) * (data.length * 0.75)) + 1 : 0;
        const target = data ? (data[idx] ?? 0) / 255 : 0;
        heights[i] = Math.max(heights[i]! * 0.9, target);
        const bh = Math.max(3, heights[i]! * h);
        g.fillStyle = color;
        g.globalAlpha = 0.35 + heights[i]! * 0.65;
        g.beginPath();
        g.roundRect(i * bw + 2, h - bh, bw - 4, bh, 4);
        g.fill();
      }
      g.globalAlpha = 1;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={640} height={140} className="mx-4 mb-4 mt-1 h-[88px] w-[calc(100%-32px)]" style={{ color: 'var(--keyColor)' }} aria-hidden />;
}

export default function SoundStudioPage() {
  const s = useSound();
  return (
    <div className={settingsUi.centered}>
      <PageHeader title="Sound Studio" back={{ to: '/settings', label: 'Settings' }} />
      <div className={settingsUi.body}>
        <p className="mx-4 mb-5 max-w-[64ch] type-body-reduced text-secondary text-pretty">
          Réglage du son pour toute l’application. Le profil choisi s’applique à tous les titres, albums, playlists et files d’attente, maintenant et pour tous les futurs titres, jusqu’à ce que tu le changes.
        </p>

        <section className={settingsUi.group} aria-label="Sound Studio">
          <Toggle label="Son Studio" detail="Active tout le traitement ci-dessous. Désactivé, le son est celui de YouTube, sans traitement." checked={s.enabled} onChange={(enabled) => s.update({ enabled })} />
          <Spectrum />
        </section>

        <h2 className={settingsUi.sectionHeader}>Profil</h2>
        <section className={`${settingsUi.group} p-3`} aria-label="Profils">
          <div className="ot-segmented flex-wrap" role="radiogroup" aria-label="Profil sonore" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={s.preset === p.id} onClick={() => s.applyPreset(p.id)}>{p.name}</button>
            ))}
            {s.preset === 'custom' && <button role="radio" aria-checked>Perso</button>}
          </div>
          <p className="px-1 pt-3 type-callout text-secondary">
            {PRESETS.find((p) => p.id === s.preset)?.detail ?? 'Tes réglages personnalisés.'}
          </p>
        </section>

        <h2 className={settingsUi.sectionHeader}>Master adaptatif</h2>
        <section className={settingsUi.group}>
          <Toggle
            label="Master adaptatif"
            detail="Analyse le morceau en direct et corrige doucement les basses et les aigus vers un équilibre de studio. Traitement du signal, sans modèle d’IA générative."
            checked={s.adaptive}
            onChange={(adaptive) => s.update({ adaptive })}
          />
          <Toggle label="Volume constant" detail="Compresseur doux + limiteur : plus de pics ni de saturation, même avec beaucoup de basses." checked={s.leveling} onChange={(leveling) => s.update({ leveling })} />
        </section>

        <h2 className={settingsUi.sectionHeader}>Basses et scène</h2>
        <section className={settingsUi.group}>
          <label className={`${settingsUi.row} flex-col items-stretch gap-2`}>
            <span className="flex justify-between"><span>Punch des basses</span><span className="text-secondary">{Math.round(s.bass)} %</span></span>
            <input type="range" min={0} max={100} step={1} value={s.bass} onChange={(e) => s.update({ bass: Number(e.currentTarget.value), preset: 'custom' })} style={{ accentColor: 'var(--keyColor)' }} />
          </label>
          <label className={`${settingsUi.row} flex-col items-stretch gap-2`}>
            <span className="flex justify-between"><span>Largeur stéréo (scène)</span><span className="text-secondary">{Math.round(s.width)} %</span></span>
            <input type="range" min={0} max={160} step={1} value={s.width} onChange={(e) => s.update({ width: Number(e.currentTarget.value), preset: 'custom' })} style={{ accentColor: 'var(--keyColor)' }} />
          </label>
        </section>

        <h2 className={settingsUi.sectionHeader}>Égaliseur 10 bandes</h2>
        <section className={settingsUi.group}>
          {BANDS.map((f, i) => (
            <label key={f} className={`${settingsUi.row} flex-col items-stretch gap-1.5`}>
              <span className="flex justify-between"><span>{hzLabel(f)}</span><span className="text-secondary tabular-nums">{sign(s.bands[i] ?? 0)}</span></span>
              <input type="range" min={-12} max={12} step={0.5} value={s.bands[i] ?? 0} onChange={(e) => s.setBand(i, Number(e.currentTarget.value))} style={{ accentColor: 'var(--keyColor)' }} />
            </label>
          ))}
        </section>

        <div className="mx-4 mt-5">
          <button type="button" className="ot-allow" onClick={s.reset}>Rétablir le profil Studio</button>
        </div>
        <p className={settingsUi.footer}>Les réglages sont enregistrés sur cet appareil et s’appliquent à tout le lecteur. La synchronisation entre appareils viendra avec les comptes.</p>
      </div>
    </div>
  );
}
