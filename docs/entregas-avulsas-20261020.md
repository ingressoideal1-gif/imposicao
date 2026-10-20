# Entregas avulsas e locais reutilizáveis

Implementação local, junto com rotas mistas. Não publicada nem aplicada no banco remoto.

## Uso

O botão Adicionar entrega fica no Imposition para quem pode editar Entregas (ADM, Financeiro e Expedição). Atendimento continua somente consulta.

O formulário permite buscar um local pelo nome ou CEP, ou informar nome, CEP, número, complemento e endereço. O ViaCEP preenche rua/bairro/cidade/UF; CEP geral ou serviço indisponível permitem preenchimento manual. Dados retornados depois de fechar o diálogo ou mudar o CEP são ignorados.

Salvar cria uma entrega identificada por AV-número e salva o local para reutilização. A nova entrega aparece na consulta para seleção do motorista. Uma cópia do nome/endereço é preservada em cada entrega.

As avulsas aparecem na modalidade Motoboy/Todas, no mapa, na seleção de rotas e no PWA. Usam as mesmas rotas, previsões, retirada de entregador, recebedor, foto e tentativas. Confirmar uma avulsa não cria nem conclui um pedido no ERP.

## Implementação

- `frontend/entregas-avulsas.js`: formulário, CEP, busca e gravação confirmada pelo servidor; identidade da operação preservada para reenvio.
- `sql/vibe_entregas_avulsas.sql`: tabelas privadas do Vibe, RLS, busca limitada e cadastro transacional/idempotente com auditoria. Locais iguais não se duplicam.
- `sql/vibe_entregas_avulsas_rotas.sql`: integração com os contratos existentes. Visões privadas distinguem origem ERP e avulsa; gestores e entregadores ativos acessam avulsas. Não há acesso direto às tabelas/visões pelo navegador.
- Registros recebem duas referências de origem mutuamente exclusivas; a referência ao ERP continua protegida por FK. `ultima_entrega` passa a referenciar o registro operacional Vibe. Nenhuma estrutura de tabela ERP é alterada.
- Locks são feitos nas tabelas de origem antes da leitura da visão. O único UPDATE permitido pela visão é de status, direcionado à origem correta. A confirmação avulsa não grava em propostas ou expedições.

## Testes locais

`TEST_AVULSAS=1 node tests/vibe_entregas_modalidades_pglite.cjs` executa em PostgreSQL em memória com dados sintéticos: cadastro, local salvo, colisão de operação, CEP inválido, mapa, seleção, rota mista, previsão, upload autorizado, entrega idempotente e ERP preservado na conclusão da avulsa. Exercita Financeiro/Expedição e negação a Atendimento.

`node tests/entregas_avulsas_browser_harness.cjs`: CEP inexistente/encontrado, falha e reenvio, local salvo, texto malicioso sem execução e revogação de acesso. As demais suítes de mapa, atribuição, gestão e PWA permanecem na validação.

ViaCEP, Google e Supabase reais não foram usados nesses testes. Publicação e conferência autenticada real pendentes.

## Implantação preparada, não executada

1. Verificar definições atuais do servidor antes de substituir as 23 funções de compatibilidade; não sobrescrever alterações de outra sessão.
2. Salvar definições, FKs, contagens e fingerprints do estado Vibe/ERP. Confirmar que todas as `ultima_entrega` existentes têm registro Vibe e que o identificador interno de empresa `__VIBE_AVULSA__` não é usado pelo ERP.
3. Aplicar primeiro `vibe_entregas_rotas_mistas.sql`, depois `vibe_entregas_avulsas.sql` e `vibe_entregas_avulsas_rotas.sql`, em janela autorizada. O último script preenche `pedido_erp=proposta` nos registros Vibe existentes; apresentar a contagem previamente. Os scripts possuem transações próprias.
4. Conferir funções, permissões e constraints; preservar dados ERP. Publicar os assets com versão nova de cache e conferir ambos os domínios.

Não exige novos segredos ou instalador NewProd. Os contratos das Edge Functions permanecem compatíveis; nomes AV são rótulos e UUIDs continuam sendo as chaves.

## Recuperação

Antes de haver avulsas usadas em rotas, é possível restaurar as definições/FKs salvas, mantendo as tabelas novas sem exposição. Depois de haver registros avulsos, não restaurar a FK antiga para propostas: ela rejeitaria registros válidos. Preservar as referências duplas e todos os comprovantes; corrigir adiante ou suspender novos cadastros enquanto prepara recuperação compatível. Nunca excluir entregas/comprovantes para permitir rollback.
