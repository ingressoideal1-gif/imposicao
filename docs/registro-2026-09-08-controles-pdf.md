# Controles de PDF na lista de arte — 08/09/2026

O pedido 21820, modelo 1000912, ficou sem os campos de escala e as setas após
desativar e reativar o modo PDF multipáginas, sequência confirmada pelo usuário.
No código da base `60fd94b2`, `toggleModoPdf` apagava `arte_url` ao desativar o
modo e persistia `{ arte_url: null, _isExplicitRemove: true }`. A reprodução
local com modelo sintético confirmou as duas exclusões, em memória e no payload.

## Inspeção do modelo

Consulta somente de leitura, restrita aos identificadores informados pelo usuário:

- `pedidos_modelos`: `modo_pdf=true`, `arte_url=null`, `verso_arte_url=null`,
  escala horizontal/vertical 100%, `status_arte=AGUARDANDO_CLIENTE`.
- Existe prévia composta em `amostra_arte_base64`, no bucket de snapshots.
- O produto de origem 2494 também está sem `arte_url`.
- A busca permitida no Storage não localizou o original; resultado vazio não
  comprova exclusão física do arquivo nem acesso a todos os objetos do bucket.

Nenhum registro ou arquivo remoto foi alterado. O snapshot contém uma imagem,
sem a estrutura das páginas do original. A recuperação desse modelo depende de
reenviar o PDF original ou recuperar seu vínculo no navegador da estação que
fez o upload. Não foi possível validar as páginas reais do modelo sem esse PDF.

## Correção local

Em `frontend/script.js`:

- Alternar o modo preserva o vínculo da arte e reverte o modo local se a gravação
  falhar. A restauração por temporizador foi retirada; o desenho normal do card
  inicializa ou reutiliza o visualizador.
- Campos e setas ficam visíveis com avisos de carregamento, original ausente,
  prévia estática, formato ausente ou falha; falhas oferecem nova tentativa.
- Paginação usa o pedido do próprio card, respeita primeira/última página e
  descarta resultados antigos. Renderizações concorrentes no mesmo canvas são
  canceladas antes da próxima, preservando o último pedido de página/escala.
- Modelo aprovado pode ser folheado; alterações de escala e modo continuam
  bloqueadas. Falha ao salvar escala restaura os valores confirmados.
- Upload de PDF no verso preserva o snapshot e o paginador da frente.

Sem alterações em backend, esquema, motor de impressão ou regras de numeração.
Trabalho isolado na branch `fix/controles-pdf-modelo`, worktree
`../imposicao-controles-pdf`, preservando as alterações preexistentes da raiz.
A publicação foi autorizada pelo usuário após a validação local. `index.html`
e `producao.html` passam a solicitar `script.js?v=837`, renovando o cache do
arquivo alterado. A entrega será confirmada pelo merge e pela conferência HTTP
das duas páginas e do JavaScript no domínio oficial `imposition.ai-ideal.com.br`.
A recuperação do PDF original do modelo 1000912 continua sendo uma ação separada;
a publicação do frontend não restaura vínculos já apagados.

## Validação

Regressão nova em `tests/controles_pdf_harness.js`, executada por
`tests/test_controles_pdf.py`: navegador e canvas reais, PDF/rede/persistência
simulados, sem acesso a produção. Abrange alternância, erro de gravação,
limites e cliques rápidos, cancelamento de render, troca de arquivo/pedido,
modelo aprovado, prévia estática, arquivo/formato ausente, nova tentativa e verso.

Também foram executados os testes existentes de escala na janela, FxVersoUnico,
PDF paginado do cliente, PDF da cor, arte de aprovação e sintaxe de todo o frontend:

```powershell
python -m pytest -n 0 -q tests/test_controles_pdf.py tests/test_escala_da_arte_na_janela.py tests/test_fxversounico_painel.py tests/test_cliente_pdf_paginado.py tests/test_pdf_da_cor.py tests/test_arte_de_aprovacao.py tests/test_o_javascript_do_frontend_compila.py
```

Resultado: 78 testes aprovados. Harness de layout do pedido: 57 verificações
aprovadas. `git diff --check` sem erros.

Na preparação da publicação, a mesma bateria foi ampliada com
`tests/test_cloudflare_pages.py` e `tests/test_link_cliente_copia.py`:
82 testes aprovados, incluindo as regressões da publicação anterior.
