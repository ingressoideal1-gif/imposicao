# Encerramento de 14/09/2026 — retomada em 15/09/2026

## Estado geral

O trabalho de hoje foi concluído em duas frentes:

1. correção do retorno para Arte do pedido **21396**;
2. criação do fluxo operacional `entrega-segura.ps1` para as próximas entregas.

O frontend público permanece na versão **v874**. O comando operacional está em
`origin/main`, no commit `7d8ea49d2157e2395192a5c2bd2f6b50b357bf4d`.

## Pedido 21396

### Causa confirmada

O pedido já havia saído da Arte e estava com `propostas.status_interno =
EXPEDICAO`. O comando interno **Voltar p/ Arte** mudava o estado geral, mas não
persistia nos modelos a marca durável `status_impressao = Corrigir Arte`.

Na montagem da fila, `EXPEDICAO` continuava vencendo o retorno geral e mantinha o
pedido em Concluídos. Por isso ele não reaparecia corretamente no painel da
Arte.

### Reparação aplicada nos dados

A correção foi restrita ao pedido e aos dois modelos conhecidos:

| Registro | Estado final confirmado |
|---|---|
| `pedidos_modelos.id = 1000878` | `status_impressao = Corrigir Arte`; `status_arte = REPROVADA_CLIENTE` |
| `pedidos_modelos.id = 1000879` | `status_impressao = Corrigir Arte`; `status_arte = REPROVADA_CLIENTE` |
| `pedidos_artes.id_int = 21396` | `status = Em Alteração`; `entrega_dados = null` |

`propostas.status_interno` permaneceu em `EXPEDICAO` e `em_arte` permaneceu
verdadeiro. Isso é intencional: a marca `Corrigir Arte` nos modelos passa a
vencer a classificação de Expedição e recoloca o pedido na fila de Arte.

A escrita foi condicionada aos estados previamente conferidos e retornou dois
modelos e uma linha de `pedidos_artes`. Não houve alteração de preço, pagamento,
produto, quantidade ou outro dado comercial.

### Correção permanente no frontend

O fluxo agora, antes de anunciar sucesso no retorno:

1. identifica se o pedido já saiu da Arte;
2. reúne apenas os modelos reprovados;
3. grava o lote em `pedidos_modelos` com filtro pelo pedido e pelos IDs;
4. exige confirmação de todos os modelos retornados pelo banco;
5. somente depois atualiza a memória da tela e consolida o estado do pedido;
6. em resposta parcial ou recusa do banco, mantém a tela sem sucesso falso.

Arquivos da correção:

- `frontend/script.js`;
- `frontend/index.html`;
- `frontend/producao.html`;
- `tests/corrigir_arte_persistencia_harness.js`.

Publicação:

- commit: `ff5fd597fbfdef2254ecb684804e454e755b6759`;
- tag: `v874`;
- Cloudflare Pages: sucesso;
- `index.html`, `producao.html` e `script.js` públicos conferidos por hashes
  normalizados idênticos aos arquivos locais validados.

Validação:

- `node --check frontend/script.js`;
- 80 verificações em `tests/corrigir_arte_harness.js`;
- 32 verificações em `tests/corrigir_arte_persistencia_harness.js`;
- `git diff --check` sem erro.

## Comando `entrega-segura.ps1`

### Estado

O comando foi implementado, testado e integrado em `origin/main`:

- commit: `7d8ea49d2157e2395192a5c2bd2f6b50b357bf4d`;
- branch de origem: `docs/entrega-segura`;
- `origin/main` e a branch apontavam para o mesmo commit no encerramento;
- implantação automática do Cloudflare Pages concluída com sucesso;
- o site continuou servindo `script.js?v=874`, pois a entrega foi operacional e
  não alterou assets do frontend.

Arquivos:

- `entrega-segura.ps1` — orquestrador;
- `ferramentas/EntregaSegura.psm1` — decisões testáveis;
- `tests/EntregaSegura.Tests.ps1` — regressões e ensaios temporários;
- `docs/ENTREGA_SEGURA.md` — contrato operacional;
- links atualizados em `docs/PUBLICAR.md` e `docs/DOCUMENTACAO.md`.

### Uso previsto

Preparar uma worktree atualizada:

```powershell
C:\ProjetosLocais\ideal-imposition-doc-entrega-segura\entrega-segura.ps1 `
    preparar -Nome nome-da-correcao
```

Verificar dentro da worktree criada:

```powershell
.\entrega-segura.ps1 verificar -Escopo Frontend
```

Simular toda a preparação da publicação sem modificar arquivos, commitar ou
enviar:

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend `
    -Mensagem "Descrição da mudança" -Simular
