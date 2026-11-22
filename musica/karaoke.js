/* Refrão — 🎤 Karaokê com nota de pronúncia.
 * A música toca pelo YouTube (achada automaticamente), a letra rola sincronizada (tempos do lrclib)
 * e o reconhecimento de fala do aparelho escuta a pessoa cantando. A nota mede PRONÚNCIA:
 * quantas palavras de cada verso foram reconhecidas corretamente — não afinação nem voz.
 * Usa de app.js: S, save, $, esc, norm, toast, confetti, loadYT, autoFindVideo, ensureTimes,
 * ytTried, ytSearching, songStats; e openShare (share.js). */
'use strict';

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let kSong = null, kLines = [], kPlayer = null, kReady = false, kTimer = null, kRec = null, kOn = false, kCur = -1, kHeard = [];

// linha do tempo: cada vez que um verso é cantado, com início/fim em segundos
function kTimeline(song) {
  return song.phrases.flatMap(p => (p.times || []).map(([start, end]) => ({ p, start, end })))
    .sort((a, b) => a.start - b.start).map((l, i) => ({ ...l, i, words: kWords(l.p.en), heard: [] }));
}
const kWords = s => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const wordClose = (a, b) => a === b || (a.length >= 4 && lev(a, b) <= 1) || (a.length >= 7 && lev(a, b) <= 2);
// pontua um verso: cada palavra esperada encontrada (uma vez) entre as ouvidas
function scoreLine(line) {
  const pool = [...line.heard]; const hit = [];
  for (const w of line.words) { const k = pool.findIndex(h => wordClose(w, h)); hit.push(k >= 0); if (k >= 0) pool.splice(k, 1); }
  line.hit = hit; line.score = line.words.length ? hit.filter(Boolean).length / line.words.length : 0;
  return line.score;
}
function kTotal() {
  const words = kLines.reduce((a, l) => a + l.words.length, 0) || 1;
  return Math.round(kLines.reduce((a, l) => a + scoreLine(l) * l.words.length, 0) / words * 100);
}

function kShow(id) { ['kIntro', 'kStage', 'kResult'].forEach(x => $(x).classList.toggle('hidden', x !== id)); }
async function openKaraoke() {
  const song = S.songs[S.activeSongId]; if (!song) return;
  kSong = song; $('karaoke').classList.remove('hidden'); kShow('kIntro');
  $('kTitle').textContent = song.title; $('kArtist').textContent = song.artist;
  $('kArt').style.cssText = bgStyle(song);
  const best = (S.karaoke || []).filter(k => k.songId === song.id).reduce((m, k) => Math.max(m, k.score), -1);
  $('kBest').textContent = best >= 0 ? `Sua melhor nota nesta música: ${best}` : 'Primeira vez cantando esta música!';
  $('kMicWarn').classList.toggle('hidden', !!SpeechRec);
  $('kGo').disabled = true; $('kStatus').textContent = 'Preparando a música…';
  // precisa do vídeo e dos tempos de cada verso
  if (!song.yt && !ytTried.has(song.id)) await autoFindVideo(song);
  await ensureTimes(song, true);
  kLines = kTimeline(song);
  if (!song.yt) { $('kStatus').textContent = 'Não achei esta música no YouTube agora. Tente mais tarde.'; return; }
  if (kLines.length < 2) { $('kStatus').textContent = 'Esta música não tem a letra sincronizada — o karaokê precisa dela. Escolha outra música.'; return; }
  await loadYT();
  if (!kPlayer) {
    kPlayer = new YT.Player('kFrame', {
      width: '100%', height: '100%', videoId: song.yt.id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
      events: { onReady: () => { kReady = true; kReadyUI(); }, onStateChange: e => { if (e.data === 0 && kOn) kFinish(); },
        onError: () => { $('kStatus').textContent = 'Este vídeo não toca fora do YouTube. Tente de novo mais tarde.'; } }
    });
  } else { kPlayer.cueVideoById(song.yt.id); kReadyUI(); }
}
function kReadyUI() { if (!kSong) return; $('kGo').disabled = false; $('kStatus').textContent = `${kLines.length} versos prontos · use fone de ouvido 🎧`; }

