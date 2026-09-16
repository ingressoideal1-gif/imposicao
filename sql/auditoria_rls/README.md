# Coleta de metadados RLS — e-deal

Alvo confirmado pelo usuário em 16/09/2026: **e-deal, produção da gráfica, project ref `vwbtitjlpelrcnsytzqw`**. A autorização desta etapa é conferir metadados. Os arquivos não aplicam correções ou revogações.

## Arquivos e execução

O usuário escolheu disponibilizar o acesso no ambiente local. O caminho preparado é executar no próprio PowerShell:

```powershell
& 'C:\ProjetosLocais\ideal-imposition-rls-20260916\ferramentas\coletar_rls.ps1' -Executar -SolicitarToken
```

O comando pede o token de gerenciamento com entrada oculta; não pede a chave anon ou service_role. O token deve ter acesso ao projeto e à leitura de metadados SQL. Não colocar o token na linha de comando, em arquivo versionado ou na conversa. Ele permanece em memória durante as requisições, sem persistência intencional. Nenhum arquivo `.env` é lido. O diretório padrão de resultados é `C:\ProjetosLocais\auditorias-rls\e-deal`, fora dos checkouts; cada coleta cria nomes únicos. Pode-se escolher outra pasta restrita com `-Diretorio`.

Sem `-Executar`, o coletor apenas mostra a prévia, sem rede, token ou gravação. Com `-Executar` e sem `-SolicitarToken`, aceita somente `SUPABASE_ACCESS_TOKEN` já disponível no processo. Não procura credenciais em outros arquivos, no registro do Windows ou em outros checkouts.

A identificação remota compara nome `e-deal` e ref antes das consultas. O endpoint recebe `read_only: true`, além da transação READ ONLY presente no SQL. Não segue redirecionamentos com credencial e não mostra respostas ou detalhes privados nos erros. Se o endpoint não devolver o resultado SELECT da consulta transacional, o coletor interrompe: conferir a compatibilidade ou usar o SQL Editor abaixo; não retirar o modo somente leitura. HTTP foi simulado nos testes, não validado contra produção.

Alternativa pelo SQL Editor:

1. Conferir no painel Supabase que o projeto aberto tem o ref acima. Os rótulos escritos no SQL não identificam automaticamente a conexão.
2. Abrir `01_metadados.sql` no SQL Editor e executar o arquivo inteiro, incluindo BEGIN e ROLLBACK. Ele devolve uma coluna JSON chamada `auditoria_rls`. Guardar o JSON completo em arquivo fora dos repositórios e de pastas públicas, sem copiar seu conteúdo para chats ou logs. Caso a interface apresente somente a conclusão da transação, selecionar o resultado da instrução SELECT; não retirar o modo READ ONLY para obter o resultado.
3. Executar `02_buckets.sql` separadamente. Ele lê somente a configuração dos buckets e devolve `auditoria_buckets`; não lista arquivos. Guardar esse resultado no mesmo local restrito para revisão manual.
4. Para analisar o primeiro JSON, a partir da raiz deste worktree:

```powershell
node ferramentas/auditar_rls.mjs --entrada 'C:\AuditoriasLocais\e-deal\metadados.json' --projeto vwbtitjlpelrcnsytzqw --ambiente producao --saida 'C:\AuditoriasLocais\e-deal\relatorio.json'
```

Os caminhos são exemplos: usar uma pasta restrita já existente. O analisador aceita o objeto JSON diretamente ou uma lista com uma única linha `{ "auditoria_rls": { ... } }`. Exportação CSV não é aceita; se o SQL Editor exportar CSV, extrair o valor JSON localmente, preservando as aspas. Não truncar a célula nem apagar seções para contornar erro. `--saida` precisa ser arquivo novo: uma evidência anterior nunca é sobrescrita.

Não usar `ferramentas/rodar_sql.ps1` nesta etapa sem revisão adicional: ele busca credenciais em `.env.local` e exibe a resposta do servidor. O analisador Node é offline; somente o novo coletor PowerShell pode fazer rede, com `-Executar`. Se houver acesso por conexão PostgreSQL autorizada, a mesma consulta pode ser executada por essa conexão com a captura do resultado SELECT; não instalar um cliente ou reaproveitar credenciais de outro checkout automaticamente.

Se uma consulta falhar, a transação deve ser encerrada com ROLLBACK antes de outras operações na mesma sessão. Não remover a falha ou devolver `[]` no lugar de metadados faltantes. A compatibilidade do SQL ainda precisa ser validada na versão instalada; nenhum PostgreSQL foi executado nesta entrega.

## O que é coletado

O primeiro arquivo consulta os catálogos PostgreSQL: schemas não internos, relações, RLS e FORCE RLS, policies, papéis, grants de tabela/coluna, permissões efetivas de anon/authenticated/service_role, ACLs de funções, privilégios padrão, colunas, constraints, índices, triggers, dependências de views e publicações. Grants herdados e via PUBLIC entram nas funções de verificação de privilégios. Dados das tabelas comerciais não são consultados.

Funções da aplicação não são executadas; seus corpos não são retornados. O hash de `prosrc` serve apenas para comparação do corpo, não certifica a função inteira ou sua origem. Não são exportados configurações arbitrárias de funções, defaults de coluna, argumentos de trigger ou definições de views. Expressões completas de policies são necessárias para revisão e podem conter literais privados: por isso o snapshot deve permanecer restrito e fora do Git. O relatório derivado não copia essas expressões.

