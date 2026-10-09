// Historique partagé : fonction serverless Vercel.
// Protégé par un code d'accès de 6 caractères (variable d'environnement ACCESS_CODE).
// Stockage : Redis (Upstash) relié au projet Vercel.
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ACCESS = (process.env.ACCESS_CODE || '').trim().toUpperCase();
const KEY = 'snotrac:calculs';
const MAX_KEPT = 300, MAX_LISTED = 100, MAX_TRIES = 15, WINDOW_S = 600;

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; };
const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const configured = !!(URL_ && TOKEN && /^[A-Z0-9]{6}$/.test(ACCESS));
  if (body.action === 'status') return res.status(200).json({ configured });
  if (!configured) return res.status(503).json({ error: 'Historique partagé non configuré' });

  try {
    // limite les essais de code par adresse IP
    const ip = txt((req.headers['x-forwarded-for'] || '').split(',')[0], 60) || 'inconnue';
    const rl = 'snotrac:essais:' + ip;
    const tries = Number(await redis(['GET', rl])) || 0;
    if (tries >= MAX_TRIES) return res.status(429).json({ error: 'Trop d\'essais, réessaie dans quelques minutes' });
    if (!same(txt(body.code, 12).toUpperCase(), ACCESS)) {
      const n = await redis(['INCR', rl]); if (n === 1) await redis(['EXPIRE', rl, WINDOW_S]);
      return res.status(401).json({ error: 'Code incorrect' });
    }

    const dev = txt(body.dev, 40);
    if (body.action === 'list') {
      const raw = await redis(['LRANGE', KEY, 0, MAX_LISTED - 1]);
      return res.status(200).json({ items: raw.map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean) });
    }
    if (body.action === 'add') {
      const e = body.entry || {}, v = {};
      for (const k of ['L', 'W', 'H', 'j', 'o', 'jeu', 'la', 'co']) { v[k] = num(e[k]); if (v[k] === null) return res.status(400).json({ error: 'Valeur invalide : ' + k }); }
      if (!/^\d{4}(\.\d{1,2})?$/.test(String(e.c))) return res.status(400).json({ error: 'Code invalide' });
      if (!dev) return res.status(400).json({ error: 'Appareil manquant' });
      const item = Object.assign({ id: crypto.randomUUID(), t: Date.now(), c: String(e.c) }, v, { by: txt(body.by, 24), dev });
      await redis(['LPUSH', KEY, JSON.stringify(item)]);
      await redis(['LTRIM', KEY, 0, MAX_KEPT - 1]);
      return res.status(200).json({ item });
    }
    if (body.action === 'delete' || body.action === 'clear') {
      if (!dev) return res.status(400).json({ error: 'Appareil manquant' });
      const raw = await redis(['LRANGE', KEY, 0, MAX_KEPT - 1]);
      let removed = 0;
      for (const s of raw) {
        let it; try { it = JSON.parse(s); } catch (e) { continue; }
        if (it.dev !== dev) continue;                                  // chacun ne supprime que ses calculs
        if (body.action === 'delete' && it.id !== body.id) continue;
        await redis(['LREM', KEY, 1, s]); removed++;
        if (body.action === 'delete') break;
      }
      return res.status(200).json({ removed });
    }
    return res.status(400).json({ error: 'Action inconnue' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
