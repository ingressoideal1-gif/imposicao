# Entrega no Link do Cliente: recebedor e endereço por CEP

Implementação local na branch `fix/portal-entrega-cep`, baseada em `ea668659` (v884).
Funções SQL instaladas e verificadas no Supabase; frontend publicado e conferido como v885.
Checkout operacional preservado. Instalação em transação única, sem alteração de registros.
Hash do corpo da leitura: `e6d88cf7d9242a76dfd933b5e034f79a`; gravação: `f54861afc573fbca02729b8f14a68e3a`.
Execução como anon confirmada; token inválido rejeitado. Backup de definição em
`C:/Users/Junior/AppData/Local/Temp/codex-portal-persistencia-20260916/entrega-backup-funcoes.json`.

## Comportamento

- Entregas por transporte exibem inputs de recebedor, CPF, CEP, endereço, número,
  complemento e bairro. Cidade e UF vêm da consulta. Retirada mantém endereço da gráfica.
- O cliente digita o CEP e usa **Buscar endereço pelo CEP**. CEP inexistente, erro de rede,
  timeout ou consulta desatualizada impedem confirmar. CEP geral permite completar rua/bairro.
- Nome e CPF já disponíveis são preenchidos; pessoa física mantém a alternativa da nota.
  CPF é validado pelos dígitos verificadores no navegador e na RPC.
- **Confirmar** primeiro grava o endereço e exige recibo dos nove campos e do pedido.
  Depois persiste a decisão pelo fluxo existente. Somente as duas respostas confirmadas
  liberam avanço. Falha na segunda etapa mantém endereço salvo e decisão pendente na tela;
  repetir a primeira etapa com valores iguais não duplica o endereço.
- Inputs ficam bloqueados depois de confirmar. **Desfazer** persiste a reabertura antes
  de permitir editar. O rascunho sobrevive aos redesenhos durante a visita.

## Banco e isolamento

Consulta autorizada de catálogo em `e-deal` (`vwbtitjlpelrcnsytzqw`), sem registros de clientes,
confirmou tipos/defaults/restrições de `enderecos` e `propostas` e gatilhos envolvidos.
O corpo da RPC de leitura instalada também foi comparado com a base versionada:
a diferença encontrada é somente um comentário sobre telefone da gráfica.

`sql/link_cliente_pedido_enderecos_portal.sql` é uma nova revisão da leitura, sem modificar
o script histórico já aplicado. Exclui endereços marcados com `obs=portal-entrega-pedido:N`
das alternativas de cadastro e nota. O endereço escolhido explicitamente no pedido continua
sendo lido. Isso preserva inclusive clientes sem principal ou sem endereço anterior.

`sql/link_cliente_salvar_entrega.sql` é aditivo. Valida número + token ativo, bloqueia linhas,
recusa alteração de entrega confirmada/finalizada, valida os campos e compara o endereço anterior.
Cria `enderecos` com o cliente da proposta e tipo ENTREGA; atualiza somente
`propostas.id_endereco_ent` do pedido autorizado. Não sobrescreve o endereço compartilhado.
A leitura posterior pela RPC do portal deve devolver exatamente os valores enviados.

O gatilho `propostas_preencher_valor_total_avulsa` pode preencher totais em qualquer UPDATE.
Uma conferência integral da proposta, desconsiderando apenas vínculo e `updated_at`, recusa
e reverte a transação se qualquer outro campo mudar. Grants de tabelas permanecem intactos.

## Validação

- `portal_entrega_cep_harness.js`: CPF, busca, resposta atrasada, recibo vazio/divergente,
  falha parcial, repetição e bloqueio de cliques concorrentes.
- `portal_entrega_cep_browser_harness.js`: Chromium em 390 px, inputs e cliques reais,
  sem rolagem horizontal, preenchimento preservado e bloqueado depois de confirmar.
- `portal_entrega_cep_pglite.cjs`: PostgreSQL/WASM exclusivamente em memória, execução
  como anon, token inválido, campos inválidos, CPF, isolamento, idempotência, conflito,
  rollback por efeito financeiro e finalização integrada pela RPC já existente.
- Pytest serial: 24 testes passaram (`test_harnesses_do_portal.py`, `test_portal_do_pedido.py`).
- Harness de pendências adaptado: o antigo aviso de campo faltante foi substituído pelo
  formulário; permanecem as verificações de isolamento visual do cartão de pendência.

Bibliotecas existentes externas ao worktree, sem instalação ou mudança no lockfile:
`NODE_PATH` aponta para node_modules do checkout histórico; `PGLITE_MODULE` aponta para
o PGlite temporário usado na validação da v884.

## Implantação, recuperação e limites

Instalar primeiro a revisão da leitura e depois a RPC de gravação, antes de publicar os
arquivos frontend, atualizando versões de cache pelo fluxo de entrega. Instalar as funções
não altera registros existentes; cada chamada válida
posterior cria no máximo um endereço e atualiza uma proposta, em transação.
Para recuar o frontend, restaurar a versão anterior através de novo commit; a RPC aditiva
pode permanecer sem uso. Manter a revisão de leitura para que os endereços exclusivos já
criados continuem fora das alternativas de cadastro/nota. Endereços antigos permanecem
disponíveis para recuperação do vínculo.

