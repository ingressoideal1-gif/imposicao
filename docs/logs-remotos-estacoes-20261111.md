# Logs remotos das estações — implementação local

Base isolada: `3068cd49` (NewProd 1.4.8), branch
`feat/logs-remotos-estacoes-20261111`. O checkout operacional foi preservado.

## Comportamento

`Gerenciar estações > Logs remotos` consulta a central por identificação da
estação, permite buscar texto nos trechos recebidos e exportar JSON/CSV.
Os arquivos permitidos são exclusivamente `agent.log` e `.1` a `.5`.
A interface informa origem, coleta, recebimento, ausência, corte e atraso.
Erro de consulta preserva o resultado anterior, identificado pela estação,
com aviso de que pode estar desatualizado.

O agente oficial inicia uma thread separada da impressão. A cada 30 segundos
lê um arquivo, até 5 MiB, seleciona mensagens conhecidas de geração/impressão,
identificação de modelo e as duas interrupções de entrega progressiva.
Envia até 300 linhas relevantes recentes / 64 KiB de JSON por arquivo.
Seis arquivos levam aproximadamente três minutos, mais os tempos de leitura e
rede. Não usa a thread de geração, fila de impressão, PDFs nem bancos de códigos.
Linhas arbitrárias e payloads de arte são omitidos; credenciais reconhecidas,
URLs, e-mails, caminhos Windows e valores longos são removidos antes da rede,
com segunda sanitização no servidor. Novos formatos de log precisam de revisão
explícita da lista permitida. A seleção não é uma exportação integral do log.

O envio HTTP tem timeout de cinco segundos, não segue redirecionamentos e
recua até quinze minutos após falhas. Só avança para o próximo arquivo após
confirmação correspondente. Falha não reenvia impressão nem altera status.
Reiniciar o agente reinicia a coleta dos arquivos ainda existentes.

São snapshots substituídos, não arquivo histórico permanente: no máximo seis
linhas de banco por empresa/estação, até 384 KiB de conteúdo de linhas antes
da serialização PostgreSQL. Arquivos removidos localmente ficam marcados
ausentes quando coletados. Log perdido por rotação não pode ser recuperado.

## Nuvem e permissões

Rotas adicionais da função existente `historico-impressao`:
`enviar-logs` e `consultar-logs`. O envio exige segredo do agente, vínculo de
estação e permissões de impressão/produção existentes. A consulta valida JWT
e `perm_admin_view` ou `perm_admin_edit`; empresa sempre resolvida no servidor.
Nome da estação normalizado em maiúsculas no armazenamento e na busca.

`sql/logs_remotos_estacoes.sql` prepara uma tabela nova,
`public.imposition_logs_estacoes`, com RLS, sem grants a PUBLIC/anon/authenticated.
Somente service_role recebe SELECT/INSERT/UPDATE para os snapshots.
Migração cria zero registros, não lê nem modifica tabelas comerciais.
Não existe nova credencial armazenada nem porta de estação exposta à internet.

## Validação

- 39 testes Python passaram: coleta, sanitização, falha/retry/ACK, limites,
  preservação de erros diante de heartbeat, histórico e gestão existentes.
- 10 testes Deno passaram, com type-check: autenticação, empresa, vínculo
  revogado, corpo limitado, sanitização e regressões do histórico.
- Harness de navegador cobre os canais 9000/9001 e painel web: consulta,
  filtro, texto seguro, atraso, falha e revogação administrativa.
- Sintaxe JS e `git diff --check` sem erros.
- Aviso preexistente de depreciação Starlette/httpx; nenhuma dependência alterada.

Deno foi executado com dependências já em cache (`--no-config --no-lock
--cached-only --node-modules-dir=none`): a invocação padrão não resolveu
`@types/node` no ambiente. Nenhum pacote instalado nem lockfile alterado.
Uma junction local de `node_modules` reutiliza as dependências já instaladas.

## Ativação pendente

Nenhuma migração, publicação, build, instalação, commit ou push foi executado.
A ativação depende de autorização para: aplicar a tabela nova no projeto
`vwbtitjlpelrcnsytzqw`, publicar a função e frontend, empacotar/publicar o agente
e verificar adoção da Laser 01. Reconciliar a base com a versão liberada mais
recente antes de publicar; não substituir atualizações posteriores.

Teste de retomada: com sessão administrativa, consultar LASER-01 e verificar
novos horários de coleta/recebimento após instalar o agente; comparar uma
mensagem conhecida do arquivo local com o trecho remoto. Testar conta sem
permissão e estação offline. Publicação não prova instalação nem impressão.

Recuperação: retirar as novas rotas/aba e coletor na próxima versão, mantendo
a tabela; nenhuma exclusão é necessária. Reverter o novo coletor não altera
o histórico operacional já existente.
