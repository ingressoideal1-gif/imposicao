# `entrega-segura.ps1` — fluxo seguro de preparação e publicação

**Estado:** primeira implementação local concluída; aguardando commit, publicação
e primeira execução real acompanhada.

Este documento define o contrato do `entrega-segura.ps1`. Enquanto a primeira
execução real não for acompanhada e aprovada, o procedimento em
[`PUBLICAR.md`](PUBLICAR.md) continua sendo o procedimento operacional vigente.

## Objetivo

Automatizar a parte repetível de uma entrega sem misturar trabalhos, esconder
falhas ou anunciar uma publicação antes de comprová-la. O comando deve conduzir
o fluxo abaixo:

```text
atualizar origin/main
  -> criar worktree isolada
  -> revisar escopo
  -> validar
  -> sincronizar novamente
  -> versionar cache quando necessário
  -> commitar somente a entrega
  -> enviar e integrar
  -> aguardar a hospedagem
  -> comparar arquivos públicos
```

O comando não substitui a análise do problema nem decide regras de negócio. Ele
começa com um escopo já definido e termina com evidências verificáveis da
entrega.

## Nome e sintaxe

O comando será executado da raiz do repositório:

```powershell
.\entrega-segura.ps1 <acao> [parametros]
```

As ações previstas são:

| Ação | Finalidade | Publica? |
|---|---|---:|
| `preparar` | Atualiza as referências e cria branch/worktree isolada | Não |
| `verificar` | Executa inventário e validações sem commit ou envio | Não |
| `publicar` | Repete os freios, integra e comprova a publicação | Sim |

## 1. Preparar uma entrega

```powershell
.\entrega-segura.ps1 preparar -Nome retorno-arte-21396
```

Comportamento esperado:

1. validar que o comando está sendo executado no repositório correto;
2. executar `git fetch origin --prune`;
3. localizar o `origin/main` atual;
4. criar uma branch `fix/<nome>` e uma worktree irmã baseada exatamente nesse
   commit;
5. recusar um nome que produza caminho ou branch já existente;
6. mostrar o caminho absoluto criado, branch e commit-base.

O checkout principal não pode ser limpo, atualizado, guardado com `stash` ou
alterado. Mudanças existentes nele pertencem a outro trabalho e devem permanecer
intactas.

Exemplo de resultado:

```text
Worktree: C:\ProjetosLocais\ideal-imposition-retorno-arte-21396
Branch:   fix/retorno-arte-21396
Base:     origin/main @ <commit>
Nada foi publicado.
```

## 2. Verificar antes de publicar

Executado dentro da worktree:

```powershell
.\entrega-segura.ps1 verificar -Escopo Frontend
```

O escopo pode ser `Auto`, `Frontend`, `EdgeFunctions`, `Documentacao`,
`Operacional` ou `NewProd`. `Operacional` cobre os próprios scripts de entrega.
`Auto` apenas classifica os arquivos; qualquer operação remota de maior impacto
continua exigindo escopo explícito.

Para validar toda a ação `publicar`, inclusive o bump de cache, e parar antes de
commit, push ou deploy:

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend `
    -Mensagem "Corrige retorno para Arte" -Simular
```

Testes dirigidos adicionais podem ser informados com `-Teste`, desde que estejam
dentro da pasta `tests/`.

### Freios obrigatórios

O comando deve parar, sem commit ou publicação, quando:

- estiver na branch `main` ou no checkout principal com trabalho pendente;
- encontrar arquivo modificado fora do escopo declarado;
- encontrar rascunho, artefato de build ou possível segredo na entrega;
- a branch estiver atrás ou tiver divergido de `origin/main`;
- um teste obrigatório, verificação de sintaxe ou `git diff --check` falhar;
- um asset alterado não tiver referência de cache preparada nas páginas que o
  carregam;
- não houver nenhuma mudança para entregar.

Antes dos testes, o comando deve mostrar:

- arquivos modificados, novos e removidos;
- estatística do diff;
- escopo detectado;
- testes que serão executados;
- serviços que seriam afetados pela publicação.

### Matriz mínima de validação

| Mudança detectada | Validação mínima |
|---|---|
| JavaScript do frontend | `node --check` nos arquivos alterados e harnesses relacionados |
| HTML/CSS do frontend | referências de assets, teste dirigido disponível e revisão do diff |
| Python local | testes relacionados e importação segura dos módulos afetados |
| Edge Function | testes Deno da função alterada |
| Documentação | links/caminhos, conteúdo e `git diff --check` |
| Qualquer escopo | caminho principal, um erro ou limite relevante e revisão de segredos |

Se o ambiente necessário não existir, o comando deve falhar com uma mensagem
objetiva. Não deve instalar dependências, pular testes ou usar produção como
substituto de uma suíte local.

## 3. Publicar

```powershell
.\entrega-segura.ps1 publicar `
    -Escopo Frontend `
    -Mensagem "Corrige retorno de pedido impresso para Arte"
```

A ação `publicar` deve repetir todas as verificações. Um `verificar` executado
antes não autoriza reutilizar resultados antigos.

### Ordem obrigatória

