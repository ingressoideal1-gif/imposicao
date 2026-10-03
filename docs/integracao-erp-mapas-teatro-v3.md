# Integração ERP — Mapas de Teatro, setores, modelos e numeração

**Versão 3 — 03/10/2026. Substitui integralmente a versão 2 de `integracao-erp-mapas-teatro.md`.**

Este documento descreve o fluxo entregue no frontend **v1004** e no **NewProd 1.2.347**. A proposta anterior de quatro campos novos em `pedidos_modelos` foi substituída pelo uso dos bancos por modelo já existentes. Não aplicar uma migração com base na versão 2 para implementar este fluxo.

## 1. Quantidade, início e lugares são informações diferentes

Para a importação completa de um setor, com um ingresso por lugar, vale:

```text
pedidos_modelos.quantidade = quantidade de lugares ativos do setor
                          = quantidade de linhas do banco desse setor
```

O ERP calcula e grava a quantidade comercial correta no modelo existente. A aplicação Ideal confere essa quantidade antes de associar o setor e antes da produção; uma divergência bloqueia a associação/geração. A importação não corrige nem substitui silenciosamente a quantidade comercial.

**Não inicializar a quantidade do modelo em 1 como regra do teatro.** Quantidade 1 só é correta quando o setor possui exatamente um lugar ativo. Se o prompt do parceiro usa “iniciada em 1” para a quantidade, substituir essa instrução pela igualdade acima. Se a expressão se refere ao início de uma numeração sequencial, ela não define a quantidade e não substitui as etiquetas dos lugares do mapa.

Os identificadores de conjunto e de lugar vêm do cadastro, podendo ser números ou letras. Por exemplo, Fila A com lugares 1, 3 e 4 contém três lugares; a importação conserva 1, 3 e 4, sem criar o lugar 2. Uma Mesa 1 pode ter lugares A, B, C e D. Não gerar uma sequência genérica de 1 até o total para substituir esses dados.

Cada fila/conjunto constitui um bloco com sua quantidade exata. Se um setor tem A com 3 lugares, B com 4 e C com 2, o modelo desse setor tem quantidade 9 e três blocos de 3, 4 e 2. O campo comercial `bloco` do modelo não é recalculado pela importação.

## 2. Localizar o mapa, setores e lugares

Tabela existente: **`public.producao_mapas_teatro`**.

| Informação | Localização |
|---|---|
| ID e nome do mapa | `id`, `name` |
| Desenho e configuração | `config` (JSONB) |
| Setores do mapa | `config.setores[]` |
| ID e nome do setor | `config.setores[].id`, `.nome` |
| Nome do conjunto | `config.setores[].nomeConjunto`; usar `Fila` quando ausente |
| Lugares e suas posições | `config.setores[].cadeiras` |
| Identificador do conjunto | `cadeiras["x,y"].prefixo` |
| Identificador do lugar | `cadeiras["x,y"].num` |
| Tipos personalizados | `config.tiposAssento` |

Contar os lugares ativos, excluindo cadeiras com `tipo = 'Apagado'` ou `isErased = true`. Não depender de colunas `total_lugares` ou `lugares_por_setor`, ausentes na consulta do cadastro que fundamentou esta entrega. IDs são usados para identificar; nomes servem para apresentação. Não associar uma arte pelo nome ou pela ordem do setor.

Consulta de leitura preparada para o ERP, sem execução remota nesta revisão documental:

```sql
SELECT m.id AS mapa_id, m.name AS nome_mapa,
       s.setor->>'id' AS setor_id, s.setor->>'nome' AS nome_setor,
       COALESCE(NULLIF(TRIM(s.setor->>'nomeConjunto'), ''), 'Fila') AS nome_conjunto,
       (SELECT COUNT(*)
        FROM jsonb_each(
          CASE WHEN jsonb_typeof(s.setor->'cadeiras') = 'object'
               THEN s.setor->'cadeiras' ELSE '{}'::jsonb END
        ) AS c(posicao, assento)
        WHERE jsonb_typeof(c.assento) = 'object'
          AND COALESCE(c.assento->>'tipo', '') <> 'Apagado'
          AND COALESCE(c.assento->>'isErased', 'false') <> 'true'
       ) AS quantidade_assentos
FROM public.producao_mapas_teatro AS m
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(m.config->'setores') = 'array'
       THEN m.config->'setores' ELSE '[]'::jsonb END
) WITH ORDINALITY AS s(setor, ordem) ON true
ORDER BY m.name, m.id, s.ordem;
```

