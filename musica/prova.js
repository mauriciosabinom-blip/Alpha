/* Refrão — Modo prova.
 * A frase aparece só em inglês (e é lida em voz alta). O aluno escreve ou fala
 * o que ela significa em português, e o app confere: acertou, faz sentido ou errou.
 * A conferência compara as palavras importantes com a tradução da frase,
 * aceitando erros de digitação, abreviações (vc, pra, tá…) e verbos parecidos.
 * Usa de app.js: S, $, esc, toast, save, touch, speak, bgStyle, markStudied, renderHome. */
'use strict';

const Prova = (() => {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const RIGHT = 0.75, CLOSE = 0.45;
  let size = 10, q = [], i = 0, results = [], rec = null, listening = false, checked = false;

  /* ---------- conferência ---------- */
  const STOP = new Set('o a os as um uma uns umas de do da dos das no na nos nas em e que se ao aos para por pelo pela com oh ah uh yeah hey la'.split(' '));
  const PRON = new Set('eu voce ele ela nos eles elas me te lhe mim ti meu minha seu sua'.split(' '));
  const SYN = {
    vc: 'voce', ce: 'voce', tu: 'voce', vcs: 'voces', pra: 'para', pro: 'para', pros: 'para', ta: 'esta', tah: 'esta', to: 'estou',
    tb: 'tambem', tbm: 'tambem', q: 'que', n: 'nao', num: 'nao', mt: 'muito', mto: 'muito', hj: 'hoje', cmg: 'comigo', ctg: 'contigo',
    tava: 'estava', tamo: 'estamos', baby: 'amor', bebe: 'amor', querida: 'amor', querido: 'amor', benzinho: 'amor', gata: 'amor', gato: 'amor',
    porque: 'por que', pq: 'por que', fala: 'diz', falar: 'dizer', diga: 'diz', fale: 'diz', falou: 'disse', jeito: 'assim', forma: 'assim', modo: 'assim',
    abandonar: 'desistir', largar: 'desistir', menina: 'garota', mina: 'garota', garoto: 'cara', menino: 'cara', mulher: 'garota',
    ok: 'tudo bem', blz: 'beleza', tchau: 'adeus', adeus: 'adeus', so: 'apenas', somente: 'apenas'
  };
  const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const toks = s => plain(s).split(' ').filter(Boolean).flatMap(w => (SYN[w] || w).split(' '));
  function lev(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let x = 1; x <= a.length; x++) {
      let prev = d[0]; d[0] = x;
      for (let y = 1; y <= b.length; y++) { const t = d[y]; d[y] = Math.min(d[y] + 1, d[y - 1] + 1, prev + (a[x - 1] === b[y - 1] ? 0 : 1)); prev = t; }
    }
    return d[b.length];
  }
  function like(a, b) {
    if (a === b) return true;
    const m = Math.min(a.length, b.length);
    if (m >= 4) { let k = 0; while (k < m && a[k] === b[k]) k++; if (k >= Math.max(4, m - 2)) return true; } // quero ~ queria, amando ~ amar
    return Math.max(a.length, b.length) >= 4 && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.75; // erro de digitação
  }
  // nota de 0 a 1 + quais palavras da resposta certa apareceram
  function grade(answer, ref) {
    const all = toks(ref);
    let R = all.filter(w => !STOP.has(w)); if (!R.length) R = all;
    const A0 = toks(answer); let A = A0.filter(w => !STOP.has(w)); if (!A.length) A = A0;
    if (!A.length || !R.length) return { score: 0, hits: new Set() };
    const used = new Set(), hits = new Set(); let got = 0, tot = 0;
    for (const r of R) {
      const w = PRON.has(r) ? 0.5 : 1; tot += w;           // em português o "eu" pode ficar implícito
      const j = A.findIndex((a, k) => !used.has(k) && like(a, r));
      if (j >= 0) { used.add(j); got += w; hits.add(r); }
    }
    const recall = got / tot, precision = used.size / A.length;
    return { score: Math.min(1, 0.75 * recall + 0.25 * precision), hits };
  }
  const verdictOf = sc => sc >= RIGHT ? 'ok' : sc >= CLOSE ? 'meio' : 'erro';
  const VERDICT = {
    ok: ['✅', 'Acertou!', 'É isso mesmo 🎉'],
    meio: ['🟡', 'Faz sentido', 'Chegou perto — compare com a tradução'],
    erro: ['❌', 'Não foi dessa vez', 'Veja a tradução e tente lembrar da próxima'],
    pulo: ['⏭', 'Resposta', 'Essa volta logo nos seus estudos']
  };

  /* ---------- abrir / montar a prova ---------- */
  const song = () => S.songs[S.activeSongId];
  function open() {
    const s = song(); if (!s) return;
    const usable = s.phrases.filter(p => p.pt && p.en);
    if (!usable.length) return toast('Essa música ainda não tem traduções para a prova.');
    $('exArt').style.cssText = bgStyle(s);
    $('exTitle').textContent = s.title; $('exArtist').textContent = s.artist;
    $('exBest').textContent = s.examBest ? `🏅 Sua melhor nota nessa música: ${s.examBest.pct}%` : 'Dica: estude algumas frases antes — a prova escolhe primeiro as que você já viu.';
    $('exSize').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', +b.dataset.n === size));
    $('exMic').classList.toggle('hidden', !SpeechRec);
    showPart('exIntro'); $('exCount').textContent = '';
    $('exam').classList.remove('hidden');
  }
  function showPart(id) {
    ['exIntro', 'exStage', 'exEnd'].forEach(x => $(x).classList.toggle('hidden', x !== id));
    $('exNextBar').classList.add('hidden');
  }
  function build() {
    const s = song(), seenPt = new Set();
    const shuf = a => a.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const ok = s.phrases.filter(p => p.pt && p.en && toks(p.en).length >= 2 && !seenPt.has(p.pt) && seenPt.add(p.pt));
    // primeiro as que você já estudou, depois as novas
    return [...shuf(ok.filter(p => p.seen)), ...shuf(ok.filter(p => !p.seen))].slice(0, size);
  }
  function start() {
    q = build(); i = 0; results = [];
    if (!q.length) return toast('Não achei frases com tradução nessa música.');
    showPart('exStage'); ask();
  }
  function ask() {
    const p = q[i]; checked = false;
    $('exCount').textContent = `${i + 1}/${q.length}`;
    $('exEn').textContent = p.en;
    $('exInput').value = ''; $('exInput').disabled = false;
    $('exAsk').classList.remove('hidden'); $('exResult').classList.add('hidden'); $('exNextBar').classList.add('hidden');
    $('exStage').scrollTop = 0;
    setTimeout(() => speak(p.en, 0.92), 250);
  }

  /* ---------- conferir ---------- */
  function check(skip) {
    if (checked) return;
    const p = q[i], ans = $('exInput').value.trim();
    if (!skip && !ans) { toast('Escreva ou fale a tradução — ou toque em "Não sei".'); $('exInput').focus(); return; }
    stopMic(); checked = true;
    const g = skip ? { score: 0, hits: new Set() } : grade(ans, p.pt);
    const v = skip ? 'pulo' : verdictOf(g.score);
    results.push({ p, ans, v, score: g.score });
    // efeito nos estudos: conta para a meta do dia; o que errou volta logo nos cartões
    const s = song(); touch(s);
    if (v === 'erro' || v === 'pulo') { if (p.seen) p.due = Date.now(); }
    markStudied(); save();
    const [ico, title, sub] = VERDICT[v];
    const ref = p.pt.split(/(\s+)/).map(t => {
      if (!/\S/.test(t)) return t;
      const k = toks(t); const hit = k.some(w => g.hits.has(w));
      return `<span class="${hit ? 'hit' : k.every(w => STOP.has(w)) ? '' : 'miss'}">${esc(t)}</span>`;
    }).join('');
    $('exResult').className = 'ex-result glass v-' + v;
    $('exResult').innerHTML = `<div class="ex-verdict"><span>${ico}</span><div><b>${title}</b><small>${esc(sub)}${skip ? '' : ` · ${Math.round(g.score * 100)}%`}</small></div></div>
      ${skip ? '' : `<div class="ex-lbl">Você disse</div><div class="ex-you">${esc(ans)}</div>`}
      <div class="ex-lbl">Tradução</div><div class="ex-ref">${ref}</div>`;
    $('exAsk').classList.add('hidden'); $('exResult').classList.remove('hidden');
    $('exNext').textContent = i + 1 < q.length ? 'Próxima ›' : 'Ver meu resultado 🏁';
    $('exNextBar').classList.remove('hidden');
    if (v === 'ok') navigator.vibrate?.(30);
  }
  function next() { if (++i < q.length) ask(); else finish(); }

  /* ---------- resultado: nota, estrelas e comemoração ---------- */
  const TIERS = [
    [95, '🏆', 'PERFEITO!', 'Nota máxima — você domina essa música!'],
    [85, '🤩', 'Excelente!', 'Mandou muito bem, quase gabaritou!'],
    [70, '🎉', 'Muito bem!', 'Você entende de verdade essa música.'],
    [50, '😄', 'Bom trabalho!', 'Mais da metade certa — tá evoluindo!'],
    [30, '💪', 'Bom começo!', 'Estude mais um pouco e tente de novo.'],
    [0, '🌱', 'Todo mundo começa assim!', 'Revise as frases nos cartões e volte aqui.']
  ];
  const fmtNota = pct => (Math.round(pct / 10 * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: pct % 10 ? 1 : 0, maximumFractionDigits: 1 });
  function fanfare(good) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [392, 523.25, 659.25];
      notes.forEach((f, k) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + k * 0.13;
        o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + (k === notes.length - 1 ? 0.9 : 0.3));
        o.start(t); o.stop(t + 1);
      });
      setTimeout(() => ac.close(), 1800);
    } catch (e) {}
  }
  function finish() {
    speechSynthesis?.cancel();
    const s = song(), pts = results.reduce((a, r) => a + (r.v === 'ok' ? 1 : r.v === 'meio' ? 0.5 : 0), 0);
    const pct = Math.round(pts / results.length * 100), nota = fmtNota(pct);
    const prev = s.examBest?.pct, best = prev == null || pct > prev;
    if (best) s.examBest = { pct, date: Date.now() };
    s.exams = [...(s.exams || []), { pct, n: results.length, date: Date.now() }].slice(-20);
    touch(s); save();
    const n = k => results.filter(r => r.v === k).length;
    const [, emo, title, sub] = TIERS.find(t => pct >= t[0]);
    const stars = Math.round(pct / 20);
    const cmp = prev == null ? '🎖 Sua primeira prova nessa música!' : pct > prev ? `🚀 Novo recorde! Antes: ${fmtNota(prev)}` : pct === prev ? `Igualou seu recorde (${fmtNota(prev)})` : `Seu recorde: ${fmtNota(prev)} — você consegue bater!`;
    const C = 2 * Math.PI * 70;
    $('exCount').textContent = '';
    $('exEnd').innerHTML = `
      <div class="ex-emo">${emo}</div>
      <div class="ex-ring"><svg viewBox="0 0 160 160"><defs><linearGradient id="exGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent2)"/></linearGradient></defs>
        <circle cx="80" cy="80" r="70" class="bg"/><circle cx="80" cy="80" r="70" class="fg" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <div class="ex-ring-in"><small>NOTA</small><b id="exNota">0</b><span id="exPct">0% de acerto</span></div></div>
      <div class="ex-stars">${[0, 1, 2, 3, 4].map(k => `<i class="${k < stars ? 'on' : ''}" style="animation-delay:${1.1 + k * 0.15}s">★</i>`).join('')}</div>
      <h2 class="ex-title">${title}</h2>
      <div class="muted">${sub}</div>
      <div class="ex-cmp ${best && prev != null ? 'rec' : ''}">${cmp}</div>
      <div class="ex-tally"><span>✅ ${n('ok')} certas</span><span>🟡 ${n('meio')} quase</span><span>❌ ${n('erro') + n('pulo')} erradas</span></div>
      <button class="btn primary big" id="exShare">📤 Compartilhar minha nota</button>
      <div class="row" style="margin-top:0"><button class="btn" id="exAgain">🔁 Nova prova</button><button class="btn" id="exDone">🏠 Início</button></div>
      <details class="ex-review glass"><summary>Ver as respostas (${results.length} frases)</summary>
        ${results.map(r => `<div class="ex-li"><span>${VERDICT[r.v][0]}</span><div><b>${esc(r.p.en)}</b><small>${esc(r.p.pt)}</small>${r.ans ? `<small class="you">Você: ${esc(r.ans)}</small>` : ''}</div></div>`).join('')}
        <div class="muted small" style="padding:8px 0 4px">As frases que você errou vão aparecer de novo nos seus estudos.</div></details>`;
    showPart('exEnd');
    // anel enche e a nota sobe contando
    requestAnimationFrame(() => { $('exEnd').querySelector('.fg').style.strokeDashoffset = C * (1 - pct / 100); });
    const t0 = performance.now(), dur = 1300;
    const tick = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = pct * e;
      if (!$('exNota')) return;
      $('exNota').textContent = k < 1 ? fmtNota(Math.round(v)) : nota; $('exPct').textContent = `${Math.round(v)}% de acerto`;
      if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => {
      fanfare(pct >= 50); navigator.vibrate?.(pct >= 70 ? [40, 60, 40] : 30);
      if (pct >= 95) window.confetti?.(['🏆', '⭐', '🎉', '💯', '🎵']);
      else if (pct >= 50) window.confetti?.(['🎉', '⭐', '📝', '✨']);
    }, dur);
    $('exAgain').onclick = start; $('exDone').onclick = close;
    $('exShare').onclick = () => window.openShare?.('exam', s, { score: nota, pct, n: results.length });
  }
  function close() {
    stopMic(); speechSynthesis?.cancel();
    $('exam').classList.add('hidden'); renderHome();
  }

  /* ---------- falar a resposta (reconhecimento de voz em português) ---------- */
  function stopMic() { if (rec) { try { rec.abort(); } catch (e) {} } rec = null; listening = false; $('exMic').textContent = '🎙 Falar'; $('exMic').classList.remove('rec'); }
  function mic() {
    if (listening) { try { rec.stop(); } catch (e) { stopMic(); } return; }
    if (!SpeechRec) return toast('Seu navegador não reconhece voz — escreva a resposta.');
    speechSynthesis?.cancel();
    rec = new SpeechRec(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = e => {
      let txt = ''; for (const r of e.results) txt += r[0].transcript;
      $('exInput').value = txt; if ([...e.results].every(r => r.isFinal)) finalText = txt;
    };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Libere o microfone para o Refrão nos ajustes do celular.', 4000); else if (e.error === 'no-speech') toast('Não ouvi nada — tente de novo, mais perto do celular.'); };
    rec.onend = () => { const had = listening; stopMic(); if (had && (finalText || $('exInput').value).trim()) check(); };
    try { rec.start(); listening = true; $('exMic').textContent = '⏹ Ouvindo… toque p/ parar'; $('exMic').classList.add('rec'); }
    catch (e) { stopMic(); toast('Não consegui usar o microfone agora.'); }
  }

  /* ---------- botões ---------- */
  $('btnExam').onclick = open;
  $('exClose').onclick = close;
  $('exGo').onclick = start;
  $('exSize').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; size = +b.dataset.n; $('exSize').querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); };
  $('exSpeak').onclick = () => q[i] && speak(q[i].en, 0.92);
  $('exSlow').onclick = () => q[i] && speak(q[i].en, 0.6);
  $('exCheck').onclick = () => check(false);
  $('exSkip').onclick = () => check(true);
  $('exNext').onclick = next;
  $('exMic').onclick = mic;
  $('exInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); check(false); } });

  return { open, grade };
})();
window.Prova = Prova;
