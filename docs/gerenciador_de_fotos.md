# Gerenciador de Fotos — a foto como dado variável

> Credenciais e cartões PVC. O texto variável (nome, CPF, data, URL, QR, código de
> barras) já era resolvido pelo elemento com `source: "database"`. Este documento
> descreve o que faltava: a **foto**.

## O caminho inteiro, em uma tela

```
lote de arquivos → normalizar (navegador) → hash → subir ao Storage
                 → casar com as linhas → 4 pilhas → resolver na mão
                 → detectar rosto → gravar __fotos dentro da linha
                 → folha de contato (ajuste fino)
                 → imposição: o agente baixa por hash, cacheia, recorta, imprime
```

## As quatro peças

### 1. O elemento `FOTO`

Um tipo de elemento, irmão de `SVG` e `PDF`, criado pelo botão **🖼️ Foto** da
paleta do editor de numeração. Nasce em 25 × 32 mm — a 3×4 de credencial — e
**sempre ligado ao banco**: uma foto que não varia por linha não é dado variável,
é arte de fundo.

| campo | o que faz |
|---|---|
| `width_mm` / `height_mm` | **são** a janela. O retângulo do elemento é o espaço pré-definido em que a foto entra. |
| `csv_column` | a coluna do banco onde a foto daquela linha está registrada |
| `fit` | `cover` preenche a janela e descarta o excedente (o certo para retrato); `contain` encaixa a foto inteira, com margem |
| `corner` | `square`, `round` ou `circle`. Canto arredondado ou círculo **recorta de verdade no papel**: a janela é rasterizada e entra com máscara, porque recorte por caminho não existe no `show_pdf_page`. O custo só aparece para quem escolhe o canto redondo |
| `border_mm` / `border_color` | contorno **impresso**, em milímetros e na cor escolhida. Zero é o padrão: a janela não ganha moldura que ninguém pediu |

O elemento é desenhado por `desenharElementoFoto()`, no `foto-lib.js`, chamada
pelos **dez** pontos de desenho do app:

| arquivo | pontos |
|---|---|
| `script.js` | editor, prévia de imposição, amostra combinada, visualizador de PDF, card do pedido, gabarito rasterizado |
| `pedido.js` | prévia de imposição do **Painel de Produção** |
| `cliente.js` | card do pedido e visualizador de PDF da página do cliente |
| `criador-arte.js` | Criador de Arte |

Um tipo novo que falte em um deles faz a tela mentir sobre o papel — e foi o que
aconteceu com o `pedido.js`, que é uma **cópia divergente** do `drawVdpElements`
do `script.js`: a do `script.js` recebeu o tipo FOTO, a dele ficou para trás e
desenhava tudo menos a foto. Ao mexer num, procure o gêmeo.

Quem desenha uma vez só — o gabarito rasterizado, o visualizador de PDF — precisa
**esperar** as fotos antes do primeiro traço (`precarregarFotosDosElementos`);
quem repinta passa um `repintor` nomeado, para um lote inteiro chegando custar um
redesenho e não trezentos.

E quem desenha uma **folha inteira** não faz nem uma coisa nem outra: colhe as
linhas daquela folha durante o desenho, carrega as fotos **dessas** linhas de uma
vez e repinta **uma** vez. É o caso da prévia do Painel de Produção, onde uma
passada custa a folha toda — arte rasterizada e todas as poses. Com o repintor
por elemento, um trabalho de 88 credenciais virava dezenas de redesenhos
completos e a aba engasgava (v553 → v554). Carregar as 88 fotos para mostrar as
21 que cabem na folha também não serve: é rede paga à toa. E o guarda do laço é o
`fotosPendentes` — sem ele, o repinte pede as fotos de novo, elas resolvem na
hora (já em cache) e mandam repintar outra vez, para sempre.

### 2. `__fotos`: o enquadramento mora dentro da linha

A célula da coluna mostra o nome do arquivo — legível na grade. O que o motor
precisa fica numa chave de sistema dentro da própria linha, invisível na grade,
ao lado de `__ativo` e `__id`:

```json
"__fotos": {
  "Foto": {
    "ref": "968e1ae3e855", "url": "https://…/fotos/<num>/968e1ae3e855.jpg",
    "arquivo": "ana.jpg", "cx": 0.5, "cy": 0.4, "zoom": 1, "rot": 0, "dpi": 390
  }
}
```

