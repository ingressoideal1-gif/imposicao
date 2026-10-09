# Revisão persistida por pedido — implementação local

Estado em 09/10/2026: migração aplicada no Supabase de produção e-deal, Edge piloto-local publicada na versão 5 ACTIVE e executável combinado instalado na estação teste Junior/PC-JR-HOME, porta 9001. Mantido o número 1.2.376 desta compilação local; identificar esta entrega pelo SHA-256 abaixo. Opção experimental preservada. Não foi publicado MSI/manifesto para as outras estações.

## Implantação confirmada

- Novo token cadastrado pelo operador foi validado. Prévia remota: 2015 modelos, 619 pedidos distintos, RPC v1 presente e objetos v2 ausentes. Schema real conferido antes da aplicação. A migração foi executada integralmente em transação; leitura posterior confirmou 619 sinais e 11 triggers, EXECUTE negado a anon/authenticated e permitido a service_role. Nenhum valor comercial foi alterado.
- RPC v2 conferida nos pedidos 23195 (2 modelos) e 23293 (5 modelos); ambos retornam recibo sem mudança ao receber a revisão atual. Evidências locais em dist/verificacao-producao-v2.json e dist/pedidos-verificados-v2.json.
- Edge piloto-local: versão anterior 4 e corpo ESZIP preservados em dist/edge-antes-v2.json e dist/edge-antes-v2-body.bin; versão 5 ACTIVE confirmada por releitura da Management API, preservando verify_jwt=false e a autenticação própria existente. Demais funções não foram publicadas.
- Junior: coleta pausada, fila local sem pendências/atividade. Backups criptografados de configuração e SQLite verificados por decifragem/conferência (dist/backup-antes-v2.json). Executável e painel anteriores copiados para a pasta de recuperação registrada em dist/instalacao-v2.json. O executável instalado tem o mesmo hash do pacote auditado; cinco recursos do painel responderam HTTP 200 e conferem com a fonte. Spool antes/depois idêntico: cinco trabalhos antigos preservados. Coleta retomada.
- Medição por chamada direta ao serviço de abertura da mesma fonte instalada, com a identidade e o cache reais da estação; não cronometra a renderização do navegador: 23293, 0,923 s e 0,675 s, uma consulta do sinal e zero requisições HTTP aos recursos em ambas. 23195, preparação inicial 10,938 s (duas consultas do sinal, quatro requisições de recursos), reabertura 0,434 s (uma consulta, zero requisições de recursos). Segunda abertura reutilizou respectivamente cinco e dois pacotes. Evidência em dist/medicao-abertura-v2.json. Não houve impressão física.

Os registros seguintes preservam o histórico de preparação e dos testes. A autorização e a implantação descritas acima substituem as pendências antigas de acesso.

Atualização da entrega em 09/10/2026: usuário autorizou explicitamente aplicar a migração no Supabase de produção e atualizar a estação teste. As duas credenciais administrativas DPAPI disponíveis foram recusadas pela Management API com HTTP 401 / Invalid access token. A chamada de identificação do projeto falhou antes de qualquer SQL. Aberto o procedimento local configurar_acesso_rls.ps1 para cadastrar novo token com entrada oculta; não solicitar token pelo chat. A autorização permanece válida; falta credencial válida, não nova autorização.

O patch experimental da instalação 1.2.376 foi incorporado ao checkout desta correção, incluindo os dois módulos Python e a página/JavaScript de testes. Após a combinação, 41 testes Python e três cenários de navegador passaram. O primeiro ensaio de empacotamento revelou ausência da página experimental por não estar registrada no índice Git; os dois arquivos foram registrados com intent-to-add e o build repetido. O executável não deve ser instalado antes da migração e da Edge v2 verificadas. A prévia somente leitura está em sql/piloto_revisao_persistida_v2_previa.sql.

Build combinado concluído e auditado: dist/NewProd.exe, 142851877 bytes, SHA-256 c3974ac2903fd988abd226ea96fdd608daa8995e914601b1e745e3329837aa48. Módulos experimentais presentes no arquivo PYZ; index, producao, pagina/JS experimentais e selecao-piloto extraídos do executável conferem byte a byte com as fontes. Auditoria do pacote público passou sem arquivos privados ou módulo de segredo. Evidência em dist/pacote-revisao-v2.json. Ainda não instalado.

O painel local agora solicita somente o número do pedido ao agente. O agente consulta o sinal persistido; se coincidir, lê o snapshot e os arquivos do cache local. Se mudar, obtém o snapshot completo, prepara os recursos afetados e confirma a revisão antes de ativar o cache. A primeira abertura após migrar o protocolo exige snapshot completo, pois o cache anterior não contém todos os dados da tela.

O snapshot inclui modelos, numerações, produtos de origem, produtos, bancos/vínculos, artes e mapas. A tela reutiliza o mapeamento existente, sem alterar quantidade, Ticket, blocagem ou regras financeiras. A abertura pelo site/Produção que não possui PilotoSelecao mantém o percurso anterior. Consultas de autenticação e do catálogo geral na entrada do aplicativo não são eliminadas por esta mudança.

As fontes dos arquivos são conferidas individualmente. Mudança somente no digest dos dados reaproveita recursos locais cuja URL e versão de Storage são iguais; o novo manifesto continua validando os bytes locais. Sem mudança no sinal, não há revalidação HTTP dos recursos. A leitura efetiva para o motor continua verificando SHA-256. Sem resposta autenticada do sinal, o cache não concede autorização offline. A revisão anterior permanece salva se a preparação falhar.

