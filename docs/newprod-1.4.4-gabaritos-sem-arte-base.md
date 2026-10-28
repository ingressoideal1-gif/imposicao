# NewProd 1.4.4: gabaritos sem arte de base

O pedido 24409 expôs um bloqueio de preparação: seu modelo aprovado usa
numeração sem arquivo de arte separado. O mesmo caso é válido para qualquer
gabarito com elementos de impressão, inclusive arte incluída nos elementos.

A correção permite preparar um manifesto local sem PDF de frente quando a
nuvem confirma o gabarito vinculado. Aprovação, empresa, situação do pedido,
digest de modelo/gabarito e integridade dos recursos continuam obrigatórios.
Modelos sem gabarito, gabaritos vazios e URLs de arte inválidas não ganham a
exceção. A revisão anterior do cache é renovada uma vez para incluir modelos
que o servidor antigo omitia. Nenhum dado comercial ou cálculo é modificado.

Fonte principal: PR #215, commit b94ccbe5. Pacote baseado na tag publicada
agente-v1.4.3 (710308a6), preservando as correções do agente que ainda não
estão na main. A função piloto-local é preparada sobre o código baixado da
versão ativa 26; somente piloto_local.ts e piloto_pedido.ts mudam. A correção
já publicada que ignora o metadado superior nome na coleta de recursos é
preservada. A função acesso-estacao não precisa ser alterada.

Regressões específicas geraram PDFs sintéticos de 1 a 200 sem arte de base,
com e sem PDF incluído no gabarito. Também verificam revisão alterada,
aprovação revogada, fonte externa, manifesto vazio, reabertura e cache antigo.
As verificações de canal, compilação, publicação e adoção são registradas
separadamente em dist/ durante a entrega. PDF sintético e aceite do servidor
não comprovam impressão física.

## Entrega em 28/10/2026

- PR #215 integrado por merge protegido f7a751eb, com todas as verificações
  obrigatórias aprovadas. Tag agente-v1.4.4 aponta para f22940b6.
- Produção, Piloto e Oficial: 1.208 testes aprovados e 2 ignorados em cada
  canal, além de todos os harnesses previstos. Os 29 testes dos módulos
  preparados sobre a função ativa passaram sem rede.
- piloto-local publicada na versão 27, ACTIVE. Os 17 módulos baixados após
  a publicação coincidem com a preparação. Autenticação preservada; requisição
  sem credencial devolveu 401.
- MSI 1.4.4: 196816896 bytes, SHA-256
  `3b4f52cbe9e43b3d8d2e36667bd06d5167a52b3828cee321af4fb75fe645c926`.
  Download público integral conferido antes de ativar os manifestos oficial
  e latest.json. Manifesto de teste preservado em 1.3.35.
- Auditoria confirmou ausência de arquivos privados, os três módulos Python
  corrigidos no executável e igualdade dos 389 arquivos do painel.
- Consulta às 16:25 BRT ainda não mostrou estação em 1.4.4. LASER-01 mantinha
  1.4.2 com registro anterior de agente executando; TEX-02 mantinha 1.3.21
  com MSI 1603. Nenhuma estação foi reiniciada à força. Adoção e impressão
  física permanecem pendentes; após atualizar, reabrir o pedido 24409.

Evidência: [resultado da entrega](evidencias/newprod-144-gabaritos.json).
