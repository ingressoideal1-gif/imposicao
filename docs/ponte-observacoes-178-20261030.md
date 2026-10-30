# Ponte 1.7.8 — consulta das observacoes

A 1.7.7 consultava produtos_proposta.observacao_arte para o fallback de anotacoes.
Essa coluna nao existe nessa tabela: a coluna persistida e amostra_obs. A consulta
falhava antes de abrir o documento, mostrando o erro generico de cadastro.
Relatos: modelo 1005747 e pedido 24547/modelo 1005652.

A correcao altera somente a selecao e leitura desse campo. Anotacoes do modelo
continuam priorizando pedidos_modelos.observacao_arte/amostra_obs. Observacoes por
produto de pedidos_artes.observacoes e camadas de referencia permanecem.
Nenhum cadastro, PDF oficial ou documento de designer foi modificado no diagnostico.

Evidencia: consulta somente leitura a information_schema.columns confirmou
amostra_obs e ausencia de observacao_arte em produtos_proposta; tambem confirmou
as colunas usadas em pedidos_artes e producao_cores. Nenhum conteudo de observacao
real foi retornado ou registrado. A fixture antiga reproduzia a coluna inexistente
e foi corrigida; o teste agora exige a consulta id,amostra_obs com filtro do pedido.

Validacao: 118 testes passaram. Build isolado ponte-build-corel-20261030-10.
Instalar 1.7.8 nas estacoes, apos sair da ponte. O download permanece no mesmo link.
Publicacao nao comprova a abertura autenticada do pedido nas estacoes afetadas.
