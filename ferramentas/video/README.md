# O vídeo do Ideal Control

Um vídeo vertical, com narração e legenda, que mostra ao cliente como **instalar**
e como **usar** o Ideal Control — do QR que a gráfica manda até a leitura no
portão.

```powershell
.\ferramentas\video\gerar.ps1
```

Sai em `midia\ideal-control-como-usar.mp4`, com a legenda também solta em
`.srt` ao lado. Leva uns seis minutos.

## O que está aqui

| Arquivo | O que é |
|---|---|
| `roteiro.js` | **as palavras.** Uma entrada por cena: o que a voz fala e o que a legenda escreve |
| `gravar.js` | dirige as telas num Chrome e fotografa quadro a quadro |
| `montar.ps1` | narra com a voz do Windows, queima a legenda e monta o MP4 |
| `gerar.ps1` | chama os dois na ordem, tirando antes um instantâneo do frontend |

Para mudar uma frase, mexa **só** no `roteiro.js` e rode
`.\ferramentas\video\gerar.ps1 -SoMontar` — ele reaproveita os quadros já
gravados e remonta em menos de um minuto.

O `ROTEIRO.md` ao lado é o roteiro **humano** da primeira versão, de 16/08/2026.
Ele descreve um caminho que o aplicativo não tem mais — vale como referência de
produção, não como espelho da gravação.

## O que o vídeo mostra hoje (16 cenas, 3min20)

Abertura · instalar · entrar · Meus Pedidos · carregar o pedido · a casa · a
configuração · o uso do ingresso · o celular da porta virando aparelho · baixando
o evento · lendo · verde · já entrou · faixa bloqueada · recusa é recusa · fecho.

Ele foi reescrito em 18/08/2026, e o motivo é a razão de existir desta pasta: as
telas mudaram. O QR do Pedido saiu de cena (não há mais `evento.html`), o código
de seis caracteres saiu junto, a configuração virou cinco seções recolhidas, e um
aparelho de portaria nasce quando o dono toca na barra do evento **no próprio
celular que vai ler**.

Esse último ponto mudou a forma da gravação. Confirmar o nome do aparelho
**encerra a sessão e troca a página** para a portaria — o que antes era motivo
para deixar esse caminho de fora agora é a espinha do vídeo: a mesma aba que
configurou o evento vira o portão, e as cenas de leitura vêm em seguida, na
sequência natural. Por isso ela é a última coisa que a aba do dono faz.

O tom é o que o usuário pediu em 18/08/2026: **simples, sem dado técnico**.
Nada de minuto, versão ou nome de tela interna — quem quiser o detalhe tem o
`manual-ideal-control.html`, na raiz do repositório.

## A decisão que governa tudo isto

**O vídeo é gravado das telas de verdade.** Não há imitação da interface em
lugar nenhum: o que aparece é o `evento.html`, o `controle.html` e o
`portaria.html` rodando, com o mesmo HTML, o mesmo CSS e o mesmo JavaScript que
a Vercel serve. Falso é só o backend — as chamadas às Edge Functions e ao login
são interceptadas e respondidas com um evento inventado.

Isso custa mais trabalho do que desenhar telas bonitas num editor, e paga por
dois motivos:

- **um vídeo desenhado envelhece em silêncio.** Ele continuaria perfeito no dia
  em que a tela mudasse, ensinando o cliente a procurar um botão que não existe
  mais. Aqui, regravar é rodar um comando;
- **o que o vídeo mostra é o que o aplicativo faz.** As três telas de resposta
  da portaria — verde, laranja e vermelho — saem das seis regras reais do
  `portaria-validacao.js`, sobre hashes calculados pelo `qr-ideal-hash.js`. Se
  alguém quebrar aquela lógica, a gravação quebra junto.

## O que NÃO entra no vídeo

Ele circula por WhatsApp e vai parar na mão de gente que não é cliente. Duas
regras, e as duas são de segurança:

- **nenhum dado real.** O evento, os setores, o número do pedido, os códigos e o
  sal são inventados dentro do `gravar.js`, e o e-mail que aparece na tela de
  entrar é fictício;
