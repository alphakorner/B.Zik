// B.Zik proxy — Cloudflare Worker (gratuit). Remplace l'extension navigateur :
// il relaie les appels YouTube que le navigateur n'a pas le droit de faire (CORS, Origin, Referer).
// Usage : https://<ton-worker>.workers.dev/?u=<URL-encodée>
// Liste blanche stricte de domaines + liste blanche d'origines (pas de proxy ouvert).
const ALLOWED_HOSTS = [/^music\.youtube\.com$/, /^www\.youtube\.com$/, /^youtubei\.googleapis\.com$/, /(^|\.)googlevideo\.com$/];
const ALLOWED_ORIGINS = ['https://alphakorner.github.io', 'http://localhost:5173', 'http://localhost:4173'];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Language, X-Goog-Api-Key, X-User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const VERSION = 'v5.1';

// ---- Flux audio résolu côté Worker (v5) ---------------------------------------
// Les URLs googlevideo sont liées à l'IP qui a fait l'appel /player. Depuis Cloudflare, l'IP de sortie
// change entre deux requêtes distinctes du navigateur -> 403 en cours de lecture. Ici la résolution et le
// téléchargement se font dans la MÊME invocation, et un 403 relance une résolution toute fraîche.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PLAYER_CLIENTS = [
  { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en', gl: 'US' },
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, osName: 'Android', osVersion: '11', hl: 'en', gl: 'US' },
];
const resolved = new Map(); // videoId -> { url, mime, size, meta, at }
const TTL_MS = 90_000;
const CHUNK = 2 * 1024 * 1024; // taille max d'une plage servie ; le navigateur enchaîne les requêtes

async function resolveStream(id, skipFrom = 0) {
  for (let i = skipFrom; i < PLAYER_CLIENTS.length; i++) {
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/', 'X-Origin': 'https://www.youtube.com', 'User-Agent': UA },
        body: JSON.stringify({ context: { client: PLAYER_CLIENTS[i] }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
      });
      const j = await r.json();
      if (j.playabilityStatus?.status !== 'OK') continue;
      const audio = (j.streamingData?.adaptiveFormats || []).filter((f) => f.url && /^audio\/mp4/.test(f.mimeType || ''));
      const f = audio.find((x) => x.itag === 140) || audio.sort((a, b) => b.bitrate - a.bitrate)[0];
      if (!f) continue;
      const d = j.videoDetails || {};
      return {
        url: f.url, mime: 'audio/mp4', size: Number(f.contentLength) || 0, at: Date.now(), client: PLAYER_CLIENTS[i].clientName, from: i,
        meta: { videoId: id, title: d.title || '', author: d.author || '', durationSec: Number(d.lengthSeconds) || 0, thumbnails: (d.thumbnail?.thumbnails || []).slice().reverse(), format: `${f.itag} mp4a ${Math.round((f.bitrate || 0) / 1000)}kbps`, client: PLAYER_CLIENTS[i].clientName },
      };
    } catch { /* client suivant */ }
  }
  return null;
}

async function getStream(id, fresh = false, skipFrom = 0) {
  const hit = resolved.get(id);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit;
  const r = await resolveStream(id, skipFrom);
  if (r) { if (resolved.size > 200) resolved.clear(); resolved.set(id, r); }
  return r;
}

async function handleAudio(request, id, origin) {
  const h = cors(origin);
  if (!/^[\w-]{11}$/.test(id)) return new Response('id invalide', { status: 400, headers: h });
  let skipFrom = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const st = await getStream(id, attempt > 0, skipFrom);
    if (!st) break;
    // googlevideo refuse (403) les plages ouvertes « bytes=0- » des clients IOS/ANDROID : on borne toujours la plage.
    const m = (request.headers.get('Range') || '').match(/bytes=(\d+)-(\d*)/);
    const start = m ? Number(m[1]) : 0;
    let end = m && m[2] ? Math.min(Number(m[2]), start + CHUNK - 1) : start + CHUNK - 1;
    if (st.size) { if (start >= st.size) return new Response('Plage hors fichier', { status: 416, headers: { ...h, 'Content-Range': `bytes */${st.size}` } }); end = Math.min(end, st.size - 1); }
    const up = await fetch(st.url, { headers: { Range: `bytes=${start}-${end}`, 'User-Agent': UA }, redirect: 'follow' });
    if (up.status === 200 || up.status === 206) {
      const out = new Headers(h);
      for (const k of ['Content-Length', 'Content-Range']) { const v = up.headers.get(k); if (v) out.set(k, v); }
      out.set('Content-Type', st.mime); out.set('Accept-Ranges', 'bytes'); out.set('Cache-Control', 'no-store');
      return new Response(up.body, { status: up.status, headers: out });
    }
    up.body?.cancel();
    if (attempt === 1) skipFrom = Math.min(st.from + 1, PLAYER_CLIENTS.length - 1); // 2e échec : autre client
    resolved.delete(id);
  }
  return new Response('Flux indisponible', { status: 502, headers: h });
}

export default {
  async fetch(request) {
    // Contrôle de version : ouvrir https://<ton-worker>.workers.dev/?v dans le navigateur doit afficher « B.Zik proxy v4 ».
    if (new URL(request.url).searchParams.has('v')) return new Response('B.Zik proxy ' + VERSION, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Origin refusée', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const sp = new URL(request.url).searchParams;
    if (sp.has('a')) return handleAudio(request, sp.get('a'), origin);
    if (sp.has('i')) {
      const id = sp.get('i');
      const st = /^[\w-]{11}$/.test(id) ? await getStream(id, true) : null;
      return new Response(st ? JSON.stringify(st.meta) : '{"error":"indisponible"}', { status: st ? 200 : 502, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const target = sp.get('u');
    let url;
    try { url = new URL(target); } catch { return new Response('URL invalide', { status: 400, headers: cors(origin) }); }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
      return new Response('Domaine non autorisé', { status: 403, headers: cors(origin) });
    }

    const headers = new Headers();
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);
    headers.set('Accept-Language', request.headers.get('Accept-Language') || 'en-US,en;q=0.9');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    const isGV = /googlevideo\.com$/.test(url.hostname);
    // Origin/Referer YouTube uniquement pour les appels d'API (les pages et scripts les refusent : 400).
    const needsOrigin = url.pathname.startsWith('/youtubei/') || url.pathname.startsWith('/api/jnn/');
    if (!isGV && needsOrigin) {
      // Comme la règle declarativeNetRequest de l'extension : Origin/Referer YouTube.
      // L'Origin doit correspondre à l'hôte appelé (www.youtube.com ou music.youtube.com), sinon 400 « XD3 ».
      const self = 'https://' + url.hostname;
      headers.set('Origin', self);
      headers.set('Referer', self + '/');
      headers.set('X-Origin', self);
      if (request.method === 'POST') {
        // BotGuard (/api/jnn/) parle en protobuf-JSON et veut sa clé d'API ; l'API youtubei en JSON.
        const jnn = url.pathname.startsWith('/api/jnn/');
        headers.set('Content-Type', jnn ? 'application/json+protobuf' : 'application/json');
        if (jnn) {
          const key = request.headers.get('X-Goog-Api-Key'); if (key) headers.set('X-Goog-Api-Key', key);
          headers.set('X-User-Agent', request.headers.get('X-User-Agent') || 'grpc-web-javascript/0.1');
        }
      }
    }
    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'follow',
    });
    const out = new Headers(upstream.headers);
    out.delete('set-cookie');
    for (const [k, v] of Object.entries(cors(origin))) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
