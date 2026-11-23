/* Refrão — progresso de estudo salvo na conta (tabela user_state no Supabase).
 * Assim as músicas, níveis, sequência 🔥 e notas ficam iguais no Safari, no ícone da Tela de Início,
 * no iPhone e no iPad. Junção por música: vale a versão mais recente de cada uma.
 * Usa de app.js: S, save, defaults, sb, current, session, renderHome, renderLyrics, toast. */
'use strict';

const Sync = (() => {
  let uid = null, timer = null, lastPull = 0, pending = null, busy = false;

  // junta o progresso deste aparelho com o da conta
  function merge(local, cloud) {
    if (!cloud || !cloud.songs) return local;
    const hasLocal = local && Object.keys(local.songs || {}).length;
    if (!hasLocal && !(local?.resetAt > (cloud.resetAt || 0))) {
      // aparelho ainda sem músicas: fica com a conta, mas sem perder os dias estudados aqui
      return { ...defaults(), ...cloud, days: [...new Set([...(cloud.days || []), ...(local?.days || [])])].sort().slice(-800) };
    }
    const newer = (cloud.updatedAt || 0) > (local.updatedAt || 0) ? cloud : local;
    const out = { ...defaults(), ...newer, settings: { ...defaults().settings, ...newer.settings } };
    const resetAt = Math.max(local.resetAt || 0, cloud.resetAt || 0);
    out.resetAt = resetAt;
    out.songs = {};
    for (const src of [cloud.songs || {}, local.songs || {}]) {
      for (const [id, s] of Object.entries(src)) {
        if ((s.touched || s.addedAt || 0) < resetAt) continue; // apagado em "Apagar tudo"
        const cur = out.songs[id];
        if (!cur || (s.touched || 0) >= (cur.touched || 0)) out.songs[id] = s;
      }
    }
    if (!out.songs[out.activeSongId]) out.activeSongId = Object.keys(out.songs)[0] || null;
    out.words = { ...(cloud.words || {}), ...(local.words || {}) };
    const seen = new Set(); out.karaoke = [...(cloud.karaoke || []), ...(local.karaoke || [])]
      .filter(k => { const key = k.songId + k.date; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.date - b.date);
    // dias estudados: junta as listas dos dois lados (nenhum dia se perde)
    out.days = [...new Set([...(cloud.days || []), ...(local.days || [])])].sort().slice(-800);
    const [sa, sb2] = [local.streak || {}, cloud.streak || {}];
    out.streak = (sa.last || '') >= (sb2.last || '') ? sa : sb2;
    const [da, dc] = [local.daily || {}, cloud.daily || {}];
    out.daily = da.date === dc.date ? { ...da, done: Math.max(da.done || 0, dc.done || 0), chosen: da.chosen || dc.chosen } : ((da.date || '') > (dc.date || '') ? da : dc);
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function pull(force) {
    if (!uid || busy || (!force && Date.now() - lastPull < 20e3)) return;
    busy = true; lastPull = Date.now();
    try {
      const { data, error } = await sb.from('user_state').select('data').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      const merged = merge(S, data?.data || null);
      if (!same(merged, S)) apply(merged);
      if (!data || !same(merged, data.data)) await sb.from('user_state').upsert({ user_id: uid, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    } catch (e) { /* sem conexão ou tabela ainda não criada: tenta de novo depois */ }
    finally { busy = false; }
  }
  // troca o progresso na tela; se um cartão estiver aberto, espera ele fechar
  function apply(merged) {
    if (session) { pending = merged; return; }
    S = merged; localStorage.setItem(STORE_KEY, JSON.stringify(S));
    if (current === 'home') renderHome(); else if (current === 'lyrics') renderLyrics();
  }
  // antes de salvar na conta, sempre junta com o que já está lá (nunca sobrescreve progresso mais novo)
  async function push() {
    if (!uid) return;
    const { data, error: e1 } = await sb.from('user_state').select('data').eq('user_id', uid).maybeSingle();
    if (e1) throw e1;
    const merged = merge(S, data?.data || null);
    if (!same(merged, S)) apply(merged);
    if (data && same(merged, data.data)) return;
    const { error } = await sb.from('user_state').upsert({ user_id: uid, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  }
  function schedule() {
    if (!uid) return;
    clearTimeout(timer);
    timer = setTimeout(() => push().catch(() => {}), 2500);
  }
  document.addEventListener('visibilitychange', () => {
    if (!uid) return;
    if (document.hidden) { clearTimeout(timer); push().catch(() => {}); }
    else pull();
  });
  setInterval(() => { if (pending && !session) { const p = pending; pending = null; apply(p); } }, 1500);

  return {
    start(sess) { uid = sess?.user?.id || null; if (uid) pull(true); },
    stop() { uid = null; clearTimeout(timer); },
    schedule, merge,
    // "Apagar tudo": apaga também na conta (e nos outros aparelhos)
    reset() { if (!uid) return; S.resetAt = Date.now(); push().catch(() => {}); }
  };
})();
window.Sync = Sync;
if (window.__socialSession) Sync.start(window.__socialSession);
