/* Refrão — rede social: amigos e chat (só texto).
 * Servidor: Supabase (tabelas profiles, friendships, messages — ver supabase.sql).
 * Regras garantidas no servidor: só amigos conversam, sem links, sem palavrões.
 * Tempo real: novas mensagens e pedidos de amizade chegam na hora.
 * Usa de app.js: sb, $, esc, toast, show, current, toHandle, getSession, temPalavrao, temLink. */
'use strict';

const Social = (() => {
  let me = null, live = null, friendships = [], profiles = {}, lastByFriend = {}, unread = {}, chatWith = null, chatMsgs = [], busy = false;
  const fmtTime = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = iso => { const d = new Date(iso), t = new Date(); const y = new Date(Date.now() - 864e5);
    return d.toDateString() === t.toDateString() ? 'Hoje' : d.toDateString() === y.toDateString() ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
  const other = f => f.requester === me.id ? f.addressee : f.requester;
  const who = id => profiles[id] || { handle: '…', name: '…' };
  const initials = p => (p.name || p.handle || '?').trim()[0].toUpperCase();
  const avatar = p => `<span class="avatar" style="--h:${[...(p.handle || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${esc(initials(p))}</span>`;
  const errText = e => {
    const m = e?.message || '';
    if (/Links não são permitidos|linguagem imprópria|Nome não permitido/.test(m)) return m;
    if (/row-level security/.test(m)) return 'Vocês precisam ser amigos para conversar.';
    if (/duplicate key|unique/.test(m)) return 'Já existe um pedido de amizade entre vocês.';
    if (/fetch|network|Failed/i.test(m)) return 'Sem conexão com a internet.';
    return 'Não deu certo agora. Tente de novo.';
  };

  /* ---------- dados ---------- */
  async function loadProfiles(ids) {
    const need = [...new Set(ids)].filter(id => id && !profiles[id]);
    if (!need.length) return;
    const { data } = await sb.from('profiles').select('id,handle,name').in('id', need);
    (data || []).forEach(p => profiles[p.id] = p);
  }
  async function refresh() {
    if (!me) return;
    const [fr, ms] = await Promise.all([
      sb.from('friendships').select('*').order('created_at', { ascending: false }),
      sb.from('messages').select('id,sender,receiver,body,created_at,read_at').order('created_at', { ascending: false }).limit(300)
    ]);
    if (fr.error || ms.error) throw fr.error || ms.error;
    friendships = fr.data || [];
    lastByFriend = {}; unread = {};
    for (const m of ms.data || []) {
      const f = m.sender === me.id ? m.receiver : m.sender;
      if (!lastByFriend[f]) lastByFriend[f] = m;
      if (m.receiver === me.id && !m.read_at) unread[f] = (unread[f] || 0) + 1;
    }
    await loadProfiles(friendships.map(other));
    renderBadge();
    if (current === 'social') renderSocial();
  }
  function renderBadge() {
    const n = Object.values(unread).reduce((a, b) => a + b, 0) + friendships.filter(f => f.status === 'pending' && f.addressee === me?.id).length;
    const b = $('socialBadge'); b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n);
  }

  /* ---------- tempo real ---------- */
  function subscribe(session) {
    sb.realtime.setAuth(session.access_token);
    live = sb.channel('me-' + me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver=eq.${me.id}` }, p => onMessage(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, async p => {
        const f = p.new && p.new.id ? p.new : null;
        if (p.eventType === 'INSERT' && f?.addressee === me.id) { await loadProfiles([f.requester]); toast(`👋 @${who(f.requester).handle} quer ser seu amigo`, 4000); }
        if (p.eventType === 'UPDATE' && f?.status === 'accepted' && f.requester === me.id) { await loadProfiles([f.addressee]); toast(`🤝 @${who(f.addressee).handle} aceitou sua amizade`, 4000); }
        refresh().catch(() => {});
      })
      .subscribe();
  }
  async function onMessage(m) {
    await loadProfiles([m.sender]);
    lastByFriend[m.sender] = m;
    if (current === 'chat' && chatWith === m.sender) {
      chatMsgs.push(m); renderChat(true);
      sb.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(() => {});
    } else {
      unread[m.sender] = (unread[m.sender] || 0) + 1; renderBadge();
      if (current === 'social') renderSocial();
      const preview = window.Duet?.isInvite(m.body) ? '🎤 te convidou para cantar junto!' : m.body.slice(0, 60);
      toast(`💬 @${who(m.sender).handle}: ${preview}`, 4500);
    }
  }

  /* ---------- tela: amigos e conversas ---------- */
  function renderSocial() {
    const sess = getSession();
    $('socialMe').innerHTML = me
      ? `${avatar({ handle: sess.handle, name: sess.name })}<div><b>${esc(sess.name)}</b><div class="muted small">Seu usuário: <b>@${esc(sess.handle)}</b> — passe para seus amigos te acharem</div></div>`
      : '';
    $('socialOff').classList.toggle('hidden', !!me);
    $('socialOn').classList.toggle('hidden', !me);
    if (!me) return;
    const incoming = friendships.filter(f => f.status === 'pending' && f.addressee === me.id);
    const outgoing = friendships.filter(f => f.status === 'pending' && f.requester === me.id);
    const friends = friendships.filter(f => f.status === 'accepted').map(other)
      .sort((a, b) => (lastByFriend[b]?.created_at || '').localeCompare(lastByFriend[a]?.created_at || ''));
    $('socialRequests').innerHTML = incoming.length ? `<h4>Pedidos de amizade</h4>` + incoming.map(f => { const p = who(f.requester);
      return `<div class="person glass">${avatar(p)}<div class="pinfo"><b>${esc(p.name)}</b><span class="muted small">@${esc(p.handle)}</span></div>
        <button class="btn primary sm" data-accept="${f.id}">Aceitar</button><button class="btn sm" data-del="${f.id}" aria-label="Recusar">✕</button></div>`; }).join('') : '';
    $('socialFriends').innerHTML = `<h4>Conversas</h4>` + (friends.length ? friends.map(id => { const p = who(id), last = lastByFriend[id], n = unread[id] || 0;
      const prev = last ? (window.Duet?.isInvite(last.body) ? '🎤 Convite para cantar' : (last.sender === me.id ? 'Você: ' : '') + last.body) : 'Diga oi! 👋';
      return `<button class="person glass chatrow" data-chat="${esc(id)}">${avatar(p)}<div class="pinfo"><b>${esc(p.name)} <span class="muted small">@${esc(p.handle)}</span></b>
        <span class="muted small ell">${esc(prev)}</span></div>${last ? `<span class="muted small">${fmtTime(last.created_at)}</span>` : ''}${n ? `<span class="badge">${n}</span>` : ''}</button>`; }).join('')
      : `<div class="empty-social muted">Nenhum amigo ainda. Busque alguém pelo @usuário aqui em cima 🔎</div>`);
    $('socialSent').innerHTML = outgoing.length ? `<h4>Pedidos enviados</h4>` + outgoing.map(f => { const p = who(f.addressee);
      return `<div class="person glass">${avatar(p)}<div class="pinfo"><b>${esc(p.name)}</b><span class="muted small">@${esc(p.handle)} · aguardando</span></div>
        <button class="btn sm" data-del="${f.id}">Cancelar</button></div>`; }).join('') : '';
  }
  let searchTimer = null;
  async function search(q) {
    const h = toHandle(q), box = $('socialResults');
    if (h.length < 2) { box.innerHTML = ''; return; }
    const { data, error } = await sb.from('profiles').select('id,handle,name').ilike('handle', h + '%').neq('id', me.id).order('handle').limit(8);
    if (error) { box.innerHTML = `<div class="muted small">${esc(errText(error))}</div>`; return; }
    (data || []).forEach(p => profiles[p.id] = p);
    box.innerHTML = (data || []).length ? data.map(p => {
      const f = friendships.find(x => other(x) === p.id);
      const action = !f ? `<button class="btn primary sm" data-add="${p.id}">Adicionar</button>`
        : f.status === 'accepted' ? `<button class="btn sm" data-chat="${p.id}">Conversar</button>`
        : f.addressee === me.id ? `<button class="btn primary sm" data-accept="${f.id}">Aceitar</button>` : `<span class="muted small">pedido enviado</span>`;
      return `<div class="person glass">${avatar(p)}<div class="pinfo"><b>${esc(p.name)}</b><span class="muted small">@${esc(p.handle)}</span></div>${action}</div>`;
    }).join('') : `<div class="muted small center">Ninguém com @${esc(h)}…</div>`;
  }
  async function act(fn) { if (busy) return; busy = true; try { await fn(); await refresh(); } catch (e) { toast(errText(e)); } finally { busy = false; } }

  /* ---------- tela: conversa ---------- */
  async function openChat(id) {
    chatWith = id; const p = who(id);
    $('chatTitle').innerHTML = `${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted small">@${esc(p.handle)}</div></div>`;
    $('chatList').innerHTML = '<div class="muted small center">Carregando…</div>'; $('chatWarn').textContent = '';
    show('chat');
    const { data, error } = await sb.from('messages').select('id,sender,receiver,body,created_at,read_at')
      .or(`and(sender.eq.${me.id},receiver.eq.${id}),and(sender.eq.${id},receiver.eq.${me.id})`).order('created_at', { ascending: true }).limit(300);
    if (chatWith !== id) return;
    if (error) { $('chatList').innerHTML = `<div class="muted small center">${esc(errText(error))}</div>`; return; }
    chatMsgs = data || []; renderChat(true);
    if (unread[id]) {
      await sb.from('messages').update({ read_at: new Date().toISOString() }).eq('sender', id).eq('receiver', me.id).is('read_at', null);
      unread[id] = 0; renderBadge();
    }
  }
  function renderChat(scroll) {
    let day = '';
    $('chatList').innerHTML = chatMsgs.length ? chatMsgs.map(m => {
      const d = fmtDay(m.created_at), sep = d !== day ? `<div class="daysep">${d}</div>` : ''; day = d;
      const mine = m.sender === me.id;
      const inner = window.Duet?.isInvite(m.body) ? window.Duet.inviteHtml(m, mine) : esc(m.body);
      return `${sep}<div class="bubble ${mine ? 'mine' : ''}">${inner}<span class="time">${fmtTime(m.created_at)}${mine && m.read_at ? ' ✓✓' : ''}</span></div>`;
    }).join('') : `<div class="empty-social muted">Comecem a conversa! Só texto — sem links nem palavrões 🙂</div>`;
    if (scroll) { const l = $('chatList'); l.scrollTop = l.scrollHeight; }
  }
  async function send(text, silent) {
    const body = (text ?? $('chatInput').value).trim();
    if (!body || !chatWith) return false;
    const warn = $('chatWarn');
    if (window.temLink?.(body)) { warn.textContent = '🚫 Links não são permitidos no chat — só texto.'; return false; }
    if (window.temPalavrao?.(body)) { warn.textContent = '🚫 Essa mensagem tem palavras não permitidas.'; return false; }
    warn.textContent = '';
    if (!silent) $('chatInput').value = '';
    const { data, error } = await sb.from('messages').insert({ sender: me.id, receiver: chatWith, body }).select().single();
    if (error) { warn.textContent = '🚫 ' + errText(error); if (!silent) $('chatInput').value = body; return false; }
    chatMsgs.push(data); lastByFriend[chatWith] = data; renderChat(true);
    return true;
  }

  /* ---------- eventos ---------- */
  $('btnSocial').onclick = () => { show('social'); renderSocial(); if (me) refresh().catch(() => {}); };
  $('socialBack').onclick = () => show('home');
  $('socialRelogin').onclick = () => { localStorage.removeItem('refrao.auth'); location.reload(); };
  $('socialSearch').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(e.target.value), 300); };
  $('social').onclick = e => {
    const t = e.target.closest('[data-add],[data-accept],[data-del],[data-chat]'); if (!t) return;
    if (t.dataset.add) act(async () => {
      const id = t.dataset.add;
      const rev = friendships.find(f => f.requester === id && f.addressee === me.id);
      const r = rev ? await sb.from('friendships').update({ status: 'accepted' }).eq('id', rev.id) : await sb.from('friendships').insert({ requester: me.id, addressee: id });
      if (r.error) throw r.error; toast(rev ? '🤝 Agora vocês são amigos!' : '✓ Pedido de amizade enviado'); $('socialSearch').value = ''; $('socialResults').innerHTML = '';
    });
    if (t.dataset.accept) act(async () => { const r = await sb.from('friendships').update({ status: 'accepted' }).eq('id', t.dataset.accept); if (r.error) throw r.error; toast('🤝 Agora vocês são amigos!'); $('socialResults').innerHTML = ''; });
    if (t.dataset.del) act(async () => { const r = await sb.from('friendships').delete().eq('id', t.dataset.del); if (r.error) throw r.error; });
    if (t.dataset.chat) openChat(t.dataset.chat);
  };
  $('chatBack').onclick = () => { chatWith = null; show('social'); renderSocial(); };
  $('chatForm').onsubmit = e => { e.preventDefault(); send(); };
  $('chatInput').oninput = () => { $('chatWarn').textContent = ''; };
  $('chatMenu').onclick = () => $('chatMenuBox').classList.toggle('hidden');
  $('chatUnfriend').onclick = () => {
    $('chatMenuBox').classList.add('hidden');
    const f = friendships.find(x => other(x) === chatWith); if (!f) return;
    if (!confirm(`Desfazer a amizade com @${who(chatWith).handle}? Vocês não poderão mais trocar mensagens.`)) return;
    act(async () => { const r = await sb.from('friendships').delete().eq('id', f.id); if (r.error) throw r.error; chatWith = null; show('social'); toast('Amizade desfeita'); });
  };
  $('chatDuet').onclick = () => { $('chatMenuBox').classList.add('hidden'); window.Duet?.invite(chatWith); };
  $('chatList').onclick = e => { const b = e.target.closest('[data-join]'); if (b) window.Duet?.join(b.dataset.join, chatWith); };

  return {
    async start(session) {
      if (!session || !sb) { me = null; $('socialBadge').classList.add('hidden'); return; }
      if (me?.id === session.user.id) return;
      me = { id: session.user.id };
      try { subscribe(session); await refresh(); } catch (e) { /* sem conexão: tenta de novo ao abrir a tela */ }
      sb.auth.onAuthStateChange((ev, s) => { if (s?.access_token) sb.realtime.setAuth(s.access_token); });
    },
    stop() { if (live) sb.removeChannel(live); live = null; me = null; },
    send: (text) => send(text, true),
    get me() { return me; }, who, openChat, refresh
  };
})();
window.Social = Social;
// o app pode ter conectado a conta antes deste arquivo carregar
if (window.__socialSession !== undefined) Social.start(window.__socialSession);