## Banco: escopo a revisar antes da aplicação

Alvo previsto: Supabase de produção vwbtitjlpelrcnsytzqw. A autorização para a alteração remota deve abranger estes objetos; a implementação local não constitui aplicação.

- Nova tabela public.piloto_revisoes_pedidos: uma linha por pedido com modelos existentes. Consulta pública somente de id_int em 09/10/2026 encontrou 2005 modelos e 614 pedidos distintos visíveis; conferir a contagem com o responsável pelo banco antes da aplicação.
- Nova tabela public.piloto_revisao_catalogo: uma linha para dependências compartilhadas.
- Triggers de INSERT/UPDATE/DELETE em pedidos_modelos, produtos_proposta, propostas, propostas_os, pedidos_bancos, pedidos_modelos_banco, pedidos_artes, producao_numeracoes, produtos, producao_mapas_teatro e storage.objects.
- Nova RPC piloto_snapshot_pedido_v2 e duas funções auxiliares. A RPC anterior permanece intacta. Sinais não são acessíveis a anon/authenticated; a Edge continua autenticando a estação e suas permissões.
- Não modifica valores comerciais, artes, pools ou reservas QR. Escreve somente os sinais, na mesma transação das alterações de origem.
- Migração transacional com lock_timeout de 5 s e statement_timeout de 60 s. Falha interrompe a transação inteira.

Arquivos: sql/piloto_revisao_persistida_v2.sql (aplicação), sql/piloto_revisao_persistida_v2_verificar.sql (prévia/validação somente leitura), sql/piloto_revisao_persistida_v2_reverter.sql (recuperação dos objetos novos, após reverter agente/Edge).

Dependências compartilhadas (numeração, produto, mapa e Storage) incrementam um contador global conservador. Assim, uma alteração pode invalidar o sinal de outros pedidos; arquivos inalterados ainda são reaproveitados. Essa escolha evita perder uma mudança concorrente com a vinculação de um modelo. A revisão é por pedido para alterações diretas. Uma evolução para invalidação compartilhada seletiva exige um índice de dependências transacional e testes de concorrência; não foi simulada como se já existisse. É necessário avaliar contenção de escrita no contador global antes da implantação.

## Evidências e pendências

- Produção e Piloto: 541 testes passaram, 2 ignorados e 2 subtestes em cada canal; 16 harness JavaScript por canal, 34 etapas aprovadas em dist/validacao-revisao-v2.json.
- Funções de nuvem: 17 testes Deno passaram, usando dependências já em cache (node-modules-dir=none e cached-only; nada instalado).
- Cenários novos: uma consulta/zero downloads na reabertura, snapshot persistido após reinício, atualização só de dados sem download de arte, corrida durante download sem substituir cache anterior, recusa sem sinal/protocolo válido, e abertura da tela com consultas diretas de modelos/numerações/artes proibidas no ensaio.
- Sintaxe JavaScript e git diff --check aprovados. O patch experimental da Junior continua aplicável sobre a correção, confirmado com git apply --check; nenhum arquivo da instalação foi substituído nesta etapa.
- Teste SQL executado com sucesso no PostgreSQL 17.11 descartável, ligado exclusivamente em 127.0.0.1:55439, com dados sintéticos e guarda newprod_test_*. Inclui todas as fontes de invalidação, INSERT/UPDATE/DELETE, movimentação de modelo entre pedidos, recibo compacto, Storage, permissões, rollback e ausência de leitura de modelos no caminho rápido. Aplicação, reversão e reaplicação passaram; a RPC v1 permaneceu disponível após a reversão. Log final: dist/postgres-test/sql-final.log.
- Concorrência: tests/piloto_revisao_concorrencia.py confirmou que mudanças não confirmadas não vazam para o recibo e que o commit invalida o sinal, tanto para modelos quanto para catálogo. Duas sessões alteraram fontes compartilhadas diferentes: 60 incrementos, sem perdas.
- Medição sintética de contenção: pgbench, quatro conexões alterando quatro produtos distintos, 1.000 transações com o contador global, zero falhas, latência média de 0,403 ms. Referência sem o trigger, exclusivamente no banco descartável: 0,214 ms. O trigger foi reativado após a comparação. Logs: dist/postgres-test/benchmark-trigger.log e benchmark-baseline.log. Ensaio curto e local; não estima carga, picos, rede ou latência de produção. Transações longas que alterem dependências compartilhadas ainda podem causar contenção.
- Ferramentas isoladas em dist/postgres-test, sem serviço Windows ou alteração global de PATH. ZIP obtido por HTTPS do fornecedor EDB: postgresql-17.11-3-windows-x64-binaries.zip; SHA-256 4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf. Servidor temporário encerrado após os ensaios.
- Próximo passo autorizado: renovar a credencial administrativa inválida; executar a prévia e conferir o schema real; aplicar e verificar a migração; publicar Edge compatível; instalar o agente combinado somente na estação teste após backup e conferência da fila; medir os pedidos 23293/23195.

As medições do serviço real estão registradas acima; ainda não foi medido o tempo completo da interface nem realizada impressão física. RPC/Edge v2 foram implantadas antes da instalação do novo painel na estação teste.
