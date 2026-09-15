# Persistência dos status da arte — 15/09/2026

## Motivo

Três pedidos apresentaram divergência entre a ação feita na tela e o estado
persistido no banco. Em duas ocorrências, um modelo continuou marcado como
`Corrigir Arte` depois de o atendimento confirmar a correção. O pedido 22192
também permaneceu em `Corrigir Dados` depois da aprovação de
Entrega/Faturamento e foi corrigido pontualmente para `APROVADO` após a
confirmação das artes e dos dados.

## Diagnóstico

O fluxo tinha quatro pontos vulneráveis:

- respostas PostgREST com `data: []` podiam ser tratadas como sucesso;
- a saída de `Corrigir Arte` dependia do estado em memória da aba;
- algumas ações atualizavam a interface ou `pedidos_links_cliente` antes de
  confirmar `pedidos_artes.status`;
- a alternativa genérica de `saveAmostraToDB` podia procurar qualquer modelo
  do pedido sem garantir que exatamente uma linha fosse alterada.

`pedidos_modelos.status_arte` e `pedidos_modelos.status_impressao` continuam
sendo estados por modelo. `pedidos_artes.status` continua sendo o estado
consolidado do pedido. A correção preserva essa separação.

## Correção aplicada

As gravações críticas agora exigem que o banco devolva a linha alterada e os
valores solicitados. Uma resposta vazia, uma divergência ou mais de uma linha
é falha visível e não permite que a memória da tela avance.

A conclusão de uma correção de arte consulta o modelo persistido e grava, na
mesma operação e com filtro por `id` e `id_int`:

- `status_impressao = 'Aguardando'`;
- `status_arte = 'APROVADA'`;
- a observação informada.

As ações de retorno, aprovação e Entrega/Faturamento também confirmam
`pedidos_artes` antes de atualizar a interface. Ao carregar a Lista de Arte, o
sistema reconcilia pedidos ativos e estados de correção interrompidos usando
os modelos persistidos no banco.

A auditoria remota feita antes da publicação encontrou zero pedidos ainda
presos nas combinações verificadas de `Corrigir Dados` com dados aprovados e
zero modelos aprovados que continuassem com `status_impressao = 'Corrigir Arte'`.

## Validação

Foram aprovados 13 testes focados, cobrindo status consolidado, saída de
`Corrigir Arte`, Lista de Arte, link do cliente e Entrega/Faturamento. Todos os
arquivos JavaScript do frontend passaram em `node --check`; o motor importou
`app`, `engine` e `db`; e `git diff --check` não encontrou erro.

A suíte global também foi executada durante o diagnóstico: 1.974 testes
passaram, 585 falharam, 13 foram ignorados e houve 1 erro. As falhas estavam
fora do fluxo alterado e concentradas em configuração/ambiente, incluindo
`QR_PEDIDO_SEGREDO`, navegador/Puppeteer, Deno/portaria e fixtures do motor. A
suíte focada foi repetida depois da alteração final e terminou sem falhas.

## Publicação

- versão: `v883`;
- commit integrado em `main`: `0e6c56122e51eae1ca51b4ebf80d049a78c5b405`;
- tag: `v883`;
- Cloudflare Pages: check concluído com sucesso;
- domínios conferidos: `https://imposition.ai-ideal.com.br` e
  `https://imposicao.pages.dev`;
- `index.html`, `cliente.html`, `controle.html`, `portaria.html`,
  `producao.html` e `script.js` corresponderam às fontes locais após
  normalização de BOM e finais de linha.

Nenhuma Edge Function, migração, dado financeiro ou versão do NewProd foi
alterada nesta entrega.

## Registro do destino de hospedagem

Antes da confirmação de que a operação usa exclusivamente Cloudflare, foi
criado por engano um deploy na Vercel no projeto genérico `frontend`, com ID
`dpl_HvBhjAcKVajryNVRVMbcTroJtQaZ` e alias
`frontend-rust-three-87.vercel.app`. Esse endereço não é o domínio operacional
e não afetou a publicação da Cloudflare. O comando seguinte foi interrompido,
nenhuma outra publicação na Vercel foi considerada válida e o vínculo local
criado no worktree foi removido.

## Retomada e recuperação

O trabalho foi feito no worktree
`C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition-status-persistencia`,
branch `fix/status-arte-persistencia`. Ao encerrar, `HEAD` e `origin/main`
apontavam para `0e6c5612` e não havia alteração local pendente antes da criação
deste registro.

Se a correção precisar ser revertida, o ponto anterior é a tag `v882`. Prefira
um novo commit de reversão do commit `0e6c5612`, preservando o histórico.

Na próxima ocorrência, registrar o número do pedido, o ID do modelo e os
valores de `pedidos_modelos.status_arte`,
`pedidos_modelos.status_impressao`, `pedidos_artes.status` e
`pedidos_artes.entrega_dados` imediatamente depois da ação. Isso permite
distinguir falha de gravação, regra de consolidação e cache da tela.
