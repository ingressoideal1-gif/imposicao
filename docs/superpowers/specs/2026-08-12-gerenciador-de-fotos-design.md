# Gerenciador de Fotos — foto como dado variável

Data: 12/08/2026

## O problema

Credenciais e cartões PVC misturam dois tipos de dado variável. O texto — nome, CPF,
data, URL, frase, QR, código de barras — já está resolvido: o elemento com
`source: "database"` lê a coluna pelo nome e o motor imprime
([engine.py:621-623](../../../engine.py#L621-L623)).

A foto não está resolvida, e ela é a maior parte do trabalho de produzir uma credencial.
O lote chega como veio do cliente: nomes sem padrão, formatos e proporções diferentes,
retrato de celular ao lado de foto 3×4 escaneada, alguns arquivos a mais, algumas pessoas
sem foto. Hoje o operador resolve isso fora do sistema, uma a uma.

São quatro problemas distintos, e tratá-los como um só é o que trava:

1. **Ingestão** — receber um lote heterogêneo e normalizá-lo.
2. **Casamento** — descobrir a qual linha do banco cada arquivo pertence.
3. **Enquadramento automático** — encaixar cada foto na janela pré-definida da arte.
4. **Ajuste fino** — corrigir o enquadramento das que ficaram tortas, sem revisar as 500.

## O que o mercado faz

| Sistema | Casamento | Enquadramento automático | Ajuste fino |
|---|---|---|---|
| cardPresso XM/XL | campo de imagem no banco (Access/SQLite), OLE ou coluna | FaceCrop com detecção de rosto + redimensionamento para a área definida | editor de foto embutido, um registro por vez |
| Express Badging | upload em lote casado por padrão do nome do arquivo, com vinculação manual das sobras | exige lote com dimensões idênticas | manual |
| BarTender | coluna do banco com caminho e/ou nome + "Default Path" | ajuste à moldura | por registro |
| NiceLabel | coluna com caminho completo, ou `Concatenate` de pasta fixa + nome + extensão | ajuste à moldura | por registro |
| InDesign Data Merge | coluna prefixada com `@` contendo o caminho, com link em vez de embed | `Content Placement Options`, uma regra de encaixe para todos os registros | manual, quadro a quadro |

Três conclusões orientam o desenho:

- **Ninguém guarda a imagem dentro do banco variável.** A coluna guarda uma referência
  e o arquivo vive fora. É o que mantém o CSV leve o bastante para trafegar no payload
  da imposição.
- **Casamento por nome de arquivo é o padrão**, e todos admitem que ele falha em parte
  do lote — por isso todos têm uma tela de sobras para resolver na mão.
- **O ajuste fino é o ponto fraco de todos.** A interface universal é "abra o registro,
  corrija, feche". Nenhum oferece uma folha de contato com o lote inteiro já dentro da
  janela real da peça. É aí que temos vantagem a construir.

Fontes: [cardPresso](https://support.cardpresso.com/kb/can-i-edit-images-using-cardpresso/),
[Express Badging](https://expressbadging.com/id-card-printing-software/),
[BarTender](https://help.seagullscientific.com/2016/en/Content/Importing_a_Linked_Picture.htm),
[NiceLabel](https://help.nicelabel.com/hc/en-001/articles/11207639940625-Print-variable-pictures),
[InDesign Data Merge](https://helpx.adobe.com/ca/indesign/using/data-merge.html).

## Decisões tomadas

- **As fotos vivem no Storage do Supabase, com cache em disco no agente.** Decisão do
  usuário em 12/08/2026. Funciona de qualquer estação e do painel; o download acontece
  uma vez por foto e nunca se repete entre prova, tiragem e reimpressão.
- **O enquadramento inicial tenta detectar o rosto**, no navegador, uma única vez, na
  importação. Decisão do usuário na mesma data. O motor não ganha nenhuma biblioteca de
  visão computacional: ele recebe um retângulo pronto.

## Arquitetura

Cinco peças, cada uma com uma responsabilidade e um contrato.

### 1. Elemento `FOTO` (motor + editor de numeração)

Um novo tipo de elemento, irmão de `SVG` e `PDF`. Nasce em `addElement`
([script.js:5256-5258](../../../frontend/script.js#L5256-L5258)) com:

```js
{ type: 'FOTO', width_mm: 25, height_mm: 32, source: 'database', csv_column: 'Foto',
  fit: 'cover', corner: 'square', render_mode: 'print' }
```

- `fit: 'cover'` preenche a janela e descarta o excedente — o correto para retrato.
  `'contain'` encaixa inteiro, deixando margem.
- `corner`: `square`, `round` (raio em mm) ou `circle`.
- `render_mode` segue a regra da Finalidade já existente; a foto nasce em `print`.

A janela **é** o retângulo do elemento: `width_mm` × `height_mm`. Isso responde
"janelas pré-definidas" sem inventar conceito novo.

### 2. A coluna de foto guarda referência, não arquivo

Na grade do editor de CSV, a célula mostra o nome legível: `maria_silva.jpg`. O que o
motor precisa vai numa chave de sistema dentro da própria linha, invisível na grade,
seguindo o padrão que `__ativo` e `__id` já estabeleceram
([docs/editor_de_csv.md](../../editor_de_csv.md)):

```json
"__fotos": {
  "Foto": { "ref": "a3f91c…", "url": "https://…/fotos/a3f91c….jpg",
            "cx": 0.5, "cy": 0.38, "zoom": 1.14, "rot": 0, "dpi": 412 }
}
```

- `ref` é o hash SHA-256 do arquivo normalizado — é ele que dá identidade à foto e
  serve de chave do cache no agente.
- `cx`/`cy` são o centro do recorte em fração da imagem, `zoom` é o fator sobre o
  encaixe `cover` mínimo, `rot` é rotação em passos de 90°.
- `dpi` é a resolução efetiva da foto dentro da janela, calculada na importação, usada
  para avisar antes de imprimir.

Guardar o enquadramento dentro da linha, e não numa tabela paralela, é o que faz ele
sobreviver a reordenar, a dividir a numeração entre modelos (`pedidos_modelos.csv_selecao`)
e à reimpressão parcial de célula.

### 3. Importador de lote

Arrastar a pasta ou o `.zip` na box "Banco de Dados (CSV)". Para cada arquivo, **no
navegador, antes de subir**:

1. Corrige a rotação pelo EXIF e descarta o resto dos metadados.
2. Converte para sRGB.
3. Redimensiona para 300 dpi da janela do elemento `FOTO`, com margem de 30% para o
   ajuste manual dar zoom sem perder resolução.
4. Grava JPEG de qualidade alta e calcula o hash.

Uma foto de celular de 4 MB vira algo em torno de 150 KB. Essa etapa é o que impede a
biblioteca de fotos de virar tempo parado na frente da impressora — é o mesmo motivo que
mantém a imposição local.

O upload vai para o bucket `fotos`, com caminho `<numeracao_id>/<hash>.jpg`. Fotos
idênticas reenviadas não geram arquivo novo.

### 4. Casamento e as quatro pilhas

A cascata de casamento, do mais forte ao mais fraco:

1. Nome exato do arquivo igual ao valor da coluna.
2. Nome sem extensão.
3. Nome normalizado: minúsculas, sem acento, sem espaço, sem separador.
4. Apenas os dígitos — resolve `CPF 123.456.789-00.jpg` contra a coluna CPF.
5. Semelhança aproximada — entra como **sugestão**, nunca aplicada sozinha.

O resultado abre numa tela de quatro pilhas: **casadas**, **ambíguas**, **fotos sem
linha**, **linhas sem foto**. Arrastar resolve. Nada é aplicado ao CSV enquanto a tela
não for confirmada.

### 5. Folha de contato

Grade com uma miniatura por linha, cada foto **já renderizada dentro da janela real do
modelo**, com o mesmo `drawImageContain`/`cover` que a arte usa — a miniatura é a
promessa do papel.

- Roda do mouse dá zoom, arrasto move, `←` e `→` pulam de registro.
- Botão "reenquadrar automático" volta ao que a detecção de rosto propôs.
- Selo vermelho na foto abaixo de 150 dpi efetivos na janela, e na linha sem foto.
- Contador no topo: quantas linhas ainda estão sem foto.

Essa tela é o diferencial competitivo. Ela existe para o operador percorrer 500
credenciais em minutos e corrigir só as dez tortas.

## Fluxo completo

```
lote de arquivos → normalizar (navegador) → hash → upload bucket `fotos`
                 → casar com as linhas → 4 pilhas → confirmar
                 → detectar rosto → gravar __fotos na linha
                 → folha de contato (ajuste fino)
                 → imposição: agente baixa por hash, cacheia, recorta, imprime
```

No motor, `FOTO` renderiza com `insert_image` aplicando o recorte guardado. O agente faz
o pré-carregamento **em paralelo, antes do laço de imposição**, nunca dentro dele, e
cacheia em `%LOCALAPPDATA%\NewProd\cache\fotos\<hash>.jpg`. Entre a prova e a tiragem, e
entre reimpressões, o download é zero.

## Onde o código muda

| Arquivo | O quê |
|---|---|
| [engine.py](../../../engine.py) | tipo `FOTO` em `_render_element` (meia-largura no bloco de ~L604, render junto de `PDF` em ~L947); cache de fotos em disco por hash ao lado de `_get_url_bytes` ([L497](../../../engine.py#L497)); pré-carregamento paralelo antes do laço |
| [frontend/script.js](../../../frontend/script.js) | `addElement('FOTO', …)` ([L5258](../../../frontend/script.js#L5258)); desenho do elemento nos caminhos de canvas do editor, da prévia e do gabarito (L3899, L5501, L8034, L23945, L24684, L29636); box do importador; folha de contato |
| [frontend/criador-arte.js](../../../frontend/criador-arte.js) | desenho da janela de foto no Criador de Arte, espelhando o card do pedido |
| [frontend/pedido.js](../../../frontend/pedido.js) | miniatura do card do pedido |
| [frontend/csv-editor.js](../../../frontend/csv-editor.js) | coluna de foto com miniatura na célula; preservar `__fotos` em duplicar/reordenar/importar |
| `sql/` | bucket `fotos` e política de acesso |

O custo real está nos **seis pontos de desenho no `script.js`**: um tipo novo de elemento
precisa aparecer em todos eles ou a tela mente sobre o papel. O desenho da janela de foto
sai numa função só, `drawFotoElement(ctx, el, foto, box)`, chamada pelos seis — não copiada
seis vezes.

## Erros e limites

- **Foto ausente na hora de imprimir**: erro que interrompe, com a lista das linhas sem
  foto. Nunca imprimir janela vazia — papel e PVC são custo.
- **Download falhou**: erro que interrompe, com o nome do arquivo. Mesma regra dos
  elementos PDF e SVG, que já não engolem exceção.
- **Resolução baixa**: aviso na folha de contato e no botão de imprimir, não bloqueio —
  a decisão é do operador.
- **Arquivo corrompido ou formato não suportado**: fica na pilha de sobras com o motivo.

## Testes

- `tests/test_engine_foto.py`: impõe um PDF com elemento `FOTO` e mede a posição e o
  tamanho da imagem no PDF gerado, como já fazem os testes de SVG.
- Teste do recorte: mesma foto com `cx/cy/zoom` diferentes produz PDFs diferentes, e o
  `cover` nunca distorce a proporção.
- Teste do casamento: as cinco regras da cascata, incluindo o caso de dois arquivos
  disputando a mesma linha, que deve cair em "ambíguas" e não escolher sozinho.
- Verificação no navegador com a skill `rodar-app`, comparando a folha de contato com o
  PDF real de uma tiragem pequena.

## Fora de escopo

Corte de fundo, correção de cor por foto, captura por webcam, e assinatura digitalizada.
São recursos que os concorrentes têm e que não resolvem nenhuma das quatro dores acima.

## Publicação

A mudança toca o [engine.py](../../../engine.py), que o `NewProd.exe` embute. O agente
sai publicado junto com o site, com número de versão novo — a estação não pode receber a
tela da folha de contato com o motor que não sabe o que é um elemento `FOTO`.
