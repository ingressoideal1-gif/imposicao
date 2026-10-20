# Entregas por modalidade — 20/10/2026

Implementação local em `feat/entregas-modalidades-20261020`, baseada em v1086. Migração e funções de rotas aplicadas em 20/10/2026; frontend em publicação v1087. Nenhum pedido real foi atribuído, iniciado, concluído ou repassado durante os testes.

## Comportamento acordado

- Fila: pedidos com `propostas_os.data_termino` para hoje em America/Sao_Paulo, ainda em preparação/produção, somados aos `EXPEDICAO` de qualquer data. Rotas Vibe iniciadas permanecem visíveis. Cancelados e entregues ficam fora da fila. Histórico de conclusões/tentativas permanece consultável.
- Abas Motoboy, Veppo e Aéreo no Imposition e no PWA. Filtragem no servidor antes da paginação. Apenas pedidos prontos podem ser atribuídos/iniciados; previstos para hoje ainda em produção são somente consulta.
- Veppo inclui VEPPO e VEPPO-RS. Aéreo inclui AEREO e AEREO EXPRESSO, com ou sem acento. Outras transportadoras não são incluídas.
- Veppo: Largo Vespasiano Júlio Veppo, 70, Centro Histórico, Porto Alegre/RS, CEP 90035-040.
- Aéreo: Rua Marquês do Herval, 45, Marechal Rondon, Canoas/RS, CEP 92020-400.
- CEPs consultados no ViaCEP em 20/10/2026. Os números foram informados pelo usuário. Destinos substituem somente o endereço operacional do trecho Vibe; endereços cadastrados no ERP não são alterados.
- Pedidos da mesma modalidade na rota do mesmo entregador ficam juntos e compartilham uma parada e previsão. Limite existente de 20 pedidos por rota preservado. A rota pode conter outras modalidades; iniciá-la inicia todos os seus pedidos, como antes.
- Repasse: um recebedor, conferência de volumes e uma foto para o grupo completo daquela modalidade na rota. A confirmação é atômica e idempotente. Mudança no grupo exige atualizar antes de confirmar. A busca de um pedido não reduz silenciosamente os pedidos confirmados no grupo.
- `concluida_em` representa a conclusão do trecho local; `tipo_conclusao=repasse` distingue do recebimento final. Veppo/Aéreo ficam EM TRANSITO no ERP; `expedicoes.data_entrega` não é preenchida. A entrega final ao destinatário continua com o ERP/parceiro.

## Roteiro de implantação e recuperação

1. Conferir main e preservar outros trabalhos. A correção de sessão persistente foi integrada nesta mesma branch; o checkout anterior de sessão permanece preservado.
2. Salvar definições e privilégios das funções afetadas. Revisar `sql/vibe_entregas_modalidades.sql`: cria somente uma tabela e uma coluna próprias do Vibe, auxiliares e RPCs; substitui validações de rotas/destinos. Não atualiza linhas comerciais durante a aplicação.
3. Aplicar a migração completa em transação no Supabase e-deal, projeto `vwbtitjlpelrcnsytzqw`, quando a publicação estiver autorizada. Conferir definições e permissões depois. Não testar confirmações com pedidos reais.
4. Publicar as Edge Functions `vibe-entregas-previsoes` e `vibe-entregas-rotas`; depois frontend com novos parâmetros de cache. O PWA usa cache v10, incluindo a correção de sessão persistente.
5. Conferir arquivos públicos nos dois domínios e testar a navegação sem gravações reais. A migração é pré-requisito dos novos leitores `*_modalidades`.
6. Recuperação: restaurar frontend/Edges e definições anteriores a partir do backup. Preservar tabela de repasses e coluna de classificação, sobretudo se houver uso real; nunca apagar comprovantes para reverter a versão. Leitores antigos de Motoboy continuam disponíveis durante a transição.

## Validação local

- PGlite: filtro de hoje, exclusão de amanhã/cancelados, destinos sem endereço de cliente, modalidades, atribuição ADM/própria, agrupamento, grupo parcial/misto rejeitado, ausência de foto, rollback integral com falha simulada no segundo pedido, idempotência, isolamento e repasse sem alterar entrega/status do ERP.
- Chromium: abas, seleção de entregador, rotas, popup do mapa com os pedidos do grupo, busca sem reduzir o grupo, comprovante único, falha/reenvio, rascunho e layout móvel. Rede ERP simulada.
- Deno: 15 testes de cálculo/otimização, incluindo parada única e expansão de previsões para o grupo. Rede Google simulada.
- Sintaxe JavaScript e `git diff --check`.

Os testes não comprovam um trajeto real do Google ou uma entrega física. Nenhuma chave nova foi necessária nesta implementação.

## Sessão persistente integrada em 20/10/2026

O login publicado ainda usava sessionStorage e não restaurava a sessão ao abrir. A correção local anterior foi incorporada sem substituir o código de modalidades. Agora o SDK usa localStorage, persistSession e autoRefreshToken; o aplicativo valida a sessão salva e a autorização do entregador antes de abrir a operação. A senha digitada não é armazenada e continua sendo limpa após o login.

Testes simulados confirmaram restauração após recarregar e fechar/reabrir a aba, saída explícita, acesso revogado e falha temporária sem apagar a sessão. A tela de login permanece oculta durante a tentativa inicial de restauração. Novo login ainda pode ser necessário após Sair, revogação/expiração definitiva pelo servidor ou limpeza dos dados do aplicativo. Não foram alteradas as políticas de expiração do Supabase.

Correção incluída na publicação v1087 junto das modalidades.

## Evidência da ativação do servidor — 20/10/2026

Migração aplicada em transação. As 11 funções anteriores foram salvas e comparadas à fonte de origem antes da alteração; todas coincidiam. Os corpos de todas as funções resultantes foram conferidos com o SQL revisado. Prévia e conferência posterior: 4 registros Vibe, 1 rota ativa; fingerprints de status/endereço dos pedidos e entrega/endereço das expedições permaneceram iguais. Nenhum repasse real registrado.

Tabela de repasses com RLS, sem leitura/escrita direta por authenticated e sem execução anônima da confirmação. Edge Functions ativas com JWT obrigatório: vibe-entregas-previsoes v2 e vibe-entregas-rotas v4. Backups e evidências em dist/entrega deste checkout, fora do Git. Publicação web será conferida nos dois domínios após integração do PR.
