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

Publicação, validação do pacote e adoção serão registradas após execução.
