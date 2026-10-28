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
