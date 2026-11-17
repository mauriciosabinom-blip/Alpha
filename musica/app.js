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

const STORE_KEY = 'refrao.v1';
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// Quanto tempo esperar até mostrar de novo, por nível alcançado
const INTERVALS = [0, 5 * MIN, 30 * MIN, 3 * HOUR, 12 * HOUR, 3 * DAY];
const HIDE_RATIO = [0, 0.3, 0.55, 0.8, 1, 1];
const MAX_LEVEL = 5;
const MAX_LEARNING = 12;          // máx. de frases "em aprendizado" ao mesmo tempo
const UNLOCK_GAP_MS = 4000;       // tempo mínimo fora do app para disparar o cartão

/* ---------------- estado ---------------- */
const defaults = () => ({
  songs: {}, activeSongId: null,
  daily: { date: '', done: 0, chosen: false },
  streak: { count: 0, last: '' },
  settings: { goal: 20, burst: 3, unlock: true, speak: false, mix: true, gateCount: 1, gateOn: true },
  gateApps: [], gateOffered: false,
  words: {}
});
let S = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.songs) return Object.assign(defaults(), s, { settings: Object.assign(defaults().settings, s.settings) });
  } catch (e) {}
  return defaults();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Não consegui salvar 😕'); } }

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
const SCREENS = ['home', 'pick', 'confirm', 'loading', 'lyrics', 'settings', 'setup'];
let current = 'home';
function show(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); current = id; window.scrollTo(0, 0); if (id === 'home') renderHome(); }

