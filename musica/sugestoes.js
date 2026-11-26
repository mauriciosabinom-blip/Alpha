/* Refrão — sugestões de amizade (faixa no topo da tela inicial) e 🔔 pedidos recebidos.
 * Quem aparece: 1º quem estuda as mesmas músicas, depois os mais ativos (ordem feita no servidor:
 * função sugestoes_amizade em supabase.sql). Nunca: amigos, pedidos pendentes e recusados recentes.
 * Recusar é silencioso: quem pediu não é avisado.
 * Usa de app.js: sb, $, esc, toast, current; e Social (social.js). */
'use strict';

const Sugestoes = (() => {
  const HIDE_KEY = 'refrao.sugHide', HIDE_DAYS = 7, REFETCH_MS = 10 * 60e3;
  let list = [], sent = {}, loadedAt = 0, loading = false, busy = false;

  const me = () => window.Social?.me;
  const hiddenUntil = () => { try { return +localStorage.getItem(HIDE_KEY) || 0; } catch (e) { return 0; } };
  const isHidden = () => hiddenUntil() > Date.now();
  const firstName = p => (p.name || p.handle || '').trim().split(/\s+/)[0];
  const avatar = (p, size) => window.Profile ? Profile.html(p, size) : Social.avatar(p, size);
  const incoming = () => (window.Social?.friendships || []).filter(f => f.status === 'pending' && f.addressee === me()?.id);
  // tira da faixa quem já virou amigo ou me mandou pedido (aparece no 🔔)
  function prune() {
    const fs = window.Social?.friendships || [];
    list = list.filter(p => !fs.some(f => (f.requester === p.id || f.addressee === p.id) && (f.status === 'accepted' || f.addressee === me()?.id)));
    // pedido feito por aqui ou pela busca 🔎: mostra "Pedido enviado"; cancelado na tela de amigos: volta "Conectar"
    for (const p of list) sent[p.id] = fs.some(f => f.addressee === p.id && f.status === 'pending');
  }

  async function load(force) {
    if (!me() || !window.sb || loading || isHidden()) return;
    if (!force && Date.now() - loadedAt < (list.length ? REFETCH_MS : 60e3)) return;
    loading = true;
    try {
      const { data, error } = await sb.rpc('sugestoes_amizade', { p_limite: 10 });
      if (error) throw error;
      list = data || []; sent = {}; prune();
    } catch (e) { /* sem conexão ou banco ainda sem a função: a faixa só não aparece */ }
    finally { loading = false; loadedAt = Date.now(); }
    render();
  }

  /* ---------- faixa de sugestões ---------- */
  function render() {
    const box = $('suggest');
    if (!me() || isHidden() || !list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="sug-head"><span>Pessoas que você pode conhecer</span><button class="sug-x" data-sughide aria-label="Esconder sugestões">✕</button></div>
      <div class="sug-row">${list.map(p => `<div class="sug-card">${avatar(p, 42)}<b class="ell" title="@${esc(p.handle)}">${esc(firstName(p))}</b>
        ${sent[p.id] ? `<button class="sug-btn sent" data-sugcancel="${esc(p.id)}" aria-label="Pedido enviado — toque para cancelar">Pedido enviado</button>`
          : `<button class="sug-btn" data-sugadd="${esc(p.id)}">Conectar</button>`}</div>`).join('')}</div>`;
    window.Profile?.hydrate(box);
  }
  $('suggest').onclick = async e => {
    const t = e.target.closest('[data-sughide],[data-sugadd],[data-sugcancel]'); if (!t || busy) return;
    if ('sughide' in t.dataset) {
      try { localStorage.setItem(HIDE_KEY, Date.now() + HIDE_DAYS * 864e5); } catch (err) {}
      render(); toast('Sugestões escondidas por alguns dias.'); return;
    }
    busy = true;
    const id = t.dataset.sugadd || t.dataset.sugcancel;
    try {
      if (t.dataset.sugadd) {
        sent[id] = true; render();                      // muda na hora; desfaz se der erro
        const st = await Social.request(id);
        if (st === 'accepted') { list = list.filter(p => p.id !== id); Social.accepted(); }
      } else {
        delete sent[id]; render();
        await Social.cancelRequest(id);
      }
      Social.refresh().catch(() => {});
    } catch (err) {
      if (t.dataset.sugadd) delete sent[id]; else sent[id] = true;
      toast(Social.errText(err));
    } finally { busy = false; render(); }
  };

  /* ---------- 🔔 pedidos recebidos ---------- */
  function renderBell() {
    const n = me() ? incoming().length : 0;
    $('btnBell').classList.toggle('hidden', !me());
    const b = $('bellBadge'); b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n);
    if (!$('bellPanel').classList.contains('hidden')) renderPanel();
  }
  function renderPanel() {
    const reqs = incoming();
    $('bellPanel').innerHTML = `<h4>Pedidos de amizade</h4>` + (reqs.length ? reqs.map(f => { const p = Social.who(f.requester);
      return `<div class="bell-item">${avatar(p, 40)}<div class="pinfo"><b class="ell">${esc(p.name)}</b><span class="muted small ell">@${esc(p.handle)}</span></div>
        <button class="btn primary sm" data-bellok="${f.id}">Aceitar</button><button class="btn sm" data-bellno="${f.id}">Recusar</button></div>`; }).join('')
      : `<div class="muted small">Nenhum pedido por aqui.</div>`);
    window.Profile?.hydrate($('bellPanel'));
  }
  const closePanel = () => $('bellPanel').classList.add('hidden');
  $('btnBell').onclick = e => {
    e.stopPropagation();
    const p = $('bellPanel'); p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) { renderPanel(); Social.refresh().catch(() => {}); }
  };
  $('bellPanel').onclick = e => {
    e.stopPropagation();
    const t = e.target.closest('[data-bellok],[data-bellno]'); if (!t) return;
    const ok = !!t.dataset.bellok;
    Social.act(async () => { await Social.respond(t.dataset.bellok || t.dataset.bellno, ok); if (ok) Social.accepted(); })
      .then(() => { if (!incoming().length) closePanel(); });
  };
  document.addEventListener('click', e => { if (!e.target.closest('#bellPanel')) closePanel(); });

  return {
    // chamado pelo social.js sempre que a lista de amizades muda (e ao entrar/sair da conta)
    sync() {
      if (!me()) { list = []; sent = {}; closePanel(); render(); renderBell(); return; }
      prune(); renderBell();
      if (current === 'home') { list.length ? render() : load(); }
    },
    // chamado ao abrir a tela inicial
    onHome() { if (me()) { load(); render(); } },
    renderBell
  };
})();
window.Sugestoes = Sugestoes;
Sugestoes.sync();
