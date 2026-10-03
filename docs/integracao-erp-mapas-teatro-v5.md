# Contrato Vibe — mapas, revisão e snapshot v1

03/10/2026. Esta versão substitui a descrição de hash e de vínculo das versões anteriores para modelos que possuem os campos Vibe. Os bancos legados continuam preservados, sem conversão automática. A evidência de publicação é registrada separadamente após a entrega.

## Revisão

`revisao = SHA-256(UTF-8(JCS(config)))`, RFC 8785, 64 caracteres hexadecimais minúsculos. O serializador compartilhado está em `frontend/mapa-teatro-revisao.js`; painel, PDF e serviço utilizam os mesmos bytes. Inclui a config inteira, sem BOM ou nova linha final. `id` e `name` externos não participam. Chaves seguem unidades UTF-16, inclusive chaves numéricas; arrays conservam a ordem; números/strings seguem ECMAScript. Unicode inválido e valores não JSON são recusados. Não substituir por `jsonb::text` ou por `json.dumps(sort_keys=True)` genérico.

Renomear o mapa externo mantém a revisão. Renomear um setor dentro da config muda o hash; **o vínculo do modelo não é invalidado nem substituído por isso**, pois a geração conserva o snapshot e a revisão gravados no modelo e sinaliza a diferença. Não excluir nomes de setores da fórmula.

Na leitura autorizada de 03/10/2026, o cálculo de Laércio Boim correspondeu ao hash enviado pelo Vibe:

```text
37a8fed126ad67a38dcf5be2f2a452fea35a3a3b0b49d4f92357599828e7b78c
```

O hash de Master Hall enviado no chat tinha **63 caracteres**, não 64. O cálculo completo da config atual é:

```text
a27a03ee856345a5d0eb26e67a53edf73f6c4442bcb30bd235fcbe53b7068d45
```

Há um `b` entre `235fc` e `e53`. Os anexos canônicos não estavam disponíveis nesta conversa; a validação acima compara o contrato com a config lida do cadastro atual, não com bytes de um anexo.

## Fonte dos modelos e snapshot

O carregamento completo de `pedidos_modelos` conserva `mapa_teatro_id`, `mapa_teatro_setor_id`, `mapa_teatro_revisao` e `mapa_teatro_snapshot`. O contrato v1 observado no cadastro e implementado é:

```json
{
  "versao": 1,
  "mapa": {"id": "mapa-sintetico", "nome": "Mapa histórico"},
  "setor": {"id": "setor-sintetico", "nome": "Plateia"},
  "cadeiras": [
    {"chave": "0,0", "prefixo": "A", "num": 1, "tipo": "Normal"},
    {"chave": "1,0", "prefixo": "A", "num": 3, "tipo": "Normal"}
  ],
  "tiposAssento": []
}
```

Exemplo sintético. `setor.nomeConjunto` é opcional; quando ausente, a apresentação usa `Fila`. Os IDs do snapshot devem coincidir exatamente com os campos do modelo. A versão deve ser 1. Prefixo e número são etiquetas string ou inteiros seguros; letras, zero e lacunas são preservados. O identificador `chave` é a posição x,y. Repetições de posição/etiqueta, vínculo incompleto ou versão desconhecida bloqueiam.

O snapshot tem prioridade sobre um eventual banco associado. Campos Vibe parciais não fazem o modelo cair silenciosamente no banco antigo ou na sequência genérica. Os lugares são ordenados por posição e agrupados por conjunto como no banco importado, sem renumerar. Excluem `tipo=Apagado` e `isErased=true`; o sufixo do tipo é aplicado na apresentação, preservando a etiqueta base em `Lugar`.

## Geração e reimpressão

