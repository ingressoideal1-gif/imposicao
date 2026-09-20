# Pedido 21826: modelos novos exibem arte do produto compartilhado

Investigacao solicitada em 09/09/2026. Consultas somente de leitura no projeto
de producao `vwbtitjlpelrcnsytzqw`. Nenhuma escrita em dados, alteracao no
frontend/backend, migracao, publicacao ou exclusao de arquivo de arte.

## Resultado confirmado

O pedido tem quatro modelos ligados ao mesmo produto comercial 2498:

| Modelo | Quantidade | Criacao UTC | Arte/previa salvas no modelo |
| --- | --- | --- | --- |
| 1000915 | 200 | 08/09/2026 18:51:16 | Presentes, arte propria |
| 1000916 | 200 | 08/09/2026 18:51:16 | Presentes, arte propria |
| 1000938 | 150 | 09/09/2026 13:56:33 | Ausentes |
| 1000939 | 150 | 09/09/2026 13:56:33 | Ausentes |

Os modelos novos tambem estao sem arte/previa de verso. O produto 2498 tem uma
URL e uma previa iguais, por hash, as do modelo 1000916. Quantidade comercial
700, consistente com a soma dos quatro modelos. Nao foram lidos dados pessoais
ou expostos enderecos privados dos arquivos.

O pedido tem uma linha em `pedidos_artes`, com quatro arquivos e observacao
`item_2498`. Essa lista pertence ao pedido/produto e nao comprova uma associacao
individual aos modelos novos. Nao deve ser usada para distribuir arquivos por
ordem ou por datas.

## Causa no painel publicado

A pagina publica referencia `script.js?v=842`. SHA-256 dos bytes recebidos:
`8593d5bfa1b8aaa67e7b00e2823515ad72a2602eafd3753cb65f875bcf2c4e5e`.

Em `loadOSItens`, o painel localiza o produto pelo campo
`id_produto_proposta_origem`. Mesmo quando o modelo existe no banco, o mapeamento
usa a arte do produto quando a arte do modelo esta vazia:

```javascript
amostra_arte_base64: item.amostra_arte_base64 || (prop ? prop.amostra_arte_base64 : null)
arte_url: item.arte_url || item.url_arquivo_arte || item.url_arquivo || (prop ? (prop.arte_url || prop.url_arquivo_arte || prop.url_arquivo) : null)
```

O mesmo emprestimo existe nos campos do verso e nos aliases `url_arquivo_arte`
e `url_arquivo_arte_verso`. No script publicado, o trecho fica nas linhas
26601-26606. Na fonte local antiga da pasta principal, fica a partir de 26571.

Portanto, os modelos 1000938 e 1000939 chegam vazios do banco, mas sao preenchidos
em memoria com a arte do modelo 1000916 armazenada no produto comum. Nao e
necessario cache antigo ou clique no botao Colar para reproduzir o problema.

`origemDaArteDoModelo` interpreta a URL compartilhada como arte colada e gera
essa marca nos cards. Neste caso, a marca resulta do fallback automatico, nao
de evidencia de uma colagem feita pelo usuario.

O caminho `saveAmostraToDB` tambem sincroniza `arte_url` e
`amostra_arte_base64` com `produtos_proposta`. Isso explica como uma arte de
modelo pode ocupar o campo compartilhado. Nao foi atribuido a um usuario o
ultimo salvamento nem alterada essa sincronizacao nesta investigacao.

## Reproducao e candidato em memoria

Arquivo descartavel local: `rascunhos/diagnostico-21826/reproduzir.cjs`.
Comando executado: `node rascunhos/diagnostico-21826/reproduzir.cjs`.

O diagnostico extrai as funcoes do JavaScript publicado, usa quatro modelos e
um produto sinteticos, Supabase simulado e nenhuma chamada de rede. Toda tentativa
de INSERT/UPDATE/DELETE/UPSERT no simulador causa falha.

- Reproduzido: dois modelos novos sem arte passam a usar URL/previa do produto
  compartilhado; o resolvedor do visualizador retorna essa arte e a marca diz colada.
- Candidato somente em memoria: retirar o fallback do produto nos seis campos
  de arte, quando ja existe registro individual do modelo. Os dois modelos antigos
  conservam as artes; os dois novos ficam sem arte, previa, verso ou marca de colagem.
- Limites exercitados: colagem explicitamente gravada no modelo continua valida;
  verso proprio permanece; modelo novo nao herda verso do produto.
- Execucao terminou com codigo zero e nenhuma tentativa de escrita no simulador.

O candidato nao foi aplicado na fonte local nem publicado. Esta simulacao nao
substitui revisao visual de navegador nem os testes de integracao de uma futura
correcao. O caminho legado sem nenhum modelo, os caches locais por indice e os
demais consumidores devem ser conferidos ao implementar a correcao.

## Escopo de uma futura correcao

Para modelos existentes, a fonte da arte precisa ser o proprio modelo ou um
vinculo individual comprovado. Campo vazio significa modelo sem arte e deve
continuar vazio; compartilhar produto comercial nao autoriza compartilhar arte.
Preservar as duas artes existentes e as colagens explicitas. Nao apagar arte do
produto ou dos modelos como tentativa de corrigir uma exibicao incorreta.

Observacao separada: os quatro modelos estavam com `status_arte =
REPROVADA_CLIENTE`, inclusive os dois novos. A investigacao de visualizacao nao
atribuiu a origem desse status nem modificou o fluxo de aprovacao.
