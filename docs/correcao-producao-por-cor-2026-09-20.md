# Correção local de Produção por Cor — 20/09/2026

## Resultado

Após a análise, o usuário autorizou “executar”. As correções foram implementadas na worktree `C:\ProjetosLocais\ideal-imposition-auditoria-cor-20260920`, baseada em `f184a001` (detached HEAD). O checkout operacional com alterações preexistentes permaneceu preservado.

**Estado ao concluir a implementação: correção local implementada e testada; ainda não publicada naquele momento.** A comparação com arquivos públicos daquela etapa foi feita antes das correções. Não houve instalação de dependências, consulta a dados reais ou impressão.

## Preparação da publicação autorizada

Em seguida, o usuário autorizou “publicar”. A entrega foi preparada na branch `fix/producao-por-cor-20260920`, sem alterar o checkout operacional. O fetch confirmou a base em `origin/main`; a simulação de `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Simular` passou, planejando v914 e atualização das referências dos três scripts alterados em `cliente.html`, `controle.html`, `index.html` e `producao.html`.

A publicação usa o mesmo comando com `-Sim`, que confirma a autorização sem dispensar as verificações. A conclusão exige sucesso do Cloudflare e comparação SHA-256 normalizada dos sete arquivos públicos com a entrega local, usando parâmetros anticache em `imposition.ai-ideal.com.br` e `imposicao.pages.dev`. O resultado dessa verificação posterior será registrado separadamente. A versão anterior é v913 (`f184a001`); eventual reversão deve ser uma nova entrega revisada, preservando avanços posteriores de main.

O teste de uniformidade global das versões permanece como falha preexistente: o publicador versiona somente os scripts alterados, não todos os módulos do HTML. Isso não dispensa o bump dos três scripts desta correção nem sua conferência pública.

## Mudanças

| Arquivo | Resultado |
|---|---|
| `frontend/producao-por-cor.js` | Entrada continua sem produto/cor selecionados; seleção múltipla do Pedido é guardada ao entrar, isolada durante o uso e restaurada ao sair. Abertura pendente perde validade ao fechar, trocar filtros/modelos ou sair. Status carrega o modelo completo antes de gravar. O contexto aberto fecha quando o modelo deixa a lista. |
| `frontend/producao-por-cor.js` | Erro de carga permanece visível e elimina registros antigos acionáveis. Retorno `false` de `loadOrdens` passa a ser falha. Atualização durante alteração de status aguarda seu término. Leituras são paginadas por `id`, inclusive quando o servidor retorna menos linhas que o solicitado. |
| `frontend/producao-por-cor.js` | Produto sem vínculo tenta a identidade do próprio modelo; dados completos são buscados apenas para esses órfãos, sem supor uma coluna opcional no schema. Identidade desconhecida fica explícita, sem agrupar pelo nome do modelo. Cor e verso seguem a reconciliação/catálogo usados pelo Pedido. Data civil preserva o dia e timestamps preservam a hora. Falha de catálogo é informada. |
| `frontend/pedido.js` | Geração da janela usa sempre frente e verso do Pedido, inclusive quando hospedada em Produção por Cor. O carregamento externo aguarda controles, arte e verso; gerar/imprimir antes de estar pronto é recusado. Respostas e temporizadores cancelados não aplicam arte antiga ao novo contexto. Validação do contexto é repetida antes de montar/enviar o trabalho. O alvo da confirmação é capturado no início: trocar de modelo depois do envio não marca outro modelo como Impresso. |
| `frontend/script.js` | Preparação compartilhada aceita uma validação opcional da abertura externa e interrompe continuações canceladas. Nesse contexto não dispara o segundo carregador da arte da aba Imposição. |
| `frontend/script.js` | Status no Supabase exige `id + id_int`, retorno de exatamente uma linha, identidade e status esperado. Zero linhas/erro/resposta divergente não geram sucesso nem evento. A confirmação de impressão retorna falha e não registra combinação se o status não foi confirmado. |

Os critérios de elegibilidade dos pedidos foram preservados: na gráfica, não expedido/entregue e não Ignorar; modelos somente Aguardando. Regras TICKET, cálculos de imposição e restrições Multi-Artes não foram modificados. A página continua operando modelo por modelo; não foi adicionada uma fila automática ou reintroduzido o box de ordem de envio removido no pedido original.

## Evidência de validação

