/* Refrão — aprenda inglês com as músicas que você gosta.
 *
 * Níveis de cada frase (repetição espaçada estilo Leitner):
 *   0  novo        -> frase em inglês + tradução completa
 *   1  ~30% oculto -> algumas palavras da tradução escondidas (com 1ª letra de dica)
 *   2  ~55% oculto
 *   3  ~80% oculto
 *   4  só inglês   -> tradução toda escondida, o aluno precisa lembrar
 *   5  dominada    -> volta de vez em quando para você confirmar que sabe 100%
 */
'use strict';

let STORE_KEY = 'refrao.v1';   // por usuário quando o login está ativo: refrao.v1:<usuario>
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// Quanto tempo esperar até mostrar de novo, por nível alcançado
const INTERVALS = [0, 5 * MIN, 30 * MIN, 3 * HOUR, 12 * HOUR, 3 * DAY];
const HIDE_RATIO = [0, 0.3, 0.55, 0.8, 1, 1];
const MAX_LEVEL = 5;
const MAX_LEARNING = 12;
// Modos de estudo (o primeiro é o padrão)
const MODES = [['seq', '🎵 Na ordem'], ['lyric', '📖 Decorar letra'], ['random', '🔀 Aleatória']];
const modeOf = song => (MODES.some(m => m[0] === song?.mode) ? song.mode : 'seq');
const UNLOCK_GAP_MS = 4000;       // tempo mínimo fora do app para disparar o cartão

/* ---------------- estado ---------------- */
const defaults = () => ({
  songs: {}, activeSongId: null,
  daily: { date: '', done: 0, chosen: false },
  streak: { count: 0, last: '' },
  settings: { goal: 20, burst: 3, unlock: true, speak: false, mix: true },
  words: {}
});
let S = defaults();   // carregado no boot(), depois do login
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.songs) return Object.assign(defaults(), s, { settings: Object.assign(defaults().settings, s.settings) });
  } catch (e) {}
  return defaults();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Não consegui salvar 😕'); } window.Sync?.schedule(); }
// marca o que mudou de verdade (para juntar o progresso entre aparelhos sem perder nada)
function touch(song) { const t = Date.now(); if (song) song.touched = t; S.updatedAt = t; }

