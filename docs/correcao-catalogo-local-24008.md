# Catálogo local cheio ao abrir o pedido 24008

Correção baseada no NewProd 1.3.28, empacotada como 1.3.29. O banco da estação
não foi alterado diretamente durante o desenvolvimento.

## Problema e comportamento

A PC-JR-HOME tinha 4.096 revisões no catálogo, para 1.655 modelos. Uma mudança
no pedido exige registrar outra revisão; o limite impedia a admissão, embora
as revisões anteriores já estivessem substituídas. O Imposition não depende
desse catálogo e podia abrir o pedido.

Quando a admissão atinge o limite, o NewProd passa a arquivar somente os
metadados de revisões antigas de antecipação online, na tabela local
`catalogo_arquivo`. O arquivamento e a nova admissão usam a mesma transação
SQLite IMMEDIATE: falhas anteriores ao commit restauram o catálogo anterior.
Arquiva somente a quantidade necessária para abrir espaço, sem aumentar o teto.

São preservados no catálogo a última revisão admitida de cada modelo,
revisões em preparação/seleção, entradas manuais e referências das cópias de
pedidos, inclusive a ligação com pacotes derivados. Referências incompletas
interrompem o arquivamento. A nova tabela conserva os registros antigos e
permite readmissão com a mesma validação de imutabilidade.

Nenhum PDF, objeto do cache, base QR, contrato, coleta, conferência, snapshot,
status de produção ou histórico de impressão é removido. A retenção de arquivos
em disco não muda. O arquivo de metadados pode crescer; esta correção administra
as vagas do catálogo ativo, não faz limpeza de disco.

Sem candidatos seguros, a abertura permanece bloqueada e a interface informa
explicitamente que o catálogo está cheio, com código de diagnóstico.

## Validação

- 119 testes Python direcionados passaram, incluindo abertura após alteração
  com catálogo cheio, leitura dos pacotes anterior e novo, concorrência,
  proteção de referências/filas, readmissão e rollback de falha na inserção.
- Após otimizar a leitura das referências para evitar carregar snapshots
  completos, os 13 testes de regressão passaram novamente.
- Harness de seleção: abertura, mensagem específica, bloqueios e revisões.
- Harness Chromium offline: lista, catálogos, confirmação e reabertura, sem
  rede externa, com APIs e PDFs sintéticos.
- Sintaxe JavaScript e `git diff --check` passaram.
- Aviso existente de depreciação do httpx no TestClient; sem falhas restantes.

## Pacote 1.3.29

O MSI foi gerado com ProductVersion 1.3.29 e auditado sem pools privados ou
credenciais. O módulo catalogo_revisoes e os bytes de selecao-piloto.js foram
conferidos dentro do executável; o provisionamento QR v2 continua incluído.

- Tamanho: 196780032 bytes.
- SHA-256: `27070849074ac5d55ec3afc53e1bb64716b1f78157463239ca056692c4653525`.

A correção do painel é servida pelo agente empacotado. Não exige deploy do site
nem de Edge Functions. Publicação e adoção nas estações serão registradas após
a conferência dos downloads e dos manifestos. Não foi feita limpeza manual do
catálogo real nem reinício do aplicativo.

Validação de release: as três identidades históricas passaram com 1.153 testes,
2 pulados, 1 aviso de depreciação e 2 subtestes cada, além dos harnesses
JavaScript correspondentes. As três identidades recebem o mesmo instalador.
