// Refrão — filtro de palavrões e termos de baixo calão (chat e nomes de usuário).
// A mesma lista é aplicada no servidor (supabase.sql), então não dá para burlar pelo app.
// Para acrescentar palavras: inclua aqui E rode no Supabase:
//   insert into public.blocked_words (word) values ('palavra') on conflict do nothing;
window.REFRAO_BLOCKED = [
  // português
  'porra', 'caralho', 'karalho', 'buceta', 'boceta', 'puta', 'puto', 'putaria', 'puteiro', 'merda', 'bosta',
  'foder', 'foda', 'fodase', 'fodasse', 'fodido', 'fodida', 'fudido', 'fudida', 'cu', 'cuzao', 'cuzinho',
  'arrombado', 'arrombada', 'viado', 'viadinho', 'bicha', 'corno', 'corna', 'otario', 'otaria', 'babaca',
  'imbecil', 'retardado', 'retardada', 'vagabundo', 'vagabunda', 'piranha', 'vadia', 'cacete', 'piroca',
  'xota', 'xoxota', 'punheta', 'punheteiro', 'siririca', 'broxa', 'desgracado', 'desgracada', 'filhodaputa',
  'fdp', 'vsf', 'vtnc', 'tnc', 'pqp', 'krl', 'crl', 'prr', 'puta que pariu', 'vai se foder', 'vai tomar no cu',
  'filho da puta', 'toma no cu',
  // inglês
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick',
  'cock', 'pussy', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'wtf', 'stfu'
];
(function () {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@4]/g, m => ({ '0': 'o', '@': 'a', '4': 'a' }[m])).replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/[5$]/g, 's').replace(/7/g, 't');
  const squeeze = s => s.replace(/(.)\1+/g, '$1');
  const words = new Set(), phrases = [];
  for (const w of window.REFRAO_BLOCKED) {
    const n = norm(w);
    if (n.includes(' ')) phrases.push(squeeze(n.replace(/\s+/g, '')));
    else { words.add(n); words.add(squeeze(n)); }
  }
  // true se o texto tiver palavrão (palavra inteira, também com letras repetidas, números ou acentos)
  window.temPalavrao = text => {
    const n = norm(text || '');
    const toks = n.split(/[^a-z]+/).filter(Boolean);
    if (toks.some(t => words.has(t) || words.has(squeeze(t)))) return true;
    // letras separadas ("f u c k", "p.o.r.r.a") viram uma palavra só
    const spaced = (n.match(/(?:^|[^a-z])[a-z](?:[^a-z]+[a-z](?![a-z])){2,}/g) || []).map(m => squeeze(m.replace(/[^a-z]/g, '')));
    if (spaced.some(w => words.has(w))) return true;
    const glued = squeeze(toks.join(''));
    return phrases.some(p => glued.includes(p));
  };
  window.temLink = text => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|br|net|org|io|app|me|ly|tv)\b)/i.test(text || '');
})();