- `cx`/`cy` — o ponto da foto que fica no centro da janela, em fração (0..1)
- `zoom` — fator sobre o encaixe mínimo; 1 é o menor que ainda cobre
- `ref` — hash do arquivo normalizado; é a chave do cache em disco do agente
- `dpi` — resolução efetiva na janela **com aquele zoom**. Aproximar 2× usa
  metade da largura da foto para preencher a mesma janela, então a resolução cai
  pela metade: uma foto que entra com 390 dpi vira 195 dpi em 2×, e 98 dpi em 4×,
  que é o teto do zoom. O número mostrado na folha de contato é recalculado a
  cada ajuste, e é exatamente o que vai gravado aqui

**Por que dentro da linha e não numa tabela à parte:** é isso que faz o
enquadramento acompanhar a pessoa quando a tabela é reordenada, quando a
numeração é dividida entre modelos (`pedidos_modelos.csv_selecao`), e quando o
operador refaz uma célula.

### O que conta como foto

A célula pode trazer três coisas, e só duas levam a uma foto:

| na célula | vale? | por quê |
|---|---|---|
| `https://…`, `data:…` | sim | o endereço que o Gerenciador grava |
| `C:\fotos\ana.jpg`, `fotos/ana.jpg` | sim | modo BarTender: o motor roda na estação e abre o arquivo |
| `JAQUE ROSSI.jpeg` | **não** | um nome não aponta para lugar nenhum |

O terceiro caso é o traiçoeiro, e já quebrou uma tiragem: a célula **parece**
preenchida, a conferência prévia dava a linha por resolvida, e a imposição morria
ao chegar naquele item. A regra vive em duas funções gêmeas — `_origem_de_foto`
no `engine.py` e `origemDeFoto` no `foto-lib.js` — e mexer numa é mexer na outra.

O motor vai além na conferência: para caminho de arquivo, ele exige que o arquivo
**exista** naquela estação. As três pendências são acusadas com nomes diferentes,
porque são trabalhos diferentes: *célula vazia*, *só um nome de arquivo* e
*arquivo não encontrado*.

**O vínculo manda, e a célula é legenda.** Quem decide o que imprime é
`__fotos[coluna]`; o texto da célula existe para o operador reconhecer a foto na
grade. Por isso o editor de CSV **desfaz o vínculo** quando o texto daquela
célula muda — digitado ou colado. Deixá-lo de pé faria a grade dizer "MARIA.jpg"
e a credencial sair com o rosto da Ana, o erro que só o cliente descobre.
Renomear a coluna arrasta o vínculo junto; remover a coluna o apaga; duplicar
linha dá a cada cópia o seu próprio; e desfazer volta atrás de verdade, porque o
editor trabalha sobre uma cópia do `__fotos`, não sobre o objeto do banco vivo.

### 3. Importar e casar

Solte a pasta (ou escolha os arquivos). Para cada um, **no navegador, antes de
subir**: rotação pelo EXIF, sRGB, redimensionamento para 300 dpi da janela com
30 % de folga para o zoom, JPEG de qualidade 0,9 e hash SHA-256.

> A redução não é otimização, é requisito. Uma foto de celular tem 4 MB; 500
> delas seriam 2 GB subindo e descendo. Reduzida, cada uma fica em ~150 KB. Sem
> isso a biblioteca de fotos vira o tempo de rede que o agente local existe para
> não pagar.

O casamento tenta, nesta ordem, contra a coluna da foto e depois contra todas as
outras colunas:

1. nome exato do arquivo
2. nome sem extensão
3. normalizado — minúsculas, sem acento, sem espaço, sem separador
4. **apenas os dígitos**, com no mínimo cinco — resolve `CPF 123.456.789-00.jpg`
5. semelhança aproximada — vira **sugestão**, nunca casamento automático

A regra inegociável: **na dúvida, não escolher**. Dois arquivos disputando a
mesma linha, ou duas pessoas com o mesmo nome, viram pendência com os candidatos
à vista. Uma credencial com a foto trocada só é descoberta pelo cliente.

O resultado abre em quatro pilhas: **casadas · ambíguas · fotos sem linha ·
linhas sem foto**. Clicar numa foto sobrando e depois numa linha sem foto liga as
duas. Nada é gravado antes de **Gravar no banco**.

Quatro coisas que a tela faz questão de garantir:

- **O lote chega em levas.** A zona de soltar nunca some: dá para trazer mais
  fotos a qualquer momento, e a leva nova **não desfaz** o que já foi casado, nem
  as ligações feitas na mão. Só os arquivos novos disputam as linhas que ainda
  estão vazias. Ter de gravar entre uma leva e outra obrigaria o operador a
  fechar e reabrir a tela a cada pendrive que chega.