Não houve gravação em pedido real para testar. Testes funcionais simulam
ViaCEP e Supabase. API consultada conforme [documentação oficial do ViaCEP](https://viacep.com.br/).
Somente CEP vai para essa API, nunca CPF ou nome. A consulta é feita no navegador;
a RPC valida formato/conteúdo obrigatório, mas não atesta o resultado externo do ViaCEP.

Endereço e decisão permanecem duas transações, com confirmação visual somente após ambas;
não constituem uma transação distribuída com o serviço de CEP. A trava de navegador serializa
ações nesta visita; a proteção de snapshot do endereço detecta conflitos antes de salvar.
Não foram alteradas as permissões legadas de confirmação direta em `pedidos_artes`.
Mudança do destino não recalcula frete, valores ou prazo: as regras comerciais existentes
continuam sendo responsabilidade do fluxo de atendimento.


## Publicação concluída

- SQL: commit `18063e20`, instalado antes do frontend em transação única.
- Frontend: commit `5138eadf079e07a9447c3ccaffbb91e603c44454`, tag `v885`.
- Cloudflare Pages: check desse commit concluído com sucesso.
- `cliente.html`, `cliente-entrega-form.js`, `cliente-entrega.js` e
  `cliente-confirmacoes.js` comparados por SHA-256 normalizado (BOM/CRLF) com os locais
  em `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`: 8 de 8 conferem.
- A verificação imediata do publicador registrou divergência durante propagação;
  a integração não foi repetida. A conferência independente posterior confirmou todos os arquivos.
- Checkout operacional preservado. Nenhum pedido real usado para teste de gravação.

Hashes finais dos arquivos publicados:

- `cliente.html`: `6fcea1ae417879e6fcc06bed2739f896ae62f7feb04a42a44438a7fefb6a76cf`
- `cliente-entrega-form.js`: `808c93921f1e62a75b00bd632ac77e6e14c9834054cde1909d689932d5a6b1d5`
- `cliente-entrega.js`: `9ff1b14d9802621e7b3b07171c0893f0cd838d35f424170ecdd64b8745ec80e2`
- `cliente-confirmacoes.js`: `87dd36785709bb5d12ff506326ee02522039e4e212fe48ad31af9d6b9d27ea0a`


## Ajuste solicitado: CEP somente após Alterar

O CEP cadastrado permanece visível e desabilitado na conferência inicial. O botão
Buscar endereço pelo CEP aparece somente depois de a solicitação **Alterar** ter
sido persistida. A confirmação do endereço já cadastrado dispensa nova consulta.
Durante alteração, a busca por CEP continua obrigatória antes de confirmar.
Recebedor e CPF continuam editáveis enquanto a entrega não estiver confirmada.

Testes de regressão verificam bloqueio inicial, confirmação sem consultar API,
liberação após Alterar, manutenção do bloqueio quando essa gravação falha e cliques
reais no navegador móvel. Não requer nova migração SQL.

Ajuste publicado como **v886**, commit `8624a2e1ad3a8706d7f43634711391910e78ebc6`.
Cloudflare Pages concluído com sucesso; HTML e formulário conferidos nos dois domínios.

## Fluxo direto e endereços cadastrados

A Entrega deixa de usar a caixa “Escreva o que precisa ser corrigido”, o botão
“Salvar correção” e o link “Desfazer”. Esses controles continuam na Nota, onde
uma divergência ainda depende do atendimento. Na Entrega, o fluxo passa a ser:

1. campos bloqueados para conferência;
2. **Alterar** libera os campos sem marcar o pedido como `CORRIGIR`;
3. **Confirmar** valida, grava o endereço, persiste a confirmação e bloqueia os campos;
4. qualquer falha mantém a edição aberta e não avança.

**Ver endereços cadastrados** abre um modal com endereços do cliente comercial
vinculado à proposta. A seleção apenas carrega o formulário; a gravação continua
dependendo de Confirmar. Cópias exclusivas criadas pelo portal para outros pedidos
não aparecem. O endereço exclusivo do pedido atual permanece elegível. A opção
**Informar outro endereço** preserva recebedor/CPF e limpa os campos do destino.

Essa lista é incluída pela RPC de leitura sob `enderecos_entrega`; não concede
leitura direta à tabela e não mistura o cliente de faturamento quando ele difere
do cliente comercial do pedido.

Revisão SQL instalada no Supabase antes do frontend, commit `3fc01280`. A função
permanece `SECURITY DEFINER`, executável por `anon`, rejeitou token inválido e foi
confirmada com hash de corpo `2bed9c5ff5007d453e70a2db7da2e9de`. A definição
anterior para recuperação ficou fora do repositório no diretório temporário da
entrega (`enderecos-modal-recuperacao.sql`). Nenhum pedido real foi aberto ou alterado.