1. executar `git fetch origin --prune` novamente;
2. confirmar que a worktree continua baseada no `origin/main` atual;
3. integrar qualquer avanço remoto e repetir os testes;
4. calcular a próxima versão pública sem reutilizar número existente;
5. atualizar o cache somente nas páginas que carregam assets alterados;
6. mostrar a prévia final: arquivos, commit, versão, escopo e destinos;
7. pedir confirmação final;
8. adicionar somente os arquivos listados e criar o commit;
9. enviar a branch remota;
10. integrar por PR, por padrão;
11. criar e enviar a tag anotada `vNNN` no commit integrado;
12. acompanhar o check da hospedagem até sucesso ou falha;
13. esperar a propagação no domínio público;
14. baixar HTML e assets com cache-buster;
15. comparar SHA-256 após normalizar BOM e finais de linha;
16. emitir o relatório final.

O comando não deve considerar a entrega concluída apenas porque o `git push`
funcionou. Publicação concluída exige check da hospedagem bem-sucedido e os
arquivos públicos correspondentes à fonte validada.

`-Sim` responde à confirmação final depois que todos os freios passaram; ele não
pula nenhuma validação. `-Simular` calcula inclusive o próximo cache, mas não
modifica arquivos e encerra antes de commit, push e deploy. No fluxo real, o
bump é gravado somente depois da confirmação e todos os freios rodam novamente
antes do commit.

### Integração no GitHub

O padrão será PR. Se não houver ferramenta autenticada capaz de criar e integrar
o PR, o comando deve enviar a branch, imprimir a URL para abertura e parar como
`AGUARDANDO_INTEGRACAO`. Ele não pode mudar silenciosamente para push direto em
`main`.

Uma integração direta poderá existir como opção separada:

```powershell
.\entrega-segura.ps1 publicar -Integracao Direta ...
```

Nesse modo, deve exigir confirmação explícita, provar que o avanço é
fast-forward e abortar se `origin/main` tiver avançado.

## Escopos e limites

### Frontend

- Publica apenas arquivos do painel hospedado.
- Atualiza o identificador `?v=NNN` das referências afetadas.
- Confirma o HTML e cada asset público alterado.
- Não publica automaticamente Edge Functions ou agente NewProd.

### Edge Functions

- Exige `-Escopo EdgeFunctions` explícito.
- Lista exatamente quais funções serão enviadas.
- Confirma projeto Supabase e testes antes do deploy.
- Não lê nem imprime valores secretos.

### Banco de dados

O comando nunca executa automaticamente `UPDATE`, `DELETE`, migração ou SQL
remoto. Uma correção de dados reais é uma operação separada, com ambiente,
tabela, filtro, quantidade esperada, prévia, recuperação e pós-validação
apresentados antes da escrita.

### NewProd

`entrega-segura.ps1` não compila nem distribui o agente. Ao
detectar arquivos do motor ou do agente, deve parar e orientar o fluxo próprio
de `publicar_agente.ps1`. Publicar o frontend não comprova atualização da estação
nem impressão física.

### Documentação

Uma entrega somente de documentação não recebe número de asset nem tag pública,
a menos que exista uma decisão explícita de versioná-la como release. Ainda deve
usar branch isolada, revisão do diff e integração rastreável.

## Saída e estados finais

O resumo deve terminar em exatamente um dos estados:

| Estado | Significado |
|---|---|
| `PREPARADA` | Worktree criada; nada publicado |
| `VALIDADA` | Verificações passaram; nada publicado |
| `AGUARDANDO_INTEGRACAO` | Branch enviada, mas ainda fora de `main` |
| `PUBLICADA_E_VERIFICADA` | Integração, hospedagem e hashes confirmados |
| `FALHA_ANTES_DA_PUBLICACAO` | Nenhuma mudança pública ocorreu |
| `FALHA_APOS_INTEGRACAO` | Código integrou, mas implantação ou prova pública falhou |

O relatório deve incluir:

- worktree e branch;
- commit integrado e tag, quando houver;
- arquivos incluídos;
- testes executados e resultados;
- hospedagem e URLs conferidas;
- hashes locais e públicos;
- limites da comprovação;
- ação de recuperação indicada, se necessária.

## Recuperação

- Antes da integração: corrigir na própria branch e repetir `verificar`.
- Depois da integração, antes da propagação: não declarar sucesso; acompanhar ou
  investigar o check da hospedagem.
- Versão web defeituosa: criar `git revert` rastreável e publicar uma versão
  nova. Nunca usar `reset --hard` ou push forçado.
- NewProd: rollback exige código anterior sob um número de versão superior; não
  é feito por este comando.

## Critérios para considerar o comando implementado

O `entrega-segura.ps1` somente poderá substituir o procedimento atual quando:

- possuir testes automatizados para as decisões e estados que podem ser
  ensaiados sem serviços reais;
- provar que não modifica o checkout principal;
- abortar diante de branch divergente e arquivo fora do escopo;
- cobrir sucesso e falha de versionamento, push, hospedagem e comparação pública;
- não vazar segredos nos logs;
- ter sido ensaiado com repositório e serviços simulados;
- ter uma primeira execução real acompanhada e documentada.

A implementação inicial cobre decisões, preparação em repositório temporário,
simulação sem commit/push, validações locais, integração PR ou fast-forward
explícito, check do Cloudflare Pages e comparação pública. Os estados que
dependem de GitHub e Cloudflare reais só serão considerados aprovados depois da
primeira publicação acompanhada.
