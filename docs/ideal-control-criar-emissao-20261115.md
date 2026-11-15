# Emissão automática ao criar o evento

Regra confirmada pelo usuário: o status **Impresso** libera **Criar evento**.
O clique prepara os códigos pela regra do pedido, sem exigir impressão física
ou reserva manual pelo atendimento. Apenas visitar a aba não cria reservas.

`sql/ideal_control_portal_emissao_automatica.sql` adiciona um auxiliar privado
de reserva e atualiza a RPC do portal. A mesma transação valida o acesso,
cria/reutiliza o evento e reserva a primeira emissão QR12. Lotes e entrega do
QR continuam no fluxo já publicado. A rotina das estações permanece intacta.

O auxiliar parte da definição SQL conferida em produção, com hash obrigatório
`0c046feddbdf4aa57bd71643da8b9fbc`. Aceita reserva depois de marcar Impresso
somente no fluxo do portal. Contratos anteriores permanecem imutáveis;
divergência de numeração/quantidade, emissão legada incompatível, preparação
anterior sem contrato ou falta de capacidade continuam recusadas.
O algoritmo não deve ser atualizado isoladamente: revisar o auxiliar junto
com alterações futuras na regra QR. A migração recusa fontes diferentes das
versões analisadas e normaliza CRLF antes de transformar as funções.

O auxiliar não permite chamada direta por anon, authenticated ou service_role.
Somente a RPC com execução como proprietário o chama após validar link,
piloto, impressão completa, evento e revogação. A allowlist continua em 24880.

## Validação

PostgreSQL 18.7 portátil, loopback, dados fictícios e duas conexões reais:

- Status Impresso sem contrato apresenta Criar evento; consulta não reserva.
- Cliques simultâneos geram um evento, um contrato e uma reserva.
- Pedidos distintos não recebem faixas sobrepostas; repetição preserva contrato.
- Alteração da numeração não substitui o contrato existente.
- A API de emissão das estações conserva sua proteção anterior.
- Falha na segunda reserva desfaz evento, setores, contratos e reservas; nova
  tentativa completa a operação sem duplicar.
- Continuam passando os testes anteriores de link revogado, impressão parcial,
  retorno após falha, lote repetido e liberação de QR apenas após publicação.

Fixtures contêm somente esquema/funções e dados fictícios. A definição de função
em `tests/control_portal_qr_baseline.sql` é código, sem dados ou credenciais.

## Implantação e recuperação

Alvo: Supabase `vwbtitjlpelrcnsytzqw`. Cria uma função privada e substitui uma
RPC; não altera pedidos, contratos, códigos, convites ou configurações ao aplicar.
A migração é transacional. O pedido piloto 24880 já tem evento e 200 códigos;
conferir que seus registros e QR permanecem iguais após a implantação.

Recuperação imediata: desativar `ideal_control_portal_config.habilitado` na linha
`id=true`, sem apagar eventos, contratos, códigos ou pareamentos. A desativação
da aba não interrompe o PWA. Não recriar a emissão do piloto para testar.

A validação física foi dispensada pelo usuário; não foi realizada nem inferida
a partir do status cadastrado.
