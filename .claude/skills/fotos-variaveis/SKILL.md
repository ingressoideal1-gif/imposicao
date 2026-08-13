---
name: fotos-variaveis
description: Leia ANTES de mexer em foto como dado variável — o elemento FOTO, o Gerenciador de Fotos, frontend/foto-lib.js, frontend/gerenciador-fotos.js, a chave __fotos das linhas do CSV, ou o ramo FOTO do engine.py. Cobre as dez armadilhas do caminho e por que o agente sai junto.
---

# Antes de mexer em foto variável

Leia **`docs/gerenciador_de_fotos.md`** por inteiro. Ele descreve o caminho todo,
do lote de arquivos ao PVC. Aqui ficam só as armadilhas.

## 1. A geometria existe duas vezes, e as duas têm de concordar

`encaixeFoto()` no `frontend/foto-lib.js` e `_foto_encaixe()` no `engine.py` são
**gêmeas**. Elas decidem qual pedaço da foto aparece na janela. Se divergirem, a
tela promete um enquadramento e o cartão sai com outro — e ninguém descobre até
o cliente reclamar.

Quem mexe numa mexe na outra, e prova nos dois lados:
`tests/test_engine_foto.py` (mede pixel da página rasterizada) e
`tests/foto_lib_harness.js` (mede a geometria em node).

Corolário do canto arredondado: **quem desenha o contorno e quem recorta a foto
têm de produzir a MESMA curva.** Não basta usarem o mesmo raio nominal — um
retângulo recuado meia espessura tem raio menor e centro deslocado, e ao longo da
curva sobra foto do lado de fora da moldura (meio milímetro numa janela 25×32 com
contorno de 2 mm). Nas retas coincide, então medir faixa reta não pega nada: o
traço vai **centrado na borda da janela com o dobro da espessura**, e a metade de
fora é aparada pelo mesmo recorte que a foto — aí a concentricidade é por
construção, não por conta batida.

## 2. O cache de imagem é por URL, nunca por elemento

O objeto do elemento é o **mesmo** para todos os modelos que dividem a numeração
— é a armadilha que o `preloadAmostraItemPdfElements` já documenta para PDF. Mas
a foto muda a cada **linha**. Guardar a imagem no elemento (`el._fotoImg`) faria
toda credencial do lote sair com o rosto da primeira pessoa.

## 3. Nos modos paginados, a foto sai da FATIA do modelo

O modo PDF e a amostra do item mostram uma página por linha. A linha é
`linhasDaAmostra(item, num)[pagina - 1]`, **não** `state.csvData[pagina - 1]`. Um
modelo cuja fatia começa na linha 601 estamparia o rosto da pessoa 1. O texto
variável já tinha levado essa correção; a foto nasceu com ela.

## 4. `__fotos` é chave de sistema — nunca vira coluna

Ela mora dentro da linha, como `__ativo` e `__id`, e está em `COLS_INTERNAS` do
`csv-editor.js`. Ficar dentro da linha é o que faz o enquadramento acompanhar a
pessoa quando a tabela é reordenada, dividida entre modelos ou tem uma célula
refeita. Qualquer lugar que derive cabeçalhos das chaves da linha precisa
filtrá-la — inclusive a reconstrução em `script.js` para CSVs antigos.

## 5. Nome de arquivo solto não é foto

`_origem_de_foto` (engine.py) e `origemDeFoto` (foto-lib.js) são o segundo par de
gêmeas deste caminho. Elas dizem se o valor cru da célula aponta para algum
lugar: endereço (`https:`, `data:`) e caminho de arquivo valem; `JAQUE
ROSSI.jpeg` não vale.

Antes delas, a célula com um nome escrito passava pela conferência prévia como
linha resolvida e a tiragem morria no meio, com o PVC na bandeja — enquanto a
tela, que já usava `urlCarregavel`, mostrava um relógio de espera eterno. Três
lugares com três réguas diferentes para a mesma pergunta.

Corolário: **o vínculo `__fotos[coluna]` manda; a célula é legenda.** Qualquer
edição do texto da célula (digitar, colar, renomear a coluna, remover a coluna)
tem de tratar o vínculo junto, senão a grade mostra um nome e a credencial sai
com outro rosto. O editor de CSV faz isso em `escreverCelula`, `renomearColuna`,
`removerColuna` e `copiarLinha`.

## 6. Ponto de desenho novo? Procure o gêmeo

`drawVdpElements` existe **duas vezes**: em `script.js` e em `pedido.js` (a
prévia do Painel de Produção). São dez os pontos que desenham elementos — a
tabela está em `docs/gerenciador_de_fotos.md`. Um tipo novo que entre em nove
deles faz a tela mentir sobre o papel exatamente na tela que ninguém testou.

E toda página que carrega o `script.js` precisa carregar também `texto-ajuste.js`
e `foto-lib.js`: ele chama `desenharTextoAjustado`, `desenharElementoFoto` e
`repintor` **sem guarda**, então a falta de um dos arquivos não deixa de desenhar
só aquele elemento — derruba o canvas inteiro. `index.html`, `cliente.html` e
`producao.html`, as três.

## 7. Quem repinta a folha inteira não pode repintar por foto

