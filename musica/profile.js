/* Refrão — perfil: avatar animado (personagem + fundo + aro + acessório), foto (só amigos veem),
 * recado e "estudando agora". Pensado para adolescentes: o avatar é o padrão (não expõe o rosto)
 * e a foto aparece só para amigos — quem não é amigo vê o avatar.
 * Usa de app.js: S, save, touch, $, esc, toast, sb, getSession, AUTH_KEY; Social; ChatPlus. */
'use strict';

const Profile = (() => {
  const CHARS = '🦊 🐼 🐨 🐯 🦁 🐸 🐵 🐶 🐱 🐰 🐻 🐧 🦄 🐲 🐙 🦋 🦉 🐢 👽 🤖 👾 👻 😎 🤓 🥳 🤠 😺 🌟 🌈 🔥 ⚡ 🍉 🍩 🧸 🎃 🌵'.split(' ');
  const BGS = {
    sunset: ['#ff7e5f', '#feb47b'], grape: ['#8b5cf6', '#ec4899'], ocean: ['#2563eb', '#06b6d4'], mint: ['#10b981', '#a7f3d0'],
    lemon: ['#facc15', '#fb923c'], night: ['#1e1b4b', '#6d28d9'], cherry: ['#e11d48', '#fb7185'], sky: ['#38bdf8', '#c4b5fd'],
    forest: ['#166534', '#65a30d'], candy: ['#f472b6', '#a78bfa']
  };
  const RINGS = [['none', 'Sem aro'], ['neon', 'Neon'], ['rainbow', 'Arco-íris'], ['gold', 'Dourado'], ['ice', 'Gelo']];
  const ACCS = ['', '🎧', '🎤', '👑', '🔥', '⭐', '🎸', '💖', '🎮', '🎵'];
  const DEFAULT = h => { const k = Object.keys(BGS), n = [...(h || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { emoji: CHARS[n % CHARS.length], bg: k[n % k.length], ring: 'none', acc: '' }; };
  const photoUrls = {}; // caminho -> link temporário (só abre para amigos)
  let mine = null, draft = null;

  const noto = e => `https://fonts.gstatic.com/s/e/notoemoji/latest/${[...e].map(c => c.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').join('_')}/512.webp`;
  // avatar em qualquer tamanho; com foto, mostra a foto se a pessoa puder ver (senão fica o personagem)
  function html(p, size = 42) {
    const a = Object.assign(DEFAULT(p?.handle), p?.avatar || {}), [c1, c2] = BGS[a.bg] || BGS.grape;
    const photo = a.photo ? ` data-photo="${esc(a.photo)}" data-v="${esc(a.v || '')}"` : '';
    const url = a.photo && photoUrls[a.photo + (a.v || '')];
    return `<span class="av ring-${esc(a.ring)}" style="--s:${size}px;--c1:${c1};--c2:${c2}"${photo}>`
      + (url ? `<img class="av-photo" src="${esc(url)}" alt="">` : `<img class="av-emo" src="${noto(a.emoji)}" data-e="${esc(a.emoji)}" alt="" loading="lazy">`)
      + (a.acc ? `<i class="av-acc">${esc(a.acc)}</i>` : '') + `</span>`;
  }
  // troca o personagem pela foto onde houver permissão (pede os links em lote)
  async function hydrate(root = document) {
    const els = [...root.querySelectorAll('.av[data-photo]')].filter(el => !el.querySelector('.av-photo'));
    if (!els.length || !window.sb) return;
    const need = [...new Set(els.map(el => el.dataset.photo + '|' + el.dataset.v))].filter(k => !(k.replace('|', '') in photoUrls));
    if (need.length) {
      const { data } = await sb.storage.from('avatars').createSignedUrls(need.map(k => k.split('|')[0]), 3600).catch(() => ({ data: [] }));
      need.forEach((k, i) => { const d = data?.[i]; photoUrls[k.replace('|', '')] = d && !d.error && d.signedUrl ? d.signedUrl + '&v=' + k.split('|')[1] : ''; });
    }
    for (const el of els) {
      const url = photoUrls[el.dataset.photo + el.dataset.v];
      if (url) { const emo = el.querySelector('.av-emo, .emo-txt'); const img = document.createElement('img'); img.className = 'av-photo'; img.src = url; img.alt = ''; emo ? emo.replaceWith(img) : el.prepend(img); }
    }
  }

  /* ---------------- meu perfil ---------------- */
  async function load() {
    const id = window.Social?.me?.id; if (!id) return null;
    const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    mine = data; return mine;
  }
  async function open() {
    if (!window.Social?.me) return toast('Entre na sua conta para editar o perfil.');
    show('profile');
    $('profPreview').innerHTML = '<div class="muted">Carregando…</div>';
    await load();
    if (!mine) return;
    draft = { name: mine.name, bio: mine.bio || '', avatar: Object.assign(DEFAULT(mine.handle), mine.avatar || {}), showSong: !!mine.now_playing || S.profileShowSong !== false };
    $('profName').value = draft.name; $('profBio').value = draft.bio; $('profSong').checked = draft.showSong;
    $('profHandle').textContent = '@' + mine.handle;
    renderEditor();
  }
  function renderEditor() {
    const a = draft.avatar;
    $('profPreview').innerHTML = html({ handle: mine.handle, avatar: a }, 120); hydrate($('profPreview'));
    $('profChars').innerHTML = CHARS.map(e => `<button class="pick ${a.emoji === e ? 'on' : ''}" data-emoji="${esc(e)}"><img src="${noto(e)}" data-e="${esc(e)}" alt="${esc(e)}" loading="lazy"></button>`).join('');
    $('profBgs').innerHTML = Object.entries(BGS).map(([k, [c1, c2]]) => `<button class="swatch round ${a.bg === k ? 'on' : ''}" data-bg="${k}" style="background:linear-gradient(135deg,${c1},${c2})" aria-label="${k}"></button>`).join('');
    $('profRings').innerHTML = RINGS.map(([k, n]) => `<button class="chip-opt ${a.ring === k ? 'on' : ''}" data-ring="${k}">${n}</button>`).join('');
    $('profAccs').innerHTML = ACCS.map(x => `<button class="pick acc ${a.acc === x ? 'on' : ''}" data-acc="${esc(x)}">${x || '∅'}</button>`).join('');
    $('profPhotoDel').classList.toggle('hidden', !a.photo);
    $('profPhotoBtn').textContent = a.photo ? '📷 Trocar foto' : '📷 Usar uma foto';
  }
  $('profile').addEventListener('click', e => {
    const t = e.target.closest('[data-emoji],[data-bg],[data-ring],[data-acc]'); if (!t || !draft) return;
    const a = draft.avatar;
    if (t.dataset.emoji) { a.emoji = t.dataset.emoji; a.photo = null; }   // escolher personagem tira a foto
    if (t.dataset.bg) a.bg = t.dataset.bg;
    if (t.dataset.ring) a.ring = t.dataset.ring;
    if ('acc' in t.dataset) a.acc = t.dataset.acc;
    renderEditor();
  });
  $('profRandom').onclick = () => {
    const pick = l => l[Math.floor(Math.random() * l.length)];
    Object.assign(draft.avatar, { emoji: pick(CHARS), bg: pick(Object.keys(BGS)), ring: pick(RINGS)[0], acc: pick(ACCS), photo: null });
    renderEditor();
  };
  // foto: recorte quadrado no aparelho, 400x400, e envio para a pasta da própria pessoa
  $('profPhotoBtn').onclick = () => $('profPhotoFile').click();
  $('profPhotoFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const img = await createImageBitmap(f), s = Math.min(img.width, img.height);
      const c = document.createElement('canvas'); c.width = c.height = 400;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 400, 400);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      toast('Enviando foto…', 1500);
      const path = `${mine.id}/avatar.jpg`;
      const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) return toast(/bucket|not found/i.test(up.error.message) ? 'A foto de perfil ainda não foi ativada no servidor.' : 'Não consegui enviar a foto.', 4500);
      draft.avatar.photo = path; draft.avatar.v = String(Date.now());
      photoUrls[path + draft.avatar.v] = URL.createObjectURL(blob);
      renderEditor(); toast('📷 Foto pronta! Só seus amigos veem — os outros veem seu avatar.', 4500);
    } catch (err) { toast('Não consegui usar essa foto. Tente outra.'); }
  };
  $('profPhotoDel').onclick = async () => {
    await sb.storage.from('avatars').remove([`${mine.id}/avatar.jpg`]).catch(() => {});
    draft.avatar.photo = null; renderEditor();
  };
  $('profSave').onclick = async () => {
    const name = $('profName').value.trim(), bio = $('profBio').value.trim(), err = $('profErr');
    err.textContent = '';
    if (name.length < 1 || name.length > 30) return err.textContent = 'Escreva um nome com até 30 letras.';
    if (window.temPalavrao?.(name) || window.temPalavrao?.(bio)) return err.textContent = 'Tem palavras não permitidas no nome ou no recado.';
    if (window.temLink?.(bio)) return err.textContent = 'Links não são permitidos no recado.';
    S.profileShowSong = $('profSong').checked; touch(); save();
    const { error } = await sb.from('profiles').update({ name, bio: bio || null, avatar: draft.avatar, now_playing: nowPlaying() }).eq('id', mine.id);
    if (error) return err.textContent = /column|schema cache/i.test(error.message) ? 'O perfil ainda não foi ativado no servidor.' : 'Não deu certo: ' + error.message;
    const sess = getSession(); if (sess) { sess.name = name; localStorage.setItem(AUTH_KEY, JSON.stringify(sess)); }
    toast('✅ Perfil salvo!'); window.Social?.refreshMe?.(); show('social'); window.Social?.refresh?.();
  };
  $('profBack').onclick = () => show('social');
  $('btnProfileSet').onclick = open;

  // "estudando agora": a música ativa, se a pessoa deixar
  const nowPlaying = () => { const s = S.songs[S.activeSongId]; return S.profileShowSong !== false && s ? `${s.title} — ${s.artist}`.slice(0, 120) : null; };
  let lastNp;
  async function syncNowPlaying() {
    if (!window.Social?.me || !window.sb) return;
    const np = nowPlaying(); if (np === lastNp) return; lastNp = np;
    await sb.from('profiles').update({ now_playing: np }).eq('id', Social.me.id).then(() => {}, () => {});
  }

  /* ---------------- ver o perfil de um amigo ---------------- */
  async function view(id) {
    const p = window.Social?.who(id); if (!p) return;
    const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    const q = data || p;
    $('viewAv').innerHTML = html(q, 110); hydrate($('viewAv'));
    $('viewName').textContent = q.name; $('viewHandle').textContent = '@' + q.handle;
    $('viewBio').textContent = q.bio || ''; $('viewBio').classList.toggle('hidden', !q.bio);
    $('viewSong').textContent = q.now_playing ? '🎵 Estudando agora: ' + q.now_playing : ''; $('viewSong').classList.toggle('hidden', !q.now_playing);
    $('viewSheet').classList.remove('hidden');
  }
  $('viewClose').onclick = () => $('viewSheet').classList.add('hidden');
  $('viewSheet').onclick = e => { if (e.target === $('viewSheet')) $('viewSheet').classList.add('hidden'); };
  $('viewDuet').onclick = () => { $('viewSheet').classList.add('hidden'); $('chatDuet').click(); };

  return { html, hydrate, open, view, syncNowPlaying, load };
})();
window.Profile = Profile;
