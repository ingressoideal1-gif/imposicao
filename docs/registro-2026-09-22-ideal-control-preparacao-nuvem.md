# Ideal Control: preparação na nuvem e atualização do PWA — v946

## Escopo autorizado

Usar a base atual do NewProd em serviço privado, preparar os ingressos ao carregar
o QR do evento, publicar ao terminar. Atualizar os dados do evento no PWA e mover
Meus Pedidos/Ler QR do evento para o menu do olho. Checkout operacional preservado;
implementação no worktree `ideal-imposition-ideal-control-qr-pronto`.

## Implementação

- Base de 24.000.000 bytes no bucket privado `ideal-control-master` do Supabase
  e-deal (`vwbtitjlpelrcnsytzqw`). SHA-256
  `8e30409786113d484103cb66f88080a99bb67530a4817c245789c8929da35174`.
- Policy RESTRICTIVE para todas as operações de anon/authenticated. Somente o
  serviço lê o objeto. Cópia privada baixada e hash comparado com a estação.
  HEAD público e autenticado sem credencial recusados, HTTP 400.
- `sql/ideal_control_preparacao_nuvem.sql` aplicado em transação: tabela com RLS,
  RPCs SECURITY INVOKER exclusivas de service_role, proteção do bucket.
- `preparar-qr-evento` valida o convite antes de acessar os pedidos. Prepara 100
  hashes por rodada, verifica integridade da base e retorna somente progresso.
  O PWA continua até concluir, ativa o celular e baixa a faixa existente.
- Cursor e hashes são gravados na mesma transação, com bloqueio do pedido.
  Repetição do cursor não duplica registros. Mudança da fonte durante preparação
  e divergência de credencial já gravada interrompem a operação para conferência.
- Mesma combinação pedido/modelo/posição e PBKDF2 de 10.000 iterações do NewProd.
  Início de numeração e posição de TICKET respeitados, sem dividir QTD física.
  Preservada a preferência já existente pelo primeiro QR Ideal/QR/barcode legível.
- Evento, data, local, aparelho e setores atualizados no sincronismo; a lista
  consulta metadados por token ao voltar ao app, recuperar rede e a cada 30 s.
  O cache offline e os campos com alterações ainda não salvas são preservados.
- Captura por câmera/digitação disponível antes de publicar; sem faixa completa,
  informa pendência e não autoriza entrada. Com a nova preparação pelo QR do
  evento, o caminho normal já baixa os ingressos antes de abrir a portaria.

## Execução e provas

- Migração validada primeiro em schema isolado, dados sintéticos e ROLLBACK:
  lotes, repetição, cursor incompatível, mudança da fonte, fechamento e ACL.
- Pós-aplicação confirmou: bucket privado, um objeto, policy restritiva, RLS e
  RPC negada a anon/authenticated. Nenhuma credencial em claro no banco.
- Pedido 19521 preparado: 1.000 ingressos do modelo 1000159 e 500 do 1000160.
  Todos os 1.500 hashes comparados com `qr_ideal.PoolQR` e `hash_codigo` da estação.
  Preparação executada pelo módulo novo com Storage/RPC remotos e credencial
  de serviço somente em memória. Não gerou PDF nem exigiu NewProd em execução.
- Portaria Edge 257 ACTIVE, verify_jwt=false, com autenticação própria nas rotas.
- 15 testes Deno: preparação, metadados/faixa/sincronismo, QR e PIN.
- Python: 85 testes de atualização/menu/chaveiro/lista; 48 de atualização,
  zeramento, QR e sincronismo; 9 testes direcionados de menu/olho/campos;
  17 de QR e paridade de hash; mais o teste de falha/retomada da preparação.
  Há sobreposição entre grupos. Deno check e JS syntax checks aprovados.

## Limites e recuperação

Não houve teste físico no iPhone nem leitura de ingresso impresso. Publicação web
deve ser confirmada por hashes nos dois domínios, registrados na evidência final.
O carregamento depende de internet na preparação/download; a leitura offline
continua disponível depois da carga completa.

Em falha de publicação, retornar frontend/função portaria à revisão anterior
preserva os hashes preparados, pois sal e algoritmo continuam compatíveis.
Não apagar credenciais para reverter a interface. A base permanece privada.
Após início da preparação, mudança de numeração que afete códigos exige
conferência da gráfica; dados descritivos do evento podem ser atualizados.