/* ---------------- utilidades ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = (d = new Date()) => d.toLocaleDateString('sv-SE'); // AAAA-MM-DD local
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => s.toLowerCase().replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
let toastTimer;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms); }
function confetti(emojis = ['🎉', '⭐', '🎵', '✨', '🏆']) {
  const box = $('confetti');
  for (let i = 0; i < 28; i++) {
    const e = document.createElement('i'); e.textContent = pickRandom(emojis);
    e.style.left = Math.random() * 100 + 'vw'; e.style.animationDelay = Math.random() * .5 + 's';
    box.appendChild(e); setTimeout(() => e.remove(), 2600);
  }
}
/* ---------------- arte & cores ---------------- */
// Paleta "de reserva" derivada do nome da música (sempre a mesma para a mesma música)
function hashPalette(seed) {
  const h = hash(seed) % 360;
  return [`hsl(${h} 75% 60%)`, `hsl(${(h + 55) % 360} 80% 62%)`];
}
// Ilustração gerada: ondas sonoras + sol + anéis, nas cores da música
function artSvg(song) {
  const [a, b] = song.palette || hashPalette(song.title + song.artist);
  const r = rng(hash(song.title + '|' + song.artist));
  const waves = Array.from({ length: 6 }, (_, i) => {
    const y = 250 + i * 34, amp = 18 + r() * 30, ph = r() * 200;
    return `<path d="M-20 ${y} C ${80 + ph / 4} ${y - amp}, ${180 + ph / 3} ${y + amp}, 260 ${y} S ${420 - ph / 5} ${y - amp}, 540 ${y}" stroke="#fff" stroke-opacity="${0.12 + i * 0.07}" stroke-width="${3 + i}" fill="none"/>`;
  }).join('');
  const cx = 120 + r() * 270, cy = 110 + r() * 70, rad = 60 + r() * 40;
  const rings = Array.from({ length: 3 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${rad + 26 * (i + 1)}" stroke="#fff" stroke-opacity="${0.18 - i * 0.05}" fill="none" stroke-width="2"/>`).join('');
  const stars = Array.from({ length: 14 }, () => `<circle cx="${r() * 512}" cy="${r() * 220}" r="${1 + r() * 2.2}" fill="#fff" fill-opacity="${0.4 + r() * 0.5}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="s"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></radialGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="#000" fill-opacity=".12"/>${stars}${rings}
    <circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#s)" fill-opacity=".85"/>${waves}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const artUrl = song => song.cover || artSvg(song);
const bgStyle = song => `background-image:url('${artUrl(song).replace(/'/g, '%27').replace(/"/g, '%22')}')`;

// Extrai duas cores vibrantes da capa (tipo Apple Music / Spotify)
function extractPalette(url) {
  return new Promise(resolve => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 40;
        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, 40, 40);
        const d = ctx.getImageData(0, 0, 40, 40).data, buckets = {};
        for (let i = 0; i < d.length; i += 4) {
          const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          if (l < 0.12 || l > 0.92) continue;
          const k = Math.round(h / 24) % 15;
          const b = buckets[k] || (buckets[k] = { n: 0, h: 0, s: 0, w: 0 });
          const w = 0.2 + s; b.n++; b.w += w; b.h += h * w; b.s += s * w;
        }
        const ranked = Object.values(buckets).map(b => ({ h: b.h / b.w, s: b.s / b.w, score: b.w })).sort((x, y) => y.score - x.score);
        if (!ranked.length) return resolve(null);
        const first = ranked[0];
        const second = ranked.find(x => Math.min(Math.abs(x.h - first.h), 360 - Math.abs(x.h - first.h)) > 35) || { h: (first.h + 40) % 360, s: first.s };
        const fmt = x => `hsl(${Math.round(x.h)} ${Math.round(Math.max(55, Math.min(90, x.s * 100 + 20)))}% 60%)`;
        resolve([fmt(first), fmt(second)]);
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
async function ensurePalette(song) {
  if (!song || song.palette || !song.cover || song._palTried) return;
  song._palTried = true;
  const pal = await extractPalette(song.cover);
  if (pal) { song.palette = pal; save(); if (song.id === S.activeSongId) applyTheme(song); }
}
function applyTheme(song) {
  ensurePalette(song);
  const root = document.documentElement.style;
  const [a, b] = song ? (song.palette || hashPalette(song.title + song.artist)) : ['#8b5cf6', '#ec4899'];
  root.setProperty('--accent', a); root.setProperty('--accent2', b);
  $('bgArt').style.backgroundImage = song ? `url("${artUrl(song).replace(/"/g, '%22')}")` : 'none';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#0f0c1a');
}

/* ---------------- telas ---------------- */
const SCREENS = ['home', 'pick', 'confirm', 'loading', 'lyrics', 'settings', 'login', 'social', 'chat', 'profile'];
let current = 'home';
function show(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); current = id; window.scrollTo(0, 0); if (id === 'home') { renderHome(); window.Tour?.maybe(); } }

/* ---------------- dia / sequência ---------------- */
function rollDay() {
  const t = today();
  if (S.daily.date !== t) { S.daily = { date: t, done: 0, chosen: false }; save(); }
}
/* ---------- dias seguidos (ofensiva) ----------
 * Guarda a LISTA de dias estudados (S.days). Assim, juntando iPhone, iPad, Safari e ícone,
 * nenhum dia se perde (antes, só "quantos dias" + "último dia" — e um aparelho zerava o outro). */
const dayStr = ts => today(new Date(ts));
function addDay(d) {
  if (!d) return;
  S.days = S.days || [];
  if (!S.days.includes(d)) { S.days.push(d); S.days.sort(); if (S.days.length > 800) S.days = S.days.slice(-800); }
}
// recupera os dias já estudados a partir do histórico (para quem usava antes desta correção)
function backfillDays() {
  const before = (S.days || []).length;
  for (const s of Object.values(S.songs || {})) for (const p of s.phrases || []) if (p.last) addDay(dayStr(p.last));
  for (const k of S.karaoke || []) if (k.date) addDay(dayStr(k.date));
  if (S.daily?.date && S.daily.done > 0) addDay(S.daily.date);
  const st = S.streak || {};
  if (st.last && st.count > 0) for (let i = 0; i < Math.min(st.count, 400); i++) addDay(dayStr(new Date(st.last + 'T12:00:00').getTime() - i * DAY));
  if ((S.days || []).length !== before) { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }
}
// dias seguidos terminando hoje (ou ontem, se hoje ainda não estudou)
function streakCount() {
  const set = new Set(S.days || []);
  let d = new Date(); if (!set.has(today(d))) d = new Date(Date.now() - DAY);
  let n = 0;
  while (set.has(today(d))) { n++; d = new Date(d.getTime() - DAY); }
  return n;
}
function markStudied() {
  const t = today();
  addDay(t);
  S.streak = { count: streakCount(), last: t };
  S.daily.done++;
  if (S.daily.done === S.settings.goal) setTimeout(() => { confetti(['🔥', '🎯', '🎉']); toast(`Meta do dia batida! ${S.settings.goal} frases 🎯 · toque em 📤 para compartilhar`, 4500); }, 600);
}

/* ---------------- HOME ---------------- */
function songStats(song) {
  const c = [0, 0, 0, 0, 0, 0];
  song.phrases.forEach(p => c[p.seen ? p.level : 0]++);
  const total = song.phrases.length || 1;
  const score = song.phrases.reduce((a, p) => a + (p.seen ? p.level : 0), 0) / (total * MAX_LEVEL);
  return { c, total, pct: Math.round(score * 100), mastered: c[5] };
}
function levelBar(song) {
  const { c, total } = songStats(song);
  return `<div class="levelbar">${c.map((n, i) => n ? `<span style="width:${n / total * 100}%;background:var(--lv${i})"></span>` : '').join('')}</div>`;
}
function renderHome() {
  rollDay();
  backfillDays();
  $('streakChip').textContent = `🔥 ${streakCount()}`;
  $('streakChip').title = `${streakCount()} dia(s) seguidos · ${(S.days || []).length} dias estudados no total`;
  const g = S.settings.goal, d = S.daily.done;
  $('goalText').textContent = `${d}/${g}`;
  $('goalRing').style.setProperty('--p', Math.min(100, d / g * 100));
  $('goalSub').textContent = d >= g ? 'Meta batida! Pode continuar se quiser 💪' : `Faltam ${g - d} frases hoje`;
  const song = S.songs[S.activeSongId];
  applyTheme(song); window.Profile?.syncNowPlaying();
  const hero = $('hero');
  if (!song) {
    const demo = { title: 'Refrão', artist: 'music' };
    hero.innerHTML = `<div class="hero-empty"><div class="art" style="${bgStyle(demo)}"></div>
      <h2>Sua trilha para o inglês</h2><div class="artist">Escolha uma música e aprenda frase por frase 🎶</div></div>`;
    $('btnStudy').disabled = true; $('btnLyrics').disabled = true; $('btnKaraoke').disabled = true; $('btnExam').disabled = true; $('miniStats').innerHTML = '';
  } else {
    const st = songStats(song);
    hero.innerHTML = `<div class="vinyl-wrap has-sleeve">
        <div class="vinyl"><div class="label" style="${bgStyle(song)}"></div></div>
        <div class="sleeve" style="${bgStyle(song)}"></div></div>
      <h2>${esc(song.title)}</h2><div class="artist">${esc(song.artist)}</div>
      <div class="progress-line">${levelBar(song)}<span class="pct">${st.pct}%</span></div>
      <div class="seg seg3" role="radiogroup" aria-label="Como as frases aparecem">
        ${MODES.map(([m, label]) => `<button role="radio" data-mode="${m}" aria-checked="${modeOf(song) === m}">${label}</button>`).join('')}
      </div>`;
    const learning = st.c[1] + st.c[2] + st.c[3] + st.c[4];
    const fresh = song.phrases.filter(p => !p.seen).length;
    $('miniStats').innerHTML = `<div class="glass"><b>${st.mastered}</b><span>🏆 dominadas</span></div>
      <div class="glass"><b>${learning}</b><span>🌱 aprendendo</span></div><div class="glass"><b>${fresh}</b><span>✨ novas</span></div>`;
    $('btnStudy').disabled = false; $('btnLyrics').disabled = false; $('btnKaraoke').disabled = false; $('btnExam').disabled = false;
  }
}

/* ---------------- PICK: pergunta diária + busca ---------------- */
function openPick(daily) {
  const song = S.songs[S.activeSongId];
  const h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  $('pickGreeting').innerHTML = daily
    ? `${hi}! 👋<br>Qual música vamos estudar hoje?<small>${song ? `Continue com <b>${esc(song.title)}</b> ou escolha uma nova.` : 'Diga o nome da música, eu busco a letra e preparo tudo.'}</small>`
    : `Trocar de música<small>Busque uma nova ou volte para uma da sua biblioteca.</small>`;
  $('results').innerHTML = ''; $('searchStatus').textContent = '';
  renderLibrary();
  show('pick');
}
function renderLibrary() {
  const songs = Object.values(S.songs).sort((a, b) => (b.id === S.activeSongId) - (a.id === S.activeSongId) || b.addedAt - a.addedAt);
  if (!songs.length) { $('library').innerHTML = ''; return; }
  $('library').innerHTML = `<h4>Sua biblioteca</h4><div class="list">${songs.map((s, i) => {
    const st = songStats(s);
    return `<button class="result glass" data-lib="${esc(s.id)}" style="animation-delay:${i * 40}ms"><div class="thumb" style="${bgStyle(s)}"></div><div style="flex:1;min-width:0"><b>${esc(s.title)}${s.id === S.activeSongId ? ' · <span class="muted">atual</span>' : ''}</b>
      <span class="muted small">${esc(s.artist)} · ${st.pct}% aprendido</span>${levelBar(s)}</div></button>`;
  }).join('')}</div>`;
}

let searchResults = [], pending = null;
async function search(q) {
  q = q.trim(); if (!q) return;
  $('searchStatus').textContent = 'Buscando… 🔎'; $('results').innerHTML = '';
  try {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    const seen = new Set();
    searchResults = data.filter(x => x.plainLyrics && !x.instrumental).filter(x => {
      const k = norm(x.trackName + '|' + x.artistName); if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 12);
    if (!searchResults.length) { $('searchStatus').textContent = 'Não achei a letra 😕 Tente outro nome, ou cole a letra manualmente lá embaixo.'; return; }
    $('searchStatus').textContent = 'Toque na música certa:';
    $('results').innerHTML = searchResults.map((x, i) => `<button class="result glass" data-res="${i}" style="animation-delay:${i * 40}ms">
      <div class="thumb" data-art="${i}" style="${bgStyle({ title: x.trackName, artist: x.artistName })}"></div><div style="flex:1;min-width:0"><b>${esc(x.trackName)}</b>
      <span class="muted small">${esc(x.artistName)}${x.albumName ? ' · ' + esc(x.albumName) : ''}${x.duration ? ' · ' + fmtDur(x.duration) : ''}</span></div></button>`).join('');
    // capas reais chegam aos poucos
    searchResults.slice(0, 6).forEach(async (x, i) => {
      const c = await findCover(x.trackName, x.artistName); if (!c) return;
      x.cover = c; const el = document.querySelector(`[data-art="${i}"]`); if (el) el.style.backgroundImage = `url('${c}')`;
    });
  } catch (e) {
    $('searchStatus').textContent = 'Sem conexão com a busca de letras agora. Verifique a internet ou cole a letra manualmente.';
  }
}
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

async function openConfirm(item) {
  pending = item;
  $('confirmTitle').textContent = item.title;
  $('confirmArtist').textContent = item.artist + (item.album ? ' · ' + item.album : '');
  $('confirmPreview').textContent = cleanLines(item.lyrics).slice(0, 5).join('\n');
  $('confirmListen').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.title + ' ' + item.artist);
  $('confirmCover').style.cssText = bgStyle(item);
  applyTheme(item);
  show('confirm');
  const cover = item.cover || await findCover(item.title, item.artist);
  if (cover && pending === item) {
    item.cover = cover; $('confirmCover').style.cssText = bgStyle(item);
    item.palette = await extractPalette(cover); if (pending === item) applyTheme(item);
  }
}
async function findCover(title, artist) {
  try {
    const r = await fetch(`https://itunes.apple.com/search?entity=song&limit=1&term=${encodeURIComponent(title + ' ' + artist)}`);
    const j = await r.json();
    const u = j.results?.[0]?.artworkUrl100;
    return u ? u.replace('100x100bb', '400x400bb') : null;
  } catch (e) { return null; }
}

/* ---------------- letra -> frases ---------------- */
function cleanLines(text) {
  return text.split(/\r?\n/).map(l => l.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim())
    .filter(l => l && !/^\(?(chorus|verse|bridge|intro|outro|refr[aã]o|pre-chorus)[\s\d:)]*$/i.test(l));
}
// versos muito curtos se juntam ao próximo para formar uma frase com sentido
function mergeShort(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = { ...items[i] };
    while (it.text.split(' ').length < 4 && i + 1 < items.length && (it.text + ' ' + items[i + 1].text).split(' ').length <= 16) {
      it.text += (/[,.!?;:]$/.test(it.text) ? ' ' : ', ') + items[++i].text; it.end = items[i].end;
    }
    out.push(it);
  }
  return out;
}
// Letra sincronizada do lrclib ("[00:32.15] Look at the stars") -> frases com início/fim em segundos
function timedSegments(synced) {
  const raw = [];
  for (const l of (synced || '').split(/\r?\n/)) {
    const ts = [...l.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; if (!ts.length) continue;
    const text = cleanLines(l.replace(/\[\d+:[\d.]+\]/g, ''))[0] || '';
    for (const m of ts) raw.push({ t: +m[1] * 60 + +m[2], text });
  }
  raw.sort((a, b) => a.t - b.t);
  raw.forEach((r, i) => r.end = Math.min(raw[i + 1]?.t ?? r.t + 6, r.t + 12)); // pausas longas não viram trecho
  return mergeShort(raw.filter(r => r.text).map(r => ({ text: r.text, start: r.t, end: r.end })));
}
// Dá a cada frase os trechos (início/fim) em que ela é cantada
function attachTimes(phrases, synced) {
  const map = new Map();
  for (const sg of timedSegments(synced)) { const k = norm(sg.text); if (!map.has(k)) map.set(k, []); map.get(k).push([+sg.start.toFixed(2), +sg.end.toFixed(2)]); }
  let n = 0;
  for (const p of phrases) { const t = map.get(norm(p.en)); if (t) { p.times = t; n++; } }
  return n;
}
function buildPhrases(text) {
  const out = mergeShort(cleanLines(text).map(t => ({ text: t }))).map(x => x.text);
  const map = new Map();
  out.forEach((en, order) => {
    const k = norm(en);
    if (map.has(k)) { const p = map.get(k); p.count++; p.at.push(order); }
    else map.set(k, { id: uid(), en, pt: '', count: 1, order, at: [order], level: 0, seen: false, due: 0, right: 0, wrong: 0, doubts: 0, last: 0, ivl: 0 });
  });
  return [...map.values()];
}

/* ---------------- tradução ---------------- */
async function gtx(text, sl = 'en', tl = 'pt') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url); if (!r.ok) throw new Error('gtx ' + r.status);
  const j = await r.json();
  return j[0].map(x => x[0]).join('');
}
async function mymemory(text) {
  const r = await fetch(`https://api.mymemory.translated.net/get?langpair=en|pt-BR&q=${encodeURIComponent(text)}`);
  const j = await r.json();
  const t = j?.responseData?.translatedText;
  if (!t || /MYMEMORY WARNING/i.test(t)) throw new Error('mymemory');
  return t;
}
async function translateOne(text) {
  try { return await gtx(text); } catch (e) { return await mymemory(text); }
}
async function translateAll(phrases, onProgress) {
  const CHUNK = 12; let done = 0, failed = 0;
  for (let i = 0; i < phrases.length; i += CHUNK) {
    const group = phrases.slice(i, i + CHUNK);
    let ok = false;
    try {
      const out = (await gtx(group.map(p => p.en).join('\n'))).split('\n').map(s => s.trim());
      if (out.length === group.length) { group.forEach((p, k) => p.pt = out[k]); ok = true; }
    } catch (e) {}
    if (!ok) for (const p of group) { try { p.pt = await translateOne(p.en); } catch (e) { failed++; } }
    done += group.length; onProgress(done / phrases.length);
  }
  return failed;
}

async function adoptSong(item) {
  const phrases = buildPhrases(item.lyrics);
  if (phrases.length < 2) { toast('Essa letra está vazia ou curta demais.'); return; }
  show('loading'); $('loadingText').textContent = `Preparando ${phrases.length} frases…`; $('loadingBar').style.width = '0';
  const failed = await translateAll(phrases, p => { $('loadingBar').style.width = (p * 100) + '%'; });
  if (item.synced) attachTimes(phrases, item.synced);
  const song = { id: uid(), title: item.title, artist: item.artist, album: item.album || '', cover: item.cover || null, palette: item.palette || null, duration: item.duration || 0, addedAt: Date.now(), phrases };
  touch(song); S.songs[song.id] = song; S.activeSongId = song.id; S.daily.chosen = true; save();
  show('home');
  if (failed) toast(`${failed} frase(s) ficaram sem tradução — dá pra escrever tocando em ✎ no cartão.`, 5000);
  else { confetti(['🎵', '🎶', '🎧']); toast('Música pronta! Vamos começar 🎧'); }
  setTimeout(() => startSession(Infinity), 900);
}

/* ---------------- escolha da próxima frase ---------------- */
let recent = [];
function pool() {
  const act = S.songs[S.activeSongId];
  const list = act ? act.phrases.map(p => [act, p]) : [];
  if (S.settings.mix && act && modeOf(act) === 'random') for (const s of Object.values(S.songs)) if (s !== act) s.phrases.forEach(p => { if (p.seen) list.push([s, p]); });
  return list;
}
// Modo "na ordem da música": segue a letra verso a verso, continuando de onde parou.
// Pula as frases já dominadas (nível 5); se todas estiverem dominadas, passa por todas.
function seqNext(song) {
  const ordered = [...song.phrases].sort((a, b) => a.order - b.order);
  const pending = ordered.filter(p => !(p.seen && p.level === MAX_LEVEL));
  const list = pending.length ? pending : ordered;
  const cur = song.cursor ?? -1;
  // saiu sem responder (✕ ou app fechado)? volta para a mesma frase
  if (song.cursorDone === false) { const same = ordered.find(p => p.order === cur); if (same) return [song, same]; }
  const next = list.find(p => p.order > cur);
  if (!next) { if (cur >= 0) toast('🔁 Fim da letra — recomeçando do início'); return [song, list[0]]; }
  return [song, next];
}
// Modo "decorar a letra": a letra inteira, verso a verso, como é cantada
// (refrão repete toda vez), sem pular nada — para gravar a música.
function sungOrder(song) {
  const byId = Object.fromEntries(song.phrases.map(p => [p.id, p]));
  return song.phrases.flatMap(p => (p.at || [p.order]).map(o => [o, p.id])).sort((a, b) => a[0] - b[0]).map(x => byId[x[1]]);
}
function lyricNext(song) {
  const sung = sungOrder(song);
  let pos = (song.lyricPos ?? -1) + 1;
  if (pos >= sung.length) { pos = 0; toast('🔁 Fim da letra — de novo do começo!'); }
  song.lyricPos = pos;
  return [song, sung[pos]];
}
function nextPhrase() {
  const now = Date.now(), act = S.songs[S.activeSongId];
  if (act && modeOf(act) === 'seq') return seqNext(act);
  if (act && modeOf(act) === 'lyric') return lyricNext(act);
  const all = pool();
  const fresh = all.filter(([, p]) => !recent.includes(p.id));
  const src = fresh.length ? fresh : all;
  const due = src.filter(([, p]) => p.seen && p.level < MAX_LEVEL && p.due <= now);
  const news = src.filter(([s, p]) => !p.seen && s === act);
  const masteredDue = src.filter(([, p]) => p.seen && p.level === MAX_LEVEL && p.due <= now);
  const learning = all.filter(([, p]) => p.seen && p.level < MAX_LEVEL).length;
  // refrões (frases que se repetem) têm prioridade para entrar primeiro
  const weightedNew = () => { const w = news.flatMap(x => Array(Math.min(3, x[1].count)).fill(x)); return pickRandom(w); };

  const r = Math.random();
  if (masteredDue.length && r < 0.12) return masteredDue[0];
  if (due.length && (r < 0.72 || !news.length || learning >= MAX_LEARNING)) {
    due.sort((a, b) => a[1].due - b[1].due);
    return pickRandom(due.slice(0, 3));
  }
  if (news.length && learning < MAX_LEARNING) return weightedNew();
  if (due.length) return due[0];
  if (masteredDue.length) return masteredDue[0];
  if (news.length) return weightedNew();
  // nada vencido: adianta a que vence primeiro (o aluno quer estudar)
  const learn = src.filter(([, p]) => p.seen && p.level < MAX_LEVEL).sort((a, b) => a[1].due - b[1].due);
  if (learn.length) return learn[0];
  const ms = src.filter(([, p]) => p.seen);
  return ms.length ? pickRandom(ms) : null;
}

/* ---------------- sessão de cartões ---------------- */
let session = null; // { left, done, cur:[song,phrase], revealed, helped }
function startSession(count, forced) {
  if (!S.songs[S.activeSongId] && !forced) return;
  hideWordPop();
  session = { left: count, done: 0, cur: null, revealed: false, helped: false };
  $('card').classList.remove('hidden');
  nextCard(forced);
}
function endSession() {
  ytStop(); $('ytBox').classList.add('collapsed');
  $('card').classList.add('hidden'); session = null; hideWordPop(); speechSynthesis?.cancel();
  if (current === 'home') { renderHome(); window.Tour?.maybe(); } else if (current === 'lyrics') renderLyrics();
}
function nextCard(forced) {
  if (session.left <= 0) {
    const n = session.done;
    endSession(); toast(n ? `Pronto! ${n} frase${n > 1 ? 's' : ''} treinada${n > 1 ? 's' : ''} ✓` : 'Pronto!'); return;
  }
  const pair = forced || nextPhrase();
  if (!pair) { endSession(); toast('Nenhuma frase para estudar ainda.'); return; }
  session.cur = pair; session.revealed = false; session.helped = false;
  const md = modeOf(pair[0]);
  if (md === 'seq') { pair[0].cursor = pair[1].order; pair[0].cursorDone = false; }
  if (md === 'lyric' && forced) { const i = sungOrder(pair[0]).indexOf(pair[1]); if (i >= 0) pair[0].lyricPos = i; }
  if (md !== 'random') touch(pair[0]);
  save();
  recent = [pair[1].id, ...recent.filter(x => x !== pair[1].id)].slice(0, 3);
  renderCard();
  if (S.settings.speak) speak(pair[1].en);
  // 1º cartão da vida: mostra como arrastar
  if (!S.cardTipDone) $('cardCoach').classList.remove('hidden');
}
$('coachOk').onclick = () => { $('cardCoach').classList.add('hidden'); S.cardTipDone = true; save(); };

function hiddenSet(p) {
  const words = p.pt.split(/\s+/).filter(Boolean);
  const ratio = HIDE_RATIO[Math.min(p.level, MAX_LEVEL)];
  const r = rng(hash(p.id));
  // ordem fixa por frase: assim o conjunto oculto só cresce de nível em nível
  const ranked = words.map((w, i) => ({ i, score: (w.replace(/[^\p{L}]/gu, '').length > 2 ? 1 : 0) + r() * 0.9 }))
    .sort((a, b) => b.score - a.score).map(x => x.i);
  const k = Math.max(p.level > 0 ? 1 : 0, Math.round(words.length * ratio));
  return { words, hide: new Set(ranked.slice(0, k)) };
}

function renderCard() {
  const [song, p] = session.cur;
  const lvl = p.level;
  $('cardSong').innerHTML = `${esc(song.title)} <span class="muted" style="font-weight:500">· ${esc(song.artist)}</span>`;
  $('cardNotes').innerHTML = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}">♪</i>`).join('');
  const art = bgStyle(song);
  if ($('cardArt').dataset.song !== song.id) { $('cardArt').style.cssText = art; $('cardThumb').style.cssText = art; $('cardArt').dataset.song = song.id; }
  const md = modeOf(song);
  // "Na ordem": posição da frase na música (ex.: 3/50). Demais modos: meta do dia (ex.: 7/20).
  const ordered = md === 'seq' ? [...song.phrases].sort((a, b) => a.order - b.order) : null;
  $('seqNav').classList.toggle('hidden', !ordered);
  if (ordered) { const i = ordered.indexOf(p); $('btnPrev').disabled = i <= 0; $('btnNext').disabled = i >= ordered.length - 1; }
  $('cardCount').textContent = ordered ? `🎵 ${ordered.indexOf(p) + 1}/${ordered.length}` : isFinite(session.left) ? `${session.done + 1}/${session.done + session.left}` : `${S.daily.done}/${S.settings.goal}`;
  $('cardCount').classList.toggle('hidden', false);

  let banner = '';
  if (!p.seen) banner = p.count > 1 ? `⭐ Frase nova · aparece ${p.count}x na música` : '✨ Frase nova';
  else if (lvl === MAX_LEVEL) banner = '🏆 Você dominou essa! Ainda lembra?';
  else if (lvl === 4) banner = '🧠 Sem tradução: você sabe o que significa?';
  else if (lvl >= 1) banner = `Nível ${lvl} · complete mentalmente as palavras escondidas`;
  $('cardBanner').textContent = banner;

  const prev = song.phrases.find(x => x.order === p.order - 1);
  $('cardContext').textContent = prev && lvl >= 2 ? '… ' + prev.en : '';

  $('cardEn').innerHTML = p.en.split(/(\s+)/).map(t => /\S/.test(t) ? `<span class="w">${esc(t)}</span>` : t).join('');
  renderPt();
  $('cardFeedback').classList.add('hidden');
  const body = $('cardBody'); body.style.transform = ''; body.style.opacity = '';
  ytStop(); $('btnSing').classList.toggle('ready', !!(song.yt && p.times?.length));
  if (song.yt) prepPlayer(song); else autoFindVideo(song); // procura sozinho, antes do toque no 🎤
}
function renderPt() {
  const [, p] = session.cur;
  const pt = $('cardPt'), hint = $('cardHint'), doubt = $('btnDoubt');
  if (!p.pt) {
    pt.innerHTML = `<div class="veil" data-edit="1">Sem tradução ainda — toque para escrever a sua ✎</div>`;
    hint.textContent = ''; doubt.disabled = true; return;
  }
  pt.classList.remove('reveal');
  if (p.level === 0 || session.revealed) {
    pt.textContent = p.pt; doubt.disabled = true;
    if (session.revealed) { void pt.offsetWidth; pt.classList.add('reveal'); }
    hint.textContent = p.level === 0 ? 'Leia, ouça 🔊 e toque nas palavras em inglês para ver cada uma.' : 'Tradução completa revelada.';
    return;
  }
  doubt.disabled = false;
  if (p.level >= 4) {
    pt.innerHTML = `<div class="veil" data-reveal="1">Pense no significado… depois toque em <b>?</b> para conferir</div>`;
    hint.textContent = ''; return;
  }
  const { words, hide } = hiddenSet(p);
  pt.innerHTML = words.map((w, i) => {
    if (!hide.has(i)) return esc(w);
    const core = w.replace(/[^\p{L}\p{N}]/gu, '');
    const shown = p.level === 1 ? core[0] + '·'.repeat(Math.max(1, core.length - 1)) : '·'.repeat(Math.max(2, core.length));
    return `<span class="blank" data-w="${esc(w)}">${esc(shown)}</span>`;
  }).join(' ');
  hint.textContent = 'Toque numa lacuna para espiar uma palavra, ou em ? para ver tudo.';
}

function answer(knew) {
  if (!session?.cur) return;
  const [song, p] = session.cur;
  touch(song);
  if (modeOf(song) === 'seq') song.cursorDone = true;
  const now = Date.now(), before = p.level, wasNew = !p.seen;
  let msg, sub = '';
  if (!p.seen) p.seen = true;
  if (knew) {
    p.right++;
    if (session.helped && p.level > 0) {
      // entendeu, mas precisou de ajuda: mantém o nível e volta logo
      p.due = now + 10 * MIN; msg = '👍 Quase lá'; sub = 'Usou dica — fica no mesmo nível por enquanto';
    } else if (p.level >= MAX_LEVEL) {
      p.ivl = Math.min(60 * DAY, (p.ivl || INTERVALS[MAX_LEVEL]) * 2.2); p.due = now + p.ivl;
      msg = '🏆 Ainda é sua!'; sub = '100% — essa você não esquece mais';
    } else {
      p.level++; p.due = now + INTERVALS[p.level]; p.ivl = INTERVALS[p.level];
      if (p.level === MAX_LEVEL) { msg = '🏆 Frase dominada!'; sub = 'Ela volta daqui uns dias pra você comemorar'; confetti(); }
      else { msg = `⬆ Nível ${p.level}`; sub = p.level === 4 ? 'Próxima vez: sem tradução!' : 'Próxima vez: mais palavras escondidas'; }
    }
  } else {
    p.wrong++;
    p.level = before >= MAX_LEVEL ? 3 : Math.max(0, before - 1);
    p.due = now + (p.level === 0 ? 0 : 2 * MIN); p.ivl = 0;
    msg = '💪 Sem problema'; sub = wasNew ? 'Ela volta já já' : 'Ela vai voltar logo pra você fixar';
  }
  if (session.helped) p.doubts++;
  p.last = now;
  markStudied(); save();
  session.done++; session.left--;
  const fb = $('cardFeedback'); fb.innerHTML = `${msg}<small>${esc(sub)}</small>`; fb.classList.remove('hidden');
  const body = $('cardBody'); body.style.transform = `translateX(${knew ? 60 : -60}px)`; body.style.opacity = '0';
  // música toda dominada?
  if (knew && p.level === MAX_LEVEL && before < MAX_LEVEL && song.phrases.every(x => x.level === MAX_LEVEL)) {
    setTimeout(() => { confetti(['🏆', '🎤', '🎉', '⭐']); toast(`Você dominou "${song.title}" inteira! 🏆`, 4000); }, 500);
    setTimeout(() => { endSession(); window.openShare?.('mastered', song); }, 2200);
  }
  setTimeout(() => nextCard(), 950);
}
function reveal() {
  if (!session?.cur || session.revealed) return;
  session.revealed = true; session.helped = true; renderPt();
}

/* ---------------- fala (TTS) ---------------- */
let voice = null;
function pickVoice() {
  const vs = speechSynthesis?.getVoices?.() || [];
  voice = vs.find(v => v.lang === 'en-US' && /google|samantha|natural/i.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs.find(v => v.lang?.startsWith('en')) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate = 0.95) {
  if (!('speechSynthesis' in window)) { toast('Seu navegador não tem leitura em voz alta.'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate; if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

/* ---------------- palavra tocada ---------------- */
async function showWord(el) {
  const word = el.textContent.replace(/[^\p{L}\p{N}']/gu, '');
  if (!word) return;
  document.querySelectorAll('.en .w.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
  const pop = $('wordPop'), r = el.getBoundingClientRect();
  $('wpWord').textContent = word; $('wpTr').textContent = '…';
  pop.classList.remove('hidden');
  pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
  pop.style.top = (r.bottom + 8) + 'px';
  pop.dataset.word = word;
  speak(word, 0.85);
  const key = word.toLowerCase();
  let tr = S.words[key];
  if (!tr) { try { tr = await translateOne(word); S.words[key] = tr; save(); } catch (e) { tr = '(sem conexão)'; } }
  if (pop.dataset.word === word) {
    $('wpTr').textContent = tr;
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
  }
}
function hideWordPop() { $('wordPop').classList.add('hidden'); document.querySelectorAll('.en .w.sel').forEach(x => x.classList.remove('sel')); }

/* ---------------- letra completa ---------------- */
function renderLyrics() {
  const song = S.songs[S.activeSongId]; if (!song) return show('home');
  $('lyricsTitle').textContent = song.title;
  $('lyricsList').innerHTML = [...song.phrases].sort((a, b) => a.order - b.order).map(p =>
    `<button class="lyr" data-pid="${esc(p.id)}"><span class="mark" style="background:var(--lv${p.seen ? p.level : 0})"></span>
     <div><div class="t">${esc(p.en)}${p.count > 1 ? ' <span class="muted small">×' + p.count + '</span>' : ''}</div>
     <div class="p">${p.seen && p.level >= 1 ? esc(p.pt) : '<i>toque para estudar</i>'}</div></div></button>`).join('');
}

/* ---------------- eventos ---------------- */
$('btnStudy').onclick = () => startSession(Infinity);
$('hero').onclick = e => {
  const b = e.target.closest('.seg [data-mode]'); if (!b) return;
  const song = S.songs[S.activeSongId]; if (!song || modeOf(song) === b.dataset.mode) return;
  song.mode = b.dataset.mode; touch(song); save(); renderHome();
  if (song.mode === 'seq') toast(`🎵 Na ordem da música, ${song.cursor == null ? 'do começo' : 'de onde você parou'} · frases dominadas saem da fila`);
  else if (song.mode === 'lyric') toast(`📖 Decorar a letra: a música inteira, verso a verso${song.lyricPos == null ? '' : ', de onde você parou'}`);
  else toast('🔀 Frases em ordem aleatória');
};
$('btnPick').onclick = () => openPick(false);
$('btnLyrics').onclick = () => { renderLyrics(); show('lyrics'); };
const APP_VERSION = '2026.11.23 · v31';
function renderStreakBox() {
  backfillDays();
  const set = new Set(S.days || []), names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  $('streakNum').textContent = streakCount();
  $('streakWeek').innerHTML = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * DAY), on = set.has(today(d));
    return `<span class="wd ${on ? 'on' : ''}">${on ? '🔥' : '·'}<small>${i === 6 ? 'hoje' : names[d.getDay()]}</small></span>`; }).join('');
  $('streakTotal').textContent = `${(S.days || []).length} dia(s) estudados no total`;
  $('appVersion').textContent = 'Refrão · versão ' + APP_VERSION;
}
$('btnSettings').onclick = () => {
  renderStreakBox();
  $('setGoal').value = S.settings.goal; $('setBurst').value = S.settings.burst;
  $('setUnlock').checked = S.settings.unlock; $('setSpeak').checked = S.settings.speak; $('setMix').checked = S.settings.mix;
  show('settings');
};
['pickBack', 'lyricsBack', 'settingsBack'].forEach(id => $(id).onclick = () => { if (id === 'pickBack') { S.daily.chosen = true; save(); } show('home'); });
$('confirmBack').onclick = $('confirmNo').onclick = () => { pending = null; applyTheme(S.songs[S.activeSongId]); show('pick'); };
$('confirmYes').onclick = () => pending && adoptSong(pending);

$('searchForm').onsubmit = e => { e.preventDefault(); $('searchInput').blur(); search($('searchInput').value); };
$('results').onclick = e => {
  const b = e.target.closest('[data-res]'); if (!b) return;
  const x = searchResults[+b.dataset.res];
  openConfirm({ title: x.trackName, artist: x.artistName, album: x.albumName, lyrics: x.plainLyrics, synced: x.syncedLyrics || '', duration: x.duration || 0, cover: x.cover || null });
};
$('library').onclick = e => {
  const b = e.target.closest('[data-lib]'); if (!b) return;
  S.activeSongId = b.dataset.lib; S.daily.chosen = true; touch(); save(); show('home');
  toast(`Estudando: ${S.songs[S.activeSongId].title}`);
};
$('manGo').onclick = () => {
  const lyrics = $('manLyrics').value.trim();
  if (!lyrics) return toast('Cole a letra primeiro.');
  openConfirm({ title: $('manTitle').value.trim() || 'Minha música', artist: $('manArtist').value.trim() || '—', lyrics });
};
$('lyricsList').onclick = e => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  const song = S.songs[S.activeSongId]; const p = song.phrases.find(x => x.id === b.dataset.pid);
  startSession(1, [song, p]);
};

$('setGoal').onchange = e => { S.settings.goal = +e.target.value; touch(); save(); };
$('setBurst').onchange = e => { S.settings.burst = +e.target.value; touch(); save(); };
$('setUnlock').onchange = e => { S.settings.unlock = e.target.checked; touch(); save(); };
$('setSpeak').onchange = e => { S.settings.speak = e.target.checked; touch(); save(); };
$('setMix').onchange = e => { S.settings.mix = e.target.checked; touch(); save(); };
$('btnExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
  a.download = `refrao-backup-${today()}.json`; a.click();
};
$('importFile').onchange = async e => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (!d.songs) throw 0; S = Object.assign(defaults(), d); save(); toast('Backup importado ✓'); show('home'); }
  catch (_) { toast('Arquivo inválido.'); }
};
$('btnReset').onclick = () => { if (confirm('Apagar todas as músicas e o progresso?')) { S = defaults(); touch(); S.resetAt = Date.now(); save(); window.Sync?.reset(); show('home'); } };

// cartão
$('cardClose').onclick = endSession;
// ‹ Anterior / Próxima › (modo "Na ordem"): anda pela letra sem responder
function seqStep(dir) {
  if (!session?.cur) return;
  const [song] = session.cur, p = session.cur[1];
  const ordered = [...song.phrases].sort((a, b) => a.order - b.order);
  const target = ordered[ordered.indexOf(p) + dir]; if (!target) return;
  session.cur = [song, target]; session.revealed = false; session.helped = false;
  song.cursor = target.order; song.cursorDone = false; touch(song); save();
  const body = $('cardBody'); body.style.transition = 'none'; body.style.transform = `translateX(${dir * 40}px)`; body.style.opacity = '0';
  renderCard();
  requestAnimationFrame(() => { body.style.transition = ''; body.style.transform = ''; body.style.opacity = ''; });
  if (S.settings.speak) speak(target.en);
}
$('btnPrev').onclick = () => seqStep(-1);
$('btnNext').onclick = () => seqStep(1);
$('btnYes').onclick = () => answer(true);
$('btnNo').onclick = () => answer(false);
$('btnDoubt').onclick = reveal;
$('btnSpeak').onclick = () => session?.cur && speak(session.cur[1].en);
$('btnSlow').onclick = () => session?.cur && speak(session.cur[1].en, 0.6);

/* ---------------- 🎤 ouvir o trecho real da música (YouTube) ----------------
 * Tempos de cada frase: letra sincronizada do lrclib. Áudio: player oficial do YouTube
 * (visível no cartão enquanto toca). Link do vídeo: colado uma vez por música.          */
let ytPlayer = null, ytReady = false, ytApi = null, ytTimer = null, ytVid = null;
function loadYT() {
  if (ytApi) return ytApi;
  ytApi = new Promise(res => {
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; toast('Não consegui carregar o YouTube. Verifique a internet.'); };
    document.head.appendChild(s);
  });
  return ytApi;
}
async function prepPlayer(song) {
  await loadYT();
  if (!ytPlayer) {
    ytVid = song.yt.id;
    ytPlayer = new YT.Player('ytFrame', {
      width: '100%', height: '100%', videoId: song.yt.id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
      events: {
        onReady: () => { ytReady = true; },
        onError: () => {
          ytStop();
          const song = session?.cur?.[0];
          // vídeo bloqueado fora do YouTube? tenta sozinho a próxima versão encontrada
          if (song?.yt?.alts?.length) { song.yt.id = song.yt.alts.shift(); save(); ytPlayer.cueVideoById(song.yt.id); ytVid = song.yt.id; toast('Essa versão não toca aqui — trocando por outra. Toque em 🎤 de novo.', 3500); }
          else { if (song) { delete song.yt; ytTried.add(song.id); save(); $('btnSing').classList.remove('ready'); } toast('Não consegui tocar essa música aqui. Vou usar a voz 🔊', 4000); }
        }
      }
    });
  } else if (ytReady && ytVid !== song.yt.id) { ytPlayer.cueVideoById(song.yt.id); ytVid = song.yt.id; }
}
function ytStop() { clearInterval(ytTimer); ytTimer = null; try { if (ytReady) ytPlayer.pauseVideo(); } catch (e) {} }
function renderYtOffset(song) { const o = song.yt?.offset || 0; $('ytOff').textContent = `sincronia ${o > 0 ? '+' : ''}${o.toFixed(1).replace('.', ',')}s`; }
function playSnippet() {
  if (!session?.cur) return;
  const [song, p] = session.cur;
  if (!song.yt) {
    if (ytSearching.has(song.id)) { toast('🔎 Procurando a música no YouTube… toque de novo em um instante'); return; }
    if (!ytTried.has(song.id)) { autoFindVideo(song); toast('🔎 Procurando a música no YouTube…'); return; }
    toast('Não achei essa música no YouTube agora — lendo com a voz 🔊'); return speak(p.en);
  }
  if (!p.times?.length) { toast('Essa frase não tem o tempo na música — vou ler com a voz 🔊'); return speak(p.en); }
  if (!ytReady) { toast('Carregando a música… toque de novo em 🎤 em um instante'); prepPlayer(song); return; }
  speechSynthesis?.cancel();
  // se a frase aparece várias vezes, alterna entre os trechos
  const k = (p._ti = ((p._ti ?? -1) + 1) % p.times.length);
  const [s, e] = p.times[k], off = song.yt.offset || 0, from = Math.max(0, s + off - 0.25), to = e + off + 0.35;
  $('ytBox').classList.remove('collapsed'); renderYtOffset(song);
  if (ytVid !== song.yt.id) { ytPlayer.loadVideoById({ videoId: song.yt.id, startSeconds: from }); ytVid = song.yt.id; }
  else { ytPlayer.seekTo(from, true); ytPlayer.playVideo(); }
  clearInterval(ytTimer);
  ytTimer = setInterval(() => { try { if (ytPlayer.getCurrentTime() >= to) ytStop(); } catch (e) {} }, 100);
  p._last = [from, to];
}
const ytIdFrom = s => (s.match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([\w-]{11})/) || s.trim().match(/^([\w-]{11})$/) || [])[1] || null;
/* ----- busca automática do vídeo -----
 * 1) YouTube Data API (se houver chave no config.js)  2) espelhos públicos Piped (YouTube Music)
 * 3) espelhos públicos Invidious. Prioriza a faixa de áudio oficial ("Artista - Topic"),
 * que é a mesma gravação da letra sincronizada — o tempo das frases bate sem ajuste.        */
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.r4fo.com'];
const INVID = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.privacyredirect.com'];
const ytTried = new Set(), ytSearching = new Set();
async function fetchJSON(url, ms = 7000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function searchVideos(song) {
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  if (CFG.youtubeKey) {
    try {
      const j = await fetchJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(`${song.title} ${song.artist} audio`)}&key=${CFG.youtubeKey}`);
      const out = (j.items || []).map(i => ({ id: i.id?.videoId, title: i.snippet?.title || '', channel: i.snippet?.channelTitle || '' })).filter(x => x.id);
      if (out.length) return out;
    } catch (e) {}
  }
  const tries = [
    ...PIPED.map(b => async () => (await fetchJSON(`${b}/search?q=${q}&filter=music_songs`)).items
      .map(x => ({ id: (x.url?.match(/v=([\w-]{11})/) || [])[1], title: x.title || '', channel: (x.uploaderName || '') + ' - Topic', dur: x.duration }))),
    ...INVID.map(b => async () => (await fetchJSON(`${b}/api/v1/search?q=${q}&type=video`))
      .map(x => ({ id: x.videoId, title: x.title || '', channel: x.author || '', dur: x.lengthSeconds })))
  ];
  for (const t of tries) { try { const out = (await t()).filter(x => x.id); if (out.length) return out; } catch (e) {} }
  return [];
}
function scoreVideo(c, song) {
  const t = norm(c.title), ch = norm(c.channel), st = norm(song.title), ar = norm(song.artist);
  let s = 0;
  if (/ topic$/.test(ch)) s += 4;
  if (t.includes(st)) s += 3;
  if (ch.includes(ar) || t.includes(ar)) s += 1;
  if (/official audio|\baudio\b/.test(t)) s += 2;
  if (/lyric/.test(t)) s += 1;
  if (/\b(live|ao vivo|cover|karaoke|remix|8d|sped up|slowed|instrumental|reaction|tutorial|piano|acoustic)\b/.test(t) && !/\b(live|remix|acoustic)\b/.test(st)) s -= 6;
  if (song.duration && c.dur && Math.abs(c.dur - song.duration) > 8) s -= 3;
  return s;
}
async function autoFindVideo(song) {
  if (song.yt || ytTried.has(song.id) || ytSearching.has(song.id)) return;
  ytSearching.add(song.id);
  try {
    const found = (await searchVideos(song)).map(c => ({ ...c, s: scoreVideo(c, song) })).filter(c => c.s > 0).sort((a, b) => b.s - a.s);
    const ids = [...new Set(found.map(c => c.id))];
    if (ids.length) {
      song.yt = { id: ids[0], offset: 0, auto: true, alts: ids.slice(1, 5) }; save();
      await ensureTimes(song, true);
      if (session?.cur?.[0] === song) { prepPlayer(song); $('btnSing').classList.toggle('ready', !!session.cur[1].times?.length); }
    }
  } finally { ytSearching.delete(song.id); ytTried.add(song.id); }
}
let ytSheetSong = null;
function openYtSheet(song) {
  ytSheetSong = song;
  $('ytSearch').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${song.title} ${song.artist} official audio`);
  $('ytInput').value = song.yt ? 'https://youtu.be/' + song.yt.id : '';
  $('ytErr').textContent = '';
  $('ytSheet').classList.remove('hidden');
}
async function ensureTimes(song, quiet) {
  if (song.phrases.some(p => p.times?.length)) return;
  try {
    const q = `track_name=${encodeURIComponent(song.title)}&artist_name=${encodeURIComponent(song.artist)}`;
    let synced = '';
    const r = await fetch('https://lrclib.net/api/get?' + q);
    if (r.ok) synced = (await r.json()).syncedLyrics || '';
    if (!synced) {
      const s = await (await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(song.title + ' ' + song.artist))).json();
      synced = (s.find(x => x.syncedLyrics) || {}).syncedLyrics || '';
    }
    const n = synced ? attachTimes(song.phrases, synced) : 0;
    save();
    if (!quiet) toast(n ? `🎤 ${n} de ${song.phrases.length} frases com o trecho da música` : 'Essa música não tem letra sincronizada — o 🎤 vai usar a voz.', 4000);
  } catch (e) { if (!quiet) toast('Sem conexão para buscar os tempos da letra agora.'); }
}
$('btnSing').onclick = playSnippet;
$('ytSave').onclick = async () => {
  const id = ytIdFrom($('ytInput').value);
  if (!id) { $('ytErr').textContent = 'Não reconheci esse link. Cole o link copiado do YouTube (botão Compartilhar → Copiar link).'; return; }
  const song = ytSheetSong; song.yt = { id, offset: song.yt?.id === id ? song.yt.offset || 0 : 0 }; save();
  $('ytSheet').classList.add('hidden');
  if (ytReady) { ytPlayer.cueVideoById(id); ytVid = id; } else prepPlayer(song);
  await ensureTimes(song);
  if (session?.cur?.[0] === song) { $('btnSing').classList.toggle('ready', !!session.cur[1].times?.length); toast('Pronto! Toque em 🎤 para ouvir o trecho', 3000); }
};
$('ytCancel').onclick = () => $('ytSheet').classList.add('hidden');
$('ytSheet').onclick = e => { if (e.target === $('ytSheet')) $('ytSheet').classList.add('hidden'); };
const nudge = d => { const song = session?.cur?.[0]; if (!song?.yt) return; song.yt.offset = Math.round(((song.yt.offset || 0) + d) * 10) / 10; save(); renderYtOffset(song); session.cur[1]._ti = (session.cur[1]._ti ?? 0) - 1; playSnippet(); };
$('ytMinus').onclick = () => nudge(-0.5);
$('ytPlus').onclick = () => nudge(0.5);
$('ytAgain').onclick = () => { if (session?.cur) { session.cur[1]._ti = (session.cur[1]._ti ?? 0) - 1; playSnippet(); } };
$('ytLink').onclick = () => session?.cur && openYtSheet(session.cur[0]);
$('ytHide').onclick = () => { ytStop(); $('ytBox').classList.add('collapsed'); };
const editPt = () => {
  if (!session?.cur) return; const p = session.cur[1];
  const v = prompt('Tradução desta frase:', p.pt); if (v === null) return;
  p.pt = v.trim(); touch(session.cur[0]); save(); renderPt();
};
$('btnEdit').onclick = editPt;
$('cardPt').onclick = e => {
  if (e.target.closest('[data-edit]')) return editPt();
  if (e.target.closest('[data-reveal]')) return reveal();
  const b = e.target.closest('.blank');
  if (b && !b.classList.contains('open')) { b.textContent = b.dataset.w; b.classList.add('open'); session.helped = true; }
};
$('cardEn').onclick = e => { const w = e.target.closest('.w'); if (w) showWord(w); };
$('wpSpeak').onclick = () => speak($('wordPop').dataset.word || '', 0.8);
document.addEventListener('pointerdown', e => { if (!e.target.closest('#wordPop, .en .w')) hideWordPop(); });

// gesto de arrastar: direita = entendi, esquerda = ainda não
(() => {
  const body = $('cardBody'); let x0 = null, y0 = 0, dx = 0;
  body.addEventListener('touchstart', e => { if (e.target.closest('.w,.blank,.veil,button')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; }, { passive: true });
  body.addEventListener('touchmove', e => {
    if (x0 === null) return; dx = e.touches[0].clientX - x0;
    if (Math.abs(e.touches[0].clientY - y0) > Math.abs(dx)) return;
    body.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
    $('stampYes').style.opacity = Math.max(0, Math.min(1, dx / 90)); $('stampNo').style.opacity = Math.max(0, Math.min(1, -dx / 90));
  }, { passive: true });
  body.addEventListener('touchend', () => {
    if (x0 === null) return; x0 = null;
    $('stampYes').style.opacity = 0; $('stampNo').style.opacity = 0;
    if (Math.abs(dx) > 90) answer(dx > 0); else body.style.transform = '';
  });
})();

/* ---------------- gatilho de desbloqueio / retorno ---------------- */
let hiddenAt = 0;
function maybeFlash() {
  if (!booted) return;
  rollDay();
  if (!S.daily.chosen && current !== 'confirm' && current !== 'loading') { if (!session) openPick(true); return; }
  if (!S.settings.unlock || session || !S.songs[S.activeSongId]) return;
  if (!$('exam').classList.contains('hidden') || window.Tour?.running) return; // fazendo prova / vendo o tour
  if (['pick', 'confirm', 'loading', 'settings', 'social', 'chat', 'login', 'profile'].includes(current)) return;
  startSession(S.settings.burst);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); speechSynthesis?.cancel(); return; }
  if (Date.now() - hiddenAt >= UNLOCK_GAP_MS) maybeFlash();
});

