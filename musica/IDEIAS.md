# Refrão — ideias para as próximas versões

Registrado em 20/11/2026. **Status em 22/11/2026: as 4 ideias foram programadas e publicadas** (ver ✅ em cada uma).

## 1. Rede social própria com chat ✅ feito
*Amigos (buscar pelo @usuário, pedir/aceitar), chat só de texto em tempo real, links e palavrões bloqueados no servidor.*
O próprio Refrão vira um meio de comunicação entre os usuários.
- Usuários se encontram dentro do app e conversam por chat.
- Conexões entre colegas (adicionar amigo).
- **Depende de:** login ativo (Supabase — já preparado, falta configurar).
- **Como fazer:** Supabase Realtime (mensagens em tempo real), plano gratuito.
- **Pontos de atenção:** moderação/denúncia de mensagens, privacidade, regras para menores de idade.

## 2. Karaokê com nota de pronúncia ✅ feito
*Botão 🎤 Karaokê: letra sincronizada, reconhecimento de fala do aparelho, nota 0–100 por verso, histórico.*
A pessoa ouve a música, vê a letra e canta junto.
- Letra sincronizada destacando o verso atual (já temos os tempos de cada frase via lrclib).
- Áudio da música pelo YouTube (busca automática já existe no 🎤).
- Grava o que a pessoa canta e, no fim, dá uma **nota de pronúncia** — não de voz/afinação.
- Vai criando um histórico do que a pessoa cantou e da evolução das notas.
- **Como fazer:** reconhecimento de fala do próprio navegador (Web Speech API, sem custo; funciona no Safari do iPhone/iPad), comparando as palavras reconhecidas com a letra de cada verso.
- **Pontos de atenção:** fone de ouvido recomendado (senão o microfone capta a música); o reconhecimento é melhor com fala do que com canto — pode precisar de um modo "falar o verso".

## 3. Karaokê online com um colega ✅ feito
*Convite pelo chat, sala em tempo real, música sincronizada nos dois aparelhos, placar no fim.*
Cantar junto com um amigo conectado na plataforma.
- Convidar um colega da rede social para uma sessão de karaokê.
- Música e letra sincronizadas para os dois; cada um canta e recebe a nota de pronúncia; placar no fim.
- **Depende de:** ideias 1 e 2.
- **Como fazer:** Supabase Realtime para sincronizar início, verso atual e notas.
- **Pontos de atenção:** ouvir a voz do outro em tempo real exige chamada de áudio (WebRTC) e tem atraso; começar com "cantar ao mesmo tempo e comparar notas", ou revezar versos.

## 4. Compartilhar resultados no Instagram (com link do app) ✅ feito
*Imagem para Stories com QR code e link; botão 📤 e oferta ao dominar uma música ou terminar o karaokê.*
Com um toque, o usuário compartilha sua pontuação, a música que dominou ou seu progresso.
- Gera uma **imagem bonita** no formato Stories (capa do álbum, nome da música, % aprendido, nota de pronúncia, dias seguidos 🔥) com o link/QR code do Refrão.
- Botão "Compartilhar" abre o menu do iPhone/iPad (Instagram, WhatsApp etc.) já com a imagem e o link.
- Momentos para oferecer: música dominada 🏆, meta do dia batida, nota do karaokê.
- **Como fazer:** desenhar a imagem no próprio app (canvas) + Web Share API do navegador. Sem custo e sem servidor.
- **Pontos de atenção:** o Instagram não aceita link clicável no post, só no Stories (figurinha de link) e na bio — por isso a imagem leva o endereço escrito e um QR code. "Baixar o app" hoje = abrir o link e adicionar à tela de início; com app na App Store, o link aponta para a loja.

## 5. Chat para adolescentes (app separado no futuro) 📝 registrado em 22/11/2026
O chat está sendo testado dentro do Refrão, mas **no futuro vai virar um app à parte, focado em adolescentes**.
- Já no Refrão (teste): aparência do chat (fontes, papel de parede, cores), emojis animados, figurinhas, GIFs (só classificação G), áudio, perfil com avatar animado e foto só para amigos.
- **Pontos de atenção para o app de adolescentes:** moderação de áudio/foto (não há filtro automático gratuito), botão de denunciar/bloquear, regras de idade e consentimento dos pais (LGPD/ECA), termos de uso, contas de pais/responsáveis.
- O toque de notificação personalizado e mais longo só é possível num app nativo (App Store / Play Store).

## 6. Chamada de vídeo própria — "Ao Vivo" 🎥 📝 registrado em 28/11/2026 (não executar ainda)
Amigos fazerem chamada de vídeo dentro do Refrão, com nome próprio. Sugestão de nome: **"Ao Vivo"** (termo de música, todo mundo entende: "chamar fulano Ao Vivo"). Alternativas: "Cara a Cara", "Palco".
- **É possível?** Sim. O navegador já tem a tecnologia de chamada de vídeo embutida (WebRTC), a mesma do Google Meet. O vídeo vai direto de um celular para o outro; nosso servidor só faz a "apresentação" entre os dois aparelhos — e isso o Supabase Realtime já faz hoje no Dueto.
- **Custo:** na maioria das chamadas, zero (o vídeo não passa por servidor nosso). Mas parte das conexões (estimativa comum: 15% a 20%, pode ser mais no 4G do Brasil) não consegue ligar direto e precisa de um "retransmissor" (servidor TURN).
  - Cloudflare Realtime TURN: **1.000 GB grátis por mês**, depois US$ 0,05 por GB.
  - Uma hora de vídeo retransmitida gasta por volta de 0,5 a 1 GB → a cota grátis cobre algo como 1 a 2 mil horas retransmitidas por mês (≈ 5 a 10 mil horas de chamadas no total).
  - Passando disso: cerca de R$ 0,15 a R$ 0,30 por hora retransmitida. Barato perto de R$ 9,99 por assinante.
- **Dá para ser sem custo?** Dá, enquanto o app for pequeno (cota grátis da Cloudflare). Totalmente grátis para sempre só sem retransmissor, mas aí parte das chamadas falharia — não vale para um app pago.
- **Só 1 a 1.** Chamada em grupo exige outro tipo de servidor (SFU) e aí o custo sobe; deixar para depois.
- **Pontos de atenção:** moderação (vídeo não tem filtro automático grátis; só entre amigos aceitos + botão de denunciar/bloquear), regras para menores (LGPD/ECA — importante para o futuro app de adolescentes), e no iPhone a chamada só toca com o app aberto (app web não recebe "ligação" com tela bloqueada; só notificação).

## Ordem sugerida
1. Ativar o login (Supabase) → 2. Karaokê com nota de pronúncia (funciona sem servidor) → 3. Rede social/chat → 4. Karaokê online.
