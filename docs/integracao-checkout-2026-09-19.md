# Integração dos rascunhos locais — 19/09/2026

> Etapa encerrada: consulte a [publicação e sincronização final das sessões](sessoes-em-dia-2026-09-20.md), web v917 e NewProd 1.2.336.

> Atualização de 20/09: a integração foi transportada para o checkout principal e atualizada com a base v916. Use `C:\ProjetosLocais\ideal-imposition`. Consulte [o registro atual e o backup](checkout-principal-atualizado-2026-09-20.md). O texto abaixo registra a etapa anterior.

Integração local concluída na pasta `C:\ProjetosLocais\ideal-imposition-atualizado-20260919`, branch `manutencao/checkout-atualizado-20260919`. Base final: `ab914f7f68eba89ed7828404ce85bd444d7a90b6`, igual a `origin/main` na conferência final. As alterações da integração estão sem commit e sem publicação.

## O que entrou

- Transporte autenticado de propostas, cadastro, pagamentos e fundo do PWA, com a ponte `propostas_api.py`, rotas nas duas Edge Functions e os consumidores do frontend. Foram preservadas as rotas atuais de bancos de pedidos, e-mail e CORS.
- Validação e tratamento de erros do SMTP local, preservação da senha quando o campo fica vazio e retirada da senha das respostas da API. A configuração continua no JSON da estação: esta integração não implementa criptografia nem migra credenciais existentes.
- Testes, documentação, propostas SQL e protótipos locais que ainda não estavam na base. Os scripts SQL foram recuperados como arquivos; nenhum foi executado.
- Proteção de `.tmp.driveupload` no `.gitignore` e a preferência local do editor.

O envio de e-mail atual usa o novo transporte de cadastro, preservando o vendedor da proposta e a confirmação obrigatória do cadastro no envio direto. Falha de consulta interrompe esse envio; não há tentativa alternativa anônima. As regras financeiras não foram modificadas.

## Como os conflitos foram resolvidos

O inventário cobre os 118 arquivos encontrados na pasta original. Consulte [as decisões por arquivo](integracao-checkout-2026-09-19.csv).

A comparação usou a base antiga `a306ff06`, o conteúdo local e a base atual. Também foram procuradas versões idênticas no histórico de main. Os conflitos foram examinados para separar mudanças inéditas de rascunhos já superados.

Foram preservadas as correções atuais de persistência do portal, status consolidado, precedência de Corrigir Dados, domínio público dos links, layout do e-mail, SMTP da nuvem, PDF, numeração e agente. O rascunho da migração de status não substituiu a migração já registrada como aplicada.

O texto acidental `conta` em `.vscode/launch.json` não foi importado: invalidava a configuração. A configuração pessoal `.claude/settings.local.json` e o lembrete de calendário vencido permaneceram somente na pasta original.

Documentos recuperados são registros das respectivas datas, não novas confirmações de publicação ou recomendações de executar scripts históricos. Os complementos de publicação de cópia de link e acabamento foram recuperados; as evidências externas antigas não foram refeitas nesta tarefa.

## Validação

| Verificação | Resultado |
|---|---|
| Deno, incluindo autenticação das rotas reais com serviços simulados | 263 aprovados |
| Seleção Python: propostas, SMTP, e-mail web, acabamento, histórico, portal, pagamentos, links, fundo e sintaxe | 209 aprovados; 4 falhas preexistentes |
| Sintaxe JavaScript de todo o frontend | 71 arquivos aprovados |
| Sintaxe Python dos arquivos integrados relevantes | 7 arquivos aprovados |
| PowerShell do script recuperado de sincronização | Sem erros de análise; script não executado |
| Vetores do contrato de idempotência | 5 aprovados |
| `git diff --check` | Aprovado |
| Preservação da origem | 117 hashes iguais e status Git inalterado; configuração pessoal não lida |

As quatro falhas Python foram reproduzidas também com os arquivos da base `c007a7d7`, antes da integração:

1. `test_a_paleta_do_acabamento_nao_repinta_o_painel_de_producao`: o teste examina CSS posterior ao bloco de acabamento e rejeita `#view-ideal-control .ic-workspace > *,`.
2. `test_status_consolidado_pedidos_artes`: o contexto simulado não define `pedidoIgnoradoNosPaineis`.
3. `test_o_harness_do_historico_passa`: expectativa antiga do filtro Impresso.
4. `test_o_botao_impresso_ve_o_pedido_que_ja_saiu_da_producao`: a mesma expectativa textual antiga do filtro Impresso.

Essas verificações continuam ativas, sem alterações para esconder as falhas. Os quatro commits posteriores incorporados por avanço direto alteraram somente documentação, proposta SQL e um teste SQL; não mudaram o código exercitado.

Foram reutilizados Python e dependências existentes, sem instalação. `node_modules` nesta pasta é uma junção para `C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\node_modules`. Deno usou somente o cache existente com `--cached-only --node-modules-dir=none`. Os testes não receberam permissão de rede Deno. O teste de SMTP local extrai as funções por AST e usa um FastAPI isolado, sem carregar a aplicação, arquivos de configuração ou worker da estação.

Logs e comparação da base: `C:\ProjetosLocais\atualizacao-checkout-20260919\integracao\` (`deno-testes.log`, `pytest-testes.log`, `baseline-testes.log`, `baseline-historico.log`, `analise.json`, `decisoes.json`).

## Continuidade e recuperação

Abra `C:\ProjetosLocais\atualizacao-checkout-20260919\Ideal-Imposition-Atualizado.code-workspace` para trabalhar na versão integrada. A pasta original continua intacta em `C:\ProjetosLocais\ideal-imposition`, com os rascunhos originais; não foi convertida para a versão integrada.

As worktrees compartilham o Git da pasta original. Mantenha essa pasta e seu `.git`; esta integração não é um backup independente. As fontes originais, a base Git e o inventário permitem revisar ou reconstruir a integração. Não restaurar ou excluir arquivos indiscriminadamente para desfazê-la, pois trabalhos posteriores podem existir.

Publicação permanece pendente. Os novos consumidores exigem primeiro a implantação das rotas correspondentes e, para a ponte local, a distribuição de uma versão do agente que as inclua. Publicar apenas o frontend faria chamadas a rotas que podem ainda não existir no ambiente remoto. Nenhum commit, push, deploy, build, instalação, migração remota ou envio real de e-mail foi realizado nesta integração.
