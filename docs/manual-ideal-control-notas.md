# Manual do Ideal Control — o que falta preencher e o que dá para mudar

Companheiro do arquivo **`manual-ideal-control.html`** (raiz do repositório). Ele abre
com duplo clique, funciona sem internet e não depende de nada externo — a fonte da
identidade e o ícone estão embutidos no próprio arquivo.

Escrito em 18/08/2026, sobre a versão **v639** do aplicativo.

---

## 1. As lacunas — o que só a equipe pode preencher

Cada uma está marcada **dentro do manual** com borda tracejada âmbar e um aviso de
"Atenção", justamente para não escapar. Busque por `[` no arquivo para achar todas.

| # | Onde | O que falta | Marcação no arquivo |
|---|---|---|---|
| 1 | Slide 6 — O endereço de instalação | O endereço oficial do aplicativo (link e/ou QR). | `[ENDEREÇO OFICIAL DE INSTALAÇÃO]` |
| 2 | Slide 27 — Suporte | WhatsApp de atendimento. | `[NÚMERO DE SUPORTE]` |
| 3 | Slide 27 — Suporte | E-mail de atendimento. | `[E-MAIL DE SUPORTE]` |
| 4 | Slide 27 — Suporte | Horário de atendimento. | `[HORÁRIO DE ATENDIMENTO]` |
| 5 | Slide 27 — Suporte | Canal e horário de urgência durante o evento (o SLA, se houver). | `[CANAL E HORÁRIO]` |
| 6 | 10 lugares | Os **prints de tela reais**. Cada lugar já diz qual captura entra ali. | caixas tracejadas com "Print a incluir" |
| 7 | Capa e encerramento | Confirmar a versão e a data a divulgar (hoje: v639, 18/08/2026). | texto simples |

### As dez capturas de tela pedidas

1. QR Code de instalação, com o endereço legível abaixo (slide 6).
2. Tela "Instale o Ideal Control" no Android, com o botão *Instalar agora* (slide 7).
3. Menu Compartilhar do Safari, com *Adicionar à Tela de Início* (slide 8).
4. Telas *Entrar* e *Escolha a sua senha*, lado a lado, com dados fictícios (slide 10).
5. *Meus Pedidos* e a caixa *Carregar o pedido* preenchida (slide 11).
6. Configuração com as cinco seções recolhidas e a faixa de tempo (slide 12).
7. Cartão de um setor aberto, com nome, uso e faixa impressa (slide 13).
8. Tela de leitura com ingresso aceito (faixa verde) — substitui a amostra desenhada (slide 18).
9. Recusa *JÁ ENTROU* em tela cheia (slide 19).
10. Recusa *OUTRA PORTA*, a laranja (slide 19).

> Formato sugerido: PNG de celular em retrato, 1080 px de largura. No manual, troque a
> caixa tracejada inteira por `<img src="data:image/png;base64,…" alt="…">` — o arquivo
> precisa continuar autocontido, então a imagem entra embutida, não por caminho.

---

## 2. As decisões que tomei sozinho

Estavam em aberto e não dava para esperar. Todas são reversíveis.

1. **A estrutura mudou em relação ao roteiro.** O roteiro pedia slides de pré-requisitos
   de servidor, comandos de instalação, variáveis de ambiente e backup/logs. Nada disso
   existe para um produtor de evento: o Ideal Control é um aplicativo que ele instala no
   celular, e a infraestrutura é nossa. Aqueles quatro slides viraram: *Antes de começar*
   (com lista de conferência), *Instalar* (um slide por plataforma), *Tabela de
   configurações do evento* e *Depois do evento*.
2. **A fonte é a Manrope**, a mesma do aplicativo, embutida no arquivo (24 KB, licença
   OFL, já distribuída dentro do produto). O roteiro sugeria fontes do sistema; preferi a
   fidelidade com a identidade, sem depender de CDN nenhum.
3. **A paleta nasce do ícone do aplicativo**: verde-água como cor de marca, laranja como
   destaque, nove neutros de viés frio. Tema claro e escuro, ambos conferidos.
4. **Nenhum nome de servidor aparece**, como pedido. Por isso o endereço de instalação
   ficou como lacuna em vez de escrito.
5. **O manual não é publicado junto com o site.** Ele está na raiz do repositório, e o
   `vercel.json` só serve o que está em `frontend/` — um arquivo na raiz responde 404. Se
   um dia quisermos publicá-lo, é preciso movê-lo para `frontend/` de propósito.
6. **Sem `localStorage`**, como pedido: o que o leitor marca na lista de conferência vive
   só na memória da aba.

---

## 3. O que dá para melhorar depois

- **Prints reais** são a melhoria de maior efeito. As três amostras desenhadas (tela de
  leitura, faixa verde, contador) são representações — servem, mas print de verdade
  vende mais.
- **Um vídeo curto** de 30 segundos da leitura na porta, com link no slide 18. Não cabe
  embutido (o arquivo passaria de 300 KB para dezenas de MB), mas cabe um link.
- **Slides mais altos que a tela.** Dez dos vinte e oito passam de 900 px de altura numa
  janela pequena e pedem uma rolagem curta dentro do slide. É proposital — o encaixe é
  `proximity`, e não `mandatory`, justamente para nada ficar inalcançável. Se quisermos
  "uma tela por slide" em qualquer resolução, o caminho é dividir os slides 5, 10, 11, 17
  e 18 em dois.
- **Versão em PDF.** O botão de imprimir do navegador já gera um PDF de 29 páginas com a
  narração inclusa e sem os controles de navegação. Se virar material impresso oficial,
  vale revisar as quebras de página com o texto final e os prints no lugar.
- **Limites contratuais** (quantidade de aparelhos, prazo de guarda dos dados do evento) e
  **texto de LGPD** ficaram de fora porque não existem no código nem em documento nosso.
  Se o comercial quiser, entram como um slide entre o 26 (FAQ) e o 27 (Suporte).
- **Aparelhos homologados.** O manual diz "Chrome atualizado" e "Safari atualizado",
  porque o código não exige versão mínima nenhuma. Se o comercial quiser prometer modelos
  específicos, é uma decisão de negócio — não uma leitura do código.

---

## 4. Como editar o manual

O arquivo publicado é montado a partir de partes, para não virar um arquivo de três mil
linhas impossível de revisar. Para uma correção pequena, edite direto o
`manual-ideal-control.html` — ele é autocontido e não precisa de compilação.

Se a edição for grande, as partes ficam em `ferramentas/manual-fonte/`:

    venv\Scripts\python ferramentas\manual-fonte\build.py     # remonta o manual
    node ferramentas\manual-fonte\verificar.js                # abre num Chrome de verdade

O `verificar.js` tira capturas nas quatro combinações de tema e largura (em
`ferramentas/manual-fonte/fotos/`), exercita teclado, busca, cópia, tema e link direto,
mede o contraste de onze elementos nos dois temas, conta as páginas do PDF e procura
vazamento de segredo. Vale rodá-lo sempre que o manual mudar.
