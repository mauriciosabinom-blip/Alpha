// Configuração do login (Supabase).
// Preencha com os dados do seu projeto: Supabase → Project Settings → API.
// Enquanto estiver vazio, o app funciona sem login (como antes).
// A "anon/publishable key" é pública por natureza — pode ficar aqui sem problema.
window.REFRAO_CONFIG = {
  supabaseUrl: 'https://khpterapkxaispzorsav.supabase.co',
  supabaseKey: 'sb_publishable_3AjjP7ROnX0df4hzGZufDA_M52XUs6H',
  // Opcional: chave gratuita da "YouTube Data API v3" (Google Cloud). Deixa a busca
  // automática do vídeo 100% confiável. Vazio = usa espelhos públicos gratuitos do YouTube.
  youtubeKey: '',
  // Opcional: chave gratuita do GIPHY (developers.giphy.com) para a aba de GIFs do chat.
  // O app só pede GIFs com classificação "G" (livre para todas as idades).
  giphyKey: ''
};
