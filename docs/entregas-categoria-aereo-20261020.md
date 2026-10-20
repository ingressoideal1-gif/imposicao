# Entregas aéreas por categoria do ERP — 20/10/2026

## Diagnóstico

Consulta de produção somente leitura confirmou que os pedidos 23857 e 23908
possuem categoria de frete AEREO, mas transportadoras SVT TRANSPORTES e MELHOR
ENVIO. A classificação anterior considerava somente o nome da transportadora.
O 23857 está pronto para expedir; o 23908 está em produção com previsão para hoje.
Ambos atendem à regra da fila.

## Correção local

`sql/vibe_entregas_categoria_aereo.sql` prioriza a categoria AEREO ao classificar
o frete e resolver o destino fixo (CEP 92020-400, número 45). Preserva a regra
anterior para outras categorias, as rotas mistas, as entregas avulsas e as
permissões existentes. A coluna de categoria é acrescentada ao final da view
privada `ve_itens_entrega`; as tabelas comerciais e seus dados não são alterados.

As 15 funções substituídas foram derivadas da implementação atual de
`vibe_entregas_avulsas_rotas.sql`. Seus corpos de origem foram comparados com
produção, com igualdade após normalização das quebras de linha.

## Validação

A suíte PGlite de modalidades passou com os casos adicionais de categoria aérea
e os casos de entregas avulsas habilitados. Dados sintéticos reproduzem os dois
cenários relatados. Cobertura: lista, mapa, PWA, atribuição, endereço fixo,
início de rota, repasse e exclusão de pedidos entregues, futuros e rodoviários.
O repasse mantém o pedido do ERP em trânsito. `git diff --check` passou.

## Publicação em produção

Migração aplicada no Supabase e-deal em 20/10/2026, em transação, depois de
comparar as 15 funções anteriores com a base testada e salvar suas definições
e a view para recuperação. As migrações de avulsas e rotas mistas não foram
reaplicadas. As 17 definições resultantes conferem com a fonte local.

Consultas com contexto autenticado de gestor retornaram 23857 e 23908 nas RPCs
de lista e mapa, com modalidade aérea e destino fixo CEP 92020-400, número 45.
O fingerprint dos registros completos dos dois pedidos permaneceu idêntico.
Evidências e script de recuperação estão em `dist/entrega/aereo-*`, ignorados
pelo Git. Não foi realizada confirmação de entrega nem interação com a sessão
real do usuário. O frontend e o instalador não foram alterados.

Para recuperação, restaurar os corpos anteriores das funções. A coluna adicional
da view pode permanecer sem uso; não remover a view nem suas dependências para
retirá-la. A correção não requer novo instalador NewProd.
