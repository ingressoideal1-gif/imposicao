# Checkout principal atualizado — 20/09/2026

A pasta de trabalho voltou a ser `C:\ProjetosLocais\ideal-imposition`, branch `main`. A base avançou de `a306ff06` para `d538bc72` (v916), incorporando os 181 commits que faltavam. A integração local revisada em 19/09 foi reaplicada sobre essa base sem conflitos.

As alterações locais restantes pertencem à integração revisada, não aos rascunhos antigos aplicados sobre código de 05/09. A publicação dessas mudanças continua separada da atualização do checkout. Não houve push, deploy, build, migração remota ou envio real de e-mail.

## Preservação e recuperação

Backup: `C:\ProjectBackups\checkout-principal-20260920-105155`.

- `principal/`: cópias verificadas por SHA-256 dos arquivos antigos modificados e não rastreados, exceto a configuração pessoal.
- `integrado/`: cópia dos arquivos da integração de 19/09 antes da atualização.
- `originais-retirados/`: arquivos antigos retirados do caminho principal, preservados sem exclusão.
- `repository-all-refs.bundle`: histórico e referências Git antes da troca, validado por `git bundle verify`.
- `estado.json`: commits, inventários e hashes das duas pastas; cópias dos índices Git também foram guardadas.
- `merge/`: comparação entre base anterior, versão integrada e remoto recente.

O `.git` permaneceu no caminho original. As outras worktrees continuam registradas. Configurações ignoradas e credenciais não foram transferidas; `.claude/settings.local.json` permaneceu no próprio caminho, sem leitura de conteúdo.

Para recuperar o estado antigo, primeiro crie uma pasta independente a partir do bundle, escolhendo a branch `main` contida nele, e copie os arquivos de `principal/` sobre essa cópia. Não restaure diretamente sobre o checkout operacional: isso poderia sobrescrever trabalho posterior. O bundle e as cópias dos rascunhos são independentes da pasta operacional; configurações ignoradas continuam somente onde já estavam.

## Pasta para usar

Use `C:\ProjetosLocais\ideal-imposition`. O arquivo `C:\ProjetosLocais\atualizacao-checkout-20260919\Ideal-Imposition-Atualizado.code-workspace` foi redirecionado para esse caminho.

`C:\ProjetosLocais\ideal-imposition-atualizado-20260919` permanece como referência da etapa anterior. Ela não é mais a pasta indicada para novas tarefas. Este registro substitui as orientações de caminho do documento de integração de 19/09.

## Limites operacionais

Validação feita no próprio caminho principal: 267 testes Deno aprovados; 219 testes Python aprovados e as mesmas quatro falhas conhecidas da integração de 19/09 (CSS de acabamento, contexto simulado de status e duas expectativas do histórico). `git diff --check` passou. Logs: `deno-testes.log` e `pytest-testes.log` na pasta de backup. Nenhuma nova falha foi observada na seleção executada.

A integração foi autorizada para registro em commit somente local pelo pedido "executar", após a conferência da atualização. A atualização da branch principal foi feita por avanço direto até o commit remoto; o commit que contém este registro acrescenta os rascunhos revisados e a documentação. A configuração pessoal `.claude/settings.local.json` ficou fora do commit. Não houve autorização nem execução de push/publicação.

A integração contém rotas novas de propostas/cadastro/pagamentos/fundo e uma ponte do agente. Sua validação local não comprova que essas rotas estejam implantadas no ambiente remoto. A publicação deve continuar coordenada entre backend, frontend e agente. Não publicar apenas o frontend por presumir que atualizar o Git implantou serviços.
