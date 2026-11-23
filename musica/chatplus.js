/* Refrão — chat turbinado: aparência (fontes, tamanho, papel de parede, cores), emojis animados,
 * figurinhas, GIFs (GIPHY, só conteúdo livre para todas as idades) e mensagens de áudio.
 * Toques do app (com o app aberto) — o toque de notificação com o app fechado é sempre o do aparelho.
 * Usa de app.js: S, save, touch, $, esc, toast, sb, CFG, getSession, bgStyle, current; Social. */
'use strict';

const ChatPlus = (() => {
  /* ---------------- preferências (salvas na conta, iguais em todos os aparelhos) ---------------- */
  const FONTS = [
    ['Inter', 'Padrão'], ['Nunito', 'Arredondada'], ['Fredoka', 'Divertida'], ['Comfortaa', 'Suave'], ['Quicksand', 'Leve'],
    ['Baloo 2', 'Bolha'], ['Caveat', 'Escrita à mão'], ['Patrick Hand', 'Caderno'], ['Pacifico', 'Cursiva'], ['Lobster', 'Retrô'], ['Fraunces', 'Elegante']
  ];
  const SIZES = [['0.9', 'P'], ['1', 'M'], ['1.15', 'G'], ['1.3', 'GG']];
  const NOTE_SVG = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90"><g fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="2"><path d="M20 60V30l18-5v30"/><circle cx="15" cy="60" r="5"/><circle cx="33" cy="55" r="5"/><path d="M65 25v22"/><circle cx="60" cy="47" r="5"/><path d="M65 25l8 4"/></g></svg>`);
  const WALLS = [
    ['padrao', 'Padrão', 'var(--bg)'],
    ['capa', 'Capa da música', null],
    ['noite', 'Noite', '#0b141a'],
    ['notas', 'Notas', `#120f1f url("data:image/svg+xml,${NOTE_SVG}")`],
    ['bolinhas', 'Bolinhas', 'radial-gradient(rgba(255,255,255,.08) 1.5px, transparent 1.6px) 0 0/18px 18px, #161226'],
    ['por-do-sol', 'Pôr do sol', 'linear-gradient(160deg,#3a1c4a,#a0365a 55%,#e8865a)'],
    ['oceano', 'Oceano', 'linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364)'],
    ['floresta', 'Floresta', 'linear-gradient(160deg,#0b2b26,#164a3e 50%,#2d6a4f)'],
    ['galaxia', 'Galáxia', 'radial-gradient(circle at 20% 20%,#5b2a86 0,transparent 45%),radial-gradient(circle at 80% 70%,#1d4e89 0,transparent 45%),#0b0820'],
    ['algodao', 'Algodão-doce', 'linear-gradient(160deg,#6a3093,#a044ff 50%,#ff6fb5)'],
    ['areia', 'Areia', '#3b3127'],
    ['foto', 'Minha foto', null]
  ];
  const BUBBLES = [
    ['roxo', 'Roxo', 'linear-gradient(135deg,color-mix(in srgb,var(--accent) 80%,transparent),color-mix(in srgb,var(--accent2) 80%,transparent))', 'rgba(255,255,255,.12)'],
    ['whats', 'Verde', '#005c4b', '#202c33'],
    ['azul', 'Azul', 'linear-gradient(135deg,#2563eb,#0ea5e9)', 'rgba(255,255,255,.12)'],
    ['rosa', 'Rosa', 'linear-gradient(135deg,#db2777,#f472b6)', 'rgba(255,255,255,.12)'],
    ['laranja', 'Laranja', 'linear-gradient(135deg,#ea580c,#f59e0b)', 'rgba(255,255,255,.12)'],
    ['menta', 'Menta', 'linear-gradient(135deg,#059669,#34d399)', 'rgba(255,255,255,.12)']
  ];
  const TONES = [['curto', '🎵 Curto (dó–mi–sol)'], ['melodia', '🎶 Melodia longa'], ['campainha', '🔔 Campainha (toca 2x)'], ['nenhum', '🔇 Sem som']];
  const prefs = () => (S.chatPrefs = Object.assign({ font: 'Inter', size: '1', wall: 'padrao', bubble: 'roxo', tone: 'curto', anim: true }, S.chatPrefs || {}));
  const photoKey = () => 'refrao.wallPhoto:' + (getSession()?.handle || '');
  const loadedFonts = new Set(['Inter', 'Fraunces']);
  function loadFont(f) {
    if (loadedFonts.has(f)) return; loadedFonts.add(f);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;600;700&display=swap`;
    document.head.appendChild(l);
  }
  function wallCss(id) {
    if (id === 'capa') { const s = S.songs[S.activeSongId]; return s ? null : 'var(--bg)'; }
    if (id === 'foto') { let p = null; try { p = localStorage.getItem(photoKey()); } catch (e) {} return p ? `center/cover no-repeat url("${p}")` : 'var(--bg)'; }
    return (WALLS.find(w => w[0] === id) || WALLS[0])[2];
  }
  // aplica no chat (e na prévia do painel)
  function apply(el = $('chat')) {
    const p = prefs(), b = BUBBLES.find(x => x[0] === p.bubble) || BUBBLES[0];
    loadFont(p.font);
    el.style.setProperty('--chat-font', `"${p.font}", var(--sans)`);
    el.style.setProperty('--chat-size', p.size + 'rem');
    el.style.setProperty('--bubble-mine', b[2]);
    el.style.setProperty('--bubble-theirs', b[3]);
    const w = wallCss(p.wall), song = S.songs[S.activeSongId];
    el.style.setProperty('--chat-wall', w || 'var(--bg)');
    el.classList.toggle('wall-cover', p.wall === 'capa' && !!song);
    if (p.wall === 'capa' && song) el.style.setProperty('--chat-cover', `url("${artUrl(song).replace(/"/g, '%22')}")`);
  }

  /* ---------------- painel "Aparência do chat" ---------------- */
  function openLook() {
    const p = prefs();
    FONTS.forEach(f => loadFont(f[0]));
    $('lookFonts').innerHTML = FONTS.map(([f, n]) => `<button class="opt ${p.font === f ? 'on' : ''}" data-font="${esc(f)}" style="font-family:'${esc(f)}',var(--sans)">${esc(n)}<small>Olá! Bora cantar? 🎶</small></button>`).join('');
    $('lookSizes').innerHTML = SIZES.map(([v, n]) => `<button class="chip-opt ${p.size === v ? 'on' : ''}" data-size="${v}">${n}</button>`).join('');
    $('lookWalls').innerHTML = WALLS.map(([id, n]) => `<button class="swatch ${p.wall === id ? 'on' : ''}" data-wall="${id}" style="background:${id === 'capa' ? 'center/cover ' + (S.songs[S.activeSongId] ? `url("${artUrl(S.songs[S.activeSongId]).replace(/"/g, '%22')}")` : 'var(--bg)') : id === 'foto' ? 'var(--glass2)' : wallCss(id)}"><span>${id === 'foto' ? '📷<br>' : ''}${esc(n)}</span></button>`).join('');
    $('lookBubbles').innerHTML = BUBBLES.map(([id, n, c]) => `<button class="swatch round ${p.bubble === id ? 'on' : ''}" data-bubble="${id}" style="background:${c}" aria-label="${esc(n)}"></button>`).join('');
    $('lookTones').innerHTML = TONES.map(([id, n]) => `<button class="chip-opt ${p.tone === id ? 'on' : ''}" data-tone="${id}">${n}</button>`).join('');
    $('lookAnim').checked = p.anim !== false;
    apply($('lookPreview'));
    $('lookSheet').classList.remove('hidden');
  }
  function setPref(k, v) { prefs()[k] = v; touch(); save(); apply(); openLook(); }
  $('lookSheet').addEventListener('click', e => {
    const t = e.target.closest('[data-font],[data-size],[data-wall],[data-bubble],[data-tone]');
    if (e.target === $('lookSheet')) return $('lookSheet').classList.add('hidden');
    if (!t) return;
    if (t.dataset.font) setPref('font', t.dataset.font);
    if (t.dataset.size) setPref('size', t.dataset.size);
    if (t.dataset.bubble) setPref('bubble', t.dataset.bubble);
    if (t.dataset.tone) { setPref('tone', t.dataset.tone); playTone(t.dataset.tone, true); }
    if (t.dataset.wall) { if (t.dataset.wall === 'foto') return $('lookPhoto').click(); setPref('wall', t.dataset.wall); }
  });
  $('lookAnim').onchange = e => setPref('anim', e.target.checked);
  $('lookDone').onclick = () => $('lookSheet').classList.add('hidden');
  // foto do aparelho: reduzida para caber no aparelho (fica só neste aparelho)
  $('lookPhoto').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const img = await createImageBitmap(f), k = Math.min(1, 1100 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, c.width, c.height);
      localStorage.setItem(photoKey(), c.toDataURL('image/jpeg', 0.78));
      setPref('wall', 'foto');
    } catch (err) { toast('Não consegui usar essa foto. Tente outra.'); }
  };

  /* ---------------- emojis animados (Noto Animated Emoji, Google — CC BY 4.0) ---------------- */
  const EMO_RE = /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*/gu;
  const code = (e, fe0f) => [...e].map(c => c.codePointAt(0).toString(16)).filter(h => fe0f || h !== 'fe0f').join('_');
  const notoUrl = (e, fe0f) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${code(e, fe0f)}/512.webp`;
  const emoImg = (e, cls) => `<img class="${cls}" src="${notoUrl(e, false)}" data-e="${esc(e)}" alt="${esc(e)}" loading="lazy" decoding="async">`;
  // se a versão animada não existir, tenta a variação e por fim mostra o emoji comum
  document.addEventListener('error', ev => {
    const im = ev.target; if (!(im instanceof HTMLImageElement) || !im.dataset.e) return;
    const e = im.dataset.e;
    if (!im.dataset.tried && e.includes('️')) { im.dataset.tried = 1; im.src = notoUrl(e, true); return; }
    const s = document.createElement('span'); s.className = im.className + ' emo-txt'; s.textContent = e; im.replaceWith(s);
  }, true);
  function richText(text) {
    if (prefs().anim === false) return esc(text);
    const only = text.replace(EMO_RE, '').trim() === '' && (text.match(EMO_RE) || []).length <= 3;
    let out = '', last = 0;
    for (const m of text.matchAll(EMO_RE)) { out += esc(text.slice(last, m.index)) + emoImg(m[0], only ? 'emo-big' : 'emo'); last = m.index + m[0].length; }
    return out + esc(text.slice(last));
  }
  const EMOJIS = '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 😐 😏 😴 😎 🥳 😮 😲 🥺 😢 😭 😤 😡 🤯 😱 🥶 🥵 😈 👻 💀 🤖 👽 🙈 🙉 🙊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 ✨ ⭐ 🌟 🔥 💯 🎉 🎊 🎵 🎶 🎤 🎧 🎸 🎹 🥁 🎺 👍 👎 👏 🙌 🙏 👋 🤝 💪 ✌️ 🤞 🤟 🤘 👀 🌈 ☀️ 🌙 ⚡ 🍕 🍔 🍟 🍦 🍩 🎂 ☕ 🐶 🐱 🦄 🐼 🦋 🌸 🌹 🌻 🏆 🎮 ⚽ 🚀'.split(' ');
  const STICKERS = '😂 🥰 😍 🤩 😎 🥳 😭 😱 🤯 🥺 😴 🤔 🤗 😈 👻 🤖 🙈 ❤️ 💔 🔥 💯 🎉 🎵 🎤 🎧 🎸 👍 👏 🙌 🙏 👋 💪 🤘 🌈 ⭐ 🦄 🐶 🐱 🍕 🎂 🏆 🚀'.split(' ');

  /* ---------------- painel de emojis / figurinhas / GIFs ---------------- */
  let tab = 'emo', gifTimer = null;
  function openPanel(t = tab) {
    tab = t;
    document.querySelectorAll('#emojiTabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const box = $('emojiGrid'); $('gifSearchBox').classList.toggle('hidden', tab !== 'gif');
    if (tab === 'emo') box.innerHTML = EMOJIS.map(e => `<button class="emo-btn" data-emo="${esc(e)}">${emoImg(e, 'emo-pick')}</button>`).join('');
    if (tab === 'stk') box.innerHTML = STICKERS.map(e => `<button class="stk-btn" data-stk="${esc(e)}">${emoImg(e, 'stk-pick')}</button>`).join('');
    if (tab === 'gif') gifs($('gifSearch').value);
    box.className = 'emoji-grid ' + tab;
    $('emojiPanel').classList.remove('hidden');
  }
  async function gifs(q) {
    const box = $('emojiGrid');
    if (!CFG.giphyKey) { box.innerHTML = `<div class="gif-off muted small">🎞 Os GIFs ainda não foram ativados.<br>Falta configurar a chave gratuita do GIPHY.</div>`; return; }
    box.innerHTML = '<div class="muted small center" style="grid-column:1/-1">Carregando GIFs…</div>';
    try {
      const u = q.trim() ? `search?q=${encodeURIComponent(q.trim())}&lang=pt&` : 'trending?';
      const j = await (await fetch(`https://api.giphy.com/v1/gifs/${u}api_key=${CFG.giphyKey}&limit=24&rating=g`)).json();
      const list = (j.data || []).filter(g => /^[A-Za-z0-9]{5,40}$/.test(g.id));
      box.innerHTML = list.length ? list.map(g => `<button class="gif-btn" data-gif="${esc(g.id)}"><img src="https://media.giphy.com/media/${esc(g.id)}/200w.gif" alt="${esc(g.title || 'GIF')}" loading="lazy"></button>`).join('')
        + '<div class="giphy-credit">Powered by GIPHY</div>' : '<div class="muted small center" style="grid-column:1/-1">Nenhum GIF encontrado.</div>';
    } catch (e) { box.innerHTML = '<div class="muted small center" style="grid-column:1/-1">Sem conexão com os GIFs agora.</div>'; }
  }
  $('btnEmoji').onclick = () => $('emojiPanel').classList.contains('hidden') ? openPanel() : $('emojiPanel').classList.add('hidden');
  $('emojiTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) openPanel(b.dataset.tab); };
  $('gifSearch').oninput = e => { clearTimeout(gifTimer); gifTimer = setTimeout(() => gifs(e.target.value), 450); };
  $('emojiGrid').onclick = async e => {
    const b = e.target.closest('[data-emo],[data-stk],[data-gif]'); if (!b) return;
    if (b.dataset.emo) { const i = $('chatInput'); i.value += b.dataset.emo; i.dispatchEvent(new Event('input')); return; }
    $('emojiPanel').classList.add('hidden');
    if (b.dataset.stk) {
      const e2 = b.dataset.stk, img = b.querySelector('img');
      const url = img && img.complete && img.naturalWidth ? img.src : notoUrl(e2, false);
      await Social.sendMedia({ body: e2, kind: 'sticker', media: url });
    }
    if (b.dataset.gif) await Social.sendMedia({ body: '🎞 GIF', kind: 'gif', media: `https://media.giphy.com/media/${b.dataset.gif}/200w.gif` });
  };

  /* ---------------- mensagens de áudio ---------------- */
  let rec = null, chunks = [], recStart = 0, recTick = null, stream = null, recSend = false;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const MAX_REC = 60;
  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este aparelho não grava áudio pelo navegador.');
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast('Permita o microfone para gravar áudio 🎙', 4000); }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t));
    rec = new MediaRecorder(stream, type ? { mimeType: type } : {}); chunks = []; recSend = false;
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = onRecStop;
    rec.start(250); recStart = Date.now();
    $('recBar').classList.remove('hidden'); $('chatForm').classList.add('recording');
    recTick = setInterval(() => { const s = (Date.now() - recStart) / 1000; $('recTime').textContent = fmt(s); if (s >= MAX_REC) stopRec(true); }, 200);
  }
  function stopRec(send) { if (!rec) return; recSend = send; clearInterval(recTick); try { rec.stop(); } catch (e) {} }
  async function onRecStop() {
    const dur = (Date.now() - recStart) / 1000, mime = (rec.mimeType || 'audio/mp4').split(';')[0];
    stream?.getTracks().forEach(t => t.stop()); rec = null;
    $('recBar').classList.add('hidden'); $('chatForm').classList.remove('recording');
    if (!recSend) return;
    if (dur < 1) return toast('Áudio muito curto — segure um pouco mais.');
    const ext = { 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' }[mime] || 'm4a';
    const path = `${Social.me.id}/${crypto.randomUUID()}.${ext}`, blob = new Blob(chunks, { type: mime });
    toast('Enviando áudio…', 1500);
    const up = await sb.storage.from('audios').upload(path, blob, { contentType: mime, upsert: false });
    if (up.error) return toast(/bucket|not found/i.test(up.error.message) ? 'O áudio ainda não foi ativado no servidor.' : 'Não consegui enviar o áudio. Tente de novo.', 4500);
    await Social.sendMedia({ body: `🎤 Áudio (${fmt(dur)})`, kind: 'audio', media: path, duration: Math.round(dur * 10) / 10 });
  }
  $('btnMic').onclick = startRec;
  $('recCancel').onclick = () => stopRec(false);
  $('recSend').onclick = () => stopRec(true);
  // botão do microfone aparece quando a caixa de texto está vazia (como no WhatsApp)
  const syncComposer = () => { const empty = !$('chatInput').value.trim(); $('btnMic').classList.toggle('hidden', !empty); $('chatSend').classList.toggle('hidden', empty); };
  $('chatInput').addEventListener('input', syncComposer);

  // tocador de áudio dentro do balão
  let playing = null;
  async function playAudio(btn) {
    const path = btn.dataset.audio, bar = btn.parentElement.querySelector('.abar i'), time = btn.parentElement.querySelector('.atime');
    if (playing?.btn === btn) { playing.a.paused ? playing.a.play() : playing.a.pause(); return; }
    if (playing) { playing.a.pause(); playing.btn.textContent = '▶'; }
    btn.textContent = '…';
    const { data, error } = await sb.storage.from('audios').createSignedUrl(path, 3600);
    if (error) { btn.textContent = '▶'; return toast('Não consegui carregar o áudio.'); }
    const a = new Audio(data.signedUrl); playing = { a, btn };
    a.onplay = () => (btn.textContent = '❚❚'); a.onpause = () => (btn.textContent = '▶');
    a.ontimeupdate = () => { if (a.duration) { bar.style.width = (a.currentTime / a.duration * 100) + '%'; time.textContent = fmt(a.currentTime); } };
    a.onended = () => { btn.textContent = '▶'; bar.style.width = '0'; time.textContent = fmt(+btn.dataset.dur || 0); playing = null; };
    a.play().catch(() => { btn.textContent = '▶'; toast('Toque de novo para ouvir.'); });
  }
  $('chatList').addEventListener('click', e => { const b = e.target.closest('[data-audio]'); if (b) playAudio(b); });

  /* ---------------- conteúdo do balão ---------------- */
  function render(m) {
    const k = m.kind || 'text';
    if (k === 'sticker' && m.media) return `<img class="sticker" src="${esc(m.media)}" data-e="${esc(m.body)}" alt="${esc(m.body)}" loading="lazy">`;
    if (k === 'gif' && m.media) return `<img class="gif" src="${esc(m.media)}" alt="GIF" loading="lazy">`;
    if (k === 'audio' && m.media) {
      const d = m.duration || 0, bars = Array.from({ length: 22 }, (_, i) => `<b style="height:${30 + ((i * 37 + d * 13) % 60)}%"></b>`).join('');
      return `<div class="aplayer"><button class="aplay" data-audio="${esc(m.media)}" data-dur="${d}">▶</button><div class="abar"><i></i>${bars}</div><span class="atime">${fmt(d)}</span></div>`;
    }
    return richText(m.body || '');
  }
  const isMediaOnly = m => ['sticker', 'gif'].includes(m.kind) || ((m.kind || 'text') === 'text' && prefs().anim !== false && m.body && m.body.replace(EMO_RE, '').trim() === '' && (m.body.match(EMO_RE) || []).length <= 3);

  /* ---------------- toques (app aberto) ---------------- */
  let ac = null;
  const unlock = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} };
  document.addEventListener('pointerdown', unlock, { passive: true });
  function notes(seq, t0, type = 'triangle', vol = 0.18) {
    seq.forEach(([f, dt, len = 0.45]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(vol, t0 + dt + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dt + len);
      o.connect(g).connect(ac.destination); o.start(t0 + dt); o.stop(t0 + dt + len + 0.05);
    });
  }
  function playTone(id = prefs().tone, preview) {
    if (id === 'nenhum') return;
    if (preview) unlock();
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.02, C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5;
    if (id === 'curto') notes([[C5, 0], [E5, 0.11], [C6, 0.22, 0.5]], t);
    if (id === 'melodia') notes([[C5, 0], [E5, 0.18], [G5, 0.36], [C6, 0.54, 0.35], [A5, 0.8], [G5, 0.98], [E6, 1.2, 0.6], [C6, 1.5, 0.8]], t, 'triangle', 0.2);
    if (id === 'campainha') for (const r of [0, 1.1]) notes([[E6, r, 0.35], [C6, r + 0.18, 0.35], [E6, r + 0.36, 0.35], [C6, r + 0.54, 0.6]], t, 'sine', 0.22);
    navigator.vibrate?.(id === 'curto' ? 60 : [200, 120, 200, 120, 400]);
  }

  // menus que abrem a aparência
  $('chatLook').onclick = () => { $('chatMenuBox').classList.add('hidden'); openLook(); };
  $('btnLook').onclick = openLook;

  return { apply, render, isMediaOnly, playTone, syncComposer, openLook };
})();
window.ChatPlus = ChatPlus;
