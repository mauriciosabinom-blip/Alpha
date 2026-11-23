/* Refrão — tour de boas-vindas.
 * Na primeira vez que a pessoa chega na tela inicial (já com uma música escolhida),
 * um passo a passo ilumina cada parte do app e explica o que ela faz.
 * Pode ser revisto em Ajustes → "Ver o tour do app de novo".
 * Usa de app.js: S, $, save, show, current. */
'use strict';

const Tour = (() => {
  const DEMO = `<div class="coach-demo"><div class="coach-card">I want it that way<small>Eu quero assim</small></div><div class="coach-hand">👆</div></div>`;
  const STEPS = [
    { html: `<div class="tour-big">👋</div><h3>Bem-vindo ao Refrão!</h3><p>Você vai aprender inglês com as músicas que gosta, frase por frase. Em 30 segundos te mostro como tudo funciona.</p>`, btn: 'Bora ver' },
    { el: '#hero .vinyl-wrap', html: `<h3>🎵 Sua música</h3><p>Essa é a música que você está estudando. A barra colorida mostra quanto você já aprendeu dela.</p>` },
    { el: '#hero .seg', html: `<h3>Como as frases aparecem</h3><p><b>🎵 Na ordem</b>: segue a música do começo ao fim.<br><b>📖 Decorar letra</b>: a letra inteira, verso a verso, para cantar de cor.<br><b>🔀 Aleatória</b>: mistura e repete mais as que você erra.</p>` },
    { el: '#btnStudy', html: `<h3>▶ Estudar agora</h3><p>Abre os cartões: a frase em inglês com a tradução embaixo. A cada vez que você acerta, <b>mais palavras da tradução somem</b> — até você entender só pelo inglês.</p>` },
    { html: `${DEMO}<h3>Arraste para responder</h3><p><b class="g">→ Arraste para a direita</b> se entendeu a frase.<br><b class="r">← Arraste para a esquerda</b> se ainda não pegou — ela volta logo.<br>Também dá para usar os botões ✓ e ✗, tocar numa palavra para ver o significado e em 🔊 para ouvir.</p>` },
    { el: '.actions .row', html: `<h3>📜 Letra · 🎤 Karaokê · 🎵 Trocar</h3><p>Veja a <b>letra completa</b> traduzida, cante no <b>karaokê</b> e ganhe uma nota de pronúncia, ou <b>troque de música</b> quando quiser.</p>` },
    { el: '#btnExam', html: `<h3>📝 Modo prova</h3><p>Hora de se testar: a frase aparece <b>só em inglês</b>. Você escreve ou <b>fala</b> a tradução, e o Refrão diz se você <b>acertou</b>, se <b>faz sentido</b> ou se errou.</p>` },
    { el: '#home .panel', html: `<h3>🎯 Meta do dia</h3><p>Quantas frases você treinou hoje. Estude todo dia para manter o <b>🔥 foguinho</b> de dias seguidos lá em cima.</p>` },
    { el: '#btnSocial', html: `<h3>💬 Amigos</h3><p>Adicione amigos pelo @, converse e cante <b>dueto no karaokê</b>.</p>` },
    { el: '#btnSettings', html: `<h3>⚙️ Ajustes</h3><p>Mude a meta do dia, a voz, os avisos e a sua assinatura. Dá para rever este tour por lá.</p>` },
    { html: `<div class="tour-big">🎧</div><h3>Prontinho!</h3><p>Toque em <b>▶ Estudar agora</b> e comece. Bons estudos!</p>`, btn: 'Começar a estudar' }
  ];
  let root = null, step = 0, running = false, pend = false;

  const visible = el => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const busy = () => ['card', 'karaoke', 'exam', 'paywall'].some(id => $(id) && !$(id).classList.contains('hidden')) || document.body.classList.contains('locked');

  function maybe() {
    if (running || S.tourDone || pend) return;
    pend = true;
    // espera a tela assentar (o 1º cartão abre sozinho logo depois de escolher a música)
    setTimeout(() => {
      pend = false;
      if (running || S.tourDone || current !== 'home' || busy() || !S.songs[S.activeSongId]) return;
      start();
    }, 1600);
  }
  function start() {
    if (running) return;
    running = true; step = 0;
    root = document.createElement('div'); root.id = 'tour';
    root.innerHTML = `<div class="tour-spot"></div><div class="tour-pop" role="dialog" aria-live="polite"><div class="tour-body"></div>
      <div class="tour-foot"><button class="linkbtn tour-skip">Pular tour</button><span class="tour-dots"></span><button class="btn primary tour-next">Próximo ›</button></div></div>`;
    document.body.appendChild(root);
    root.querySelector('.tour-skip').onclick = finish;
    root.querySelector('.tour-next').onclick = () => go(step + 1);
    addEventListener('resize', place);
    go(0);
  }
  function go(n) {
    // pula passos cujo elemento não está na tela
    while (n < STEPS.length && STEPS[n].el && !visible(document.querySelector(STEPS[n].el))) n++;
    if (n >= STEPS.length) return finish();
    step = n;
    const s = STEPS[n], last = n === STEPS.length - 1;
    root.querySelector('.tour-body').innerHTML = s.html;
    root.querySelector('.tour-next').textContent = s.btn || (last ? 'Começar' : 'Próximo ›');
    root.querySelector('.tour-skip').classList.toggle('hidden', last);
    root.querySelector('.tour-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('');
    const pop = root.querySelector('.tour-pop'); pop.classList.remove('in'); void pop.offsetWidth;
    const el = s.el && document.querySelector(s.el);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(place, 380); } else place();
  }
  function place() {
    if (!root) return;
    const s = STEPS[step], el = s.el && document.querySelector(s.el);
    const spot = root.querySelector('.tour-spot'), pop = root.querySelector('.tour-pop');
    const W = innerWidth, H = innerHeight;
    if (!el) {
      Object.assign(spot.style, { left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px' });
      pop.style.top = Math.max(16, (H - pop.offsetHeight) / 2) + 'px';
    } else {
      const r = el.getBoundingClientRect(), pad = 8;
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const ph = pop.offsetHeight, below = r.bottom + pad + 14, above = r.top - pad - 14 - ph;
      pop.style.top = (below + ph <= H - 12 ? below : above >= 12 ? above : Math.max(12, H - ph - 12)) + 'px';
    }
    pop.classList.add('in');
  }
  function finish() {
    running = false; S.tourDone = true; save();
    removeEventListener('resize', place);
    root?.remove(); root = null; scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('btnTour').onclick = () => { show('home'); setTimeout(start, 300); };

  return { maybe, start, get running() { return running; } };
})();
window.Tour = Tour;
