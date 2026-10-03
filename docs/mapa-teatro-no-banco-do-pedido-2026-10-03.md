# Mapa de Teatro nos bancos do pedido

Implementação local em `feat/pedido-mapa-teatro-20261003`, baseada no commit publicado `5f84c7686192de011ffee146dd0948f50c9e696a` (v1003). Esta funcionalidade ainda não foi publicada nem instalada nas estações.

## Fluxo na Lista de Arte

Na edição das artes do pedido, **Gerenciamento de Bancos de Dados → Mapa de Teatro** abre um popup com pesquisa pelo nome e seleção dos mapas cadastrados. A aplicação lê a configuração salva do mapa e apresenta os setores, seus conjuntos e suas quantidades.

O operador associa **cada setor com lugares ativos a um modelo já existente e salvo no pedido**. Um modelo não pode ser escolhido para dois setores. Setores vazios não são importados. Modelos aprovados não podem receber a associação. A quantidade comercial do modelo precisa corresponder ao total de lugares do setor; corrigir diferenças no pedido/ERP antes da associação.

**Carregar mapa** cria um banco por setor e vincula esse banco ao modelo escolhido. O vínculo anterior em “Vem de:” é substituído; o banco anterior permanece disponível. Arte, verso, numeração escolhida, formato, BLOCO comercial e quantidades do ERP não são alterados. Uma seleção anterior de linhas do modelo é limpa por salvamento confirmado, para usar todo o setor.

## Dados persistidos: tabelas existentes

| Informação | Tabela e campo |
|---|---|
| Mapa original, nome e desenho dos setores | `public.producao_mapas_teatro.id`, `name`, `config.setores[]` |
| Banco de cada setor, pertencente ao pedido | `public.pedidos_bancos.id`, `id_int`, `nome` |
| Colunas e lugares do setor | `public.pedidos_bancos.csv_headers`, `csv_data` |
| Identificação determinística da importação | `public.pedidos_bancos.csv_filename` |
| Associação modelo → banco de setor | `public.pedidos_modelos_banco.modelo_id`, `banco_id` |

Nenhuma coluna ou tabela nova é necessária. Não escrever campos comerciais propostos `mapa_teatro_id`/`mapa_teatro_setor_id` em `pedidos_modelos`: esses campos não foram criados por esta entrega. A identificação efetiva usa o vínculo do banco e os IDs nas suas linhas.

Cada linha de `csv_data` contém `Mapa`, `Mapa_ID`, `Revisao_Mapa`, `Setor`, `Setor_ID`, `Conjunto`, `Fila`, `Numero`, `Lugar`, `Bloco`, `Tipo`, `Posicao_X`, `Posicao_Y`, `Origem` e `__id`.

- `Mapa_ID` e `Setor_ID` são IDs persistidos, não nomes. Renomear um setor não identifica outro setor.
- `Revisao_Mapa` usa SHA-256 da serialização canônica de `{id,name,config}`, a mesma convenção da revisão dos PDFs. O banco representa um snapshot da revisão importada: editar o mapa posteriormente exige uma nova importação explícita.
- `Conjunto` guarda o título configurado no setor, como Fila, Mesa, Camarote ou Sala. `Fila` é a identificação do conjunto (A, B, 1, 2 etc.); o nome histórico da coluna é mantido para os elementos de teatro existentes.
- `Bloco` tem o mesmo identificador de `Fila`. As linhas de cada conjunto permanecem contíguas e os lugares seguem a posição geográfica salva, sem inventar ou preencher lugares apagados.
- `Numero` traz o identificador do lugar e seu sufixo configurado (por exemplo `1 Cad`); `Lugar` conserva o identificador sem sufixo.
- `__id` é estável por mapa, setor e posição, evitando redistribuir identidades em uma repetição da importação.

## Numeração e blocos com quantidades diferentes

O modelo utiliza sua numeração existente com elementos `TEATRO_FILA`, `TEATRO_LUGAR` ou `TEATRO_COMBO`. Cada elemento lê `Fila`/`Numero` do banco vinculado ao próprio modelo; o seletor legado que carregava o mapa inteiro deixa de ser exigido para esses modelos.

