/* Refrão — acesso: teste grátis de 15 minutos e assinatura (liberada manualmente após o Pix).
 * Quem decide é o servidor (função my_access); o relógio do celular não conta.
 * Enquanto o servidor ainda não tiver a função (antes de rodar o SQL), o app fica liberado.
 * Usa de app.js: sb, $, esc, toast, getSession, session, endSession, AUTH_KEY. */
'use strict';

const Access = (() => {
  const WHATS = '5547988495202';
  const CACHE = () => 'refrao.access:' + (getSession()?.handle || '');
  let st = null, skew = 0, timer = null, tick = null;
  const salesUrl = plano => `assinar/?u=${encodeURIComponent(getSession()?.handle || '')}${plano ? '&plano=' + plano : ''}#pagar`;
  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR');

  async function check() {
    if (!window.sb || !getSession()) return;
    try {
      const { data, error } = await sb.rpc('my_access');
      if (error) {
        // função ainda não criada no servidor: não bloqueia ninguém
        if (/my_access|schema cache|PGRST202|does not exist/i.test(error.message + error.code)) { st = null; return apply(); }
        throw error;
      }
      if (!data) return;
      st = data; skew = new Date(data.now).getTime() - Date.now();
      try { localStorage.setItem(CACHE(), JSON.stringify(data)); } catch (e) {}
    } catch (e) {
      // sem internet: usa a última situação conhecida
      try { st = JSON.parse(localStorage.getItem(CACHE())); } catch (e2) { st = null; }
      if (st?.status === 'trial' && Date.now() + skew > new Date(st.trial_ends).getTime()) st.status = 'expired';
      if (st?.status === 'active' && st.paid_until && Date.now() > new Date(st.paid_until).getTime()) st.status = 'expired';
    }
    apply();
  }
  const minsLeft = () => Math.max(0, Math.ceil((new Date(st.trial_ends).getTime() - (Date.now() + skew)) / 60000));
  function apply() {
    const status = st?.status;
    // contador do teste na tela inicial
    $('trialChip').classList.toggle('hidden', status !== 'trial');
    clearInterval(tick);
    if (status === 'trial') {
      const upd = () => {
        const m = minsLeft();
        $('trialChip').innerHTML = `<span class="tb-t">${m > 0 ? `⏳ Teste grátis: <b>${m} min</b> restantes` : '⏳ Teste grátis terminando…'}</span><span class="tb-go">Ver planos →</span>`;
        if (m <= 0) { clearInterval(tick); check(); }
      };
      upd(); tick = setInterval(upd, 15000);
    }
    // situação nos Ajustes
    $('planStatus').innerHTML = status === 'active'
      ? (st.plan === 'cortesia' ? '⭐ Acesso liberado (cortesia)' : `⭐ Plano <b>${esc(st.plan)}</b> ativo até <b>${fmtDate(st.paid_until)}</b>`)
      : status === 'trial' ? `⏳ Teste grátis: faltam ${minsLeft()} min` : status === 'expired' ? '🔒 Teste encerrado — assine para continuar' : '';
    // bloqueio
    const lock = status === 'expired';
    $('paywall').classList.toggle('hidden', !lock);
    document.body.classList.toggle('locked', lock);
    if (lock) {
      if (typeof session !== 'undefined' && session) endSession();
      $('pwUser').textContent = '@' + (getSession()?.handle || '');
      $('pwTitle').textContent = st.paid_until ? 'Sua assinatura venceu' : 'Seu teste grátis terminou';
      clearInterval(timer); timer = setInterval(check, 60000); // destrava sozinho quando você liberar
    } else { clearInterval(timer); timer = status === 'trial' ? setInterval(check, 120000) : null; }
  }

  // tela de bloqueio
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pw-plan]'); if (!b) return;
    window.open(salesUrl(b.dataset.pwPlan), '_blank', 'noopener');
  });
  $('pwCheck').onclick = async () => {
    $('pwCheck').disabled = true; $('pwCheck').textContent = 'Verificando…';
    await check();
    $('pwCheck').disabled = false; $('pwCheck').textContent = '🔄 Já paguei — verificar agora';
    if (st?.status === 'active') toast('✅ Assinatura ativada! Bons estudos 🎧', 4500);
    else toast('Ainda não foi liberado. Depois que o comprovante for conferido, o app destrava sozinho.', 5000);
  };
  $('pwWhats').onclick = () => {
    const msg = `Olá! Quero assinar o Refrão. Meu @usuário é: @${getSession()?.handle || ''}`;
    window.open(`https://wa.me/${WHATS}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };
  $('pwLogout').onclick = () => $('btnLogout').click();
  $('trialChip').onclick = () => window.open(salesUrl(), '_blank', 'noopener');
  $('btnPlans').onclick = e => { e.preventDefault(); window.open(salesUrl(), '_blank', 'noopener'); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && getSession()) check(); });

  return { check, get status() { return st?.status || null; } };
})();
window.Access = Access;
if (window.__socialSession) Access.check();