1. A tela resolve os lugares a partir do snapshot do modelo. Quantidade comercial diferente do total ativo ou seleção parcial de linhas bloqueia a geração; não corrige quantidade no ERP.
2. O payload conserva os campos completos em `numeracao.teatro_modelo`, inclusive no `multi_artes`. A numeração visual escolhida permanece; precisa conter elementos de teatro.
3. Antes de gerar, o painel lê o mapa atual, verifica seu ID e a presença do setor, calcula JCS e avisa quando a revisão diverge: será usado o snapshot histórico.
4. A entrada local do motor (`app.py`/`teatro_snapshot.py`) valida o modelo destinatário, a quantidade, os IDs internos do snapshot e todos os lugares. Relê o mapa para confirmar que o setor pertence a ele e que a configuração continua igual à conferida pelo painel. Os bytes JCS vêm do serializador compartilhado; o motor confirma o conteúdo contra a releitura e calcula SHA-256 deles, sem usar serialização Python alternativa.
5. O motor compara a revisão atual à gravada, sinaliza em log e utiliza somente as linhas regeneradas do snapshot histórico. Dados enviados diferentes dessas linhas são recusados. Não atualiza campos, revisão ou snapshot no banco.
6. Mapa/setor ausente, conferência obsoleta ou falha de leitura bloqueiam com aviso; não se presume relação pelo nome. O contrato desta versão exige a existência atual do mapa/setor para conferir a relação. Se o ERP precisar reimprimir após excluir mapa/setor, será necessário alinhar esse caso antes da exclusão.

TEATRO conserva a montagem vertical por modelo da v1005: posições P, quantidade Q, folhas F=ceil(Q/P), registro p*F+folha. Filas/mesas não reiniciam a pilha. A regra de BLOCO comercial idêntico na combinação de modelos permanece, assim como as quantidades e fórmulas TICKET. O NewProd deve expor as capacidades `teatro_vertical_modelo_v1` e `teatro_snapshot_v1`; a tela bloqueia envio de snapshots a uma versão anterior.

## Históricos e inventário

Não converter `Revisao_Mapa` ou `revisao_exportacao` antigos. A consulta explícita de PDF antigo conserva hash e bytes; uma revisão histórica ausente não é substituída pela atual. Os bancos do pedido não são reconstruídos a partir do cadastro atual. A associação pelo popup continua disponível para o fluxo por bancos, mas não grava automaticamente os campos Vibe.

Leitura atual, somente GET, em `e-deal / vwbtitjlpelrcnsytzqw`: dois mapas; modelos 1001961/1001962 com bancos legados de 82/515 lugares, ambos `PENDENTE`; modelo 1001963 com snapshot v1 de Laércio Boim, quantidade 273 e `PENDENTE`; zero exportações de PDF armazenadas. Portanto não foram encontrados modelos aprovados nem PDFs armazenados com a revisão antiga dentro dos vínculos de teatro consultados. Isso não comprova a ausência de PDFs locais externos a esse cadastro.

Não houve alteração de dados de negócio no banco, migração, alteração de permissões, aprovação, envio ao parceiro, instalação na estação ou impressão física nesta implementação. A publicação do código e a distribuição do agente são verificadas separadamente. O fluxo Duplicar do ERP continua precisando preservar os quatro campos e criar IDs novos; não foi alterado pelo Ideal nesta tarefa.

## Resposta às três confirmações do parceiro

1. A borracha do editor usa `delete cadeiras[chave]` (`frontend/mapas.js`, mouse e arraste). Portanto, uma posição apagada fica ausente do objeto; não recebe automaticamente `isErased` nem um tipo especial. Os dois mapas cadastrados consultados em 03/10 não contêm cadeira marcada como apagada. Não há objeto real apagado para fornecer desses cadastros. A representação correta após apagar a posição `0,2` é a ausência dessa propriedade; não enviar um objeto inventado como exemplo real. Para compatibilidade, os consumidores ignoram `isErased=true` e o ID literal `tipo="Apagado"`. O nome descritivo de um tipo personalizado, sozinho, não é marcador de exclusão.
2. `num` pode ser inteiro ou texto. O motor preserva a etiqueta: `1` gera `1`, `"01"` gera `01`, `"Z"` gera `Z`. Não converte textos a inteiros nem fecha lacunas.
3. Cada cadeira do snapshot é localizada pela sua `chave`, não pelo índice da lista. Inverter a lista não altera os lugares gerados. A revisão vem exclusivamente de `pedidos_modelos.mapa_teatro_revisao`, fora de `mapa_teatro_snapshot`; não é exigido um campo de revisão no snapshot. Posições duplicadas são recusadas.

Validação sintética adicional: lista invertida mantém as mesmas linhas e `num="01"` preserva o zero. Não foi apagada nenhuma cadeira do cadastro real para obter um exemplo.
