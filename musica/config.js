// Configuração do login (Supabase).
// Preencha com os dados do seu projeto: Supabase → Project Settings → API.
// Enquanto estiver vazio, o app funciona sem login (como antes).
// A "anon/publishable key" é pública por natureza — pode ficar aqui sem problema.
window.REFRAO_CONFIG = {
  supabaseUrl: 'https://khpterapkxaispzorsav.supabase.co',
  supabaseKey: 'sb_publishable_3AjjP7ROnX0df4hzGZufDA_M52XUs6H',
  // Chave da "YouTube Data API v3" (Google Cloud, projeto refrao-515811).
  // É pública por natureza, mas está travada: só funciona a partir de
  // https://mauriciosabinom-blip.github.io/* e só para a API do YouTube.
  // Se a cota grátis do dia acabar, o app usa os espelhos públicos sozinho.
  youtubeKey: 'AIzaSyCxeBwAIkJBgHqtNPKydC-NMsVnoeu9qbs',
  // Opcional: chave gratuita do GIPHY (developers.giphy.com) para a aba de GIFs do chat.
  // O app só pede GIFs com classificação "G" (livre para todas as idades).
  giphyKey: ''
};
