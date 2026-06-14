DOCUMENTO — ORGANIZAÇÃO DAS TABELAS DE PRODUÇÃO / ARTES
ERP Ideal — Fase 1

1. Objetivo

Foi criada a primeira base real para controlar artes produzidas por designers/artistas dentro do módulo de Pedidos / Produção.

A estrutura foi organizada para permitir:
- divisão do pedido em modelos/lotes;
- upload de artes por modelo;
- controle de versões das artes;
- aprovação/reprovação interna;
- rastreabilidade por proposta/pedido;
- histórico operacional no chat já existente;
- armazenamento dos arquivos no Supabase Storage.

2. Princípio central

Todo o módulo de Produção deve ser rastreável por `id_int`.

O `id_int` é a chave operacional da proposta e conecta:
- propostas;
- produtos_proposta;
- pedidos;
- pedidos_modelos;
- pedidos_artes;
- propostas_chat;
- propostas_pendencias.

Não deve ser criado um identificador paralelo para timeline ou comunicação.

3. Tabelas criadas

Foram criadas duas tabelas principais nesta fase:

A) public.pedidos_modelos

Representa cada modelo/lote de um pedido.

Exemplo:
Um item comercial de 3.000 pulseiras pode virar:

- Modelo Azul: 750 unidades
- Modelo Vermelho: 750 unidades
- Modelo Verde: 1.000 unidades
- Modelo Amarelo: 500 unidades

Cada um desses modelos é uma linha em `pedidos_modelos`.

Campos principais:
- id
- id_int
- id_pedido
- id_item
- id_produto_proposta_origem
- nome_modelo
- descricao
- quantidade
- tipo_numeracao
- numeracao_inicio
- numeracao_fim
- obs_impressao
- status_arte
- status_producao
- ordem
- created_at
- updated_at

Função da tabela:
Controlar a subdivisão operacional do item vendido, com quantidade, numeração, status da arte e status de produção por modelo.

B) public.pedidos_artes

Representa as artes enviadas para cada modelo.

Cada upload cria uma nova linha. Nenhuma versão anterior deve ser sobrescrita.

Exemplo:
Modelo Azul:
- versão 1: reprovada
- versão 2: reprovada
- versão 3: aprovada/liberada

Campos principais:
- id
- id_int
- id_modelo
- versao
- nome_arquivo
- storage_bucket
- storage_path
- url_arquivo
- tipo_arquivo
- mime_type
- tamanho_bytes
- status
- comentarios_revisao
- enviado_por
- enviado_por_uid
- aprovado_por
- data_aprovacao
- created_at
- updated_at

Função da tabela:
Guardar o histórico de versões das artes de cada modelo.

4. Relação entre as tabelas

A relação operacional ficou assim:

propostas.id_int
  ↓
pedidos.id_int
  ↓
pedidos_modelos.id_int
  ↓
pedidos_artes.id_modelo
  ↓
storage.chat-ideal

`pedidos_modelos` é a entidade central do fluxo de arte.

`pedidos_artes` sempre pertence a um modelo específico por `id_modelo`.

5. Storage

Não foi criado bucket novo.

As artes usam o bucket existente:

chat-ideal

O caminho padrão dos arquivos deve ser:

propostas/{id_int}/artes/{id_modelo}/{timestamp}_{nomeArquivo}

Exemplo:

propostas/3412/artes/6f4e.../1718300000_arte_modelo_azul_v1.pdf

A tabela `pedidos_artes` deve salvar:
- storage_bucket = chat-ideal
- storage_path = caminho completo do arquivo no bucket
- nome_arquivo
- mime_type
- tamanho_bytes

6. Versionamento

O versionamento funciona assim:

1. Sistema busca a maior `versao` existente para o `id_modelo`.
2. Soma +1.
3. Faz upload do arquivo no Storage.
4. Se o upload funcionar, cria uma linha em `pedidos_artes`.
5. Se o upload falhar, não grava no banco.
6. Se a gravação no banco falhar, deve retornar erro claro.

Regra obrigatória:
Nunca sobrescrever uma arte antiga.

7. Status das artes

Os status usados são:

- PENDENTE
- EM_CRIACAO
- EM_REVISAO_INTERNA
- AGUARDANDO_CLIENTE
- REPROVADA_CLIENTE
- APROVADA_CLIENTE
- LIBERADA
- IMPRESSA
- NAO_NECESSARIA

A tabela `pedidos_modelos` tem `status_arte`.

A tabela `pedidos_artes` tem `status`.

A versão atual mais importante normalmente será a maior versão do modelo, mas o histórico inteiro deve continuar disponível.

8. Timeline / chat

Não foi criada tabela `pedidos_historico`.

O histórico operacional será registrado na tabela existente:

public.propostas_chat

As mensagens de produção devem usar:

tipo = PRODUCAO
setor = Pre-impressao / Producao / Sistema
visivel_externo = false
id_int = mesmo id_int da proposta/pedido

Exemplo de mensagem:

"Arte enviada para o Modelo Azul (versão 1). Aguardando análise."

O chat é registro/timeline.
A ação operacional deve acontecer no painel do modelo.

9. Como o sistema deve operar

Fluxo básico:

1. Pedido entra em Produção.
2. Atendente ou produção cria os modelos/lotes do pedido.
3. Designer ou operador envia arte para um modelo.
4. Sistema salva arquivo no Storage.
5. Sistema cria registro em `pedidos_artes`.
6. Sistema registra evento em `propostas_chat`.
7. Pré-impressão analisa.
8. Se aprovar:
   - atualiza status da arte;
   - atualiza status do modelo;
   - registra mensagem automática no chat.
9. Se reprovar:
   - atualiza status da arte;
   - grava comentário de revisão;
   - registra mensagem no chat;
   - aguarda nova versão.
10. Quando todos os modelos estiverem liberados, o pedido pode avançar para OS/impressão.

10. O que NÃO deve ser feito nesta fase

- Não criar novo bucket de Storage.
- Não criar `pedidos_historico`.
- Não misturar dados de produção dentro de `produtos_proposta`.
- Não apagar versões antigas de arte.
- Não criar portal externo de aprovação do cliente nesta fase sem nova aprovação.
- Não alterar Financeiro, Fiscal, Cobranças ou Cadastros.
- Não criar trigger SQL para chat nesta fase.
- Não alterar RLS/policies sem aprovação explícita.

11. Próximo plano para o agente

O agente deve seguir este caminho:

1. Validar que as tabelas existem.
2. Criar os tipos TypeScript para `pedidos_modelos` e `pedidos_artes`.
3. Criar service de Produção/Artes.
4. Implementar upload no bucket `chat-ideal`.
5. Implementar versionamento incremental.
6. Inserir registro em `pedidos_artes` após upload bem-sucedido.
7. Inserir mensagem em `propostas_chat` após gravação da arte.
8. Criar painel visual de modelos e artes.
9. Criar ações de aprovar/reprovar arte no painel do modelo.
10. Manter tudo dentro de `src/features/producao`.

12. Regra final

Produção deve ser separada do comercial e do financeiro.

`produtos_proposta` continua sendo origem comercial.
`pedidos_modelos` controla a produção por modelo.
`pedidos_artes` controla as versões de arte.
`chat-ideal` guarda os arquivos.
`propostas_chat` guarda a timeline operacional.