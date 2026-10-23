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


## Publicacao concluida

Fonte publicada no commit `0f560939`, branch `fix/regressao-status-20261023`, tag `agente-v1.3.33`. Build PyInstaller e MSI aprovados; identidade NewProd e UpgradeCode preservados. Auditoria comparou os 389 arquivos frontend empacotados byte a byte, verificou a versao e a nova rotina de recibos no executavel, DLLs exigidas e ausencia de arquivos privados.

MSI: `NewProdPiloto_Oficial_v1.3.33.msi`, 196788224 bytes.
SHA-256: `d289a7252283e354e971087d6b4f03002e3e505eafb5eb1e5420a4268ec0773a`.

Os downloads publicos oficial e alias historico Teste foram integralmente conferidos por tamanho e SHA-256 antes de ativar os manifestos. `latest.json`, `newprod-piloto-oficial.json` e `newprod-piloto-teste.json` relidos com cache-buster: versao 1.3.33, mesmo hash/tamanho, liberacao universal. Evidencias e copia dos manifestos anteriores em `dist/publicacao-unica-1.3.33-*`; auditoria e releitura independente em `dist/status-regressao/`.

Consulta posterior de estacoes, com contatos recentes em 23/10/2026 por volta de 19:25 UTC: nenhuma informou 1.3.33 ainda. LASER-01, LASER-02, TEX-01 e PC-JR-HOME informavam 1.3.32; LASER-04 e GUSTAVO-PROD, 1.3.30; TEX-02, 1.3.21; ACABAMENTO-TEX, 1.3.9. A versao do painel informada no heartbeat e evidencia separada da versao do executavel.

Pendente operacional: cada estacao instalar a atualizacao (menu Atualizar agora ou ciclo normal) e conferir um pedido real pelo popup e seletor, inclusive reabrindo e consultando em outra estacao atualizada. Nenhuma instalacao/reinicializacao foi forcada e nenhum status real foi alterado nesta entrega. Disponibilidade publica nao comprova adocao nem elimina a necessidade dessa conferencia.
