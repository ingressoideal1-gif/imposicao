# Mapas de Teatro — referência para integração do ERP

Os Mapas de Teatro são cadastrados no Supabase/PostgreSQL, na tabela `public.producao_mapas_teatro`. Cada registro representa um mapa. Os setores e seus assentos estão no JSON `config` do mesmo registro; não há tabela separada de setores neste cadastro.

| Informação | Campo no banco |
| --- | --- |
| Identificador do mapa | `id` (texto, chave primária) |
| Nome do mapa | `name` |
| Total de assentos do mapa | `total_lugares` |
| Resumo dos setores e quantidades | `lugares_por_setor` (JSONB) |
| Configuração completa | `config` (JSONB) |
| Nome de cada setor | `config.setores[].nome` |
| Identificador de cada setor, quando presente | `config.setores[].id` |
| Assentos de cada setor | `config.setores[].cadeiras` (objeto com chave de posição) |

Use `id` para vincular o mapa ao ERP. O nome serve para exibição e pode ser alterado. Para vincular setores, use o par `id` do mapa + `config.setores[].id`; confira registros antigos sem ID de setor antes de cadastrar o vínculo. O resumo `lugares_por_setor` contém nomes e quantidades, sem IDs de setor.

Exemplo ilustrativo de `lugares_por_setor`:

```json
[
  { "setor": "Plateia", "quantidade": 120 },
  { "setor": "Balcão", "quantidade": 80 }
]
```

## Localizar todos os mapas

Consulta somente de leitura:

```sql
SELECT id AS mapa_id,
       name AS nome_mapa,
       total_lugares,
       lugares_por_setor
FROM public.producao_mapas_teatro
ORDER BY name, id;
```

## Listar setores e contar os assentos cadastrados

A consulta abaixo retorna uma linha por setor, mantendo também mapas sem setores. Conta os objetos de assento existentes, excluindo `tipo = 'Apagado'` e `isErased = true`. Não calcula a quantidade pelos intervalos de numeração das fileiras.

```sql
SELECT m.id AS mapa_id,
       m.name AS nome_mapa,
       s.setor->>'id' AS setor_id,
       s.setor->>'nome' AS nome_setor,
       (
         SELECT COUNT(*)
         FROM jsonb_each(
           CASE WHEN jsonb_typeof(s.setor->'cadeiras') = 'object'
                THEN s.setor->'cadeiras'
                ELSE '{}'::jsonb END
         ) AS c(posicao, assento)
         WHERE jsonb_typeof(c.assento) = 'object'
           AND COALESCE(c.assento->>'tipo', '') <> 'Apagado'
           AND COALESCE(c.assento->>'isErased', 'false') <> 'true'
       ) AS quantidade_assentos
FROM public.producao_mapas_teatro AS m
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(m.config->'setores') = 'array'
       THEN m.config->'setores'
       ELSE '[]'::jsonb END
) WITH ORDINALITY AS s(setor, ordem) ON true
ORDER BY m.name, m.id, s.ordem;
```

Para consultar um mapa específico, acrescente `WHERE m.id = :mapa_id` antes do `ORDER BY`, passando o ID como parâmetro pelo cliente do ERP.

## Compatibilidade e acesso

A correção do frontend passa a gravar `total_lugares` e `lugares_por_setor` ao salvar o mapa, calculados pelas cadeiras existentes. Registros anteriores podem conter `0` e `[]` nesses campos mesmo tendo assentos. Não houve atualização em lote dos dados históricos nem consulta ao banco de produção nesta revisão.

A consulta detalhada atende ao formato `config.setores[].cadeiras`. Se um registro antigo ainda guardar cadeiras em `config.cadeiras`, abra e revise o mapa no editor e salve para normalizar a estrutura antes de integrá-lo. Cadeiras antigas com setor ausente ou posição conflitante exigem revisão; a correção preserva essas cadeiras e bloqueia um salvamento que as perderia.

O acesso deve ser configurado pelo responsável pelo Supabase, com permissão de leitura adequada ao ERP e ao isolamento por empresa. As permissões aplicadas em produção não foram verificadas. Credenciais privilegiadas devem permanecer no backend do ERP.

Referência técnica: `sql/schema_mapas_teatro.sql` e `frontend/mapas.js`. Consultas preparadas para revisão; não executadas no banco compartilhado.
