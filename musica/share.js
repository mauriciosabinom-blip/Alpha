/* Refrão — compartilhar resultados (Instagram Stories, WhatsApp...).
 * Gera uma imagem 1080x1920 no próprio aparelho (canvas) com a capa da música, o resultado,
 * os dias seguidos e um QR code com o link do app; depois abre o menu de compartilhar do sistema.
 * Usa: S, songStats, artUrl, hashPalette, toast, esc, $ (de app.js). */
'use strict';

const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
let shareFile = null, shareText = '';

function loadImg(src, cors) {
  return new Promise((res, rej) => {
    const i = new Image(); if (cors) i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
}
// capa real (se o servidor permitir usar no canvas) ou a ilustração gerada do app
async function coverImage(song) {
  if (song.cover) {
    try {
      const img = await loadImg(song.cover, true);
      const t = document.createElement('canvas'); t.width = t.height = 2; t.getContext('2d').drawImage(img, 0, 0, 2, 2);
      t.getContext('2d').getImageData(0, 0, 1, 1); // falha se a imagem "sujar" o canvas
      return img;
    } catch (e) {}
  }
  return loadImg(artSvg(song));
}
let qrLib = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  if (qrLib) return qrLib;
  qrLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.onload = res; s.onerror = () => { qrLib = null; rej(); };
    document.head.appendChild(s);
  });
  return qrLib;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, maxW, size, weight, family) {
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 2; } while (ctx.measureText(text).width > maxW && size > 20);
}
function wrapLines(ctx, text, maxW) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}