function kRenderLyrics() {
  $('kLyrics').innerHTML = kLines.map(l => `<div class="kline" data-i="${l.i}">${esc(l.p.en)}</div>`).join('');
}
function startKaraoke() {
  if (!kReady) return;
  kLines.forEach(l => { l.heard = []; l.hit = null; l.score = 0; });
  kHeard = []; kCur = -1; kOn = true; kRenderLyrics(); kShow('kStage'); $('kLive').textContent = '';
  const off = kSong.yt.offset || 0;
  // tudo dentro do toque (exigência do iPhone para som e microfone)
  kPlayer.seekTo(Math.max(0, kLines[0].start + off - 4), true); kPlayer.playVideo();
  startMic();
  clearInterval(kTimer); kTimer = setInterval(kTick, 120);
}
function kTick() {
  let t; try { t = kPlayer.getCurrentTime() - (kSong.yt.offset || 0); } catch (e) { return; }
  let i = -1; for (const l of kLines) { if (l.start - 0.15 <= t) i = l.i; else break; }
  if (i !== kCur) {
    kCur = i;
    document.querySelectorAll('.kline').forEach(el => { const n = +el.dataset.i; el.classList.toggle('on', n === i); el.classList.toggle('past', n < i); });
    const el = document.querySelector(`.kline[data-i="${i}"]`);
    // rola só a caixa da letra (scrollIntoView empurraria a tela inteira)
    const box = $('kLyrics');
    if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });
  }
  const last = kLines[kLines.length - 1];
  $('kProgress').style.width = Math.min(100, Math.max(0, (t - kLines[0].start) / (last.end - kLines[0].start) * 100)) + '%';
  if (t > last.end + 4) kFinish();
}
// palavras reconhecidas vão para o verso que estava sendo cantado (com folga para o atraso do reconhecimento)
// o reconhecimento entrega as palavras com atraso (às vezes já no verso seguinte):
// entre os versos dos últimos segundos, credita no que mais combina com o que foi ouvido
function assignWords(words, t) {
  const cands = kLines.filter(l => l.start - 0.6 <= t && t <= l.end + 4);
  if (!cands.length) return;
  const fit = l => words.filter(w => l.words.some(x => wordClose(x, w))).length / Math.max(l.words.length, words.length);
  let best = cands[0], bestFit = -1;
  for (const l of cands) { const f = fit(l); if (f > bestFit || (f === bestFit && l.start > best.start && l.start <= t - 0.8)) { best = l; bestFit = f; } }
  if (bestFit === 0) best = cands.filter(l => l.start <= t - 0.8).pop() || cands[0]; // nada combinou: verso em andamento
  best.heard.push(...words);
}
function startMic() {
  if (!SpeechRec) return;
  kRec = new SpeechRec(); kRec.lang = 'en-US'; kRec.continuous = true; kRec.interimResults = true; kRec.maxAlternatives = 1;
  kRec.onresult = e => {
    let live = '';
    for (let r = e.resultIndex; r < e.results.length; r++) {
      const res = e.results[r], txt = res[0].transcript;
      if (res.isFinal) { const t = kPlayer.getCurrentTime() - (kSong.yt.offset || 0); const w = kWords(txt); kHeard.push({ t, txt }); assignWords(w, t); }
      else live += txt;
    }
    $('kLive').textContent = live ? '🎙 ' + live : '';
  };
  kRec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { kOn && toast('Permita o microfone para receber a nota 🎙', 4000); kRec = null; } };
  kRec.onend = () => { if (kOn && kRec) try { kRec.start(); } catch (e) {} }; // o iPhone para sozinho; religa
  try { kRec.start(); } catch (e) {}
}
function stopAll() {
  kOn = false; clearInterval(kTimer);
  try { kPlayer?.pauseVideo(); } catch (e) {}
  if (kRec) { const r = kRec; kRec = null; try { r.stop(); } catch (e) {} }
}
function kFinish() {
  if (!kOn) return; stopAll();
  const reached = kLines.filter(l => l.start <= (kPlayer.getCurrentTime?.() ?? 0) - (kSong.yt.offset || 0) + 1);
  const scored = reached.length >= 2 ? reached : kLines;
  const words = scored.reduce((a, l) => a + l.words.length, 0) || 1;
  const score = Math.round(scored.reduce((a, l) => a + scoreLine(l) * l.words.length, 0) / words * 100);
  S.karaoke = S.karaoke || []; S.karaoke.push({ songId: kSong.id, title: kSong.title, score, date: Date.now(), lines: scored.length }); save();
  $('kScore').textContent = score;
  $('kScoreMsg').textContent = score >= 90 ? 'Pronúncia de nativo! 🤩' : score >= 75 ? 'Mandou muito bem! 👏' : score >= 50 ? 'Bom caminho — continue treinando 💪' : 'Treine os versos em vermelho e tente de novo 🎯';
  $('kRing').style.setProperty('--p', score);
  $('kLines').innerHTML = scored.map(l => {
    const cls = l.score >= 0.8 ? 'good' : l.score >= 0.5 ? 'mid' : 'bad';
    const shown = l.p.en.split(/\s+/).map((w, k) => `<span class="${l.hit?.[k] ? '' : 'miss'}">${esc(w)}</span>`).join(' ');
    return `<div class="kres ${cls}"><b>${Math.round(l.score * 100)}</b><div>${shown}${l.heard.length ? `<small>ouvido: “${esc(l.heard.join(' '))}”</small>` : '<small>não ouvi nada neste verso</small>'}</div></div>`;
  }).join('');
  kShow('kResult');
  if (score >= 75) confetti(['🎤', '⭐', '🎉']);
  kLastScore = score;
}
let kLastScore = 0;
function closeKaraoke() { stopAll(); $('karaoke').classList.add('hidden'); kSong = null; if (current === 'home') renderHome(); }

$('btnKaraoke').onclick = openKaraoke;
$('kGo').onclick = startKaraoke;
$('kStop').onclick = kFinish;
$('kAgain').onclick = () => { kShow('kIntro'); kReadyUI(); };
$('kShare').onclick = () => { const s = kSong; closeKaraoke(); window.openShare?.('karaoke', s, { score: kLastScore }); };
document.querySelectorAll('.kclose').forEach(b => b.onclick = closeKaraoke);
document.addEventListener('visibilitychange', () => { if (document.hidden && kOn) kFinish(); });
