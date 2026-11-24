/**
 * Lecteur de secours : le lecteur intégré officiel de YouTube (IFrame Player API).
 *
 * Quand le flux direct ne démarre pas (YouTube refuse au hasard les adresses IP des serveurs relais), le titre est
 * joué par le lecteur YouTube lui-même, dans le navigateur de l'utilisateur : sa propre IP, aucun blocage, titre
 * entier. Conformément aux conditions d'utilisation de YouTube, la vidéo reste visible (carte flottante 220×220) :
 * elle n'est jamais masquée ni réduite.
 */
import { create } from 'zustand';

const KEY = 'bzik:embed';
export const useEmbedSettings = create<{ enabled: boolean; setEnabled: (on: boolean) => void }>((set) => ({
  enabled: (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })(),
  setEnabled: (enabled) => { try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignoré */ } set({ enabled }); },
}));

interface YTPlayer {
  loadVideoById(id: string, start?: number): void;
  playVideo(): void; pauseVideo(): void; stopVideo(): void; seekTo(s: number, allow: boolean): void;
  getPlayerState(): number; getCurrentTime(): number; getDuration(): number; setVolume(v: number): void;
  destroy(): void;
}
interface YTApi {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global { interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void } }

export interface EmbedHandlers {
  onState: (state: 'playing' | 'paused' | 'buffering') => void;
  onEnded: () => void;
  onError: (code: number) => void;
}

let api: Promise<YTApi> | null = null;
let player: YTPlayer | null = null;
let ready: Promise<YTPlayer> | null = null;
let card: HTMLDivElement | null = null;
let handlers: EmbedHandlers | null = null;
let activeId: string | null = null;
let volume = 100;

function loadApi(): Promise<YTApi> {
  api ??= new Promise<YTApi>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT!); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { api = null; reject(new Error('API YouTube injoignable')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT?.Player) { api = null; reject(new Error('API YouTube trop lente')); } }, 10000);
  });
  return api;
}

function ensureCard(): HTMLDivElement {
  if (card) return card;
  card = document.createElement('div');
  card.id = 'bzik-embed';
  card.setAttribute('aria-label', 'Lecteur YouTube');
  Object.assign(card.style, {
    position: 'fixed', left: '12px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)', width: '220px', height: '220px',
    zIndex: '60', borderRadius: '16px', overflow: 'hidden', background: '#000', boxShadow: '0 10px 40px rgba(0,0,0,.45)', display: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:100%';
  card.appendChild(host);
  document.body.appendChild(card);
  return card;
}

async function ensurePlayer(): Promise<YTPlayer> {
  if (player) return player;
  ready ??= (async () => {
    const yt = await loadApi();
    const host = ensureCard().firstElementChild as HTMLElement;
    return new Promise<YTPlayer>((resolve, reject) => {
      const timer = setTimeout(() => { ready = null; reject(new Error('Lecteur YouTube trop lent')); }, 12000);
      const p = new yt.Player(host, {
        width: '220', height: '220',
        playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: location.origin },
        events: {
          onReady: () => { clearTimeout(timer); player = p; p.setVolume(volume); resolve(p); },
          onStateChange: (e: { data: number }) => {
            if (!handlers) return;
            if (e.data === 1) { hideHint(); handlers.onState('playing'); }
            else if (e.data === 2) handlers.onState('paused');
            else if (e.data === 3) handlers.onState('buffering');
            else if (e.data === 0) handlers.onEnded();
          },
          onError: (e: { data: number }) => handlers?.onError(e.data),
        },
      });
    });
  })();
  return ready;
}

let hint: HTMLDivElement | null = null;
let hintTimer: number | undefined;
function hideHint(): void { clearTimeout(hintTimer); if (hint) hint.style.display = 'none'; }
/** Si le navigateur bloque le démarrage automatique, on le dit : un tap sur le ▶ du lecteur suffit. */
function armHint(): void {
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    if (activeId === null || !card) return;
    try { if (player?.getPlayerState() === 1) return; } catch { /* ignoré */ }
    if (!hint) {
      hint = document.createElement('div');
      hint.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:8px 10px;font:600 13px system-ui;color:#fff;background:linear-gradient(90deg,#ff2d87,#7a3cff);text-align:center;pointer-events:none';
      hint.textContent = 'Touche ▶ pour lancer la lecture';
      card.appendChild(hint);
    }
    hint.style.display = 'block';
  }, 2500);
}

/** Précharge l'API et le lecteur (à appeler dès le premier geste) : le relais est alors prêt en un instant. */
export function preloadEmbed(): void { void ensurePlayer().catch(() => { /* réessayé au moment du besoin */ }); }

/** Joue [videoId] dans le lecteur YouTube intégré ; résout quand le lecteur a pris la commande. */
export async function playEmbedded(videoId: string, h: EmbedHandlers, startSec = 0): Promise<void> {
  const p = await ensurePlayer();
  handlers = h;
  activeId = videoId;
  ensureCard().style.display = 'block';
  p.loadVideoById(videoId, startSec);
  p.playVideo();
  armHint();
}

export function embedActive(): boolean { return activeId !== null; }

export function stopEmbedded(): void {
  if (activeId === null) return;
  activeId = null; handlers = null; hideHint();
  try { player?.stopVideo(); } catch { /* lecteur déjà détruit */ }
  if (card) card.style.display = 'none';
}

export function embedToggle(): void {
  if (!player || activeId === null) return;
  if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo();
}

export function embedSeek(seconds: number): void { if (player && activeId !== null) player.seekTo(Math.max(0, seconds), true); }
export function embedSetVolume(v01: number): void { volume = Math.round(Math.min(1, Math.max(0, v01)) * 100); try { player?.setVolume(volume); } catch { /* ignoré */ } }
export function embedPosition(): { time: number; duration: number } | null {
  if (!player || activeId === null) return null;
  return { time: player.getCurrentTime(), duration: player.getDuration() };
}