Para um mapa específico, acrescentar `WHERE m.id = :mapa_id` antes de `ORDER BY`, com parâmetro no cliente do ERP. Mapas/setores sem IDs salvos, lugares sem identificação ou posições inválidas precisam ser revisados antes da importação.

## 3. Onde o vínculo é salvo — sem novos campos em pedidos_modelos

O botão publicado usa as tabelas existentes:

| Informação | Tabela e campo |
|---|---|
| Modelo comercial, arte e quantidade | `public.pedidos_modelos.id`, `id_int`, `quantidade` e campos de arte existentes |
| Banco de lugares de um setor, pertencente ao pedido | `public.pedidos_bancos.id`, `id_int`, `nome` |
| Colunas, lugares e identificação da importação | `public.pedidos_bancos.csv_headers`, `csv_data`, `csv_filename` |
| Modelo associado ao banco do setor | `public.pedidos_modelos_banco.modelo_id`, `banco_id`, `csv_mapa` |

```text
pedidos_modelos.id
  → pedidos_modelos_banco.modelo_id
    → pedidos_modelos_banco.banco_id
      → pedidos_bancos.id
        → csv_data[].Mapa_ID + csv_data[].Setor_ID + csv_data[].Revisao_Mapa
```

Uma linha de `csv_data` representa um lugar e guarda `Mapa`, `Mapa_ID`, `Setor`, `Setor_ID`, `Revisao_Mapa`, `Conjunto`, `Fila`, `Numero`, `Lugar`, `Bloco`, `Tipo`, `Posicao_X`, `Posicao_Y`, `Origem` e `__id`. `Origem` vale `Mapa de Teatro`; `Bloco` é o identificador do conjunto, igual a `Fila`. `Numero` inclui o sufixo configurado do tipo de assento, quando houver; `Lugar` conserva a etiqueta sem sufixo. `__id` identifica mapa, setor e posição.

**Não escrever** `mapa_teatro_id`, `mapa_teatro_setor_id`, `mapa_teatro_revisao` ou `mapa_teatro_snapshot` em `pedidos_modelos` para este fluxo: esses quatro campos foram apenas uma proposta anterior, não foram criados por esta entrega e não são lidos pelo botão publicado. O banco do setor conserva as linhas da revisão importada; ele não é um novo campo de snapshot do desenho completo no modelo.

O fluxo publicado não exige migração em `pedidos_modelos`. Também não altera políticas, permissões ou o esquema das tabelas de bancos. Uma futura decisão de adotar os quatro campos seria outra implementação, exigindo revisão dos consumidores, inclusive o Duplicar, migração, recuperação e validação em ambiente compartilhado.

## 4. Responsabilidades do ERP e da aplicação Ideal

1. O ERP consulta os mapas e setores, calcula a quantidade de lugares ativos e cria/sincroniza os modelos comerciais, preservando seus IDs. Para quatro setores a importar, disponibilizar quatro modelos existentes, com suas próprias artes/configurações e quantidades correspondentes.
2. Na aplicação Ideal, o operador abre **Lista de Arte → edição do pedido → Gerenciamento de Bancos de Dados → Mapa de Teatro**, pesquisa/seleciona o mapa e associa cada setor com lugares ativos a um modelo salvo do mesmo pedido. Cada setor usa um modelo distinto; modelos aprovados não recebem essa associação.
3. Ao concluir, a aplicação Ideal relê o mapa, verifica sua revisão e as quantidades, cria/reaproveita um banco por setor e grava a associação em `pedidos_modelos_banco`. Confere a criação e os vínculos por releituras das APIs existentes. Arte, formato, numeração escolhida e quantidade comercial não são substituídos.
4. A numeração do modelo usa seus elementos de teatro `TEATRO_FILA`, `TEATRO_LUGAR` ou `TEATRO_COMBO`, lendo `Fila`/`Numero` do banco associado. Para produção, usar **Blocado → Montagem estrita** e, ao combinar modelos, **Folha própria**. Atualizar as estações para NewProd 1.2.347. A regra que proíbe combinar modelos com BLOCO comercial diferente permanece.

