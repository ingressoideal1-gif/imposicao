# Integração ERP — Mapas de Teatro e PDFs por setor

Contrato de 03/10/2026. Os estados de implantação e a prova de produção são registrados em `docs/mapas-teatro-pdfs-persistentes-2026-10-03.md`; a existência deste contrato não comprova implantação ou exportação de todos os mapas.

## Localizar mapa, setores e quantidades

Tabela existente: **`public.producao_mapas_teatro`**. A prévia de 03/10/2026 confirmou `id` UUID, `name` TEXT, `config` JSONB e `created_at` TIMESTAMPTZ. Não utilizar `total_lugares` ou `lugares_por_setor`: esses campos não existem no ambiente consultado.

| Informação | Campo |
| --- | --- |
| Mapa | `id` |
| Nome do mapa | `name` |
| Setores | `config.setores[]` |
| ID e nome do setor | `config.setores[].id` e `.nome` |
| Nome do conjunto de assentos | `config.setores[].nomeConjunto` — por exemplo `Fila`, `Mesa`, `Camarote` ou `Sala` |
| Assentos e posições | `config.setores[].cadeiras` |

Contar as cadeiras ativas de cada setor, excluindo `tipo = 'Apagado'` e `isErased = true`. O nome serve para exibição; o vínculo é o par **mapa_id + setor_id**. Nunca associar artes pelo nome ou posição do modelo.

`nomeConjunto` é texto livre por setor (até 40 caracteres), salvo dentro do JSONB `config` da tabela existente; não é uma nova coluna ou tabela. O editor permite alterar o título que antes era fixo como “Fila”. Na ausência de um nome, inclusive em mapas antigos, usar **Fila**. O identificador continua em `cadeiras["x,y"].prefixo` e o número/letra do assento em `.num`; mudar o nome do conjunto preserva essas etiquetas e posições.

Exemplo: um setor com `nomeConjunto="Mesa"`, prefixo `1` e assentos `A` a `D` representa **Mesa 1**, com quatro assentos. O PDF usa “ASSENTOS POR MESA” e “Mesa 1: 4”. Outro setor do mesmo mapa pode usar “Camarote”. Esta alteração integra a atualização frontend de 03/10/2026, cujo estado de implantação consta no registro da entrega.

Consulta de leitura:

```sql
SELECT m.id AS mapa_id, m.name AS nome_mapa,
       s.setor->>'id' AS setor_id, s.setor->>'nome' AS nome_setor,
       coalesce(nullif(trim(s.setor->>'nomeConjunto'),''),'Fila') AS nome_conjunto,
       (SELECT count(*) FROM jsonb_each(
          CASE WHEN jsonb_typeof(s.setor->'cadeiras')='object'
          THEN s.setor->'cadeiras' ELSE '{}'::jsonb END
        ) c(posicao,assento)
        WHERE jsonb_typeof(assento)='object'
          AND coalesce(assento->>'tipo','') <> 'Apagado'
          AND coalesce(assento->>'isErased','false') <> 'true') AS quantidade_assentos
FROM public.producao_mapas_teatro m
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(m.config->'setores')='array'
  THEN m.config->'setores' ELSE '[]'::jsonb END
) WITH ORDINALITY s(setor,ordem) ON true
ORDER BY m.name,m.id,s.ordem;
```

## Onde ficam os PDFs

Tabela da nova integração: **`public.producao_mapas_teatro_pdf_exportacoes`**. Um registro representa o conjunto completo de PDFs de uma revisão. Não são gravados links temporários no cadastro geográfico.

Formato solicitado: **exatamente uma página por setor**, com todos os lugares ativos nas posições gravadas no mapa. Não há páginas adicionais de detalhe ou resumo. O PDF completo apenas reúne as mesmas pranchas: quatro setores resultam em quatro páginas, além dos quatro PDFs individuais de uma página. O desenho e a numeração são ajustados para caber em uma única prancha A3; em mapas densos, o tamanho visual dos rótulos diminui. Cadeiras apagadas e espaços vazios continuam sendo respeitados.