/* kind: 'progress' | 'mastered' | 'goal' | 'karaoke' ; extra: { score } */
async function buildShareImage(kind, song, extra = {}) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const [a, b] = song?.palette || hashPalette(song ? song.title + song.artist : 'Refrão');
  const serif = '"Fraunces", Georgia, serif', sans = '"Inter", system-ui, -apple-system, sans-serif';
  await document.fonts?.ready;

  // fundo: paleta da música + capa ampliada e escurecida
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cover = song ? await coverImage(song) : null;
  if (cover) { ctx.globalAlpha = 0.35; ctx.drawImage(cover, -420, -200, H + 120, H + 120); ctx.globalAlpha = 1; }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(12,9,22,.35)'); shade.addColorStop(0.55, 'rgba(12,9,22,.78)'); shade.addColorStop(1, 'rgba(12,9,22,.96)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);

  // marca
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = `700 54px ${serif}`; ctx.fillText('♪ Refrão', W / 2, 150);
  ctx.font = `500 30px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('inglês com música', W / 2, 200);

  // capa
  if (cover) {
    const s = 560, x = (W - s) / 2, y = 270;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 30;
    roundRect(ctx, x, y, s, s, 44); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ctx.save(); roundRect(ctx, x, y, s, s, 44); ctx.clip(); ctx.drawImage(cover, x, y, s, s); ctx.restore();
  }

  // manchete
  const st = song ? songStats(song) : null;
  const head = {
    mastered: ['🏆 Dominei esta música!', null],
    goal: [`🎯 Meta do dia batida!`, `${S.daily.done} frases em inglês hoje`],
    karaoke: [`🎤 Nota de pronúncia: ${extra.score}`, extra.score >= 90 ? 'Pronúncia de nativo!' : extra.score >= 70 ? 'Mandei bem no karaokê!' : 'Treinando no karaokê'],
    progress: [`Já aprendi ${st?.pct ?? 0}% desta música`, null]
  }[kind] || ['Aprendendo inglês com música', null];
  let y = 960;
  ctx.fillStyle = '#fff'; fitText(ctx, head[0], W - 120, 70, 800, sans); ctx.fillText(head[0], W / 2, y);
  if (song) {
    y += 100; ctx.font = `700 76px ${serif}`; fitText(ctx, song.title, W - 140, 76, 700, serif);
    for (const line of wrapLines(ctx, song.title, W - 140).slice(0, 2)) { ctx.fillText(line, W / 2, y); y += 84; }
    ctx.font = `500 40px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(song.artist, W / 2, y); y += 40;
  }
  if (head[1]) { y += 50; ctx.font = `600 40px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(head[1], W / 2, y); }

  // números
  const streak = (S.streak.last === today() || S.streak.last === today(new Date(Date.now() - DAY))) ? S.streak.count : 0;
  const boxes = [
    st ? [`${st.mastered}/${st.total}`, 'frases dominadas'] : [String(S.daily.done), 'frases hoje'],
    [`${streak}🔥`, streak === 1 ? 'dia seguido' : 'dias seguidos'],
    kind === 'karaoke' ? [`${extra.score}`, 'nota de pronúncia'] : [`${st?.pct ?? 0}%`, 'da letra']
  ];
  const bw = 290, gap = 30, bx0 = (W - (bw * 3 + gap * 2)) / 2, by = Math.max(y + 70, 1330);
  boxes.forEach(([big, small], i) => {
    const x = bx0 + i * (bw + gap);
    roundRect(ctx, x, by, bw, 190, 32); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; fitText(ctx, big, bw - 30, 64, 800, sans); ctx.fillText(big, x + bw / 2, by + 95);
    ctx.font = `500 28px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(small, x + bw / 2, by + 150);
  });

  // rodapé: QR code + link
  const fy = 1600;
  try {
    await loadQR();
    const qr = qrcode(0, 'M'); qr.addData(APP_URL); qr.make();
    const n = qr.getModuleCount(), size = 220, cell = size / n, qx = 110, qy = fy;
    roundRect(ctx, qx - 18, qy - 18, size + 36, size + 36, 24); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#111';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(qx + k * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `700 44px ${sans}`;
    ctx.fillText('Aprenda inglês com', 400, fy + 70); ctx.fillText('as músicas que ama', 400, fy + 125);
    ctx.font = `500 30px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('Aponte a câmera e baixe o Refrão', 400, fy + 185);
  } catch (e) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `700 46px ${sans}`;
    ctx.fillText('Aprenda inglês com as músicas que ama', W / 2, fy + 80);
  }
  ctx.textAlign = 'center'; ctx.font = `600 30px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(APP_URL.replace(/^https?:\/\//, ''), W / 2, H - 50);

  return new Promise(res => c.toBlob(res, 'image/png'));
}

async function openShare(kind, song, extra) {
  const sheet = $('shareSheet');
  $('shareImg').removeAttribute('src'); $('shareGo').disabled = true; $('shareGo').textContent = 'Preparando a imagem…';
  sheet.classList.remove('hidden');
  try {
    const blob = await buildShareImage(kind, song, extra);
    shareFile = new File([blob], `refrao-${(song?.title || 'resultado').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, { type: 'image/png' });
    shareText = song
      ? `${kind === 'mastered' ? 'Dominei' : kind === 'karaoke' ? `Tirei ${extra.score} de pronúncia cantando` : 'Estou aprendendo inglês com'} "${song.title}" (${song.artist}) no Refrão 🎧 Baixe também: ${APP_URL}`
      : `Estou aprendendo inglês com música no Refrão 🎧 Baixe também: ${APP_URL}`;
    $('shareImg').src = URL.createObjectURL(blob);
    $('shareGo').disabled = false; $('shareGo').textContent = '📤 Compartilhar';
  } catch (e) {
    $('shareGo').textContent = 'Não consegui gerar a imagem'; toast('Não consegui gerar a imagem agora.');
  }
}
// o compartilhar precisa acontecer direto no toque (exigência do iPhone), por isso a imagem é gerada antes
$('shareGo').onclick = async () => {
  if (!shareFile) return;
  const data = { files: [shareFile], text: shareText, title: 'Refrão' };
  try {
    if (navigator.canShare && navigator.canShare(data)) { await navigator.share(data); return; }
    if (navigator.share) { await navigator.share({ text: shareText, url: APP_URL, title: 'Refrão' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  // sem menu de compartilhar (ex.: computador): baixa a imagem e copia o texto com o link
  const a = document.createElement('a'); a.href = $('shareImg').src; a.download = shareFile.name; a.click();
  try { await navigator.clipboard.writeText(shareText); toast('Imagem salva e texto com o link copiado ✓'); } catch (e) { toast('Imagem salva ✓'); }
};
$('shareClose').onclick = () => $('shareSheet').classList.add('hidden');
$('shareSheet').onclick = e => { if (e.target === $('shareSheet')) $('shareSheet').classList.add('hidden'); };
$('btnShare').onclick = () => { const s = S.songs[S.activeSongId]; openShare(s && songStats(s).mastered === songStats(s).total ? 'mastered' : 'progress', s); };
window.openShare = openShare;
