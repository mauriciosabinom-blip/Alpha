/* Refrão — notificações de mensagem nova.
 * App fechado/tela bloqueada: notificação do sistema com o toque padrão do aparelho
 * (enviada pela função "notify" do Supabase — ver notify.ts e supabase.sql).
 * App aberto: um jingle musical curto (3 notas), gerado aqui mesmo, sem arquivo de áudio.
 * No iPhone/iPad, notificação de app web só funciona com o Refrão aberto pelo ícone
 * da Tela de Início (iOS 16.4+). Usa de app.js: sb, CFG, $, toast, getSession; Social. */
'use strict';

const Push = (() => {
  const FN = CFG.supabaseUrl ? CFG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/notify' : null;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  async function currentSub() { try { const r = await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch (e) { return null; } }

  // 'on' | 'off' | 'denied' | 'install' (iPhone fora do ícone) | 'unsupported' | 'nologin'
  async function state() {
    if (!sb || !getSession()) return 'nologin';
    if (isIOS && !standalone()) return 'install';
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return (Notification.permission === 'granted' && await currentSub()) ? 'on' : 'off';
  }
  const TEXT = {
    on: '✅ Ativadas — você recebe um aviso a cada mensagem nova.',
    off: 'Receba um aviso no celular quando chegar mensagem, mesmo com o app fechado.',
    denied: isAndroid
      ? '🚫 Bloqueadas. Para ativar: toque no cadeado 🔒 ao lado do endereço (ou ⋮ → Configurações do site) → Notificações → Permitir. Se instalou o app: Configurações do Android → Apps → Refrão → Notificações.'
      : isIOS ? '🚫 Bloqueadas nos ajustes do aparelho. Para ativar: Ajustes do iPhone → Notificações → Refrão.'
      : '🚫 Bloqueadas neste navegador. Clique no cadeado 🔒 ao lado do endereço e permita as notificações.',
    install: '📲 No iPhone/iPad, os avisos só funcionam com o Refrão instalado: toque em Compartilhar ⬆️ → “Adicionar à Tela de Início”, abra pelo ícone e entre na sua conta.',
    unsupported: isIOS ? 'Este aparelho não recebe notificações. No iPhone/iPad, use iOS 16.4 ou mais novo e o Refrão pelo ícone da Tela de Início.'
      : 'Este navegador não recebe notificações. No Android, use o Chrome (ou o app instalado).',
    nologin: ''
  };
  async function render() {
    const st = await state();
    $('pushBox').classList.toggle('hidden', st === 'nologin');
    $('pushStatus').textContent = TEXT[st];
    $('pushBtn').classList.toggle('hidden', !(st === 'on' || st === 'off'));
    $('pushBtn').textContent = st === 'on' ? '🔕 Desativar avisos' : '🔔 Ativar avisos de mensagem';
    // convite discreto na tela de amigos enquanto não estiver ativado
    $('pushBanner').classList.toggle('hidden', !(st === 'off' || st === 'install'));
    $('pushBannerText').textContent = st === 'install' ? 'Quer ser avisado de mensagens novas? Instale o Refrão na Tela de Início.' : 'Quer ser avisado quando chegar mensagem?';
    $('pushBannerBtn').textContent = st === 'install' ? 'Como instalar' : '🔔 Ativar';
    return st;
  }
  async function enable() {
    const st = await state();
    if (st === 'install' || st === 'unsupported' || st === 'denied') { toast(TEXT[st], 7000); return; }
    // pedir permissão precisa ser direto no toque
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Sem permissão, não dá para avisar. Dá para mudar depois nos Ajustes do aparelho.', 5000); return render(); }
    try {
      const { publicKey } = await (await fetch(FN)).json();
      if (!publicKey) throw new Error('sem chave');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
      const j = sub.toJSON();
      const { error } = await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      if (error) throw error;
      toast('🔔 Pronto! Você vai ser avisado quando chegar mensagem.', 4000);
    } catch (e) {
      toast('Não consegui ativar os avisos agora. Verifique a internet e tente de novo.', 5000);
    }
    render();
  }
  async function disable() {
    const sub = await currentSub();
    if (sub) { try { await sb.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} }
    toast('🔕 Avisos de mensagem desativados'); render();
  }
  // ao sair da conta: este aparelho para de receber avisos dela
  async function forget() { const sub = await currentSub(); if (sub && sb) { try { await sb.rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); } catch (e) {} } }

  /* ---------- jingle musical (app aberto) ---------- */
  let ac = null;
  const unlock = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} };
  document.addEventListener('pointerdown', unlock, { passive: true });
  function chime() {
    if (window.ChatPlus) return ChatPlus.playTone();
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + 0.02;
    // dó – mi – sol (oitava acima), como um acorde arpejado
    [[523.25, 0], [659.25, 0.11], [1046.5, 0.22]].forEach(([f, dt]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(0.18, t0 + dt + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dt + 0.5);
      o.connect(g).connect(ac.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.55);
    });
    navigator.vibrate?.(30);
  }

  /* ---------- abrir a conversa ao tocar na notificação ---------- */
  async function openChatWhenReady(id) {
    for (let i = 0; i < 40 && !window.Social?.me; i++) await new Promise(r => setTimeout(r, 250));
    if (!window.Social?.me) return;
    await Social.refresh().catch(() => {});
    Social.openChat(id);
  }
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.openChat) openChatWhenReady(e.data.openChat); });
  const startChat = new URLSearchParams(location.search).get('chat');
  if (startChat) { history.replaceState(null, '', location.pathname); if (getSession()) openChatWhenReady(startChat); }
  // ao abrir o app, limpa o número do ícone e as notificações já vistas
  const clearBadge = () => { if (document.hidden) return; navigator.clearAppBadge?.().catch(() => {}); navigator.serviceWorker?.ready.then(r => r.getNotifications()).then(ns => ns.forEach(n => n.close())).catch(() => {}); };
  document.addEventListener('visibilitychange', clearBadge); clearBadge();

  /* ---------- convite (tela nossa antes da janela do iPhone, que só pode aparecer uma vez) ----------
   * 'start': logo depois de criar a conta / primeiro acesso nesta versão
   * 'friend': de novo, uma única vez, ao fazer o primeiro amigo — se antes a pessoa disse "Agora não" */
  const askKey = r => `refrao.notifAsk:${getSession()?.handle}:${r}`;
  async function maybeAsk(reason) {
    if (!sb || !getSession() || localStorage.getItem(askKey(reason))) return;
    if (reason === 'friend' && !localStorage.getItem(askKey('start'))) return;
    if ((typeof session !== 'undefined' && session) || !$('karaoke').classList.contains('hidden')) { setTimeout(() => maybeAsk(reason), 4000); return; } // não atrapalha o estudo
    const st = await state();
    if (st !== 'off' && st !== 'install') return;
    localStorage.setItem(askKey(reason), String(Date.now()));
    const install = st === 'install';
    $('notifIcon').textContent = install ? '📲' : '🔔🎵';
    $('notifTitle').textContent = install ? 'Instale o Refrão no seu iPhone' : reason === 'friend' ? 'Seu amigo pode te chamar!' : 'Quer ser avisado das mensagens?';
    $('notifText').textContent = install
      ? 'Assim ele vira um app de verdade na sua tela e pode te avisar quando chegar mensagem.'
      : 'Quando um amigo te mandar mensagem ou te chamar para cantar, o Refrão te avisa — mesmo com o app fechado.';
    $('notifSteps').classList.toggle('hidden', !install);
    $('notifYes').textContent = install ? 'Entendi' : '🔔 Ativar avisos';
    $('notifNo').classList.toggle('hidden', install);
    $('notifSheet').dataset.mode = install ? 'install' : 'ask';
    $('notifSheet').classList.remove('hidden');
  }
  $('notifYes').onclick = () => { $('notifSheet').classList.add('hidden'); if ($('notifSheet').dataset.mode === 'ask') enable(); };
  $('notifNo').onclick = () => { $('notifSheet').classList.add('hidden'); toast('Tudo bem! Dá para ativar depois em ⚙️ Ajustes.', 3500); };

  /* ---------- instalar o app ----------
   * Android/Chrome: o próprio navegador oferece "Instalar app" (beforeinstallprompt).
   * iPhone/iPad: só pelo Safari → Compartilhar → Adicionar à Tela de Início (mostramos o passo a passo). */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; renderInstall(); toast('📲 Refrão instalado! Abra pelo ícone na sua tela.', 4500); });
  const canInstall = () => !standalone() && (!!installEvt || isIOS);
  function renderInstall() { $('installBox')?.classList.toggle('hidden', !canInstall()); }
  async function install() {
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); if (r?.outcome === 'accepted') installEvt = null; renderInstall(); return; }
    if (isIOS) { // passo a passo do iPhone
      $('notifIcon').textContent = '📲'; $('notifTitle').textContent = 'Instale o Refrão no seu iPhone';
      $('notifText').textContent = 'Assim ele vira um app de verdade na sua tela e pode te avisar quando chegar mensagem.';
      $('notifSteps').classList.remove('hidden'); $('notifYes').textContent = 'Entendi'; $('notifNo').classList.add('hidden');
      $('notifSheet').dataset.mode = 'install'; $('notifSheet').classList.remove('hidden'); return;
    }
    toast(isAndroid ? 'No Chrome: toque em ⋮ (menu) → “Instalar app” ou “Adicionar à tela inicial”.' : 'No navegador, use o menu → “Instalar Refrão”.', 6000);
  }
  if ($('installBtn')) $('installBtn').onclick = install;
  renderInstall();

  $('pushBtn').onclick = async () => ((await state()) === 'on' ? disable() : enable());
  $('pushBannerBtn').onclick = enable;
  return { render, enable, forget, chime, state, maybeAsk, install, isAndroid, isIOS };
})();
window.Push = Push;
Push.render();