Não é preciso o ERP gravar um novo campo de mapa no modelo para o operador usar esse botão. A associação automática diretamente pelo ERP, sem passar pelo popup, **não foi implementada nesta entrega**: se for desejada, alinhar separadamente o transporte e as validações, usando o vínculo real acima. Não tratar a consulta de mapas ou a proposta antiga como uma API nova de gravação já disponível.

Uma falha parcial pode deixar bancos/setores gravados. Repetir a importação da mesma revisão permite reaproveitar conteúdo e vínculos já confirmados, sem excluir bancos antigos automaticamente. Alterar o desenho não atualiza os bancos dos pedidos: fazer uma nova importação explícita da revisão desejada.

### Duplicar pedido/modelo

Não foi alterado nem validado nesta entrega o fluxo Duplicar do ERP parceiro. Duplicar a linha comercial não comprova que o vínculo do banco também foi copiado. Ao duplicar, conferir os novos IDs, o pedido de destino, a quantidade e a associação persistida; quando necessário, refazer a associação pelo popup no pedido de destino. Não reutilizar um `modelo_id` antigo nem apontar silenciosamente o novo pedido para o banco de outro pedido. Não presumir que duplicar o modelo adota a revisão atual do mapa.

## 5. Revisão — a aplicação Ideal calcula; o ERP recebe

**Autoridade da revisão: aplicação/serviço Ideal. O ERP não precisa implementar um segundo algoritmo de hash para usar este contrato.**

- Antes da importação, o frontend Ideal calcula a revisão a partir do mapa salvo e a grava em `pedidos_bancos.csv_data[].Revisao_Mapa`. Depois da associação, o ERP lê esse valor para identificar a revisão usada pelo modelo.
- Para consultar a revisão atual e os PDFs, o serviço Ideal calcula a revisão e a devolve como `revisao_exportacao`, inclusive quando `estado = 'pendente'`. O ERP consulta o endpoint sem enviar um hash calculado por ele.
- Para acessar uma revisão histórica, o ERP transmite exatamente o valor anteriormente recebido/armazenado. Não recalcular a revisão de um pedido antigo usando o mapa atual.

API autenticada existente:

```text
GET https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/mapas-teatro-pdfs/mapas/{mapa_id}/exportacao
Authorization: Bearer <access_token autorizado do ERP>
```

Codificar o ID para URL. Para uma revisão específica, acrescentar `?revisao={hash_recebido}&gerador=a3-v1-20261003`. O ERP usa o valor devolvido pelo serviço, sem enviar credenciais na URL e sem usar chave privilegiada no navegador. Esta revisão documental não cria a conta nem concede permissões ao parceiro.

O cálculo implementado no Ideal é SHA-256 dos bytes UTF-8 de `JSON.stringify` aplicado a `{id,name,config}`, após ordenar recursivamente as chaves dos objetos e preservar a ordem dos arrays. O resultado usa 64 caracteres hexadecimais minúsculos. Nomes fazem parte da revisão; alterações em qualquer setor do mapa também podem mudar a revisão. `Revisao_Mapa` e `revisao_exportacao` coincidem **quando representam o mesmo mapa e a mesma configuração**, não necessariamente quando o pedido usa um banco antigo.

Essa descrição documenta o cálculo interno; não exige que o ERP o reproduza. Não substituir por SHA-256 somente de `config`, somente do setor, de `jsonb::text` ou de uma serialização própria. Se futuramente for indispensável calcular fora do Ideal, aprovar vetores de conformidade antes: ordem das chaves, chaves numéricas, números, Unicode, escapes e arrays podem mudar os bytes. Não presumir que qualquer biblioteca chamada “JSON canônico” reproduz `JSON.stringify`.

