# Execução do plano RLS — 16/09/2026

**Estado atual:** credencial validada; revisão 04 aplicada em produção e pós-verificada às 08:05 -03:00. Foi removido somente DELETE de anon em pagamentos. A revisão 03 abortou previamente por grants de coluna; o relatório foi corrigido. O usuário confirmou que não há acesso ao código ERP. Os registros abaixo são históricos; para resultado, evidências e pendências atuais, ver `aplicacao-rls-2026-09-16.md`.

Pedido: executar o plano de segurança preservando usabilidade. Alvo confirmado pelo usuário: e-deal, produção da gráfica, ref `vwbtitjlpelrcnsytzqw`.

## Isolamento e entrega local

Trabalho em `C:\ProjetosLocais\ideal-imposition-rls-20260916`, branch `security/rls-auditoria-20260916`, criada a partir do `origin/main` local `011f9de7`. Não houve fetch, commit, push, deploy, build ou cópia de alterações preexistentes. A árvore principal permanece na branch main `a306ff06` com suas alterações preservadas. As regras AGENTS fornecidas para o projeto foram observadas.

Implementado o pacote de coleta e triagem de metadados:

- `sql/auditoria_rls/01_metadados.sql`: fotografia dos catálogos em transação REPEATABLE READ / READ ONLY, limites de tempo e ROLLBACK; nenhuma leitura de pedidos/clientes/arquivos.
- `sql/auditoria_rls/02_buckets.sql`: configuração dos buckets, sem listar objetos ou baixar arquivos.
- `ferramentas/auditar_rls.mjs`: análise offline; exige identificação do alvo e snapshot completo, considera grants por coluna, políticas por comando/papel e caminhos privilegiados; não executa SQL nem autoriza revogação automaticamente.
- `ferramentas/coletar_rls.ps1`: coleta local opcional, após solicitação de token com entrada oculta ou credencial já presente no processo; confirma a identidade remota, envia apenas os dois SQLs com read_only e salva arquivos novos fora de repositórios. Sem `-Executar`, só apresenta a prévia.
- `tests/auditoria_rls.test.mjs`: testes sintéticos da triagem, recusas de entrada incompleta, separação de ambiente, preservação das evidências e ausência de conteúdo privado nos erros de parse.
- `tests/coleta_rls_harness.ps1`: HTTP e token simulados, sem rede; cobre prévia, projeto divergente, credencial ausente, ausência de READ ONLY, resposta vazia, arquivos novos e erro parcial sem divulgar resposta privada.
- `sql/auditoria_rls/README.md`: procedimento de coleta, interpretação e limites.

## Correção da leitura inicial dos riscos

A existência de scripts antigos permissivos não prova a configuração atual. Nesta execução foram identificados também `sql/fontes_so_escrevem_pelas_funcoes.sql` e `sql/fontes_tirar_o_que_sobrou_da_chave_publica.sql`, além do módulo `_compartilhado/fontes.ts`, que já tratam migração da escrita de fontes para funções e retirada de privilégios antigos. O estado instalado precisa ser comparado com esses scripts antes de qualquer correção.

Os contratos do portal continuam pendentes na documentação do checkout operacional: revisão da arte válida para todos os escritores, vínculo inequívoco entre modelo e briefing, autoria/visibilidade das mensagens, idempotência e efeitos dos gatilhos financeiros. A autorização de implementação não fornece esses contratos ausentes. Não criar uma RPC genérica com service_role para substituir indiscriminadamente as chamadas diretas.

## Estado da validação e bloqueios

Os 16 testes Node passaram, sem rede e sem dependências novas; sintaxe Node aprovada. A coleta PowerShell passou nos cenários simulados. A consulta SQL recebeu revisão estática; ainda não foi executada contra PostgreSQL. Nenhuma policy foi modificada e nenhuma proteção nova foi declarada ativa em produção.

A sessão não dispõe de ferramenta Supabase conectada. Foram verificadas somente as existências: `SUPABASE_ACCESS_TOKEN` ausente no ambiente e `.env.local` ausente em `C:\ProjetosLocais\ideal-imposition`. Não foram lidos arquivos de segredos nem procuradas credenciais em outros checkouts. PostgreSQL/psql/Docker não foram encontrados no PATH; não foram instalados.

O usuário escolheu disponibilizar acesso Supabase no ambiente local. Foi preparado o coletor para entrada oculta no próprio PowerShell; ele não grava o token e não altera variáveis persistentes. A coleta real ainda depende dessa execução com credencial. Essa dependência bloqueia as decisões sobre migrações; não bloqueou a entrega local acima.

## Retomada

1. Obter os metadados do e-deal pelo procedimento em `sql/auditoria_rls/README.md`.
2. Validar o snapshot com o analisador e revisar todos os achados com os contratos do parceiro e consumidores ativos.
3. Conferir separadamente schemas da API, Edge Functions, buckets e estações. Respeitar a exposição pública intencional do portal e catálogos necessários.
4. Preparar a primeira migração concreta com baseline, impacto, transação e recuperação segura. Não aplicar os antigos SQLs de fechamento em lote.
5. Completar e testar as rotas pendentes somente com os contratos necessários; depois coordenar atualização dos consumidores e fechamento de acessos em produção.

O plano completo permanece em andamento. A entrega atual é a infraestrutura da primeira etapa; não equivale a concluir o endurecimento das RLS.

## Atualização após coleta do usuário

Os snapshots do lote `20260916T101419582Z-d7541dc6` foram encontrados e validados em 16/09/2026. A pendência de coleta descrita acima foi resolvida; o token não foi disponibilizado a este processo nem é necessário para analisar os arquivos. Ver `resultado-coleta-rls-2026-09-16.md` para os achados confirmados, as proteções já presentes e a primeira proposta de contenção de DELETE anon em pagamentos. Nenhuma restrição foi aplicada em produção.

## Atualização da validação SQL

Após autorização explícita para instalação temporária, a proposta de pagamentos passou em oito cenários PostgreSQL 17.5 e oito em 18.3, em memória com dados sintéticos. As 42 verificações existentes da coluna Pagamento também passaram. Ver `validacao-pagamentos-rls-2026-09-16.md`. A pendência de teste SQL isolado foi resolvida; continuam pendentes a confirmação do consumidor externo ERP e a aplicação por canal autorizado de escrita. Nenhuma dependência do projeto ou dado de produção foi alterado.

## Autorização para concluir e impedimento de acesso

O usuário autorizou concluir o trabalho com todas as permissões. Não falta aprovação humana para os passos necessários nesse escopo. O token localizado na configuração antiga foi recusado com HTTP 401 na identificação do projeto; seu valor não foi exibido. O token novo usado na coleta anterior não está disponível nesta sessão.

`ferramentas/configurar_acesso_rls.ps1` permite inserir um token oculto e validar o alvo antes de salvá-lo como PSCredential protegido por DPAPI no perfil Windows, fora do Git. O coletor aceita esse arquivo por `-CredencialProtegida`. A validação GET não comprova database_write. Nenhuma modificação remota foi executada. A autorização não resolve a falta de credencial nem comprova compatibilidade com consumidores externos desconhecidos.
