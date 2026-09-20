# Contrato de idempotência do portal — v1

Especificação para revisão da migration do Vibe. Janela e seis campos aceitos pelo parceiro: 7 dias a partir da primeira conclusão bem-sucedida; UUID, operação, conclusão, identificador do link, hash da entrada e resultado. Nenhuma tabela ou função foi criada no banco nesta entrega.

## Hash: formato exato

`hash_entrada = lowercase_hex(SHA-256(UTF8(JCS(envelope))))`

JCS significa JSON Canonicalization Scheme, conforme [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785). Sem BOM nem nova linha final. O resultado tem **64 caracteres hexadecimais minúsculos**, equivalentes a 32 bytes. Para a coluna, propor `text` com CHECK `^[0-9a-f]{64}$`.

O servidor monta o envelope abaixo a partir dos parâmetros validados. Não confiar em hash ou envelope enviados pelo navegador:

```json
{
  "versao": "imposition-portal-v1",
  "operacao": "link_cliente_confirmar_dados",
  "link_id": "00000000-0000-0000-0000-000000000001",
  "pedido": "42",
  "entrada": {
    "aba": "entrega",
    "confirmado": false,
    "correcao": "Portão B\nRua das Flores, 10"
  }
}
```

`link_id` vem do registro autenticado, como sua chave primária convertida para texto pelo banco, não do corpo. O exemplo usa UUID sintético e não fixa o tipo da tabela existente. `pedido` é o número validado em representação decimal textual, positiva e sem zeros à esquerda. Não converter IDs grandes para Number de JavaScript.

`operacao` é um dos três nomes da tabela seguinte, sem schema, parênteses ou assinatura. `versao` é sempre a string literal acima. Não é a versão da arte.

| Operação | Objeto `entrada` completo e exclusivo |
|---|---|
| `link_cliente_decidir_arte` | `{"modelo_id": string, "versao_arte": string, "decisao": "aprovar" ou "reprovar", "observacao": string ou null}` |
| `link_cliente_confirmar_dados` | `{"aba": "entrega" ou "faturamento", "confirmado": boolean, "correcao": string ou null}` |
| `link_cliente_finalizar` | `{}` |

Esses são nomes do envelope de hash. As assinaturas SQL podem ter prefixo `p_`; o envelope não o usa. `modelo_id` e `versao_arte` usam a representação textual canônica de seus tipos, que será definida com o DDL fornecido pelo parceiro: por exemplo, UUID em forma minúscula com hífens e versão inteira em decimal sem zeros à esquerda. Essa conversão depende somente do valor/tipo, nunca do estado atual da arte. Não presumir que todos os IDs sejam UUID ou que a versão seja inteira antes de receber o DDL.

Regras da entrada:

- Incluir todas as chaves da operação. Parâmetro textual opcional ausente vira `null`. String vazia permanece `""` e é diferente de `null`; booleano obrigatório não recebe default implícito.
- Preservar texto exatamente como recebido e validado: sem trim, normalização Unicode, troca de CRLF por LF, alteração de maiúsculas ou remoção de espaços. Uma alteração desses bytes representa outro payload. Não incluir textos que o servidor gerar depois, como mensagens de auditoria.
- Validar enums nas formas exatas acima; não traduzir automaticamente um status do banco para a ação solicitada. O mapeamento da ação para os status existentes pertence à mutação, não à serialização.
- Chaves desconhecidas são recusadas. O servidor constrói objetos com chaves únicas; não usar um JSON genérico recebido do cliente como envelope.
- Este contrato não usa arrays nem números JSON: identificadores são strings; os únicos valores escalares são strings, booleanos e null. Todas as chaves são ASCII fixas, o que simplifica a implementação interoperável de JCS no SQL.
- Ordenar chaves conforme JCS em todos os objetos. Não inserir espaços de formatação, preservar os caracteres Unicode válidos e aplicar os escapes de string definidos pelo JCS. Rejeitar Unicode inválido e U+0000, que não é representável como texto PostgreSQL.

Ficam **fora do hash**: token do link, UUID da requisição, cabeçalhos, IP, navegador, horários, resultado, identidade textual do autor fornecida pela interface e qualquer estado mutável consultado do banco. A operação e o link são incluídos no hash mesmo tendo colunas próprias.

Não usar `jsonb::text` diretamente como substituto de JCS: sua representação textual não é este contrato. Os [vetores de conformidade](idempotencia-portal-v1-vetores.json) contêm envelopes, strings canônicas e hashes calculados localmente para testar a implementação do parceiro. Nenhum vetor contém dados reais.

## Resultado: coluna e dimensionamento

