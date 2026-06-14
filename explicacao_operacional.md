O que tem que aparecer como OK
pedidos_modelos existe.
pedidos_artes existe.
pedidos_artes tem FK em id_modelo.
Existe unique para evitar versão duplicada por modelo.
Existem índices por id_int, id_modelo, status e storage_path.
Bucket chat-ideal aparece.
Se a FK estiver com delete_rule = CASCADE, eu recomendo corrigir depois para RESTRICT ou NO ACTION, porque arte é histórico operacional e não deveria sumir automaticamente.
2. Como vai funcionar operacionalmente

O fluxo ficou assim:

Proposta / Pedido
   ↓ id_int
Modelo / Lote do pedido
   ↓ pedidos_modelos
Versões de arte
   ↓ pedidos_artes
Arquivo físico
   ↓ storage: chat-ideal
Timeline operacional
   ↓ propostas_chat
Exemplo real

Cliente compra 3.000 pulseiras Triband.

No comercial, isso pode ser um item só em produtos_proposta.

Na produção, isso pode virar vários modelos:

Modelo Azul     → 750 unidades
Modelo Vermelho → 750 unidades
Modelo Verde    → 1.000 unidades
Modelo Amarelo  → 500 unidades

Cada modelo fica em pedidos_modelos.

Cada arte enviada para cada modelo fica em pedidos_artes.

Se o designer subir uma arte nova para o Modelo Azul:

Modelo Azul
  ├─ arte v1 → reprovada
  ├─ arte v2 → reprovada
  └─ arte v3 → aprovada/liberada

Cada versão é uma linha nova em pedidos_artes. O histórico não é sobrescrito. A documentação define exatamente esse comportamento: cada upload cria novo registro, incrementa versão e preserva o histórico integralmente.

Storage

O arquivo físico vai para:

chat-ideal/propostas/{id_int}/artes/{id_modelo}/{timestamp}_{nomeArquivo}

A tabela pedidos_artes guarda o caminho desse arquivo:

storage_bucket = chat-ideal
storage_path = propostas/3412/artes/<id_modelo>/1718300000_arte_azul.pdf
Chat / timeline

Quando uma arte for enviada, aprovada ou reprovada, o sistema registra uma mensagem em propostas_chat com:

id_int = número da proposta/pedido
tipo = PRODUCAO
setor = Pre-impressao / Producao / Sistema
visivel_externo = false
anexos = dados do arquivo

Isso segue a decisão de não criar uma timeline nova; o módulo de Produção reaproveita o chat operacional existente por id_int.

Aprovação interna

Nesta fase, a aprovação/reprovação deve sair do painel do modelo, não diretamente do chat.

Fluxo:

1. Designer envia arte.
2. Sistema grava arquivo no Storage.
3. Sistema cria registro em pedidos_artes.
4. Sistema registra mensagem em propostas_chat.
5. Pré-impressão analisa.
6. Se aprovar:
   - pedidos_artes.status = APROVADA_CLIENTE ou LIBERADA, conforme etapa
   - pedidos_modelos.status_arte = status correspondente
   - registra mensagem automática no chat
7. Se reprovar:
   - pedidos_artes.status = REPROVADA_CLIENTE
   - grava comentário
   - registra mensagem no chat
   - designer/comercial envia nova versão

A documentação também reforça que a ação de aprovar/reprovar pertence ao painel de modelos, enquanto o chat funciona como registro rastreável.