Para produzir o banco importado, selecionar **Blocado → Montagem estrita**; ao combinar modelos, usar **Folha própria**. Cada conjunto ocupa uma posição da folha e forma um bloco separado, mesmo com quantidades diferentes. Exemplo: Fila A com 3 lugares, B com 4 e C com 2, em duas posições por folha: primeiro conjunto de folhas com 4 folhas (A+B; a última posição de A fica vazia); segundo com 2 folhas (C e uma posição vazia). São 9 lugares impressos uma vez. Uma fila de 60 lugares permanece inteira mesmo se o BLOCO comercial do modelo for 50.

A prévia do pedido, a contagem de folhas, o PDF, o Refazer Folhas e as capas seguem os mesmos conjuntos. As capas identificam o nome do conjunto, sua faixa de lugares e a quantidade real. O BLOCO comercial permanece sujeito à regra existente: modelos com valores diferentes de `bloco` não podem ser combinados. A quantidade física e a fórmula de numeração TICKET permanecem intactas.

## Confirmação e retomada

O mapa é relido antes da importação. Se sua revisão mudou desde a seleção, selecionar novamente; não importar silenciosamente outra versão. A criação do banco e o vínculo do modelo são conferidos por releituras das APIs existentes, com escopo no pedido.

As APIs existentes não oferecem uma transação única para todos os setores. Uma falha pode deixar bancos/setores já gravados. O popup informa o erro e permite repetir: bancos com a mesma revisão, setor e conteúdo são reaproveitados; vínculos já confirmados não são recriados. Não há exclusão automática de bancos antigos ou de importações parciais. Fechar/trocar de pedido impede os passos seguintes; uma requisição já enviada pode terminar e será encontrada na releitura.

## Entrega e validação

O frontend e o motor Python foram alterados em uma cópia isolada; o checkout operacional e os dados reais não foram modificados. Para impressão, o NewProd precisa incluir a capacidade `mapa_teatro_blocos_v1` em `/api/version`. O frontend recusa um motor antigo antes de enviar o trabalho, evitando que ele trate os lugares como blocos de tamanho fixo.

Testes usam mapas, bancos, pedidos e artes sintéticos. Foram exercitados quatro setores/modelos, busca e seleção no navegador, associação repetida indevida, falha parcial e retomada, releitura das gravações, conservação das artes/quantidades, fechamento durante leitura, paridade da montagem JavaScript/Python, PDF de conjuntos desiguais, quatro artes diferentes, fila de 60 lugares, Refazer Folhas e capas. Evidência visual: `tmp_teatro_pedido_evidencia/popup-associacao.png` na cópia de trabalho.

Validação: 30 testes Python focados passaram (14 novos testes do mapa, mais regressões de Refazer, banco obrigatório e capas); 95 regressões do editor de mapas, 54 verificações do banco por modelo, 40 de banco no payload, 7 de preservação do fluxo legado, 7 de prévia por modelo e 127 de seleção de linhas passaram nos harnesses existentes. Passaram também os fluxos simulados de Folha 1, impressão/PDF combinado, seleção assíncrona e o navegador do popup. Sintaxe dos JavaScripts alterados, parsing Python e `git diff --check` conferidos. Nenhuma dependência foi instalada. A suíte usou o ambiente Python já instalado no checkout histórico, com saída temporária dentro da cópia de trabalho.

Limitação da suíte antiga, reproduzida na base: `test_engine_modelos_somados.py` apresenta 16 falhas por fixtures incompatíveis com a validação atual de bancos; `test_banco_do_pedido_na_impressao.py` possui uma falha porque procura a validação somente nos primeiros 1200 caracteres, enquanto na base ela começa 1598 caracteres depois. Esses fluxos fora do escopo não foram modificados para contornar os testes.

Publicação web, build/instalação do NewProd e teste de impressão física permanecem pendentes. Não houve alteração de schema, SQL remoto ou importação de mapas em pedidos reais.