| Campo | Conteúdo |
| --- | --- |
| `mapa_id` | UUID do mapa |
| `revisao_exportacao` | SHA-256 da versão dos dados usada no desenho |
| `gerador_versao` | `a3-v1-20261003` nesta entrega |
| `nome_mapa` | Nome na revisão exportada |
| `snapshot` | Cópia de `{id,name,config}` usada |
| `arquivos` | JSONB com mapa completo e um arquivo por setor |
| `criado_em`, `criado_por` | Data de conclusão e autor |

Cada item de `arquivos` contém `tipo`, `setor_id`, `nome_setor`, `quantidade_assentos`, `storage_path`, `sha256_arquivo`, `tamanho_bytes` e `paginas`. O arquivo do mapa completo tem `tipo='mapa'` e `setor_id=null`; os demais têm `tipo='setor'` e o ID real do setor. A API acrescenta `pdf_recurso` ao resultado; esse endereço é calculado e não precisa ser gravado no banco.

O nome do conjunto usado no PDF fica no setor correspondente em `snapshot.config.setores[].nomeConjunto`, com o mesmo fallback **Fila**. Para informações do cadastro atual, ler `producao_mapas_teatro.config`; para reproduzir uma exportação anterior, ler seu `snapshot`. `nomeConjunto` não é um campo adicional no manifesto `arquivos[]`. Alterar esse nome gera uma nova revisão dos dados e novos PDFs; os arquivos históricos conservam o texto da revisão exportada.

