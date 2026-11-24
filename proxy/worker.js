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
    'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Language',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Origin refusée', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const target = new URL(request.url).searchParams.get('u');
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
    const needsOrigin = url.pathname.startsWith('/youtubei/') || url.pathname.startsWith('/api/jnn/GenerateIT');
    if (!isGV && needsOrigin) {
      // Comme la règle declarativeNetRequest de l'extension : Origin/Referer YouTube.
      // L'Origin doit correspondre à l'hôte appelé (www.youtube.com ou music.youtube.com), sinon 400 « XD3 ».
      const self = 'https://' + url.hostname;
      headers.set('Origin', self);
      headers.set('Referer', self + '/');
      headers.set('X-Origin', self);
      if (request.method === 'POST') headers.set('Content-Type', 'application/json');
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
