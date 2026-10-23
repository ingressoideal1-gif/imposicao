# Regressao de status no NewProd — 23/10/2026

Base isolada: `agente-v1.3.32` / `ed74018c`. Checkout operacional preservado.

## Regra confirmada pelo usuario

Confirmacao prioritariamente na rede. Em divergencia automatica, preservar o status local Impresso em vez de rebaixar para Aguardando. Voltar para Aguardando somente por acao explicita do operador.

## Evidencia e limites

A versao 1.3.32 encaminhava popup e seletor a uma confirmacao local e retornava sucesso sem gravar na rede naquele momento. A sincronizacao posterior compara a revisao de todo o pedido. Essa revisao muda com atualizacoes do pedido/modelos/catalogo, inclusive apos a primeira confirmacao de um pedido com varios modelos; a confirmacao seguinte pode terminar como conflito. A regressao sintetica inicial demonstrou zero gravacoes na rede ao retornar sucesso.

A consulta de producao foi somente leitura. Havia estacoes ativas na 1.3.32, 1.3.30 e versoes anteriores. Os carimbos atuais nao representam um historico de transicoes; nao foi demonstrado um autor de reversoes remotas. O acesso SQL de gerenciamento recusou o token; leituras REST autorizadas continuaram disponiveis. Nenhum status real foi alterado durante os testes.

## Correcao da versao 1.3.33

- `frontend/script.js`: popup e seletor usam gravacao confirmada na rede; leitura previa identifica o modelo/pedido e impede confirmar Corrigir Arte; PATCH condicionado ao status/carimbo observado; exige exatamente uma linha e releitura com status correto antes do sucesso. Nao usa a revisao global do pedido como condicao para gravar um modelo.
- `frontend/offline-estacao.js`: lista e detalhe consultam os status da rede, preservam Impresso em divergencia automatica e reaplicam recibos locais confirmados. Uma decisao explicita para Aguardando fica registrada separadamente. Confirmacoes legadas pendentes/conflitantes continuam preservadas, sem apresentacao de gravacao na rede inexistente.
- `offline_estacao.py`: aceita o recibo de Impresso confirmado online, valida pedido/modelo/status/carimbos e o preserva apos reinicio. Nao reenfileira um recibo ja confirmado. Nao altera schema remoto, PDFs, numeracao nem impressao fisica.

Validacoes focadas aprovadas: rede antes de sucesso, popup/seletor, duas estacoes simuladas, varios modelos, snapshot antigo, reabertura, retorno explicito, rede indisponivel, zero linhas, releitura divergente, bloqueio Corrigir Arte e preservacao de recibo legado. Chromium com rede simulada; 25 testes Python de persistencia local e rotas. Regressoes incluidas na verificacao dos tres perfis.

## Validacao completa e entrega autorizada

Produção, Piloto e Oficial: 1.163 testes Python aprovados, dois ignorados, dois subtestes aprovados em cada perfil; 24 harnesses JavaScript por perfil aprovados. Aviso existente de depreciacao do transporte httpx do Starlette. Relatorios locais em `dist/status-regressao/testes-duas-versoes.json` e `testes-oficial.json`. Apos o ajuste final da ordem de renderizacao e da protecao Corrigir Arte, os tres harnesses de status/painel tambem foram executados novamente e passaram.

Usuario autorizou compilar e publicar NewProd 1.3.33, sem reinicio forcado das estacoes. Versao de asset principal 1322; base preservada da 1.3.32. Pipeline oficial retomado pelas etapas componentes ja inspecionadas (testes, build_agent.ps1, compilar_msi.ps1, auditoria e publicar_newprod_unico.py), porque a fonte ja esta versionada e o orquestrador exige uma versao superior a ela.

Publicacao e adocao nas estacoes devem ser comprovadas separadamente. Nao promover os registros reais a Impresso em massa nem reenviar trabalhos a impressora para testar. Esta entrega do agente nao publica o site web separado.
