/**
 * Mode « sans extension » : les appels YouTube passent par le Worker Cloudflare de B.Zik
 * (proxy/worker.js), qui ajoute Origin/Referer et les en-têtes CORS.
 */
const PROXY = (import.meta.env.VITE_BZIK_PROXY as string | undefined)?.replace(/\/$/, '') || '';
export const proxyEnabled = PROXY !== '';
const HOST = /(^|\.)(youtube\.com|youtubei\.googleapis\.com|googlevideo\.com)$/;

export function viaProxy(url: string | URL): string {
  const u = new URL(url.toString());
  if (!proxyEnabled || !HOST.test(u.hostname)) return u.toString();
  return `${PROXY}/?u=${encodeURIComponent(u.toString())}`;
}