- **A linha se identifica pela coluna, com o nome dela à vista.** "Ana Paula" não
  diz de onde veio; "Nome · linha 12: Ana Paula · Cargo: Portaria" diz. O
  operador escolhe no alto da tela qual coluna identifica a pessoa.
- **A dúvida mostra os dois lados.** A pilha de ambíguas não dá veredito: ela põe
  lado a lado a miniatura e o nome do arquivo contra a coluna de identidade e as
  outras colunas da linha. Com duas Anas na planilha, é o CPF ou o cargo que
  decide — e eles precisam estar na tela.
- **Nada é definitivo.** O gerenciador reabre trazendo o que já está gravado nas
  linhas, direto na folha de contato, com o enquadramento que cada foto tem.
  Reenquadrar ou trocar a foto de uma pessoa é um clique, a qualquer momento.
  Foto que já está no banco **não sobe de novo**: reenquadrar 500 credenciais não
  pode custar 500 uploads.
- **Gravar não faz a sobra desaparecer.** A tela continua aberta depois de
  gravar, e a foto que ainda não achou dono continua na pilha dela — inclusive se
  o gerenciador for fechado e reaberto na mesma sessão. Ela não tem linha, logo
  não tem onde ser gravada; jogá-la fora obrigaria a reimportar o pendrive
  inteiro. O limite honesto: recarregar a página perde o que não foi ligado a
  ninguém, e é para isso que existe o relatório.

### Onde a falta aparece

Uma foto que falta não pode depender de alguém abrir o gerenciador para ser
descoberta. Ela aparece em três lugares:

| Onde | Como |
|---|---|
| Nas janelas de arte (editor, prévia, amostra, link do cliente) | a janela vira um **quadro vermelho com um “?” branco** — texto não serve, porque nessas telas a janela tem poucos milímetros e vira borrão |
| Na folha de contato | um cartão marcado, na mesma grade das outras, com **📎 anexar foto** |
| No editor de CSV | a célula da coluna de foto fica **vermelha**, com a dica de que aquela linha não vai imprimir; quem tem foto fica verde com 🖼️ |

E o botão **📋 Relatório de pendências** baixa uma planilha (`.csv`, que o Excel
em português abre direto) com quem ficou sem foto — nome, linha e as demais
colunas —, que fotos chegaram sem dono, e o que ficou em dúvida. É o que fecha o
ciclo com quem enviou o lote.

### A régua de qualidade: 200 · 300 · 350

| faixa | o que acontece |
|---|---|
| **abaixo de 200 dpi** | selo vermelho no cartão da folha de contato |
| **200–350** | corredor bom — nada a fazer |
| **acima de 350 depois de enquadrada** | no **Gravar**, a foto que vai subir é reamostrada para **300 dpi** no enquadramento decidido: arquivo menor, RIP mais rápido, impressão igual |

A queima 350→300 acontece no Gravar, e não na importação, para preservar a
folga de 30% enquanto o operador ainda enquadra. Ela só vale para fotos que já
iam subir (novas, trocadas, editadas): as antigas do banco não pagam reupload —
é a condição `f.blob`, e `dpiEmExcesso()` repete exatamente essa condição, de
propósito, para que o contador da tela não prometa uma redução que não vai
acontecer.

**Onde a queima aparece.** Ela é automática e não tem botão, então precisa de
voz — sem isso o operador não descobre que existe, e já veio perguntar onde
estava. São três lugares, todos escritos por `atualizarReguaDeDpi()` e
`seloDpi()`:

- a **faixa fixa** logo abaixo da barra da folha de contato, que diz a regra
  mesmo com contagem zero (`⤓ Acima de 350 dpi o Gravar reduz para 300
  dpi automaticamente — nenhuma foto deste lote está acima`) e acende em azul
  com a contagem viva quando há alguma;
- o **selo do cartão**, que passa de `390 dpi` para `390 dpi · ⤓ 300 no Gravar`
  em azul antes, e `300 dpi · reduzida` depois;
- o **aviso do Gravar**, que soma quantas subiram reamostradas.

Como a importação já normaliza para 300 dpi **com 30% de folga**, uma foto
recém-importada chega a 390 dpi: acima do teto. Ou seja, a faixa acende na
importação por definição, e o que ela está dizendo é "a folga que você não usou
para aproximar vai embora no Gravar". Zoom de 1,15× ou mais consome a folga e a
faixa se apaga sozinha.

O botão **⬆ Interpolar fracas até 200 dpi** é fixo na barra da folha de contato
e conta as fracas ao vivo. Interpolar suaviza o serrilhado — não recupera
detalhe —, e por isso o cartão passa a dizer `interp.`: a tela não finge
qualidade que não existe.