Usar **`jsonb`**, não `varchar` de tamanho fixo. Cada mutação retorna um recibo compacto, sem devolver modelos completos, imagens, base64, anexos, observações ou dados de cadastro. A leitura completa continua em uma operação de consulta separada, que não entra na tabela de deduplicação.

Formato do recibo v1:

```json
{
  "ok": true,
  "operacao": "link_cliente_confirmar_dados",
  "requisicao_id": "00000000-0000-0000-0000-000000000002",
  "pedido": "42",
  "concluido_em": "2026-09-07T15:00:00.000000Z",
  "estado": {
    "aba": "entrega",
    "confirmado": false
  }
}
```

`estado` contém somente o resumo da ação: decisão de arte pode trazer modelo, versão e status gravado; confirmação traz aba/resultado; finalização traz status final. Não incluir o texto da correção. `concluido_em` é gerado pelo servidor ao concluir a ação e deve representar o mesmo instante da coluna de conclusão. Replays devolvem o JSON armazenado, sem trocar o timestamp ou acrescentar uma flag de repetição.

**Estimativa de projeto: 300–1.000 bytes UTF-8 por recibo, normalmente abaixo de 1 KiB; não é uma medição de produção.** Limite proposto: **16.384 bytes** de `octet_length(resultado::text)` para o JSONB armazenado. Conferir o limite antes do commit; um resultado maior deve abortar toda a transação, inclusive as mutações. Não truncar um resultado e não aplicar a mutação se não puder armazenar seu recibo.

O tamanho físico de linha/índices/TOAST é separado desse limite lógico e será medido pelo parceiro depois. A migration pode exigir resultado objeto, `ok = true`, hash bem formado e os seis campos preenchidos para registros concluídos.

## Unicidade, transação e janela

Propor **UUID da requisição como chave única global**. `operacao` e `link_id` são conferidos junto do hash; não incluir esses campos na chave de unicidade de forma que a reutilização do mesmo UUID com outra operação/link possa criar outra ação silenciosamente.

1. Validar o link ativo pelo número + token. Fazer isso inclusive no replay.
2. Validar os parâmetros e gerar o envelope/hash no servidor.
3. Adquirir exclusão transacional para o UUID, com limite de espera. Pode ser lock transacional ou disputa por chave única, conforme implementação do parceiro. Um timeout deve responder como conflito recuperável, sem escrever nem marcar sucesso.
4. Se houver recibo dentro da janela, comparar operação, link e hash: iguais devolvem o JSON salvo; qualquer divergência retorna conflito, sem executar a mutação e sem revelar recibo de outro link.
5. Na primeira execução, conferir os vínculos de modelo/arte e a versão atual, aplicar todas as mutações e mensagens, montar/validar o recibo e gravar os seis campos na mesma transação. A verificação de versão atual não deve impedir o replay de um recibo já concluído.
6. Erro aborta tudo. Com seis campos e sem coluna de estado, a tabela persistida representa somente ações concluídas; registros intermediários não podem sobreviver a uma falha. A exclusão concorrente é responsabilidade transacional, não um marcador permanente de "em andamento".

Usar relógio do banco ao final da ação (`clock_timestamp()` ou equivalente), não o horário do navegador nem o timestamp de início de uma transação longa. O instante de commit posterior não é conhecido dentro da transação: a referência contratual é o carimbo final da operação cuja transação teve sucesso. A janela não é renovada em replays.

Janela ativa: `agora < concluido_em + interval '7 days'`. No limite exato ela expirou. Após expiração não há garantia de replay: o cliente não deve reutilizar a mesma chave como retry automático, pois a ação pode ser executada outra vez. Nova ação intencional recebe novo UUID. Se a linha expirada ainda estiver na tabela, a RPC deve tratar sua remoção/substituição sob o mesmo lock e transação; não depender do horário do expurgo para decidir validade.

## Expurgo: responsabilidade do Vibe

**Job do parceiro, executado de hora em hora**, em lotes limitados e com índice no instante de conclusão. Excluir somente concluídos com `concluido_em <= clock_timestamp() - interval '7 days'`. Não haverá chamada de limpeza pelo navegador ou pelo Imposition e não é necessário criar um endpoint público para isso.

O job deve coordenar seus locks com a RPC para não remover um recibo que outra transação está conferindo. Um job atrasado pode deixar linhas fisicamente presentes por mais tempo; isso não estende a validade lógica dos sete dias. Monitoramento e ajuste de tamanho dos lotes ficam com o parceiro.

## Fora deste contrato

`link_cliente_modelos` é leitura e não precisa de deduplicação. As quatro `link_cliente_*` existentes não são alteradas aqui. As novas RPCs e sua tabela serão aplicadas exclusivamente pelo parceiro por migration versionada; este documento e os vetores são material de revisão, não autorização para execução direta.
