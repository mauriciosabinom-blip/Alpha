/* Refrão — 🎤 karaokê online com um amigo (dueto).
 * Convite: mensagem no chat ("🎤 Convite para cantar junto — Música · sala abc12345").
 * Sala: canal em tempo real do Supabase (broadcast). Quem convida envia a música (vídeo + tempos
 * dos versos), os dois ficam "prontos", quem convidou começa e a música toca junto nos dois aparelhos.
 * Cada um canta no próprio microfone; no fim aparece o placar com as duas notas de pronúncia.
 * Usa: sb, Social, S, $, esc, toast, autoFindVideo, ensureTimes, ytTried, kTimeline, kEnsurePlayer,
 *      startKaraoke, startMic, kShow, bgStyle e as variáveis do karaokê (kSong, kLines, kPlayer, kRec). */
'use strict';

const Duet = (() => {
  const INV = /^🎤 Convite para cantar junto(?: — (.+?))? · sala ([a-z0-9]{8})$/;
  const EXPIRE_MS = 30 * 60e3;
  let room = null, ch = null, role = null, friend = null, payload = null, meReady = false, peerReady = false, peerIn = false, myScore = null, peerScore = null;
  const name = id => '@' + (window.Social?.who(id)?.handle || 'amigo');
  const myHandle = () => '@' + (getSession()?.handle || 'você');

  function lobby() {
    $('karaoke').classList.remove('hidden'); kShow('kDuet');
    $('dTitle').textContent = kSong ? kSong.title : 'Preparando…';
    $('dArtist').textContent = kSong ? kSong.artist : '';
    if (kSong) $('kArt').style.cssText = bgStyle(kSong);
    $('dWith').textContent = `Dueto com ${name(friend)}`;
    $('dMe').innerHTML = `${meReady ? '✅' : '⏳'} Você${meReady ? ' está pronto' : ''}`;
    $('dPeer').innerHTML = `${peerReady ? '✅' : peerIn ? '⏳' : '📨'} ${esc(name(friend))} ${peerReady ? 'está pronto' : peerIn ? 'entrou na sala' : 'ainda não entrou'}`;
    $('dReady').classList.toggle('hidden', meReady || !kReady || !kSong);
    $('dStart').classList.toggle('hidden', role !== 'host' || !meReady);
    $('dStart').disabled = !peerReady;
    $('dWait').textContent = role === 'guest' && meReady ? `Esperando ${name(friend)} começar…` : !kSong ? 'Recebendo a música…' : '';
  }
  async function connect() {
    ch = sb.channel('duet-' + room, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'hello' }, () => { peerIn = true; if (role === 'host') send('song', payload); lobby(); })
      .on('broadcast', { event: 'song' }, async ({ payload: p }) => { if (role !== 'guest' || kSong) return; peerIn = true; await loadSong(p); })
      .on('broadcast', { event: 'ready' }, () => { peerIn = peerReady = true; lobby(); })
      .on('broadcast', { event: 'start' }, ({ payload: p }) => { if (role === 'guest') startKaraoke(p.delay); })
      .on('broadcast', { event: 'score' }, ({ payload: p }) => { peerScore = p.score; renderDuel(); })
      .on('broadcast', { event: 'bye' }, () => { if (room) toast(`${name(friend)} saiu da sala`, 3500); peerIn = peerReady = false; if (!$('kDuet').classList.contains('hidden')) lobby(); });
    await new Promise(res => ch.subscribe(st => { if (st === 'SUBSCRIBED') res(); if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { toast('Não consegui conectar na sala. Verifique a internet.'); res(); } }));
    send('hello', {});
  }
  const send = (event, p) => ch?.send({ type: 'broadcast', event, payload: p });
  async function loadSong(p) {
    payload = p;
    const song = { id: 'duet-' + room, title: p.title, artist: p.artist, cover: p.cover || null, palette: p.palette || null, yt: p.yt,
      phrases: p.phrases.map((x, i) => ({ id: 'd' + i, en: x.en, times: x.times })) };
    kSong = song; kLines = kTimeline(song); lobby();
    await kEnsurePlayer(song.yt.id); lobby();
  }

  return {
    isInvite: body => INV.test(body || ''),
    inviteHtml(m, mine) {
      const [, title, r] = (m.body.match(INV) || []);
      const old = Date.now() - new Date(m.created_at).getTime() > EXPIRE_MS;
      const action = old ? '<span class="muted small">Convite expirado</span>'
        : mine ? '<span class="muted small">Convite enviado 🎶</span>'
        : `<button class="btn primary sm" data-join="${esc(r)}">🎤 Entrar na sala</button>`;
      return `<div class="invite"><b>🎤 ${mine ? 'Você convidou para cantar junto' : 'Convite para cantar junto!'}</b>${title ? `<span>${esc(title)}</span>` : ''}${action}</div>`;
    },
    async invite(friendId) {
      const song = S.songs[S.activeSongId];
      if (!song) return toast('Escolha uma música primeiro 🎵');
      toast('🔎 Preparando a música para o dueto…');
      if (!song.yt && !ytTried.has(song.id)) await autoFindVideo(song);
      await ensureTimes(song, true);
      const phrases = song.phrases.filter(p => p.times?.length).map(p => ({ en: p.en, times: p.times }));
      if (!song.yt || phrases.length < 2) return toast('Essa música não dá para cantar online (sem vídeo ou sem letra sincronizada). Tente outra.', 4500);
      room = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
      // o nome da música pode ter palavra bloqueada no chat — aí manda o convite sem o nome
      const ok = await Social.send(`🎤 Convite para cantar junto — ${song.title} · sala ${room}`) || await Social.send(`🎤 Convite para cantar junto · sala ${room}`);
      if (!ok) { room = null; return; }
      role = 'host'; friend = friendId; meReady = peerReady = peerIn = false; myScore = peerScore = null;
      payload = { title: song.title, artist: song.artist, cover: song.cover || null, palette: song.palette || null, yt: { id: song.yt.id, offset: song.yt.offset || 0 }, phrases };
      kSong = song; kLines = kTimeline(song); lobby();
      await kEnsurePlayer(song.yt.id); await connect(); lobby();
    },
    async join(r, friendId) {
      if (room === r) return lobby();
      role = 'guest'; room = r; friend = friendId; payload = null; kSong = null; meReady = peerReady = false; peerIn = true; myScore = peerScore = null;
      lobby(); await connect();
    },
    // "Estou pronto" é um toque: libera microfone e som no iPhone
    ready() {
      if (!kSong) return;
      meReady = true; if (!kRec) startMic();
      try { kPlayer.playVideo(); setTimeout(() => { try { kPlayer.pauseVideo(); kPlayer.seekTo(0, true); } catch (e) {} }, 350); } catch (e) {}
      send('ready', {}); lobby();
    },
    start() { if (role !== 'host' || !peerReady) return; send('start', { delay: 3500 }); startKaraoke(3500); },
    onFinish(score) { if (!room) return; myScore = score; send('score', { score }); renderDuel(); },
    leave() { if (!room) return; send('bye', {}); if (ch) sb.removeChannel(ch); ch = null; room = null; role = null; $('kDuel').innerHTML = ''; },
    again() { meReady = peerReady = false; myScore = peerScore = null; $('kDuel').innerHTML = ''; lobby(); },
    get active() { return !!room; }
  };
  function renderDuel() {
    if (!room || myScore == null) return;
    const them = name(friend);
    $('kDuel').innerHTML = peerScore == null
      ? `<div class="duel glass">⏳ Esperando a nota de ${esc(them)}…</div>`
      : `<div class="duel glass"><div class="duel-row"><div><b>${myScore}</b><span>você</span></div><div class="vs">×</div><div><b>${peerScore}</b><span>${esc(them)}</span></div></div>
         <div class="duel-msg">${myScore > peerScore ? '🏆 Você venceu o dueto!' : myScore < peerScore ? `🏆 ${esc(them)} venceu — revanche?` : '🤝 Empate!'}</div></div>`;
    if (peerScore != null && myScore > peerScore) confetti(['🏆', '🎤', '✨']);
  }
})();
window.Duet = Duet;
$('dReady').onclick = () => Duet.ready();
$('dStart').onclick = () => Duet.start();