O segundo arquivo consulta `storage.buckets` para configuração. RLS de `storage.objects` está no primeiro inventário, mas o conteúdo de `storage.objects` nunca é consultado.

## Como interpretar o resultado

- `RLS_DESLIGADA_COM_GRANT`: há privilégio efetivo e USAGE do schema, sem RLS; confirmar se o recurso está exposto e se sua publicação é intencional.
- `BYPASS_RLS`: papel de cliente possui caminho que ignora RLS. service_role não é tratado como incidente por simplesmente ter bypass.
- `POLICY_AMPLA`: há expressão literal ampla aplicável ao comando e papel. Não implica, isoladamente, vulnerabilidade: SELECT público pode ser intencional; grants de coluna, SELECT necessário à mutação e outros controles precisam ser considerados.
- `POLICY_AMPLA_COM_RESTRITIVA`: a policy ampla convive com restrições; revisar a composição completa, não presumir acesso irrestrito.
- `OPERACAO_SEM_POLICY_PERMISSIVA`: a operação tem grant mas não tem policy permissiva aplicável. É um ponto de compatibilidade a conferir, não um pedido para abrir acesso.
- `DEFINER_EXECUTAVEL`: revisar corpo, dono, autorização e search_path. As RPCs públicas legítimas do portal também aparecerão; não revogá-las apenas por aparecerem.
- `RELACAO_SEM_RLS_DO_CHAMADOR`: view, view materializada ou tabela estrangeira requer revisão específica.
- `PRIVILEGIOS_EXCEDENTES`: privilégios administrativos que exigem revisão; não afirma que exista um verbo REST capaz de usá-los.

O analisador faz triagem conservadora; não interpreta SQL arbitrário e não avalia simbolicamente a combinação de policies. Pode deixar de sinalizar expressões amplas complexas. Resultado sem achados **não é certificado de segurança**. `pronto_para_revogar` permanece falso mesmo quando não há achados.

## Ainda necessário antes das migrações

- Confirmar schemas expostos e autenticação das Edge Functions no ambiente publicado. `pgrst.db_schemas` ausente na sessão SQL não significa Data API desabilitada.
- Revisar manualmente privilégios padrão, grants por coluna, constraints, schemas graváveis, dependências de views e código dos triggers/funções envolvidos, em canal restrito. Dependências dinâmicas não são integralmente registradas nos catálogos.
- Conferir acessos via API, Realtime, Storage, serviços e demais consumidores do ERP; validar painel, portal e versões efetivamente instaladas das estações.
- Resolver os contratos de vínculo modelo/briefing, revisão da arte, autoria/visibilidade do chat e idempotência antes de migrar as mutações do portal.
- Preparar e revisar migrações por domínio; testar em ambiente isolado com dados sintéticos e apresentar o impacto concreto antes de alterar produção.

Não preencher lacunas repetindo requisições de escrita sobre registros reais. Não usar service_role nos clientes, não desligar RLS para resolver um erro de compatibilidade e não reaplicar scripts históricos permissivos.

## Validação local

```powershell
node --check ferramentas/auditar_rls.mjs
node --test tests/auditoria_rls.test.mjs
& ./tests/coleta_rls_harness.ps1
```

Os testes usam somente objetos sintéticos e arquivos temporários, sem rede ou importação da aplicação. O teste estático do SQL confere barreiras e escopo; não equivale a execução em PostgreSQL nem valida policies instaladas.

Referências: [privilégios efetivos no PostgreSQL](https://www.postgresql.org/docs/current/functions-info.html), [catálogo de policies](https://www.postgresql.org/docs/current/catalog-pg-policy.html), [privilégios padrão](https://www.postgresql.org/docs/current/catalog-pg-default-acl.html), [transações somente leitura](https://www.postgresql.org/docs/current/sql-set-transaction.html).

Endpoints utilizados pelo coletor: [identificação do projeto](https://supabase.com/docs/reference/api/v1-get-project) e [consulta SQL com opção read_only](https://supabase.com/docs/reference/api/v1-run-a-query).

## Proposta de restrição de pagamentos

Para disponibilizar a credencial nesta sessão Windows sem colocá-la em `.env` ou na conversa, execute `& .\ferramentas\configurar_acesso_rls.ps1`. Use token restrito ao e-deal, com `project_admin_read` e acesso ao banco necessário à tarefa (`database_read` para coleta; `database_write` para a aplicação autorizada). O script valida apenas a identificação e salva um arquivo novo protegido por DPAPI em `%LOCALAPPDATA%\IdealImposition\rls`. O coletor pode usá-lo com `-Executar -CredencialProtegida <caminho.clixml>`. Nunca versionar esse arquivo. A aplicação de SQL continua separada da coleta.

`03_pagamentos_sem_delete_anon.proposta.sql` é a proposta histórica que abortou antes do REVOKE por grants de coluna presentes no baseline. Foi substituída por `04_pagamentos_sem_delete_anon.sql`, aplicada e verificada em produção. Não reaplicar nenhuma delas automaticamente. O aplicador `ferramentas/aplicar_restricao_pagamentos_rls.ps1` confere hash do SQL, salva baseline e recibos e verifica o resultado; sem `-Executar`, mostra apenas prévia. Veja `docs/aplicacao-rls-2026-09-16.md` para evidências, recuperação e limitações. O coletor continua estritamente somente leitura.
