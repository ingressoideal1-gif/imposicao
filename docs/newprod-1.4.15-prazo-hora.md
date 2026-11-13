# NewProd 1.4.15 — hora do prazo na lista local

A lista preparada da estação carregava a data de entrega e dispensava tanto
a consulta inicial dos horários quanto o complemento assíncrono. O site
continuava mostrando a hora, mas a lista local ficava somente com a data.

O complemento existente passa a executar também para a lista preparada.
A abertura da lista não aguarda a rede. Os horários disponíveis são aplicados
à mesma lista e ao mesmo usuário; respostas de uma seleção anterior não alteram
a lista atual. Sem horário disponível, mantém-se somente a data.

Base: fonte publicada do NewProd 1.4.14 (4b74248c), com seus registros de entrega.
Não altera prazo no ERP, filtros por dia, numeração, impressão ou manutenção
do cache. A investigação da lentidão de visualização da LASER-01 está pausada.

Teste de regressão reproduziu a ausência de chamada para localPreparado=true
antes da correção. Cobre a carga sem bloqueio, aplicação da hora, resposta antiga,
ausência de horário e isolamento do caminho web. Cache das entradas HTML renovado.

## Validação

- Produção, Piloto e Oficial: 1.346 testes aprovados por canal, três skips,
  dois subtests e um aviso de depreciação por canal. Todos os 25 harnesses
  por canal passaram, incluindo a regressão desta correção.
- Executável e MSI auditados sem arquivos privados; DLLs de impressão presentes.
- ProductVersion e versão embutida: 1.4.15. script.js, index.html e producao.html
  embutidos iguais aos arquivos da fonte.
- MSI: 196882432 bytes; SHA-256
  `4dfb06c48c6f0a7b547ae1096203a0fa478cf370415d3d054b9e0facf9037b5c`.
- Fonte: ff70634ff6d70b450effa8bec1724cf121af056f; tag agente-v1.4.15.

## Publicação em 13/11/2026

- MSI imutável enviado a agent-releases e baixado integralmente; tamanho e
  SHA-256 iguais ao artefato local auditado.
- latest.json e newprod-piloto-oficial.json relidos publicamente com cache-buster:
  versão 1.4.15, hash/tamanho conferidos, sem restrição de estações.
- Canal de teste preservado em 1.3.35.
- Fonte e tag publicadas no GitHub. O site já exibia a hora; a correção pertence
  ao painel local distribuído pelo MSI, sem substituição do frontend web.
- Nenhuma instalação ou reinicialização de estação foi forçada. A instalação
  da 1.4.15 e a conferência visual autenticada permanecem pendentes.

Retomada: após atualizar uma estação ociosa, confirmar 1.4.15 e abrir o Painel
de produção. Um pedido com hora registrada no ERP deve ganhar o horário após
o complemento da lista; sem hora cadastrada, continuar somente com a data.
O complemento usa a consulta existente, com limite de 30 segundos; indisponibilidade
da rede ou do horário não inventa valores nem bloqueia a lista.

Recuperação: publicar uma versão superior com reversão focal para a fonte anterior,
preservando os dados e o spool. Não rebaixar o agente nem reverter outros arquivos.
