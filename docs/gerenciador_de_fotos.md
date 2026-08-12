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
