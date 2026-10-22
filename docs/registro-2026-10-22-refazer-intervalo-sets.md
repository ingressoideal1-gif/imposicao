# Refazer intervalo entre sets — 22/10/2026

Implementação local na branch `fix/refazer-intervalo-sets-20261022`, baseada em `08686458`.

Na edição do modelo, Refazer Folhas permite escolher set/folha inicial e set/folha final. O intervalo é inclusivo: da folha 10 do set 3 até a folha 30 do set 20 inclui o restante do set 3, todos os sets 4–19 e as primeiras 30 folhas do set 20. A tela informa o total de folhas físicas e valida os limites reais de cada extremo, inclusive o último set incompleto. A opção Mesmo set conserva o uso anterior.

O painel envia `refazer_set_ate` somente para intervalos entre sets. O motor valida todos os extremos antes de entregar arquivos, mantém a numeração original e as duas faces e não acrescenta capas na reimpressão. A capacidade `refazer_intervalo_sets_v1` em `/api/version` impede que um agente antigo receba uma solicitação que não sabe interpretar.

Durante os testes foi corrigido também o descarte do documento na transição de set sem capa/lote: o documento agora só é reiniciado quando o set foi salvo. Essa correção preserva as folhas anteriores no PDF único.

Arquivos principais: `frontend/pedido.js`, `frontend/index.html`, `frontend/producao.html`, `frontend/arte-de-impressao.js`, `app.py` e `engine.py`.

## Validação

- 60 testes direcionados passaram: novos intervalos e regressões de refazer/entrega por bloco.
- PDFs reais comparados por texto e hash rasterizado: strict e strict_assembly, frente e frente/verso, com/sem capas, limite final incompleto, intervalo invertido e extremo inexistente.
- Harness de navegador nas duas páginas: exemplo 3/10 → 20/30 (871 folhas quando cada set possui 50), Mesmo set, limites, agente antigo/novo e tela de 390px.
- Fixture antiga de `test_engine_refazer.py` corrigida para declarar ausência de arte, em vez de referenciar um PDF inexistente; falha reproduzida também na base antes do ajuste.
- Harness de impressão combinada atualizado para carregar a nova função auxiliar usada por `drawPedPreview`.
- Canal oficial: 865 testes passaram, 2 ignorados e todos os harnesses passaram. Produção e Piloto: mesmo resultado, com todos os harnesses aprovados. O aviso de depreciação Starlette/httpx não bloqueou a execução.
- Relatórios completos dos canais em `dist/refazer-validacao.json` e `dist/refazer-oficial-final.json`. Artefato local em `dist/refazer-piloto/resultado-entrega.json`.

## Entrega

Sem publicação web, MSI, instalação em estação ou impressão física nesta tarefa. A disponibilização requer publicar o painel e uma versão do NewProd com a nova capacidade. Preservar as mudanças da versão operacional vigente ao preparar essa publicação; esta branch não substitui integralmente uma branch de release mais recente.

O primeiro build foi invalidado automaticamente porque houve uma correção de frontend durante sua execução. O artefato válido é `dist/refazer-piloto/compilar-fc456c029194/NewProdPiloto.exe`, auditado e recompilado com as fontes finais. Não usar o diretório anterior `compilar-4a9caa898b44`.
