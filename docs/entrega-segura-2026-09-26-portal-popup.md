# Entrega segura do portal — validada, aguardando publicação

Worktree: `C:/ProjetosLocais/ideal-imposition-entrega-portal-popup-20260926`.
Branch: `entrega/portal-popup-20260926`.
Base conferida após fetch: `origin/main`, `fb776c1d` (sem divergência).

## Pacote revisado

Frontend do portal: `cliente.js`, `cliente-shell.js`, `cliente.html`.
Inclui erro/repetição de carga, status consolidado, aviso de falha do chat,
aprovação sem esperar resposta do chat e popup de próxima etapa.
O popup só surge após persistência; seu botão apenas navega para conferir dados.
Inclui testes e os registros correspondentes. O procedimento revisou escopo,
segredos, arquivos novos, whitespace, sintaxe e testes.

Indicador Cliente/Atendente, SQL e análise do percurso permanecem preservados no
worktree original `ideal-imposition-portal-prioridades-20260926`. Não integram este
pacote de publicação: a origem exige validação do gateway e implantação própria.
Nenhum arquivo operacional preexistente foi alterado ou escondido.

## Resultado

`entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Simular`
terminou com **ESTADO: VALIDADA**; cache planejado **v966** em `cliente.html`.
Sem commit, push, integração ou deploy. A simulação consultou Git remoto, sem
consultar banco ou dados de clientes.

Passaram: 146 verificações de abas, 143 de confirmações, 53 de pendências,
35 cenários de persistência, 32 de carga/status/chat, 19 cenários de navegação
e o harness móvel do popup (também verifica 1280px, teclado e Escape).
Chamadas de aplicação foram simuladas. O teste antigo que exigia navegação direta
foi atualizado para exigir o popup seguido da navegação pelo botão; não foi desabilitado.

As referências temporárias de cache baseadas em data foram normalizadas nesta
entrega para a série numérica do publicador. O script calculará a versão novamente
na publicação, caso outra entrega avance antes.

## Próximo passo e recuperação

Após autorização explícita de publicação, executar no worktree desta entrega:

```powershell
$env:NODE_PATH = 'C:/ProjetosLocais/ideal-imposition/node_modules'
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'core.quotepath'
$env:GIT_CONFIG_VALUE_0 = 'false'
.\entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Sim -Mensagem 'Corrige fluxo de aprovacao do portal e orienta conferencia de entrega' -Teste @('tests/portal_abas_harness.js','tests/portal_pendencia_harness.js','tests/portal_confirmacoes_harness.js','tests/navegacao_browser_harness.js')
```

A configuração Git acima vale apenas no processo e permite caminhos com acentos
sem aspas escapadas no parser de arquivos do publicador. Não altera configuração pessoal.
Revalidar base se houver avanço remoto. Após Cloudflare Pages, comparar conteúdos
normalizados de `cliente.html`, `cliente.js` e `cliente-shell.js` nos dois domínios
operacionais, com cache busting. Commit/push não bastam como prova pública.

Antes de publicar, o trabalho pode permanecer neste worktree, sem tocar na main.
Após publicar, recuperação exige uma nova entrega revisada do frontend com versão
de cache nova, preservando dados; não usar descarte de histórico. Nenhuma migração
do banco ou versão NewProd está incluída.
