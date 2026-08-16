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

O `ROTEIRO.md` ao lado é o roteiro **humano**: o que se leva para uma gravação de
verdade, com preparação, tempos por cena e nota de produção. Ele tem **27**
cenas; a amostra tem **24**, e a diferença está no Ato 4. Desde a v612 há dois
jeitos de montar o portão, e a amostra só cobre o do código de 6 caracteres —
salvar "Usar ESTE aparelho" encerra a sessão e joga o navegador para a portaria,
o que interromperia as cenas seguintes da gravação automática. Se um dia esse
caminho entrar na amostra, ele precisa de um navegador só para ele.

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
  sal são inventados dentro do `gravar.js`. O código do aparelho que aparece na
  tela (`K7M2QP`) não liga aparelho nenhum;
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

- **O caminho da Edge Function do QR não tem `/evento` no fim.** O `endereco()`
  do `acesso-conta.js` troca o prefixo `/evento` pela função inteira, então
  `/evento?t=…` vira `…/acesso-evento?t=…`. Uma rota falsa escrita como
  `/acesso-evento/evento` nunca casa, a tela recebe `{}` e falha com uma
  mensagem genérica. É por isso que o roteador avisa no terminal toda vez que
  uma chamada cai no caso padrão.
- **A câmera precisa de um adereço.** Sem `--use-file-for-fake-video-capture`, o
  Chrome alimenta a câmera com o cartão de teste dele — um retângulo verde-limão
  com um relógio —, e a cena mais importante do vídeo passa a parecer defeito. O
  `gravar.js` desenha um ingresso, grava um `.mjpeg` e entrega ao Chrome. Por
  isso são **dois** navegadores, nesta ordem: o segundo recebe o arquivo como
  argumento de linha de comando, e não dá para trocar a câmera de um Chrome que
  já subiu.
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
do botão novo. **Depois de mexer nas três telas do Ideal Control, regrave e
assista.** São dois minutos e meio.
