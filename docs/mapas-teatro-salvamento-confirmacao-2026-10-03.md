# Mapas de Teatro: salvamento e confirmações

Correção de 03/10/2026, na branch `fix/mapas-salvamento-confirmacao-20261003`, baseada na v1000 (`edba39d52d3daa91f7aaa1902f95b1cedc5b2b2b`). Worktree isolada em `C:\ProjetosLocais\ideal-imposition\tmp_mapas-faixas-20261003`. Checkout operacional preservado.

## Falha e correção

O frontend enviava `total_lugares` e `lugares_por_setor` junto de `name` e `config`. A evidência local da consulta de 02/10/2026 registrou somente `id`, `name`, `config` e `created_at` na tabela compartilhada. O SQL versionado descreve outro esquema; não comprova as colunas existentes no ambiente remoto.

O teste reproduziu a falha com um transporte que rejeita colunas ausentes: o editor permaneceu aberto em vez de confirmar a gravação. O payload agora grava somente `name` e `config`, que contém os setores, os assentos, as posições e os rótulos. A quantidade exibida continua calculada pelas cadeiras existentes. Não há migração ou ajuste de permissões.

O retorno continua exigindo um único mapa com o ID correto e uma releitura com `name` e `config` equivalentes. Uma falha após INSERT preserva o ID para que a nova tentativa seja UPDATE, evitando criar outro mapa.

## Fluxo do operador

- **Salvar Mapa:** abre “Salvar mapa de teatro?”, com “Salvar mapa” e “Continuar editando”. Cancelar não grava nem fecha a edição.
- **Sucesso:** “Mapa salvo” aparece somente depois da confirmação por releitura, com botão “Concluir”.
- **Falha:** “Mapa não salvo” informa que as alterações continuam no editor, com botão “Voltar ao editor”.
- **Sair com alterações:** “Sair sem salvar?” oferece “Sair sem salvar” e “Continuar editando”. Nome, setores e assentos entram na comparação; abrir sem editar ou desfazer até o estado inicial não gera falso alerta.
- **Recarregar/fechar a aba:** o evento `beforeunload` pede a confirmação nativa do navegador quando há alterações ou gravação em andamento. O navegador controla o texto e a exibição desse diálogo.

Os popups usam o componente existente `confirmarPopup`, acima do editor (`z-index: 1000000`). Os novos parâmetros são opcionais: altura de exibição, apenas um botão e foco inicial em cancelar. Os usos anteriores mantêm seus valores padrão. Os nomes aparecem como texto escapado, sem executar HTML. Escape cancela; Enter com “Continuar editando” em foco cancela. Duplo clique, saída e atalhos do mapa são bloqueados durante a confirmação ou a gravação.

## Validação

- 83 regressões Node passaram, incluindo INSERT/UPDATE, schema sem colunas de resumo, cancelamento sem escrita, gravação duplicada, erro/zero linhas/releitura divergente, manutenção do ID, saída sem alterações, descarte/cancelamento, desfazer e proteção de recarregamento.
- Chromium percorreu o modal real de `index.html` e `producao.html`, usando o popup real do painel e Supabase simulado com colunas estritas. Conferiu clique acima do editor, popups de salvar/sucesso/erro, Escape/Enter, nomes com HTML escapado, saída com nome/setor alterado, conservação dos assentos e CSV das duas telas. Zero erros JavaScript.
- Sintaxe dos arquivos JavaScript alterados e revisão de whitespace.

Não houve acesso ou escrita no banco compartilhado, instalação de dependências, mudança em Python, Edge Functions, schema ou RLS. O salvamento e a releitura foram testados com dados sintéticos; não comprovam permissões de uma sessão real. O backend local pode montar payloads próprios; sua criação via Supabase, distribuição do NewProd e impressão física não foram validadas nesta correção web.

## Entrega e recuperação

A simulação de `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Simular` passou e planejou a v1001, com novo cache em `index.html` e `producao.html`. Após a simulação inicial, o usuário autorizou especificamente a publicação desta correção com o pedido "entrega segura", em 03/10/2026.

Preparação validada para publicação pelo fluxo seguro: integração direta em `origin/main`, Cloudflare e comparação dos arquivos públicos com cache novo nos dois domínios operacionais. A identidade final de commit/deployment e os hashes são registrados após a execução; a preparação isolada não comprova a publicação nem gravação em banco real.

Recuperação: usar a v1000 como referência para uma reversão revisada desta correção, sem descartar o checkout operacional ou reescrever histórico. Não há alteração de banco a reverter.