/* ---------------- dia / sequência ---------------- */
function rollDay() {
  const t = today();
  if (S.daily.date !== t) { S.daily = { date: t, done: 0, chosen: false }; save(); }
}
function markStudied() {
  const t = today();
  if (S.streak.last !== t) {
    const y = today(new Date(Date.now() - DAY));
    S.streak.count = S.streak.last === y ? S.streak.count + 1 : 1;
    S.streak.last = t;
  }
  S.daily.done++;
  if (S.daily.done === S.settings.goal) setTimeout(() => { confetti(['🔥', '🎯', '🎉']); toast(`Meta do dia batida! ${S.settings.goal} frases 🎯`); }, 600);
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
  $('streakChip').textContent = `🔥 ${S.streak.last === today() || S.streak.last === today(new Date(Date.now() - DAY)) ? S.streak.count : 0}`;
  const g = S.settings.goal, d = S.daily.done;
  $('goalText').textContent = `${d}/${g}`;
  $('goalRing').style.setProperty('--p', Math.min(100, d / g * 100));
  $('goalSub').textContent = d >= g ? 'Meta batida! Pode continuar se quiser 💪' : `Faltam ${g - d} frases hoje`;
  const song = S.songs[S.activeSongId];
  applyTheme(song); if (typeof renderGateStatus === 'function') renderGateStatus();
  const hero = $('hero');
  if (!song) {
    const demo = { title: 'Refrão', artist: 'music' };
    hero.innerHTML = `<div class="hero-empty"><div class="art" style="${bgStyle(demo)}"></div>
      <h2>Sua trilha para o inglês</h2><div class="artist">Escolha uma música e aprenda frase por frase 🎶</div></div>`;
    $('btnStudy').disabled = true; $('btnLyrics').disabled = true; $('miniStats').innerHTML = '';
  } else {
    const st = songStats(song);
    hero.innerHTML = `<div class="vinyl-wrap has-sleeve">
        <div class="vinyl"><div class="label" style="${bgStyle(song)}"></div></div>
        <div class="sleeve" style="${bgStyle(song)}"></div></div>
      <h2>${esc(song.title)}</h2><div class="artist">${esc(song.artist)}</div>
      <div class="progress-line">${levelBar(song)}<span class="pct">${st.pct}%</span></div>`;
    const learning = st.c[1] + st.c[2] + st.c[3] + st.c[4];
    const fresh = song.phrases.filter(p => !p.seen).length;
    $('miniStats').innerHTML = `<div class="glass"><b>${st.mastered}</b><span>🏆 dominadas</span></div>
      <div class="glass"><b>${learning}</b><span>🌱 aprendendo</span></div><div class="glass"><b>${fresh}</b><span>✨ novas</span></div>`;
    $('btnStudy').disabled = false; $('btnLyrics').disabled = false;
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
function buildPhrases(text) {
  const lines = cleanLines(text);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // versos muito curtos se juntam ao próximo para formar uma frase com sentido
    while (line.split(' ').length < 4 && i + 1 < lines.length && (line + ' ' + lines[i + 1]).split(' ').length <= 16) {
      line += (/[,.!?;:]$/.test(line) ? ' ' : ', ') + lines[++i];
    }
    out.push(line);
  }
  const map = new Map();
  out.forEach((en, order) => {
    const k = norm(en);
    if (map.has(k)) map.get(k).count++;
    else map.set(k, { id: uid(), en, pt: '', count: 1, order, level: 0, seen: false, due: 0, right: 0, wrong: 0, doubts: 0, last: 0, ivl: 0 });
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
  const song = { id: uid(), title: item.title, artist: item.artist, album: item.album || '', cover: item.cover || null, palette: item.palette || null, addedAt: Date.now(), phrases };
  S.songs[song.id] = song; S.activeSongId = song.id; S.daily.chosen = true; save();
  show('home');
  if (failed) toast(`${failed} frase(s) ficaram sem tradução — dá pra escrever tocando em ✎ no cartão.`, 5000);
  else { confetti(['🎵', '🎶', '🎧']); toast('Música pronta! Vamos começar 🎧'); }
  setTimeout(() => offerGate(() => startSession(Infinity)), 900);
}

/* ---------------- escolha da próxima frase ---------------- */
let recent = [];
function pool() {
  const act = S.songs[S.activeSongId];
  const list = act ? act.phrases.map(p => [act, p]) : [];
  if (S.settings.mix) for (const s of Object.values(S.songs)) if (s !== act) s.phrases.forEach(p => { if (p.seen) list.push([s, p]); });
  return list;
}
function nextPhrase() {
  const now = Date.now(), act = S.songs[S.activeSongId];
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
let session = null; // { left, done, cur:[song,phrase], revealed, helped, gate }
function startSession(count, forced, gate) {
  if (!S.songs[S.activeSongId] && !forced) return;
  hideWordPop();
  session = { left: count, done: 0, cur: null, revealed: false, helped: false, gate: gate || null };
  $('card').classList.remove('hidden');
  nextCard(forced);
}
function endSession() {
  const g = session?.gate, n = session?.done || 0;
  $('card').classList.add('hidden'); session = null; hideWordPop(); speechSynthesis?.cancel();
  if (g) return gateDone(g, n);
  if (current === 'home') renderHome(); else if (current === 'lyrics') renderLyrics();
}
function nextCard(forced) {
  if (session.left <= 0) {
    const n = session.done;
    if (session.gate) return endSession();
    endSession(); toast(n ? `Pronto! ${n} frase${n > 1 ? 's' : ''} treinada${n > 1 ? 's' : ''} ✓` : 'Pronto!'); return;
  }
  const pair = forced || nextPhrase();
  if (!pair) { endSession(); toast('Nenhuma frase para estudar ainda.'); return; }
  session.cur = pair; session.revealed = false; session.helped = false;
  recent = [pair[1].id, ...recent.filter(x => x !== pair[1].id)].slice(0, 3);
  renderCard();
  if (S.settings.speak) speak(pair[1].en);
}

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
  $('gateOff').classList.toggle('hidden', !session.gate);
  if (session.gate) $('gateOff').textContent = session.gate.all ? 'Não mostrar mais antes dos apps' : `Não mostrar mais antes do ${session.gate.name}`;
  $('cardCount').textContent = session.gate ? `🔓 ${session.done + 1}/${session.done + session.left}` : isFinite(session.left) ? `${session.done + 1}/${session.done + session.left}` : `${S.daily.done}/${S.settings.goal}`;
  $('cardCount').classList.toggle('hidden', false);

  let banner = '';
  if (session.gate && session.done === 0) banner = `Antes do ${session.gate.name}: uma frase rapidinha 🎵`;
  else if (!p.seen) banner = p.count > 1 ? `⭐ Frase nova · aparece ${p.count}x na música` : '✨ Frase nova';
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
    setTimeout(() => { confetti(['🏆', '🎤', '🎉', '⭐']); toast(`Você dominou "${song.title}" inteira! Que tal escolher a próxima? 🎤`, 5000); }, 500);
  }
  if (session.gate && session.left <= 0) { const g = session.gate; markGatePassed(); leaveTo(g); } // dentro do toque: o Safari permite abrir o app
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
$('btnPick').onclick = () => openPick(false);
$('btnLyrics').onclick = () => { renderLyrics(); show('lyrics'); };
$('btnSetup').onclick = () => { renderSetup(); show('setup'); };
$('setupBack').onclick = () => show('settings');
$('setupApp').onchange = renderSetup;
$('setupCopy').onclick = async () => {
  addGateApp($('setupApp').value); S.settings.gateOn = true; save();
  const t = $('setupUrl').textContent;
  try { await navigator.clipboard.writeText(t); toast('Link copiado ✓'); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('setupUrl')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecionei o link — toque em Copiar'); }
};
$('setGate').onchange = e => { S.settings.gateCount = +e.target.value; save(); };
$('gateGo').onclick = () => gateCurrent && leaveTo(gateCurrent);
$('gateStay').onclick = () => { $('gateDoneBox').classList.add('hidden'); gateCurrent = null; show('home'); };
$('btnSettings').onclick = () => {
  $('setGate').value = S.settings.gateCount || 1;
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
  openConfirm({ title: x.trackName, artist: x.artistName, album: x.albumName, lyrics: x.plainLyrics, cover: x.cover || null });
};
$('library').onclick = e => {
  const b = e.target.closest('[data-lib]'); if (!b) return;
  S.activeSongId = b.dataset.lib; S.daily.chosen = true; save(); show('home');
  toast(`Estudando: ${S.songs[S.activeSongId].title}`);
  offerGate();
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

$('setGoal').onchange = e => { S.settings.goal = +e.target.value; save(); };
$('setBurst').onchange = e => { S.settings.burst = +e.target.value; save(); };
$('setUnlock').onchange = e => { S.settings.unlock = e.target.checked; save(); };
$('setSpeak').onchange = e => { S.settings.speak = e.target.checked; save(); };
$('setMix').onchange = e => { S.settings.mix = e.target.checked; save(); };
$('btnExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
  a.download = `refrao-backup-${today()}.json`; a.click();
};
$('importFile').onchange = async e => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (!d.songs) throw 0; S = Object.assign(defaults(), d); save(); toast('Backup importado ✓'); show('home'); }
  catch (_) { toast('Arquivo inválido.'); }
};
$('btnReset').onclick = () => { if (confirm('Apagar todas as músicas e o progresso?')) { S = defaults(); save(); show('home'); } };

// cartão
$('cardClose').onclick = () => { const g = session?.gate; endSession(); if (g) leaveTo(g); };
$('btnYes').onclick = () => answer(true);
$('btnNo').onclick = () => answer(false);
$('btnDoubt').onclick = reveal;
$('btnSpeak').onclick = () => session?.cur && speak(session.cur[1].en);
$('btnSlow').onclick = () => session?.cur && speak(session.cur[1].en, 0.6);
const editPt = () => {
  if (!session?.cur) return; const p = session.cur[1];
  const v = prompt('Tradução desta frase:', p.pt); if (v === null) return;
  p.pt = v.trim(); save(); renderPt();
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
  rollDay();
  if (!S.daily.chosen && current !== 'confirm' && current !== 'loading') { if (!session) openPick(true); return; }
  if (!S.settings.unlock || session || !S.songs[S.activeSongId]) return;
  if (['pick', 'confirm', 'loading', 'settings', 'setup'].includes(current) || gateCurrent) return;
  startSession(S.settings.burst);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); speechSynthesis?.cancel(); return; }
  if (Date.now() - hiddenAt >= UNLOCK_GAP_MS) maybeFlash();
});