O bucket **`mapas-teatro-pdfs` é privado**. O ERP usa sua sessão Supabase com permissão de leitura do mapa. Não enviar a chave de serviço para o navegador, nem usar a chave anônima como autorização. A configuração privada evita leitura pública direta, conforme a [documentação do Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Consultar pela API

Base da nova Edge Function:

```text
https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/mapas-teatro-pdfs
```

Todas as chamadas exigem `Authorization: Bearer <access_token da sessão do ERP>`. O token deve ser enviado pelo cliente HTTP, nunca incorporado à URL. A autorização de leitura acompanha as políticas existentes do mapa. Esta entrega não cadastra contas do parceiro nem altera as políticas do cadastro original.

| Operação | Método e caminho |
| --- | --- |
| Consultar PDFs da revisão atual | `GET /mapas/{mapa_id}/exportacao` |
| Consultar revisão específica | `GET /mapas/{mapa_id}/exportacao?revisao={hash}&gerador=a3-v1-20261003` |
| Baixar PDF completo | `GET /mapas/{mapa_id}/arquivo?revisao={hash}&gerador=a3-v1-20261003` |
| Baixar PDF do setor | Mesmo caminho, acrescentando `&setor={setor_id}` |

Codificar IDs e parâmetros para URL. O ERP pode usar diretamente `pdf_recurso` retornado pelo endpoint de consulta, mantendo a autenticação no cabeçalho. Esse endereço identifica uma revisão e não expira por um token embutido. A sessão do usuário precisa continuar válida; mapas sem permissão não são expostos.

A consulta retorna `estado='pendente'` quando aquela revisão ainda não tiver exportação completa. Quando pronta, retorna `estado='pronto'`, `mapa_id`, `nome_mapa`, `revisao_exportacao`, `gerador_versao` e `arquivos[]`, com nomes, quantidades e recursos dos PDFs. Se uma revisão antiga for solicitada explicitamente, `revisao_atual=false` informa que o mapa foi alterado depois. Não tratar uma exportação antiga como se fosse a configuração atual.

O download devolve os bytes `application/pdf` daquela revisão, após conferir seu hash. Um setor de outro mapa ou um arquivo inexistente retorna 404; falta de autorização retorna 401/403. PDFs ainda não publicados não devem ser anunciados ao cliente do ERP como disponíveis.

## Modelos e artes de um pedido

O fluxo preparado para **Lista de Arte → Gerenciamento de Bancos de Dados → Mapa de Teatro** associa cada setor a um modelo existente do pedido, usando as tabelas de bancos já disponíveis. A implementação desse fluxo está local e ainda depende de publicação web e atualização do NewProd; a entrega publicada dos PDFs permanece independente.

O vínculo efetivo fica em **`public.pedidos_modelos_banco`**: `modelo_id` identifica o modelo existente e `banco_id` aponta para **`public.pedidos_bancos.id`**. O banco pertence ao pedido (`id_int`), traz o nome do mapa/setor (`nome`) e guarda em `csv_data` uma linha por lugar. Cada linha identifica `Mapa_ID`, `Mapa`, `Setor_ID`, `Setor`, `Revisao_Mapa`, `Conjunto`, `Fila`, `Numero` e `Bloco`. `Bloco` identifica o conjunto; a quantidade é o número de suas linhas, inclusive quando dois conjuntos têm quantidades diferentes.

Os campos comerciais anteriormente propostos em `pedidos_modelos` (`mapa_teatro_id`, `mapa_teatro_setor_id` etc.) **não foram criados**. Não depender deles para localizar a associação desta implementação. Contrato detalhado e estado da entrega: [Mapa de Teatro nos bancos do pedido](mapa-teatro-no-banco-do-pedido-2026-10-03.md).

Para quatro setores com quatro artes, cada modelo deverá apontar para o mesmo mapa e seu próprio setor. A quantidade deve corresponder às cadeiras daquele setor. O ERP não deve copiar o total do mapa para todos os modelos.

Consulta de leitura para identificar modelo, mapa, setor e quantidade de cada conjunto depois da importação (substituir `12345` pelo número do pedido):

```sql
select b.id_int as pedido, v.modelo_id, b.id as banco_id,
       lugar->>'Mapa_ID' as mapa_id, lugar->>'Mapa' as nome_mapa,
       lugar->>'Revisao_Mapa' as revisao_mapa,
       lugar->>'Setor_ID' as setor_id, lugar->>'Setor' as nome_setor,
       lugar->>'Conjunto' as nome_conjunto, lugar->>'Bloco' as identificador_bloco,
       count(*) as quantidade_lugares
from public.pedidos_modelos_banco v
join public.pedidos_bancos b on b.id = v.banco_id
cross join lateral jsonb_array_elements(b.csv_data) as lugar
where b.id_int = 12345 and lugar->>'Origem' = 'Mapa de Teatro'
group by b.id_int, v.modelo_id, b.id,
         lugar->>'Mapa_ID', lugar->>'Mapa', lugar->>'Revisao_Mapa',
         lugar->>'Setor_ID', lugar->>'Setor', lugar->>'Conjunto', lugar->>'Bloco';
```

O total de um setor é a soma dos seus conjuntos. Usar a autorização de leitura já existente; esta funcionalidade não modifica as permissões de acesso do ERP. Alterações posteriores no desenho não atualizam automaticamente bancos de pedidos: identificar a revisão importada e fazer nova associação quando necessário.

## Convenção da revisão

`revisao_exportacao`: SHA-256 dos bytes UTF-8 da serialização JSON JavaScript de `{id,name,config}`, ordenando recursivamente as chaves dos objetos e mantendo a ordem dos arrays. Nomes fazem parte da revisão; renomear gera uma revisão nova. A versão do gerador participa da chave de unicidade do registro.

O campo de revisão comercial proposto anteriormente para modelos mencionava somente `config`. Os dois algoritmos não são automaticamente equivalentes. Para localizar PDFs, usar `revisao_exportacao` devolvida pela nova API. Não produzir esse hash com `jsonb::text` sem compatibilização e testes de conformidade.

## Operação na aplicação

Após salvar o mapa e confirmar sua persistência, a aplicação gera e tenta armazenar os PDFs. Se o envio falhar, o mapa permanece salvo e o download local continua disponível. A lista **Mapas de Teatro → PDFs** consulta o estado atual; **Salvar PDFs para o ERP** permite enviar mapas existentes ou repetir um envio pendente sem gravar novamente o mapa.

A publicação exige papel `admin` ou `atendimento`, usando a validação existente do Ideal Control. O manifesto só é registrado após todos os uploads serem confirmados; repetições não duplicam uma exportação já pronta. Revisões anteriores não são sobrescritas. Excluir um mapa com exportações é bloqueado pela referência, preservando os documentos históricos.
