# Ideal Control no Link do Cliente — piloto 24880

## Estado da entrega

Implementação local no worktree `imposition-control-portal-piloto-20261115`, base
`266dae5568011fbcf3733f2a0c25668a20aa731b`. Sem migração aplicada, publicação ou
liberação remota. O checkout operacional foi preservado.

O usuário confirmou em 15/11/2026 que o pedido **24880 não foi impresso**.
O cadastro consultado apresenta o modelo 1006762 (200 unidades) como `Impresso`.
Não corrigimos esse status. Consultas encontraram zero contratos QR, reservas,
credenciais e preparações para o pedido. A rotina de contratos recusou a emissão
por status impresso sem contrato; a transação falhou e não houve reserva.
Ausência de contrato não autoriza escolher códigos novos para uma emissão antiga.

## Fluxo implementado

1. Aba oculta por padrão, controlada por chave global e lista explícita de pedidos.
2. Link ativo, pedido não cancelado, cliente válido e todos os modelos positivos
   marcados como impressos são conferidos no servidor.
3. QR Ideal ainda não publicado exige contrato existente. Divergência de emissão
   mostra orientação para atendimento; não cria evento nem reserva nova faixa.
4. O cliente clica em **Criar evento**. Uma transação cria pedido técnico, evento
   e setores. Cliques concorrentes reutilizam o mesmo evento.
5. Uma Edge Function privada por número/token prepara um lote por chamada usando
   a rotina existente. O navegador avança até 20 lotes por interação; permite
   continuar após interrupção. Não há trabalho automático ao apenas consultar.
6. Só após publicação completa e conferência por modelo é emitido o convite.
   A página mostra instalar PWA, QR e baixar QR; configurações ficam no PWA/Imposition.

O backend revalida o acesso após cada lote. Uma revogação durante um lote em curso
pode deixar hashes preparados, mas impede a entrega posterior do QR. A preparação
não apaga códigos e respeita contratos, cursor e deduplicação existentes.
Publicação marcada concluída com quantidade inconsistente exige conferência.
Eventos existentes preservam nomes de setores e configurações.

## Segurança e recuperação

`sql/ideal_control_portal_piloto.sql` instala tudo **desligado**. Cria três tabelas
privadas com RLS. A RPC é executável somente por `service_role`; a função Edge
aceita número/token do portal e não aceita evento/modelo/faixa fornecidos pelo cliente.
O identificador interno de preparação não sai da função. Respostas usam `no-store`.

O convite recuperável fica na tabela privada `ideal_control_portal_convites`,
acessível apenas pelo servidor. Não é criptografado em coluna; depende da proteção
do banco e da chave de serviço. O hash continua no cadastro existente de convites.
Não registrar token, QR, plano, pool privado ou respostas com segredo em logs.
A autoria do portal usa o link validado, sem atribuir uma identidade de atendente.

Desligamento, depois da implantação:

```sql
BEGIN;
UPDATE public.ideal_control_portal_config SET habilitado=false WHERE id=true;
COMMIT;
```

Esse comando modifica uma linha, não apaga eventos, convites ou pareamentos.
O portal reconsulta ao ganhar foco e a cada 60 segundos. Um QR já baixado e um PWA
já pareado continuam válidos; revogação de convite/aparelho permanece no atendimento.
Não usar exclusão de tabelas/eventos como rollback.

## Validação executada

- PostgreSQL portátil 18.7, loopback, somente dados fictícios, sem serviço Windows.
  Duas conexões reais: evento único e QR estável. Falha no segundo setor: rollback
  integral. Impressão parcial, token errado/revogado, pedido cancelado, fora do piloto,
  chave desligada e acesso direto às tabelas privadas: bloqueados.
- A rotina SQL real `producao_acesso_preparar_lote` foi executada com lotes fictícios:
  QR ausente na preparação parcial, repetição sem duplicação e QR após conclusão.
  Pedido sem contrato bloqueado antes de criar evento; evento existente preservado.
- Cinco testes Deno da nova Edge Function passaram: autorização, consulta sem escrita,
  revogação após lote, falha/retomada, segredo interno e CORS do SDK.
- Navegador com HTML/CSS e navegação reais: 14 verificações em cada largura 320, 390 e
  1440, sem rede. Inclui clique na aba, clique duplo, QR decodificado, texto seguro,
  instalação, revogação, desligamento e área de toque.
- Após autorização, dependências Deno foram resolvidas exclusivamente em
  `%TEMP%/ideal-control-deno-validacao-20261115`, sem mudar manifestos/lockfiles:
  **448 testes Deno passaram**, com verificação de tipos e sem permissão de rede nos testes.
- Produção e Piloto: **913 testes, dois subtestes e todos os harnesses por canal**;
  dois testes ignorados por condição do ambiente. Canal oficial em conferência.
- A lista `security_config.PAINEL_ARQUIVOS` inclui o novo módulo. Pacote local
  compilado e auditado sem arquivos privados; cache de publicação atualizado como
  painel compatível em `dist/control-portal-publicacao/painel-b97d250ec5c8`.
  Nenhum pacote foi instalado ou distribuído para estações.
- Regressão do portal integrada à suíte Python: 11 harnesses passaram.
- Mais três limites SQL passaram: sequência incompleta com contagem aparentemente
  correta, pedido de acesso inativo e QR do pedido revogado.

## Próximas etapas de entrega

1. Concluir canal oficial e checks do PR protegido; publicar somente após sucesso.
2. Revisar SQL contra o esquema vivo; apresentar prévia de implantação: três tabelas
   novas, metadados de autoria na tabela de convites existente, zero eventos criados
   pela migração. Aplicar desligado, implantar a Edge Function, publicar frontend
   com versão de cache atualizada e verificar arquivos nos dois domínios.
3. Ativar **somente 24880** em transação (uma linha de allowlist e uma chave global).
   A implantação não corrige status de impressão nem imprime o pedido.
4. Antes da impressão real, confirmar bloqueio. Após impressão e contrato válido,
   conferir em celulares reais: criar, instalar, parear, ler ingresso impresso,
   recusar repetição e conferir relatório/horário. Registrar resultado sem segredos.
5. Ampliar somente depois dessa conferência. Não há ampliação automática.

Não foi comprovada instalação em celular, leitura de ingresso físico ou relatório
do evento piloto. A informação humana de não impressão prevalece sobre a inferência
anterior baseada apenas no status cadastrado.
