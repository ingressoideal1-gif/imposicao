# Faces na impressão do modelo — 06/10/2026

Correção local na branch `fix/faces-producao-20261006`, baseada em `origin/main`
no commit `39e593838899bca935c29a7fdd82dfec0203d3fb`. O checkout operacional
`C:\ProjetosLocais\ideal-imposition` e suas alterações existentes foram preservados.

## Problema e correção

O painel principal (`index.html`) tinha os controles Apenas Frente/Apenas Verso,
mas `producao.html` não os incluía. O JavaScript compartilhado retornava sem
mostrar os controles quando não encontrava `ped-print-faces`. A ausência foi
confirmada anteriormente nos dois domínios públicos e no painel servido pelo
NewProd local. A entrega original v926 adicionou os controles somente ao HTML
principal; a página de produção recebeu apenas referências de cache.

`frontend/producao.html` agora inclui os mesmos identificadores e callbacks,
junto dos botões de gerar PDF e imprimir o pedido. Sem marcar, permanecem ambas
as faces. Marcar uma desmarca a outra. A escolha é temporária, limpa ao trocar
modelo, seleção ou modo, e aparece apenas em trabalhos com verso. A seleção é
aplicada pelo fluxo existente ao PDF antes de baixar ou entregar ao destino.

O seletor `ped-print-mode` também recebeu a opção existente `duplex_unico`
(FxVersoUnico). Sem essa opção, atribuir o modo de um modelo vinculado a uma
numeração FxVersoUnico deixava o select sem valor e os controles não apareciam.
Não houve mudança no motor, API, banco, numeração, quantidades ou preferências
persistidas de impressora.

## Regressão e validação

`tests/pedido_faces_impressao_harness.js` passou a usar os dois HTML reais e a
folha de estilos no navegador, com dependências externas simuladas. Executa as
funções reais de resumo e seleção para testar os quatro modos com verso,
callbacks dos checkboxes, exclusividade, ambas as faces, troca de modelo e de
seleção, modo Frente e mudança de numeração. Confere a seleção também numa
janela de 400 pixels. Antes da correção, falhou com
`producao.html: ped-print-faces / 0 !== 1`. Após a correção, passou junto da
filtragem de PDFs sintéticos, preservação de ICC e tratamento de erros.

Também passaram os harnesses `impressao_combinada_fluxo_harness.js`,
`entrega_imediata_harness.js` (49 verificações) e `folha1_pedido_harness.js`.
Falha de entrega e cancelamento nos logs são cenários simulados previstos.
A sintaxe do harness e `git diff --check` passaram.

`ferramentas/conferir_duas_versoes.py` concluiu em Produção e Piloto: 389 testes
passaram, dois foram ignorados e houve um aviso em cada canal; todos os
harnesses do conferidor também passaram. Os dois testes ignorados dependem de
`qr_ideal_pool.bin`, ausente na cópia isolada; esse arquivo privado não foi
copiado nem lido. O aviso é a depreciação de `httpx` no TestClient do Starlette.
As dependências existentes foram reutilizadas, sem instalação ou atualização.
Log local: `dist/validacao-faces/duas-versoes.log`.

## Pacote independente do Piloto

Gerado com `ferramentas/compilar-piloto.ps1`, após ler o script e a especificação
de empacotamento, em uma saída nova da cópia isolada. Não foi usado o build
normal que limpa saídas ou prepara configurações privadas da estação.

- Executável: `dist/piloto-faces-20261006/NewProdPiloto.exe`.
- Tamanho: 142.669.307 bytes.
- SHA-256: `328db20d38a0d145d72ec592ebcfbd4e27a08769d4f7e8c47c5c2ad94a8376f8`.
- O conferidor aprovou a ausência de arquivos privados/módulo de segredo.
- `frontend/producao.html`, `frontend/index.html` e `frontend/pedido.js`
  extraídos do pacote correspondem byte a byte à fonte desta cópia.
- Evidência: `dist/validacao-faces/pacote-piloto-fontes.json`;
  log: `dist/validacao-faces/build-piloto.log`.

O manifesto registra o commit-base. A correção ainda não está commitada;
a evidência de fontes registra explicitamente essa condição e seus hashes.
Este pacote é um artefato local preparado, sem instalação ou distribuição.

## Estado ao concluir a correção local

A implementação está na cópia isolada
`C:\ProjetosLocais\ideal-imposition-faces-producao-20261006`.
Este registro descreve uma correção local: não houve commit, push, publicação,
atualização das instalações, envio a impressora/hotfolder real ou gravação em
banco compartilhado. A disponibilização no site e nos painéis instalados é
uma etapa posterior. Conferência visual com pedido real e impressão física
não foram executadas.

## Preparação da entrega segura

O pedido humano `ENTREGA SEGURA` autoriza a entrega desta correção ao site e
aos painéis locais afetados. A simulação de `entrega-segura.ps1 publicar`
concluiu com `ESTADO: VALIDADA`, integração direta e versão planejada v1026.
Reexecutou os quatro harnesses pertinentes e conferiu sintaxe, escopo,
whitespace e ausência de segredos. Log: `dist/validacao-faces/entrega-simulacao.log`.

A execução efetiva deve gerar novamente o pacote independente do Piloto após
o commit, comprovar os arquivos públicos nos dois domínios e guardar backup
dos HTML locais antes da atualização. O checkout operacional permanece
preservado; não será alinhado automaticamente. O resultado posterior e os
hashes serão registrados separadamente, sem declarar impressão física.