`sha256_arquivo` é outro hash: identifica os bytes do PDF e não a configuração do mapa. A versão do gerador identifica a exportação, não muda a fórmula da revisão do mapa.

## 6. Consulta do vínculo efetivo após a associação

Consulta somente de leitura. Substituir `12345` pelo pedido autorizado, parametrizando no cliente do ERP:

```sql
SELECT b.id_int AS pedido, v.modelo_id, b.id AS banco_id,
       lugar->>'Mapa_ID' AS mapa_id, lugar->>'Mapa' AS nome_mapa,
       lugar->>'Setor_ID' AS setor_id, lugar->>'Setor' AS nome_setor,
       lugar->>'Revisao_Mapa' AS revisao_importada,
       lugar->>'Conjunto' AS nome_conjunto,
       lugar->>'Bloco' AS identificador_bloco,
       COUNT(*) AS quantidade_lugares
FROM public.pedidos_modelos_banco AS v
JOIN public.pedidos_bancos AS b ON b.id = v.banco_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(b.csv_data) = 'array'
       THEN b.csv_data ELSE '[]'::jsonb END
) AS lugar
WHERE b.id_int = 12345 AND lugar->>'Origem' = 'Mapa de Teatro'
GROUP BY b.id_int, v.modelo_id, b.id,
         lugar->>'Mapa_ID', lugar->>'Mapa',
         lugar->>'Setor_ID', lugar->>'Setor', lugar->>'Revisao_Mapa',
         lugar->>'Conjunto', lugar->>'Bloco';
```

O resultado tem uma linha por conjunto/bloco. Somar os conjuntos para obter o total do banco/setor e compará-lo à quantidade do modelo associado. A ausência de vínculo não autoriza inferir um setor pelo nome do modelo. Ambas as consultas deste documento exigem a autorização de leitura existente; não foram executadas em produção nesta revisão.

## 7. PDFs

Cada setor possui exatamente uma página com os lugares ativos nas posições gravadas. O PDF completo reúne essas páginas: quatro setores correspondem a quatro páginas. O logotipo Ingresso Ideal integra os PDFs. O banco de um pedido e o PDF atual do mapa podem representar revisões diferentes; comparar os identificadores antes de apresentá-los como correspondentes.

Quando a exportação estiver pronta, a consulta retorna `estado = 'pronto'`, `mapa_id`, `nome_mapa`, `revisao_exportacao`, `gerador_versao` e `arquivos[]`. Cada arquivo identifica tipo, setor, quantidade, tamanho, `sha256_arquivo` e `pdf_recurso`. O ERP pode usar `pdf_recurso`, mantendo a autorização no cabeçalho. `estado = 'pendente'` identifica a revisão atual, mas não comprova que existe PDF para baixar. Uma consulta histórica pode devolver `revisao_atual = false`.

## 8. Texto para substituir o prompt do parceiro

> Criar/sincronizar um modelo comercial por setor, com quantidade igual aos lugares ativos daquele setor, excluindo cadeiras apagadas. Não inicializar a quantidade em 1 como regra. Preservar as etiquetas de conjuntos e lugares gravadas no mapa, inclusive letras, lacunas e quantidades diferentes por conjunto. O vínculo publicado usa `pedidos_modelos_banco.modelo_id → banco_id` e o banco em `pedidos_bancos`, cujas linhas identificam mapa, setor e revisão. Não criar nem gravar os quatro campos propostos anteriormente em `pedidos_modelos`. No fluxo entregue, o operador associa os setores aos modelos existentes pelo popup Mapa de Teatro. A revisão é calculada pelo Ideal e recebida pelo ERP via consulta autenticada ou pelas linhas do banco importado; o ERP não calcula um hash próprio. Conferir separadamente o vínculo ao duplicar pedido/modelo. Automatizar a associação pelo ERP exige alinhamento específico, pois essa automação não faz parte do popup entregue.

Esta revisão corrige documentação. Não modifica código, tabelas, dados reais, permissões ou a implementação do ERP parceiro.