- **nenhuma explicação do mecanismo.** O vídeo não diz como o código do ingresso
  é formado, nem menciona hash, sal ou pool. Isso vale para o roteiro tanto
  quanto vale para a interface.

## Por que a gravação sai de um instantâneo, e não de `frontend\`

Porque este repositório costuma ter mais de uma sessão de trabalho aberta ao
mesmo tempo. Um arquivo salvo no meio da gravação produziria um vídeo em que a
tela troca de versão entre uma cena e a seguinte — sem erro nenhum, e impossível
de perceber a não ser assistindo até o fim.

O instantâneo sai de `git archive HEAD`, que é um estado coerente por definição.
Para gravar o que está na pasta agora, inclusive alteração ainda não commitada,
use `-DaPastaViva`.

## As armadilhas já encontradas

- **A ordem das rotas falsas importa, e o erro é mudo.** O endereço
  `.../acesso-conta/minha-conta/elevar` contém `.../acesso-conta/minha-conta`
  por inteiro. Com a regra mais curta primeiro, o login recebia a resposta de
  "quem é a conta" no lugar do bilhete de quinze minutos, e a cena do Carregar
  morria com "Digite a sua senha para carregar o pedido". É por isso que o
  roteador avisa no terminal toda vez que uma chamada cai no caso padrão.
- **Nada de fotografar durante uma navegação.** O toque que confirma o nome do
  aparelho troca a página; um `page.screenshot` em voo nesse instante deixa o
  Chrome pendurado até o tempo do protocolo esgotar, e o erro fala de
  `captureScreenshot`, não de navegação. Aquele toque usa `click` cru.
- **O adereço da câmera precisa durar a gravação inteira.** O `.mjpeg` tinha
  noventa quadros, o que bastava quando a portaria era a primeira tela gravada.
  Hoje ela é a última: a câmera secava no meio e o visor saía **preto** nas cinco
  cenas de leitura. São 2.400 quadros repetidos.
- **A carga da portaria precisa da `quantidade` de cada setor.** É o denominador
  do contador. Sem ela o vídeo mostrava `1 / 0` na cena mais vista de todas.
- **A câmera precisa de um adereço.** Sem `--use-file-for-fake-video-capture`, o
  Chrome alimenta a câmera com o cartão de teste dele — um retângulo verde-limão
  com um relógio —, e a cena mais importante do vídeo passa a parecer defeito. O
  `gravar.js` desenha um ingresso, grava um `.mjpeg` e entrega ao Chrome. Por
  isso são **dois** navegadores, nesta ordem: o segundo recebe o arquivo como
  argumento de linha de comando, e não dá para trocar a câmera de um Chrome que
  já subiu.
- **A tela do ingresso BOM não é mais uma tela.** Desde 16/08/2026 o ingresso
  aceito só troca a faixa verde e a câmera segue lendo. Esperar por
  `#tela-resposta` naquela cena é esperar por uma tela que o aplicativo deixou
  de mostrar de propósito.
- **O QR do adereço sai pela borda de propósito.** Inteiro e legível, a portaria
  o leria no instante em que a câmera ligasse e pintaria a tela de verde no meio
  da cena que ainda está explicando como apontar.
- **A duração de cada cena é a da NARRAÇÃO, não a da imagem.** Se a voz demora
  mais que os quadros, o último quadro fica parado. Onde isso ficaria errado —
  "Baixando o evento", que termina em segundos —, o `gravar.js` estica o último
  quadro do carregamento com `segurarUltimo()`, para a legenda não falar de uma
  tela que já saiu.
- **`setContent` com `<script src>` e `networkidle0` trava.** Os scripts do QR
  entram por `addScriptTag`. O erro que aparecia era um tempo esgotado de
  navegação, que não diz nada sobre o que faltou carregar.

## O que o vídeo não regrava sozinho

Nada aqui olha para a tela e confere se ela ainda faz sentido. Se um botão mudar
de nome, a gravação continua rodando e o vídeo sai com a legenda antiga por cima
do botão novo. **Depois de mexer nas telas do Ideal Control, regrave e assista.** A gravação
leva uns sete minutos; o vídeo, três e vinte.