/* ---------------- início ---------------- */
/* ---------------- login (Supabase) ----------------
 * Usuário = primeiro nome, único (vira um "@usuario" sem acentos/espaços).
 * Por baixo, o Supabase recebe usuario@usuarios.refrao.app — nenhum e-mail é enviado.
 * Cada usuário tem seu próprio progresso guardado no aparelho.                    */
const CFG = window.REFRAO_CONFIG || {};
const AUTH_ON = !!(CFG.supabaseUrl && CFG.supabaseKey);
const AUTH_KEY = 'refrao.auth';
let booted = false, authMode = 'signup';
const toHandle = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const handleEmail = h => `${h}@usuarios.refrao.app`;
function getSession() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } }
const APP_HOME = location.origin + location.pathname.replace(/index\.html$/, '');
const URL_TYPE = new URLSearchParams(location.hash.slice(1)).get('type'); // links de e-mail: recovery / email_change
// cliente oficial do Supabase: guarda a sessão e a renova sozinho (senão expiraria em 1 hora)
const sb = AUTH_ON && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, storageKey: 'refrao.sb', autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
window.sb = sb;
const authErr = error => Object.assign(new Error(error.message), { code: error.code || error.name, status: error.status });
async function authSignUp(h, name, pass) {
  const { data, error } = await sb.auth.signUp({ email: handleEmail(h), password: pass, options: { data: { name, handle: h } } });
  if (error) throw authErr(error);
  if (!data.session) throw Object.assign(new Error('confirm'), { code: 'needs_confirm' });
  return data;
}
async function authSignIn(h, pass) {
  let { data, error } = await sb.auth.signInWithPassword({ email: handleEmail(h), password: pass });
  if (error && /invalid_credentials|invalid login/i.test(error.code + ' ' + error.message)) {
    // quem vinculou um e-mail real: o servidor devolve esse e-mail só se a senha estiver certa
    const r = await sb.rpc('login_email', { p_handle: h, p_password: pass });
    if (r.error && /Muitas tentativas/.test(r.error.message)) throw Object.assign(new Error(r.error.message), { code: 'too_many' });
    if (r.data && r.data !== handleEmail(h)) ({ data, error } = await sb.auth.signInWithPassword({ email: r.data, password: pass }));
  }
  if (error) throw authErr(error);
  return data;
}

