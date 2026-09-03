# Sessão de 02/09/2026 — a janela e o papel

Um dia inteiro numa pergunta só, feita sobre o pedido 21408:

> *"pq a visualização da arte da frente esta em tamanho diferente da arte do verso?"*

A resposta virou sete correções, todas na **tela**. O `engine.py` não foi tocado
em nenhuma delas: o papel sai hoje exatamente como saía ontem. Cinco publicações,
v798 a v804, agente 1.2.288 a 1.2.294.

O usuário deu o enquadramento logo no começo, e ele explica por que o motor
ficou intocado:

> *"ATENÇÃO, imposição e impressão, motor, gera CORRETAMENTE, apenas a janela de
> visualização mostra errado"*

---

## O que foi corrigido, em ordem

| v | o que era | o que passou a ser |
|---|---|---|
| 798 | no card de frente e verso, a moldura da frente tinha teto de 400 px e a do verso 450 — o verso aparecia **12,5% maior** | os dois em 450; medido 319,1 × 450,0 contra 319,2 × 450,0 |
| 799 | *(recurso novo)* | o status **Corrigir Arte** |
| 802 | a janela da imposição encolhia a arte em PDF para caber na célula — **93,5%** e **89,9%** do tamanho real | arte em PDF no tamanho do arquivo, com o verso usando a medida da própria página |
| 803 | a folha somada mostrava uma pilha por modelo; o esquema da janela não seguia a barra; a arte travava após uma falha de rede | os três consertados |
| 804 | a moldura seguia a arte quando o modelo "não tinha formato" | a moldura é o formato do modelo, sempre |

## As três regras que o usuário ditou no caminho

1. **"O que define o tamanho da janela de visualização é o formato" — "não a
   arte".** Moldura e arte são dois objetos: a primeira vem do formato, em
   milímetros, e não muda com o arquivo; a segunda vem do arquivo, no tamanho
   real, e é aparada pela célula. Ver `docs/como_a_arte_entra_na_peca.md`.
2. **"Todo modelo exige obrigatoriamente um formato vinculado".** Não existe
   plano B: sem formato resolvido, a tela diz que falta, com a saída na frase.
3. **"Não alterar o papel."** Toda divergência tela/papel se resolve na tela.

## O que cada correção tinha em comum

Todas eram a mesma coisa, em lugares diferentes: **uma tela adivinhando o que a
máquina faz, em vez de perguntar**.

- a arte em PDF encolhida "para caber" — o motor não encolhe;
- a folha somada montada por pilha — o motor enfileira e mistura;
- o esquema lido de um seletor que ninguém atualiza — o payload lê outra fonte;
- a moldura tirada do arquivo ou do primeiro formato do catálogo — o modelo tem
  formato próprio.

Em três dos quatro casos **o código certo já existia no arquivo** e não era
alcançado: o ramo `multi_artes` do mapeamento de poses estava escrito logo abaixo
do ramo que o interceptava, e a prévia da tela de Imposição já fazia a conta
certa que a do Pedido não fazia.

## Como cada uma foi provada

Nenhuma conclusão veio de leitura de código. O método, repetido em todas:

1. **medir o motor**, chamando a função dele com os números reais do pedido
   (`_arte_na_celula`, `ImpositionEngine.process`) — nunca supondo o que ele faz;
2. **medir a tela**, dirigindo o app num Chrome sem cabeça e interceptando o
   `drawImage` do canvas para ler o que a janela manda desenhar;
3. **comparar em milímetros**, pose a pose quando era o caso;
4. quando a dúvida era "isto é meu ou já era assim", **trocar o arquivo pelo da
   versão publicada**, medir de novo e devolver.

O passo 4 evitou um erro sério: eu tinha relatado que a folha combinada só
desenhava a primeira arte. Medindo contra a v799 descobri que o comportamento
era antigo — e, olhando melhor, que **eu é que estava errado**: a segunda arte
aparecia no Set 2, e eu nunca tinha trocado o seletor de Set. O defeito real era
outro e maior.

## O que ficou aberto

**A arte do modelo 1000740 do 21408.** A frente tem 110,70 × 164,70 mm e o verso
104,35 × 158,35 — 6,35 mm de diferença em cada eixo, uma sangria a mais por lado
na frente. Numa célula de 105 × 148, o corte come faixas diferentes de cada face:
2,85 mm por lado na largura da frente contra 0 no verso; 8,35 contra 5,17 na
altura. **Frente e verso não fecham registro.**

Isso não é da tela — sai assim no papel. Decisão do usuário: pedir ao cliente o
PDF da frente reexportado com a mesma sangria do verso, ou compensar pela escala
da arte do modelo. Nada foi alterado.

**Um resquício de código.** No `renderPdfViewerPage` havia um caminho de reserva
que fazia a moldura seguir a arte; ele foi removido na v804. Não consegui
fazê-lo disparar numa medição antes de removê-lo — o que registro aqui por
honestidade, e não como dúvida sobre a remoção: a regra do usuário o proíbe de
qualquer forma.

## Testes que nasceram no dia

| arquivo | o que trava |
|---|---|
| `tests/corrigir_arte_harness.js` + `test_corrigir_arte.py` | o terceiro status e as quatro decisões |
| `tests/test_folha_combinada_igual_ao_motor.py` | a folha somada, rodando o motor de verdade |
| `tests/esquema_da_previa_harness.js` + `test_esquema_da_janela_igual_ao_payload.py` | a janela e o payload lendo a mesma regra |
| `tests/test_arte_travada_apos_falha.py` | a marca de "carregando" apagada no `finally` |
| `tests/test_todo_modelo_tem_formato.py` | a moldura saindo do formato do modelo |

Dois testes antigos precisaram mudar, e ambos porque **travavam o comportamento
que o usuário mandou trocar**:

- `escala_da_arte_harness.js` afirmava *"sem formato, o canvas continua sendo a
  pagina da arte (como antes)"*;
- `dois_status_do_painel_harness.js` descrevia a impressão como tendo dois
  status.

Trocar a asserção de um teste existente é coisa a contar, não a fazer calado — em
ambos ficou escrito no próprio arquivo por que mudou e qual medição justifica.

## Estações

No fim do dia, **TEX-01 continuava em 1.2.281** — treze versões atrás, sem se
mover enquanto as vizinhas subiram sozinhas cinco vezes. Não é atraso de
propagação: é uma estação que não está conseguindo se atualizar. PC-JR-HOME
esteve travada em 1.2.290 durante o dia e se desencalhou sozinha na última leva.
