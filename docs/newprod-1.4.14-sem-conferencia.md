# NewProd 1.4.14: trabalho interrompido não bloqueia novos envios

Pedido humano de 12/11/2026: remover para todas as estações o bloqueio e a mensagem que exigiam conferir o trabalho anterior.

Base: agente-v1.4.13, preservando o catálogo e a retenção de cache publicados.
O estado persistido conferencia continua no histórico para não perder evidência e não reexecutar lotes.
Ele deixa de impedir novos trabalhos; a tela o apresenta como Interrompido, sem botão ou confirmação obrigatória.
Trabalhos efetivamente ativos continuam serializados. Não existe retomada automática nem reenvio do mesmo identificador.
Nenhum histórico existente é apagado ou marcado como conferido.
A alteração exige novo MSI porque a admissão ocorre também no agente Python.
Não altera fila do Windows, configuração da impressora, pedido ou status comercial.

Validação direcionada: falha após envio, reinício abrupto, novo envio autorizado sem conferir o anterior, idempotência, concorrência e interface sem exigência de conferência.
Teste Chromium com HTTP real preserva envio de capas/miolo após fechamento do navegador; spool físico simulado.
## Validação e artefatos

- Produção: 1345 testes; Piloto e Oficial: 1346 testes em cada canal. Três skips, dois subtests e um aviso de depreciação por canal. Todos os harnesses passaram.
- O teste adicional da interface foi incluído após a coleta da primeira bateria; passou separadamente e nas baterias Piloto/Oficial.
- MSI e executáveis Oficial/Piloto compilados e auditados, sem arquivos privados.
- ProductVersion 1.4.14; quatro arquivos do painel embutido iguais à fonte.
- MSI: 196882432 bytes; SHA-256 f63482f4a6877243b0dce804ed056aba5a812361bf508181d12505624b3d13fa.
- Download público completo conferido. Fonte 4b74248c; tag agente-v1.4.14.
- Integração web anterior permanece no PR 279, atualizado em 1ca1eeac para não reintroduzir a conferência. O painel do MSI inclui a correção independentemente desse PR.
- Nenhuma estação foi reiniciada ou instalada à força, nenhuma OS foi reenviada e nenhum status comercial foi alterado.

A adoção é confirmada pela versão 1.4.14 no agente. Abrir o painel nessa versão com registro antigo interrompido deve permitir novo trabalho sem exigir conferência. Não há prova de impressão física nesta entrega.


## Publicação confirmada

Manifestos públicos latest.json e newprod-piloto-oficial.json conferidos em 12/11/2026: versão 1.4.14, mesmo hash/tamanho do MSI e sem lista restritiva de estações.
Canal de teste preservado em 1.3.35.
A leitura final de print_agents foi recusada pelo CLI com Invalid access token; instalação nas estações não confirmada nesta entrega.

## Entrega segura concluida em 12/11/2026

- PR 279 integrado apos todos os checks obrigatorios: https://github.com/ingressoideal1-gif/imposicao/pull/279.
- Merge web: 1805aa3ea9e7efcb506f19ada671c45d1103ff9c; fonte validada d48aaf9ba9f09e167c31f4ab89801b9baeb44949.
- CI 43305195458 aprovado nos tres canais, consulta autenticada e Windows seguranca/recuperacao.
- Regressoes locais da integracao web: 912 testes por canal Producao/Piloto, dois skips, dois subtests e todos os harnesses aprovados.
- Cloudflare Pages de producao: 5bd18948-477a-488f-8a36-c2ca525327f9, sucesso.
- index.html, producao.html, pedido.js, script.js e impressao-autonoma.js conferidos por hash normalizado em imposition.ai-ideal.com.br e imposicao.pages.dev: 10/10 iguais a fonte.
- MSI e manifestos 1.4.14 reconferidos, sem restricao de estacoes; teste permanece 1.3.35.
- Consulta somente leitura de estacoes recuperada pela credencial de publicacao ja autorizada: Gustavo 1.4.11 (contato 18:10:28 BRT), Laser 01 1.4.13 (18:10:18 BRT).
- Logo, publicacao concluida; adocao da 1.4.14 nessas estacoes e impressao fisica continuam pendentes.

Retomada: instalar a 1.4.14 com a fila ociosa, confirmar a versao e verificar que um registro antigo interrompido nao exige conferencia para iniciar outro. Nao reenviar automaticamente a OS.
Recuperacao: preservar historico e spool. Para o agente, preparar uma versao superior com reversao focal; para web, novo commit focal ou rollback de deployment comprovado, sem restaurar indiscriminadamente o painel antigo.