**✕ desvincular**, em cada cartão, desfaz o vínculo: a linha volta para "Linhas
sem foto" (célula limpa, vermelha nas outras telas), a foto volta para "Fotos
sem linha" sem perder o upload já feito, e a dupla entra na lista de divórcios
— o casamento automático não junta os dois de novo, nem quando a tela reabre.
Religar na mão anula o divórcio: a última palavra é sempre do operador.

### O Editor de Foto (`frontend/editor-foto.js`)

O **✏️ editar** de cada cartão abre a foto num editor próprio, tudo no
navegador — nada sobe para editar, o envio continua acontecendo só no Gravar:

- **recorte** com alça, **girar** 90°, **espelhar**
- **brilho / contraste / saturação** ao vivo, **nitidez** (máscara de
  desfoque), **auto-nível** (estica o histograma entre os percentis 1–99)
- **reamostrar** por dpi-na-janela (o rótulo mostra o dpi com o zoom do
  enquadramento atual)
- **remover fundo**: um modelo de segmentação leve (u2netp, Apache-2.0, ~4 MB)
  separa a pessoa e compõe sobre a cor escolhida — o clássico da foto 3×4 com
  fundo bagunçado
- **ampliar a tela**: cresce a moldura e completa o fundo que passou a faltar

#### Ampliar a tela (mais fundo em volta)

O problema que ela resolve é o mais comum de credencial: a foto chega
**enquadrada demais**. Não sobra fundo para o recorte da janela, e a única saída
antes disto era cortar mais — ou seja, cortar o ombro, ou o alto da cabeça.
Ampliar inverte a conta: a moldura cresce e a foto inteira cabe.

Dois caminhos, no mesmo bloco:

| botão | o que faz |
|---|---|
| **⤢ Ampliar** | margem igual dos quatro lados, em % do **menor** lado (numa 3×4, usar o próprio lado deixaria a moldura visivelmente mais grossa em cima e embaixo) |
| **⧉ Caber na janela** | cresce **só o eixo que falta** até a foto ficar na proporção da janela desta credencial: nada é cortado, e o rosto continua centrado onde estava |

E três maneiras de completar o que ficou vazio:

- **Borda esticada** (instantânea): estica a linha e a coluna da borda para
  fora. É a melhor para parede, fundo de estúdio e degradê — continua a cor
  exata do encontro, sem repetir forma nenhuma.
- **Espelhado** (instantânea): reflete a foto nos quatro lados e nos quatro
  cantos. Preserva textura (folhagem, tijolo), ao custo da simetria.
- **IA** (LaMa, Apache-2.0, 88 MB): inventa o fundo de verdade.

Três decisões de desenho que não devem ser desfeitas sem pensar:

1. **Só o anel novo vem do modelo.** O LaMa tem entrada fixa de 512×512, então
   a tela inteira é reduzida a 512 para ele olhar. Se a saída dele virasse a
   foto, o trabalho sairia com 512 px de resolução. Não vira: o resultado é
   recortado pela máscara e colado **apenas na moldura**, com a costura
   suavizada. Todo pixel que veio da câmera continua com a resolução que tinha —
   e o driver de teste prova isso comparando pixels do rosto e do ombro antes e
   depois.
2. **O borrão do anel acontece antes de a foto entrar.** O fundo inventado cobre
   a tela toda, é borrado, e só então a foto original é colada por cima,
   inteira. Assim o borrão nunca encosta num pixel original.
3. **O fundo sem borrão fica por baixo** (`destination-over`). O filtro de
   desfoque chupa transparência de fora da tela e deixa a beirada
   semitransparente, que no JPEG final vira uma **vinheta preta**. Já aconteceu;
   o teste pega pelo canal alfa das quatro beiradas.

O tempo da IA é o que decide se ela serve: **~20 s por foto** só no
processador (a página não é isolada por origem, então o WASM roda em uma thread
só — isolá-la quebraria o Supabase e os CDNs), e poucos segundos onde há
**WebGPU**, que é tentado primeiro e cai para o processador sozinho. Os dois
modos instantâneos existem exatamente para o operador não precisar dessa espera
quando o fundo é liso. A mensagem na tela diz os dois números antes de começar.

O modelo de completar é baixado uma vez e guardado no **Cache Storage** do
navegador (`ideal-modelos-ia`), não só no cache HTTP: 88 MB rebaixados no meio
de um trabalho porque o navegador resolveu limpar a casa seria inaceitável.
Sobe pela ferramenta `ferramentas/subir_modelo_completar.ps1`, com a mesma
conferência de sha256.

