# Notas emitidas na aba Nota

## Origem verificada em 12/11/2026

Inspeção somente leitura no Supabase do Vibe (`vwbtitjlpelrcnsytzqw`).
O vínculo é `notas_fiscais.id_int = propostas.id_int`; o PDF da NF-e fica em
`notas_fiscais.url_danfe`. Para NFS-e, são `notas_servico.id_int` e `url_pdf`.
O Vibe já grava o pedido ao criar o rascunho e recebe a URL na emissão.
Não é necessário copiar a URL para outro campo do pedido.
`propostas_os.nota_fiscal_url` está vazio nos 1.715 registros consultados.

`propostas.id_int` tem índice UNIQUE global. `propostas.empresa` é texto e não
corresponde a `notas_fiscais.id_empresa`, que identifica a empresa emitente
selecionada na emissão. A consulta usa exclusivamente o pedido autorizado pelo
par número/token de um link ativo. Não busca por cliente nem por nome de empresa.

Há 68 pedidos com múltiplas NF-e autorizadas em produção, incluindo remessas.
Por isso a tela suporta vários botões, identificados por tipo e número.
Apenas `status = AUTORIZADA`, `ambiente = producao`, sem data de cancelamento e
com URL HTTPS são elegíveis. `status_focus` sozinho não basta: há notas canceladas
que ainda mantêm `autorizado` nesse campo. Prévias e XML não são usados.

## Implementação local

`sql/link_cliente_notas_fiscais.sql` adiciona uma RPC somente de leitura, com
validação do token antes de consultar as notas. Retorna somente tipo, número e
URL. Não concede leitura direta das tabelas nem substitui `link_cliente_pedido`.

O frontend consulta em paralelo ao carregamento do portal e mostra os botões
abaixo do resumo fiscal. Cada botão abre uma nova aba com `noopener noreferrer`.
Sem documento, o cartão não aparece; falha de consulta apresenta mensagem para
atualizar a página. Uma resposta atrasada não altera outro pedido nem reescreve
os formulários que o cliente esteja editando.

## Validação e implantação

Testes: `tests/portal_notas_fiscais_harness.cjs` e
`tests/portal_notas_fiscais_pglite.cjs`, usando somente dados sintéticos.
O segundo aceita `PGLITE_MODULE` para reutilizar instalação existente.

Resultados locais: ambos os testes novos passaram; 28 testes do portal passaram.
`conferir_duas_versoes.py --base HEAD` passou integralmente nos dois canais:
911 testes e 2 subtestes por canal, 2 ignorados por canal, mais todos os harnesses.
O único aviso foi de depreciação do TestClient da dependência Starlette.
Sintaxe dos JS alterados e `git diff --check` também passaram.
Evidência local ignorada pelo Git: `dist/nota-fiscal/duas-versoes.json` e `.log`.

Autorização humana recebida em 12/11/2026 para aplicar a RPC e publicar o frontend.
A RPC foi aplicada antes do frontend. A migração é transacional e altera somente uma função e seu
privilégio de execução; zero registros comerciais ou fiscais são modificados.
Definição instalada conferida por MD5 do corpo: `a9e750f7a386659bf519454bc013a20f`.
SECURITY DEFINER e search_path conferidos; EXECUTE para anon/authenticated e
revogado de PUBLIC; token inválido retorna lista vazia. Consulta somente leitura
em cinco links ativos com documentos retornou notas nos cinco, sem expor tokens,
URLs ou dados pessoais. Nenhum PDF real foi aberto.

O frontend usa cache `v20261126` nos três módulos alterados e será integrado por
PR protegido. Conferir os hashes públicos após a implantação antes de declarar
publicação concluída. A ordem Envio abaixo do endereço acompanha esta entrega.

Recuperação: republicar os arquivos anteriores pelo fluxo protegido; a função
aditiva pode permanecer sem uso. Nenhum documento emitido é alterado.
Não foram emitidas notas nem modificados pedidos ou documentos fiscais.