/* ---------------- modo porteiro (Atalhos do iPhone) ----------------
 * Uma automação do app Atalhos ("quando o Instagram for aberto") abre
 *   .../musica/?gate=instagram
 * O Refrão mostra a(s) frase(s) e depois devolve a pessoa ao app.        */
const GATE_APPS = {
  todos: ['Todos os apps', null],
  instagram: ['Instagram', 'instagram://'], whatsapp: ['WhatsApp', 'whatsapp://'], tiktok: ['TikTok', 'tiktok://'],
  youtube: ['YouTube', 'youtube://'], facebook: ['Facebook', 'fb://'], x: ['X (Twitter)', 'twitter://'],
  spotify: ['Spotify', 'spotify://'], netflix: ['Netflix', 'nflx://'], telegram: ['Telegram', 'tg://'],
  kwai: ['Kwai', 'kwai://'], linkedin: ['LinkedIn', 'linkedin://']
};
let gateCurrent = null;
function gateFromKey(key) {
  const k = (key || '').toLowerCase(); const a = GATE_APPS[k];
  if (k === 'todos' || !a) return { key: k, name: 'seu app', url: null, all: true };
  return { key: k, name: a[0], url: a[1] };
}
function markGatePassed() { S.gateLast = Date.now(); save(); }
function leaveTo(g) { if (g?.url) location.href = g.url; }
function gateDone(g, n) {
  markGatePassed(); gateCurrent = g; $('gateReactivate').classList.add('hidden');
  $('gateDoneTitle').textContent = n ? 'Liberado! 🔓' : 'Pulou essa 👋';
  $('gateDoneSub').textContent = n ? `${n} frase${n > 1 ? 's' : ''} a mais no seu inglês hoje (${S.daily.done}/${S.settings.goal}).` : 'Sem problema, a frase volta mais tarde.';
  $('gateGo').textContent = `Abrir ${g.name} →`; $('gateGo').classList.toggle('hidden', !g.url);
  $('gateBackHint').classList.toggle('hidden', !!g.url);
  $('gateDoneBox').classList.remove('hidden');
}
function addGateApp(k) { if (GATE_APPS[k] && !S.gateApps.includes(k)) { S.gateApps.push(k); save(); } }
const gateNames = () => S.gateApps.includes('todos') ? 'todos os apps' : (S.gateApps.map(k => GATE_APPS[k]?.[0]).filter(Boolean).join(', ') || 'seus apps');
// pausado: a automação do iPhone continua existindo, mas o Refrão devolve na hora
function gatePaused(g) {
  gateCurrent = g;
  $('gateDoneTitle').textContent = 'Refrão pausado ⏸';
  $('gateDoneSub').textContent = `As frases antes ${g.all ? 'dos apps' : 'do ' + g.name} estão desativadas. Para não abrir mais nada, apague a automação no app Atalhos.`;
  $('gateGo').textContent = `Abrir ${g.name} →`; $('gateGo').classList.toggle('hidden', !g.url);
  $('gateReactivate').classList.remove('hidden');
  $('gateBackHint').classList.toggle('hidden', !!g.url);
  $('gateDoneBox').classList.remove('hidden');
}
function setGateOn(on) { S.settings.gateOn = on; save(); renderGateStatus(); }
function renderGateStatus() {
  const el = $('gateStatus'); if (!el) return;
  if (!S.gateApps.length) el.innerHTML = `📱 Ver uma frase antes do Instagram, WhatsApp… <button class="linkbtn" data-gs="setup">Configurar</button>`;
  else if (S.settings.gateOn !== false) el.innerHTML = `🔓 Frase antes de ${esc(gateNames())}: <b>ativada</b> · <button class="linkbtn" data-gs="off">Desativar</button>`;
  else el.innerHTML = `⏸ Frase antes de ${esc(gateNames())}: <b>desativada</b> · <button class="linkbtn" data-gs="on">Ativar</button>`;
}
// painel que oferece a opção (1ª abertura e a cada troca de música)
let offerAfter = null;
function offerGate(after) {
  offerAfter = after || null;
  const on = S.gateApps.length && S.settings.gateOn !== false;
  $('offerTitle').textContent = on ? 'Sua música vai junto 🎵' : 'Frase antes dos seus apps?';
  $('offerText').innerHTML = on
    ? `As frases desta música vão aparecer antes de <b>${esc(gateNames())}</b>.`
    : 'Toda vez que você abrir o Instagram, WhatsApp ou outro app, o Refrão mostra uma frase rapidinha antes. É o jeito mais fácil de estudar sem lembrar de estudar.';
  $('offerYes').textContent = on ? '✓ Ótimo' : '📱 Sim, configurar';
  $('offerNo').textContent = on ? 'Desativar' : 'Agora não';
  $('offerSheet').dataset.mode = on ? 'on' : 'off';
  $('offerSheet').classList.remove('hidden');
  S.gateOffered = true; save();
}
function closeOffer() { $('offerSheet').classList.add('hidden'); const f = offerAfter; offerAfter = null; f && f(); }
$('offerYes').onclick = () => {
  if ($('offerSheet').dataset.mode === 'on') return closeOffer();
  offerAfter = null; $('offerSheet').classList.add('hidden'); renderSetup(); show('setup');
};
$('offerNo').onclick = () => { if ($('offerSheet').dataset.mode === 'on') { setGateOn(false); toast('Frases antes dos apps desativadas ⏸'); } closeOffer(); };
$('offerSheet').onclick = e => { if (e.target === $('offerSheet')) closeOffer(); };
$('gateStatus').onclick = e => {
  const b = e.target.closest('[data-gs]'); if (!b) return;
  if (b.dataset.gs === 'setup') { renderSetup(); show('setup'); }
  else { setGateOn(b.dataset.gs === 'on'); toast(b.dataset.gs === 'on' ? 'Ativado 🔓' : 'Desativado ⏸ — o Refrão devolve você direto ao app'); }
};
$('gateOff').onclick = () => {
  const g = session?.gate; setGateOn(false);
  $('card').classList.add('hidden'); session = null; markGatePassed();
  if (g) { gatePaused(g); leaveTo(g); }
};
$('gateReactivate').onclick = () => { setGateOn(true); $('gateReactivate').classList.add('hidden'); toast('Ativado de novo 🔓'); };
function renderSetup() {
  const sel = $('setupApp');
  if (!sel.options.length) sel.innerHTML = Object.entries(GATE_APPS).map(([k, a]) => `<option value="${k}">${esc(a[0])}</option>`).join('');
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  $('setupUrl').textContent = `${base}?gate=${sel.value}`;
  const all = sel.value === 'todos';
  $('step2').innerHTML = all
    ? 'Toque em <b>App</b> → <b>Escolher</b> → marque <b>todos os apps</b> da lista, <b>MENOS o Safari e o Atalhos</b> → deixe <b>"Está Aberto"</b> marcado.'
    : `Toque em <b>App</b> → <b>Escolher</b> → marque <b>${esc(GATE_APPS[sel.value][0])}</b> → deixe <b>"Está Aberto"</b> marcado.`;
  $('stepLast').innerHTML = `Toque em <b>OK</b>. Pronto! Abra ${all ? 'qualquer app' : 'o <b>' + esc(GATE_APPS[sel.value][0]) + '</b>'} para testar.`;
  $('allWarn').classList.toggle('hidden', !all);
}

rollDay();
show('home');
const gateParam = new URLSearchParams(location.search).get('gate');
if (gateParam) {
  history.replaceState(null, '', location.pathname); // recarregar não dispara o porteiro de novo
  const g = gateFromKey(gateParam);
  addGateApp(g.key);
  if (S.settings.gateOn === false) gatePaused(g);
  else if (S.songs[S.activeSongId]) startSession(S.settings.gateCount || 1, null, g);
  else { gateCurrent = g; gateDone(g, 0); toast('Escolha uma música no Refrão para começar 🎵', 4000); }
} else if (!Object.keys(S.songs).length) { openPick(true); offerGate(); }
else maybeFlash();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
