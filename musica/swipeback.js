/* Refrão — arrastar para a direita para voltar (como no WhatsApp / iPhone).
 * Vale para toda tela que tem botão ← ou ✕, menos os cartões de estudo
 * (lá arrastar para os lados já significa "entendi" / "ainda não").
 * Na prova e no karaokê, só na tela de início/resultado — nunca no meio. */
'use strict';

(() => {
  const vis = id => !$(id).classList.contains('hidden');
  const TARGETS = [
    ['pick', 'pickBack'], ['confirm', 'confirmBack'], ['lyrics', 'lyricsBack'], ['settings', 'settingsBack'],
    ['social', 'socialBack'], ['chat', 'chatBack'], ['profile', 'profBack'],
    ['exam', 'exClose', () => vis('exIntro') || vis('exEnd')],
    ['karaoke', null, () => vis('kIntro'), el => el.querySelector('.kclose')]
  ];
  const SKIP = 'input,textarea,select,[contenteditable],#emojiPanel,.menu,audio,video,iframe,.no-swipe,.seg,.crop-stage';

  for (const [id, backId, when, getBtn] of TARGETS) {
    const el = $(id); if (!el) continue;
    const btn = () => getBtn ? getBtn(el) : $(backId);
    let x0 = null, y0 = 0, dx = 0, mode = null;
    el.addEventListener('touchstart', e => {
      x0 = null;
      if (e.touches.length !== 1 || e.target.closest(SKIP) || (when && !when()) || !btn()) return;
      if (document.querySelector('.sheet-backdrop:not(.hidden)') || window.Tour?.running) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (x0 === null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!mode) { if (Math.abs(mx) < 12 && Math.abs(my) < 12) return; mode = mx > 0 && Math.abs(mx) > Math.abs(my) * 1.4 ? 'back' : 'scroll'; }
      if (mode !== 'back') return;
      dx = Math.max(0, mx);
      el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; el.style.boxShadow = '-20px 0 40px #0008';
    }, { passive: true });
    const end = () => {
      if (x0 === null) return; x0 = null;
      if (mode !== 'back') return;
      const go = dx > Math.min(120, innerWidth * 0.3);
      el.style.transition = 'transform .22s ease-out';
      el.style.transform = go ? `translateX(${innerWidth}px)` : '';
      setTimeout(() => { el.style.transition = ''; el.style.transform = ''; el.style.boxShadow = ''; if (go) btn()?.click(); }, go ? 200 : 230);
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
})();