A função `inpaintarRegiao(tela, mascara)` recebe qualquer máscara. Ampliar é só
o primeiro uso: um pincel de **eliminar objetos** é a mesma máquina com outra
máscara, e é o passo seguinte natural.

Os modelos moram no **nosso Storage**
(`agent-releases/modelos/`, subidos e conferidos por sha256 pelas ferramentas
`ferramentas/subir_modelo_fundo.ps1` e `subir_modelo_completar.ps1`) — nunca no
GitHub nem no Hugging Face: asset de release não manda CORS e a produção não
pode depender de site de terceiro estar no ar. Trocar de modelo exige **nome de
arquivo novo**: o Storage fica atrás do CDN da Cloudflare, e reusar o nome faz a
borda continuar servindo o arquivo antigo. O
runtime (onnxruntime-web) vem do jsDelivr, o mesmo CDN de que o app já depende.
Se qualquer um dos dois faltar, o botão se declara indisponível e o resto do
editor segue funcionando.

Aplicar gera um arquivo novo (hash novo) que substitui o da pessoa **mantendo o
enquadramento** — mesmo encanamento do 🔁 trocar. **Eliminar objetos com
pincel** continua sem interface; a API externa só ficaria necessária para
edições que peçam um modelo generativo grande demais para a estação.

### 4. Folha de contato

A aba **Enquadrar**: todas as fotos já renderizadas dentro da janela real do
modelo, com o mesmo recorte que o papel terá. Roda do mouse aproxima, arrastar
move, as setas do teclado trocam de foto, duplo clique volta ao automático. Selo
vermelho abaixo de 150 dpi, e **🔁 trocar** em cada cartão para substituir a foto
daquela pessoa sem mexer no resto do lote.

É a tela que os concorrentes não têm — cardPresso, BarTender e o Data Merge do
InDesign corrigem um registro por vez.

O enquadramento inicial vem da detecção de rosto (`FaceDetector` do navegador,
quando existe), feita **uma vez, na importação**; só o retângulo é guardado. Sem
detector, o padrão é o terço superior, onde a cabeça está em praticamente toda
foto de documento. O executável do agente não ganha nenhuma biblioteca de visão
computacional.

## No motor (`engine.py`)

`_render_element` ganhou o ramo `FOTO`. O recorte **não toca nos bytes da
imagem**: a foto é desenhada maior que a janela numa página temporária do tamanho
exato dela, e o que sobra fica fora — sem recompressão, sem perda por enquadrar.

`process()` começa por `_conferir_e_aquecer_fotos()`:

- **acusa todas as linhas sem foto de uma vez**, com número de linha e coluna.
  Descobrir a décima linha vazia depois de nove credenciais impressas é PVC no
  lixo;
- **baixa as fotos únicas em paralelo** e guarda no cache antes do laço. Dentro
  do laço elas seriam buscadas em série, com o operador de pé na frente da
  impressora.

O cache tem dois níveis: memória (`_url_cache`) e disco
(`%LOCALAPPDATA%\NewProd\cache\fotos\<hash>.bin`), com escrita em dois passos —
um cache pela metade, deixado por uma queda de energia, viraria foto corrompida
na próxima tiragem.

A origem aceita **URL da nuvem**, **`data:` embutido** e **caminho de arquivo
local**. O caminho local é o modo BarTender/NiceLabel: quem já tem as fotos
organizadas numa pasta escreve o caminho direto na célula.

## Arquivos

| arquivo | papel |
|---|---|
| `frontend/foto-lib.js` | geometria, casamento, cache de imagens, desenho da janela. **A geometria é gêmea da do `engine.py`** — mexeu numa, mexe na outra |
| `frontend/gerenciador-fotos.js` | o modal: importar, quatro pilhas, folha de contato. Não enxerga o `state` |
| `frontend/script.js` | `addElement('FOTO')`, painel de propriedades, a ponte `abrirFotosDoElemento` |
| `engine.py` | `_foto_encaixe`, `_foto_da_linha`, `_get_foto_bytes`, `_conferir_e_aquecer_fotos`, ramo `FOTO` |
| `tests/test_engine_foto.py` | mede **pixel da página rasterizada**, não a árvore do PDF |
| `tests/foto_lib_harness.js` | 37 casos do casamento e da geometria, em node |

## Publicação

O `engine.py` é embutido no `NewProd.exe`. Toda mudança aqui **exige publicar o
agente junto com o site**, com número de versão novo: a estação não pode receber
a folha de contato com um motor que não sabe o que é um elemento `FOTO`.