/* ---------- e-mail opcional: vincular e recuperar senha ---------- */
const isRealEmail = e => !!e && !e.endsWith('@usuarios.refrao.app');
const maskEmail = e => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(5, b.length)) + c);
async function renderEmailStatus() {
  if (!sb) return;
  const { data } = await sb.auth.getUser().catch(() => ({ data: {} }));
  const u = data?.user; if (!u) { $('emailStatus').textContent = 'Entre de novo para vincular um e-mail.'; return; }
  $('emailStatus').innerHTML = u.new_email ? `⏳ Confirme pelo link enviado para <b>${esc(maskEmail(u.new_email))}</b>`
    : isRealEmail(u.email) ? `✅ E-mail vinculado: <b>${esc(maskEmail(u.email))}</b>` : 'Nenhum e-mail vinculado — sem ele não dá para recuperar a senha.';
  $('btnEmail').textContent = isRealEmail(u.email) ? '📧 Trocar e-mail' : '📧 Vincular e-mail';
}
function openSheet(id) { $(id).classList.remove('hidden'); $(id).querySelectorAll('.login-err').forEach(e => e.textContent = ''); }
const closeSheet = id => $(id).classList.add('hidden');
$('btnEmail').onclick = () => { $('emailInput').value = ''; openSheet('emailSheet'); };
$('emailSave').onclick = async () => {
  const email = $('emailInput').value.trim(), err = $('emailErr');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err.textContent = 'Digite um e-mail válido.';
  $('emailSave').disabled = true;
  const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: APP_HOME });
  $('emailSave').disabled = false;
  if (error) return err.textContent = /already|registered|exists/i.test(error.message) ? 'Esse e-mail já está em outra conta.' : /rate|limit/i.test(error.message) ? 'Muitos e-mails enviados. Tente de novo mais tarde.' : 'Não deu certo: ' + error.message;
  closeSheet('emailSheet'); toast('📧 Enviamos um link para ' + email + '. Abra e confirme para vincular.', 6000); renderEmailStatus();
};
$('forgotLink').onclick = () => { $('forgotInput').value = ''; $('forgotMsg').textContent = ''; openSheet('forgotSheet'); };
$('forgotSend').onclick = async () => {
  const email = $('forgotInput').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return $('forgotErr').textContent = 'Digite o e-mail que você vinculou à conta.';
  $('forgotSend').disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_HOME });
  $('forgotSend').disabled = false;
  if (error && /rate|limit/i.test(error.message)) return $('forgotErr').textContent = 'Muitos pedidos. Espere um pouco e tente de novo.';
  $('forgotErr').textContent = '';
  $('forgotMsg').textContent = '📬 Se esse e-mail estiver vinculado a uma conta, você vai receber um link para criar uma senha nova. Confira também o spam.';
};
$('newPassSave').onclick = async () => {
  const pass = $('newPassInput').value, err = $('newPassErr');
  if (pass.length < 6) return err.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
  $('newPassSave').disabled = true;
  const { data, error } = await sb.auth.updateUser({ password: pass });
  $('newPassSave').disabled = false;
  if (error) return err.textContent = 'Não deu certo: ' + error.message;
  closeSheet('newPassSheet'); history.replaceState(null, '', location.pathname);
  const md = data.user.user_metadata || {};
  if (!booted && md.handle) { startUser({ handle: md.handle, name: md.name || md.handle, userId: data.user.id, at: Date.now() }); boot(); }
  toast('🔑 Senha nova salva! Você já está conectado.', 4500);
};
document.querySelectorAll('[data-close-sheet]').forEach(b => b.onclick = () => closeSheet(b.dataset.closeSheet));
if (sb) sb.auth.onAuthStateChange(ev => {
  if (ev === 'PASSWORD_RECOVERY') { $('newPassInput').value = ''; openSheet('newPassSheet'); }
});
if (URL_TYPE === 'email_change') setTimeout(() => { toast('📧 E-mail confirmado e vinculado à sua conta!', 5000); history.replaceState(null, '', location.pathname); }, 1200);
function startUser(sess) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(sess));
  STORE_KEY = 'refrao.v1:' + sess.handle;
  // o primeiro usuário a entrar neste aparelho herda o progresso de antes do login
  if (!localStorage.getItem(STORE_KEY) && localStorage.getItem('refrao.v1') && !localStorage.getItem('refrao.legacyClaimed')) {
    localStorage.setItem(STORE_KEY, localStorage.getItem('refrao.v1'));
    localStorage.setItem('refrao.legacyClaimed', sess.handle);
  }
}
function renderLogin() {
  const up = authMode === 'signup';
  document.querySelectorAll('#loginTabs button').forEach(b => b.setAttribute('aria-checked', b.dataset.auth === authMode));
  $('loginTitle').textContent = up ? 'Crie seu acesso' : 'Bem-vindo de volta';
  $('loginSub').textContent = up ? 'Só o seu primeiro nome e uma senha. Leva 10 segundos.' : 'Entre com seu usuário e senha.';
  $('loginNameLabel').textContent = up ? 'Seu primeiro nome' : 'Seu usuário';
  $('loginGo').textContent = up ? 'Criar conta e começar 🎧' : 'Entrar';
  $('loginPass').autocomplete = up ? 'new-password' : 'current-password';
  $('loginErr').textContent = '';
  $('forgotLink').classList.toggle('hidden', up || !sb);
  updateHandle();
}
function updateHandle() {
  const h = toHandle($('loginName').value);
  $('loginHandle').innerHTML = authMode === 'signup' && h ? `Seu usuário será <b>@${esc(h)}</b>` : '';
}
async function submitLogin(e) {
  e.preventDefault();
  const name = $('loginName').value.trim(), pass = $('loginPass').value, h = toHandle(name), err = $('loginErr');
  err.textContent = '';
  if (h.length < 2 || h.length > 20) return err.textContent = 'Use um nome com 2 a 20 letras ou números.';
  if (pass.length < 6) return err.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
  if (authMode === 'signup' && window.temPalavrao && (temPalavrao(name) || temPalavrao(h))) return err.textContent = 'Esse nome não é permitido. Escolha outro.';
  const btn = $('loginGo'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Um instante…';
  try {
    let j;
    if (authMode === 'signup') {
      j = await authSignUp(h, name, pass);
    } else {
      j = await authSignIn(h, pass);
    }
    const display = j.user?.user_metadata?.name || name;
    startUser({ handle: h, name: display, userId: j.user?.id, at: Date.now() });
    $('loginPass').value = '';
    boot(); toast(`Olá, ${display}! 👋`);
  } catch (ex) {
    const c = String(ex.code || '') + ' ' + ex.message;
    if (/already|exists|registered/i.test(c)) err.innerHTML = `O usuário <b>@${esc(h)}</b> já existe. Tente outro, como <b>${esc(h + (Math.floor(Math.random() * 90) + 10))}</b> — ou toque em “Já tenho conta”.`;
    else if (/invalid_credentials|invalid login|invalid_grant/i.test(c)) err.textContent = 'Usuário ou senha incorretos.';
    else if (/too_many/.test(c)) err.textContent = ex.message;
    else if (/needs_confirm/.test(c)) err.textContent = 'Conta criada, mas o Supabase está pedindo confirmação de e-mail. Desligue "Confirm email" no Supabase.';
    else if (/weak_password/i.test(c)) err.textContent = 'Senha fraca demais. Use pelo menos 6 caracteres.';
    else if (authMode === 'signup' && ex.status === 500) err.textContent = 'Não foi possível criar a conta com esse nome. Escolha outro.';
    else if (ex instanceof TypeError || ex.status === 0 || /fetch|network/i.test(ex.message)) err.textContent = 'Sem conexão com a internet. Verifique o Wi-Fi e tente de novo.';
    else err.textContent = 'Não deu certo: ' + ex.message;
  } finally { btn.disabled = false; btn.textContent = label; }
}
$('loginForm').onsubmit = submitLogin;
$('loginName').oninput = updateHandle;
$('loginTabs').onclick = e => { const b = e.target.closest('[data-auth]'); if (b) { authMode = b.dataset.auth; renderLogin(); } };
$('loginEye').onclick = () => { const i = $('loginPass'); i.type = i.type === 'password' ? 'text' : 'password'; $('loginEye').textContent = i.type === 'password' ? '👁' : '🙈'; };
$('btnLogout').onclick = () => {
  if (!confirm('Sair desta conta? Seu progresso continua salvo neste aparelho.')) return;
  window.Social?.stop();
  (window.Push ? Push.forget() : Promise.resolve()).finally(() => {
    localStorage.removeItem(AUTH_KEY);
    (sb ? sb.auth.signOut().catch(() => {}) : Promise.resolve()).finally(() => location.reload());
  });
};

function boot() {
  booted = true;
  S = load();
  const sess = AUTH_ON && getSession();
  $('accountBox').classList.toggle('hidden', !sess);
  $('emailBox').classList.toggle('hidden', !sess || !sb);
  if (sess) { $('accountName').textContent = `${sess.name} · @${sess.handle}`; renderEmailStatus(); }
  window.Push?.render();
  if (sess) setTimeout(() => window.Push?.maybeAsk('start'), 1800);
  rollDay();
  show('home');
  if (!Object.keys(S.songs).length) openPick(true);
  else maybeFlash();
  if (sess && sb) connectAccount(sess);
}
// garante a sessão do Supabase (rede social/chat). Contas criadas antes guardavam o token à parte.
async function connectAccount(sess) {
  try {
    let { data } = await sb.auth.getSession();
    if (!data.session && sess.refresh_token) ({ data } = await sb.auth.refreshSession({ refresh_token: sess.refresh_token }));
    if (data.session) { delete sess.access_token; delete sess.refresh_token; sess.userId = data.session.user.id; localStorage.setItem(AUTH_KEY, JSON.stringify(sess)); }
    window.__socialSession = data.session || null;
    window.Social?.start(data.session || null);
    window.Sync?.start(data.session || null);
    window.Access?.check();
  } catch (e) { window.__socialSession = null; window.Social?.start(null); }
}
if (!AUTH_ON) boot();
else {
  const sess = getSession();
  if (sess?.handle) { startUser(sess); boot(); }
  else { authMode = localStorage.getItem('refrao.legacyClaimed') ? 'login' : 'signup'; renderLogin(); show('login'); }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
