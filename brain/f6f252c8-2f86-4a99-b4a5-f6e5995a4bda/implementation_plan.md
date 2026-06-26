# Resolvendo o Erro da Arte por Modelo e Atualização do Gabarito

O usuário apontou que as configurações (arte, numeração, etc) não estavam sendo salvas *por modelo*, mas sim sobrescrevendo o *produto pai*, o que é um erro de principiante. Além disso, a coluna `gabarito_operacional` não estava sendo atualizada ao mudar a numeração.

## Modificações Necessárias

### 1. Atualizar Tabela `pedidos_modelos` no Supabase
A tabela `pedidos_modelos` precisa ser capaz de armazenar as configurações visuais individuais de cada modelo.
Precisamos adicionar as seguintes colunas (o usuário deverá rodar o SQL):
- `arte_url` (text)
- `amostra_arte_base64` (text)
- `amostra_cor_id` (int8)
- `amostra_num_id` (int8)
- A coluna `gabarito_operacional` provavelmente já existe, mas o SQL terá a cláusula `ADD COLUMN IF NOT EXISTS`.

### 2. Alterar `saveAmostraToDB` no `script.js`
Atualmente, a função sempre atualiza `produtos_proposta`.
Devemos:
- Identificar se o `itemId` pertence a um modelo (não começa com `vibe_item_`).
- Se for modelo, fazer o `.update()` na tabela `pedidos_modelos` usando o ID do modelo.
- Se não for, fazer o `.update()` na tabela `produtos_proposta`.

### 3. Alterar `loadOSItens` no `script.js`
Quando carregar os itens de `pedidos_modelos`, priorizar os campos do próprio item (modelo). Caso estejam nulos (ex: modelo recém criado), fazer o *fallback* para herdar os dados do produto pai (`prop`).

### 4. Alterar `onItemNumSelect` no `script.js`
Buscar o nome (name) da numeração selecionada.
No payload enviado para `saveAmostraToDB`, incluir `gabarito_operacional: nome_da_numeracao`, para que o texto da numeração seja devidamente gravado no banco de dados, atendendo a reclamação.

## Aprovação e Execução
Como precisamos adicionar colunas no banco de dados do usuário e reestruturar o fluxo de salvamento, aguardaremos a aprovação do usuário e solicitaremos que ele execute o SQL fornecido.