Toda foto que chega avisa quem a pediu. Numa janela pequena — o editor, um card —
isso custa um redesenho barato, e o `repintor` nomeado já junta o lote num só.

Numa **folha de imposição** a conta é outra: uma passada redesenha a folha
inteira, com a arte rasterizada e todas as poses. Um trabalho de 88 credenciais
vira dezenas de redesenhos completos, e a aba engasga — foi o que aconteceu entre
a v553 e a v554 na prévia do Painel de Produção.

O padrão certo, para quem desenha folha: colher as linhas **daquela folha**
durante o desenho, chamar `precarregarFotosDosElementos` uma vez no fim e
repintar uma vez. Duas ressalvas que não são opcionais:

- **Só as linhas da folha.** Pedir as 88 fotos para mostrar as 21 que cabem é
  rede paga à toa, e rede é o que o agente local existe para não pagar.
- **`fotosPendentes` antes de pré-carregar.** Sem essa pergunta, o repinte pede
  as fotos de novo, elas resolvem na hora (já em cache) e mandam repintar outra
  vez — laço infinito.

## 8. O MuPDF renderiza o que o Acrobat rejeita

Medir pixel do PDF rasterizado prova que a **tinta** está certa, não que o
**arquivo** vale. O caso real: o canto arredondado gerava a foto com SMask em
ColorSpace ICCBased de 1 bit — a especificação exige SMask em **DeviceGray** —,
o MuPDF mostrava tudo perfeito (na tela, nos testes e na prévia), e o Acrobat
descartava todas as fotos da página com "Há um erro nesta página". O operador
recebeu um lote de credenciais sem rosto tendo conferido a prévia.

Duas regras ficaram:

- **Nunca `insert_image(mask=PNG)`**: o PyMuPDF guarda o PNG da máscara como
  veio. Transparência entra como canal alfa do pixmap (`fitz.Pixmap(pix, 1)` +
  `set_alpha`), e o MuPDF escreve a SMask canônica.
- Todo caminho novo que **escreva** objeto de PDF precisa de um teste que leia o
  **arquivo salvo** e confira a estrutura contra a especificação — além do teste
  de pixel. `test_canto_redondo_gera_smask_devicegray` é o modelo.

## 9. Normalizar antes de subir é requisito, não otimização

Uma foto de celular tem 4 MB; um lote de 500 seriam 2 GB subindo e descendo.
Reduzida no navegador para 300 dpi da janela com 30 % de folga, cada uma fica em
~150 KB. Remover essa etapa transforma a biblioteca de fotos exatamente no tempo
de rede que o agente local existe para não pagar.

Pelo mesmo motivo, o `engine.py` **baixa em paralelo antes do laço** e cacheia em
disco por hash. Não mova o download para dentro do laço.

## 10. Modelo de IA olha pequeno — não deixe a saída dele virar a foto

O LaMa, que completa fundo em `editor-foto.js`, tem entrada **fixa de 512×512**.
A tela inteira é reduzida a 512 para ele olhar. Se a saída virasse a foto, o
trabalho sairia com 512 px de resolução, e ninguém perceberia até o PVC estar
impresso. O resultado é recortado pela máscara e colado **só na região
inventada**; o que veio da câmera nunca é reprocessado.

Vale para qualquer modelo que venha depois. O teste que segura isso compara
pixels do rosto e do ombro antes e depois — igualdade exata, não semelhança.

Duas armadilhas de canvas do mesmo caminho, ambas descobertas por teste:

- **`ctx.filter = 'blur()'` chupa transparência de fora da tela.** Borrar um
  canvas deixa as quatro beiradas semitransparentes, e no JPEG final isso vira
  vinheta preta. Redesenhe a versão sem borrão por baixo
  (`destination-over`) antes de considerar pronto.
- **Com `scale(-1)`, o desenho cresce para a esquerda do ponto transladado.**
  Ladrilho espelhado ancora no ponto e desenha em `(0,0)`; corrigir a âncora com
  um deslocamento `-w` joga a aba para fora da tela e o anel fica vazio.

Modelo novo mora no **nosso Storage**, com nome de arquivo próprio (o CDN da
Cloudflare serve o antigo se você reusar o nome) e ferramenta de upload que
confere sha256 pelo endereço público. Baixado uma vez e guardado no Cache
Storage: 88 MB rebaixados no meio de um trabalho é tempo de produção perdido.

## Duas regras de produto

- **Na dúvida, não escolher.** Disputa entre arquivos ou entre linhas vira
  pendência com os candidatos à vista. Nome parecido vira sugestão. Uma
  credencial com a foto trocada só é descoberta pelo cliente.
- **Sempre vai precisar de ajuste manual.** O usuário disse isso explicitamente.
  Um desenho que assuma "o automático resolve" está errado por premissa — a folha
  de contato não é enfeite.

## Publicação

`engine.py` é embutido no `NewProd.exe`: mexeu, o agente sai junto com o site,
com número de versão novo. E todo `.js` novo do painel precisa entrar em
`security_config.PAINEL_ARQUIVOS`, senão dá 404 em toda estação — o teste
`tests/test_painel_estacao.py` cobre isso.

Para conferir no navegador, use a skill `rodar-app`.