- **22 cenários novos de regressão** em `tests/producao_por_cor_fluxo_harness.js`: elegibilidade real, estado neutro, isolamento/restauração da seleção, troca rápida de modelo, cancelamento ao sair, confirmação de status com erro/zero/múltiplas linhas/identidade ou valor divergentes, retorno à arte sem abrir antes, atualização falha, catálogo indisponível, produto órfão, paginação, prazo, cor/verso, origem dos arquivos, carga real da janela, cancelamento durante downloads/consulta de numeração/preparação de PDF e impressão, e preservação do alvo da confirmação após trocar de modelo.
- **Navegador offline** em `tests/producao_por_cor_browser_harness.js`: HTML real da seção, módulo real e funções reais que movem/fecham a janela; filtros, troca de modelo, status, saída/reentrada, identidade do nó, preservação de controles. Todas as requisições externas são abortadas; dados e integrações são simulados.
- **Suíte selecionada: 139 aprovados e 1 falha preexistente**, executada pelo pytest 9.1.1 já instalado. Inclui sintaxe de todo frontend, Produção por Cor, Corrigir Arte, janela do Pedido, bancos do pedido, arte de impressão, aproveitamento/Multi-Artes, esquema da prévia, numeração frente/verso e prazo.
- `node tests/corrigir_arte_persistencia_harness.js`: **37 verificações aprovadas**.
- `node tests/bandeja_capa_miolo_harness.js`: **16 verificações aprovadas**. O leitor do teste foi ajustado para normalizar CRLF/LF; antes, em checkout Windows, extraía um corpo vazio. A lógica da bandeja não foi alterada.
- `git diff --check`: aprovado.

Falha remanescente: `tests/test_arte_de_impressao.py::test_a_versao_do_script_acompanha_as_outras` exige um único número de versão de JavaScript em cada HTML. `index.html` já contém **897, 899, 908 e 913** na revisão `f184a001`, confirmado com `git show HEAD:frontend/index.html`. Este arquivo não foi alterado. O teste não foi desabilitado; a uniformização/bump de cache pertence à preparação da publicação.

Foram substituídas as asserções frágeis da elegibilidade por execução de cenários; o teste de navegação agora delimita a função inteira em vez de cortá-la no primeiro `setTimeout`. O programa `producao_por_cor_auditoria_harness.js` foi preservado como reprodução **histórica**, lendo explicitamente o código de `f184a001` via `git show`. A validação da correção é feita pelo novo harness de fluxo, não pelas asserções que comprovavam os defeitos antigos.

## Ambiente de testes e repetição

O venv previsto no checkout operacional não existe. Foi localizado e reutilizado, sem instalar nada, o interpretador:

```powershell
& 'C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_producao_por_cor.py tests/test_corrigir_arte.py tests/test_janela_do_modelo.py tests/test_banco_do_pedido_na_impressao.py tests/test_arte_de_impressao.py tests/test_o_javascript_do_frontend_compila.py tests/test_harness_de_imposicao.py tests/test_esquema_da_janela_igual_ao_payload.py tests/test_pdf_duplex_preview_numbering.py tests/test_prazo_de_entrega.py tests/test_janela_tres_colunas.py -q
```

A worktree reutiliza as dependências Node existentes por uma junction local `node_modules` apontando para `C:\ProjetosLocais\ideal-imposition-atualizado-20260919\node_modules`. Nenhum package/lockfile foi alterado. Os testes não executaram build do agente nem importaram o backend para acessar serviços.

## Limites e retomada

- Os cenários exercitam código real com banco/agente/impressora simulados. Não comprovam persistência em produção, permissão RLS da sessão do operador, comportamento de um pedido real ou saída física.
- A suíte completa do repositório não foi executada; a seleção acima cobre as áreas alteradas e regressões relacionadas.
- Para revisar, abrir o diff desta worktree e os dois novos harnesses de fluxo/navegador. As referências de linha da análise original pertencem à revisão anterior.
- Para entrega: autorização de publicação, preparação do cache/versionamento e verificações de release; depois, comparar os arquivos públicos e conferir o fluxo autenticado no alvo autorizado. Não usar build MSI como teste dessa correção web.
- Manter a worktree até integrar/entregar. Não copiar `script.js`/`pedido.js` inteiros sobre a raiz antiga e suja, nem resetar/stashar alterações do usuário. Nenhuma recuperação do checkout operacional é necessária porque ele não foi editado.