```

Publicar depois de autorização explícita:

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend `
    -Mensagem "Descrição da mudança"
```

O padrão é integração por PR. Como `gh` não estava instalado no ambiente no
encerramento, esse modo envia a branch e termina em `AGUARDANDO_INTEGRACAO`, com
a URL para abrir o PR. A integração direta existe somente com opção explícita:

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend `
    -Mensagem "Descrição da mudança" -Integracao Direta
```

### Proteções implementadas

- recusa executar `verificar` ou `publicar` na `main`/worktree principal;
- preserva o checkout principal, sem `stash`, `reset`, `clean` ou descarte;
- detecta escopo misto, banco, NewProd, rascunhos, builds e possíveis segredos;
- exige branch alinhada com `origin/main`;
- verifica sintaxe, testes dirigidos, Markdown e whitespace;
- calcula a próxima versão sem reutilizar tags;
- simula o bump de cache sem modificar HTML;
- no fluxo real, grava o bump somente depois da confirmação e revalida;
- PR é o padrão; push direto precisa ser solicitado;
- acompanha Cloudflare Pages para entregas de frontend;
- compara hashes locais e públicos após normalizar BOM e finais de linha;
- não executa SQL remoto nem distribui NewProd.

### Testes

- 19 testes específicos do `entrega-segura.ps1` passaram;
- 87 testes legados de publicação passaram;
- Windows PowerShell 5.1 validado;
- ensaio com Git remoto temporário comprovou:
  - criação de worktree sem tocar no checkout principal sujo;
  - `publicar -Simular` sem alteração local ou remota;
  - commit, push e integração direta em remoto descartável;
  - planejamento de cache sem modificar o HTML.

O próprio comando foi usado para publicar sua implementação e terminou em
`PUBLICADA_E_VERIFICADA`.

## Limites e pendências

- A publicação web não atualizou o agente NewProd e não comprova impressão
  física.
- Não foi feita uma validação visual autenticada da fila do pedido 21396; a
  comprovação disponível é banco mais regra determinística do frontend.
- O caminho real de uma futura entrega **Frontend** pelo novo comando ainda deve
  ser acompanhado na primeira utilização. As partes foram testadas, mas a
  publicação de hoje do próprio comando teve escopo `Operacional`.
- `gh` continua ausente; o padrão PR para em `AGUARDANDO_INTEGRACAO` até haver
  uma ferramenta autenticada ou integração manual.
- Nenhuma dependência foi instalada.

## Checkouts no encerramento

### Checkout principal antigo

`C:\ProjetosLocais\ideal-imposition`

- permanece deliberadamente intocado;
- branch `main` estava 101 commits atrás de `origin/main`;
- havia 111 entradas no `git status --porcelain`;
- não executar `pull`, `stash`, `reset`, `clean` ou descarte automático ali.

Esse conteúdo deve ser auditado em uma tarefa separada, arquivo por arquivo.

### Worktree operacional atual

`C:\ProjetosLocais\ideal-imposition-doc-entrega-segura`

- commit publicado: `7d8ea49d`;
- alinhada com `origin/main` antes da criação deste documento;
- este arquivo de encerramento é a única mudança nova esperada após o commit.

## Retomada recomendada

1. ler este documento e `docs/ENTREGA_SEGURA.md`;
2. conferir `git status` na worktree operacional;
3. para uma nova demanda, usar `entrega-segura.ps1 preparar -Nome <tema>`;
4. implementar e validar somente na worktree criada;
5. usar `publicar -Simular` antes de solicitar/autorização de publicação;
6. na primeira entrega real de frontend pelo comando, acompanhar versão, check
   do Cloudflare e hashes públicos;
7. tratar a organização do checkout antigo em tarefa independente.

## Recuperação

- Código da correção do pedido: revert rastreável do commit `ff5fd597`, seguido
  de nova versão web. Não reutilizar `v874`.
- Comando operacional: revert rastreável do commit `7d8ea49d` se o fluxo precisar
  ser retirado.
- Dados do pedido 21396: qualquer reversão exige nova autorização e filtros
  condicionais nos mesmos dois modelos e na linha de `pedidos_artes`; não
  reverter automaticamente, pois isso recolocaria o defeito observado.
- Nunca usar `reset --hard` ou push forçado como recuperação.

## Estado de encerramento

O desenvolvimento e as publicações autorizadas de hoje estão concluídos. Este
documento foi preparado localmente para a retomada e não foi commitado nem
publicado nesta etapa de encerramento.
