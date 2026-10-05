# Arte pronta: quantidade e paginas do PDF

Na edicao do pedido pela Lista de Arte, um modelo em Modo PDF so pode ser
marcado PRONTO quando o numero de paginas do PDF original corresponde a
quantidade do modelo e ao modo de verso vinculado a sua numeracao.

| Modo | Paginas do original para N unidades | Exemplo para 100 unidades |
|---|---|---:|
| So frente | N | 100 |
| FxVerso, frente e verso intercalados | 2 x N | 200 |
| PDF Impar Frente e Verso Par | 2 x N | 200 |
| FxVersoUnico | N no PDF da frente | 100 |
| Duplicar para Verso | N | 100 |

No PDF impar/frente e par/verso, 199 ou 201 paginas para 100 unidades bloqueiam
Arte Pronta. A quantidade comercial permanece a mesma; corrigir o arquivo ou
a quantidade pela operacao apropriada e conferir novamente.

A verificacao acontece no clique em PRONTO, individualmente e em lote. Le o
original com cache no-store, preserva as verificacoes de banco e numeracao e
recusa PDF ausente, indisponivel ou invalido. A mensagem informa paginas
encontradas, quantidade e total esperado. A divergencia interrompe o fluxo
antes de regenerar a amostra e antes da gravacao de prontidao. Mudancas locais
dos dados conferidos durante a operacao tambem impedem a gravacao.

## Registro da entrega segura

A regra existente foi conferida nos dois dominios publicos e nos paineis locais
de producao e Piloto. Este registro amplia os testes permanentes para 54
cenarios sinteticos, abrangendo os cinco modos, quantidades compativeis e
divergentes, acao individual/em lote, falhas e mudancas durante a conferencia.
As fixtures simulam PDF e persistencia; nao acessam dados reais nem gravam
status em producao.

Arquivos de aplicacao, schemas e permissao permanecem na implementacao ja
publicada. A entrega atual registra a regra e os testes, sem nova versao do
frontend ou pacote do agente. Evidencias dos arquivos servidos e dos processos
ficam no registro privado da estacao. Impressao fisica e aceite de um pedido
real devem ser registrados separadamente.
