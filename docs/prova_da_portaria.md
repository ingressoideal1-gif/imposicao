# A prova da portaria — o roteiro, com o evento e os números de hoje

**Esta é a única prova que vale, e ela não foi feita.** A portaria está no ar desde a v585.
Todos os testes automáticos passam; nenhum deles prova o que importa, porque nenhum deles
tem uma câmera, um celular sem sinal e um ingresso de papel na mão.

Ela precisa de você. Nada aqui pode ser feito daqui: é o mundo físico.

> **Por que insistir nisto.** Um ingresso errado não parece defeituoso. Ele é impresso
> bonito, conferido na tela, embalado, entregue — e só falha na porta do evento, com a fila
> esperando, quando já não há o que consertar. É por isso que o valor de uma noite inteira
> de trabalho depende de vinte minutos com um celular na mão, hoje, sem pressa.

---

## O que preparar

| | |
|---|---|
| **O evento** | **Expointer 2026** (pedido **18560**) — hoje é o único com faixa publicada de verdade |
| **Um celular** | qualquer um, com o aplicativo instalado por `https://ideal-imposition.vercel.app/ic/` |
| **Ingressos de papel** | dois, de setores diferentes — ver a tabela abaixo |
| **Tempo** | uns vinte minutos |

Conferido no banco em 04/09/2026, o Expointer 2026 tem **2.001 credenciais** e **zero
leituras** — quer dizer, nada foi lido ainda e o teste começa do zero:

| Setor | Contratado | Publicadas | Números | O código no papel |
|---|---|---|---|---|
| **CAMAROTE** | 400 | 401 | 1 a 400 | **QR Ideal** (e também QR e barras) |
| **PISTA** (modelo 1000108) | 200 | 200 | 1 a 200 | **QR Ideal** |
| **PISTA 2** | 300 | 300 | 1 a 300 | QR comum |
| PISTA (modelo 1000109) | 600 | 600 | 1 a 600 | a numeração foi apagada depois de imprimir |
| VIP | 500 | 500 | 1 a 500 | a numeração foi apagada depois de imprimir |

As duas últimas linhas não servem para este teste, e valem um parágrafo por outro motivo —
ver [Uma coisa que a consulta encontrou](#uma-coisa-que-a-consulta-encontrou), no fim.

**Os ingressos que servem: um do CAMAROTE e um da PISTA 2.** O primeiro tem QR Ideal, o
segundo tem QR comum — e são de setores diferentes, que é o que o segundo teste exige.

---

## Os cinco passos

### 1. Ligar o celular como portão do CAMAROTE

Abra o aplicativo, entre com a conta do cliente, toque na barra do **Expointer 2026** e diga
que sim, este aparelho vai ler. Dê um nome a ele — *Teste 04/09*, por exemplo.

Depois, na engrenagem do evento → **Aparelhos** → o aparelho que você acabou de criar →
**Selecionar os setores**: deixe aceso **só o CAMAROTE**.

> O portão nasce validando **todos** os setores, de propósito: um portão sem setor recusa
> tudo com o laranja de "outra porta", e o porteiro não teria como saber por quê.
> Restringir é escolha da engrenagem, feita depois e com calma — é o que você está fazendo
> agora.

### 2. Desligar o Wi-Fi e os dados

**Este passo é o teste.** Ler com internet não prova nada: o que precisa ser provado é que
o aparelho decide sozinho, com a carga que baixou, porque num portão de festa não há sinal.

Antes de desligar, deixe a tela de leitura abrir uma vez com internet — é ela que baixa o
evento inteiro para o celular.

### 3. Ler um ingresso do CAMAROTE → tem de sair **VERDE**

Verde, com o nome do setor e o número do ingresso. O aparelho apita e a câmera continua
ligada, esperando a próxima pessoa.

Leia o **mesmo** ingresso de novo. Como o CAMAROTE está configurado como entrada única, a
segunda leitura tem de sair **JÁ ENTROU** — e isso continua valendo sem internet, porque
quem já entrou fica guardado no próprio celular.

### 4. Ler um ingresso da PISTA 2 → tem de sair **LARANJA**

**É o teste mais importante dos dois.** O aparelho está aceso só para o CAMAROTE, e este
ingresso é de outro setor. A tela tem de dizer, em laranja, que ele é **de outra porta** — e
dizer qual.

**Se sair vermelho ("não é deste evento"), pare e me chame.** É o erro que a tela inteira
existe para não cometer: o porteiro devolveria um ingresso bom achando que é falso, na frente
do dono do evento.

### 5. Ligar a internet de volta e conferir que a fila subiu

Com o sinal de volta, abra **Ao vivo** naquele evento (o botão do meio, na linha do evento).
As leituras que você fez offline têm de aparecer ali: o contador de entradas, o CAMAROTE com
gente dentro, e a recusa da PISTA 2 na lista de recusas.

É a prova do caminho inteiro: o papel, a decisão sem rede, a fila que subiu depois, e o
número na tela do dono.

---

## Se quiser desfazer o teste

Na engrenagem do evento → **Zona de risco** → **Zerar as entradas deste evento**. A contagem
volta a zero, e os ingressos, os setores e os aparelhos continuam valendo. Ela pede a sua
senha de novo mesmo dentro dos 15 minutos já liberados — é a única coisa daquela tela que
não tem volta.

Para desligar o celular de teste: engrenagem → **Aparelhos** → **Excluir**.

---

<a name="uma-coisa-que-a-consulta-encontrou"></a>
## Uma coisa que a consulta encontrou

Dois modelos do 18560 — **VIP** (1000107) e uma das **PISTA** (1000109) — apontam para
numerações que **não existem mais** no catálogo. Somam **1.100 credenciais publicadas** de
ingressos cuja numeração foi apagada depois de imprimir.

Nada quebra por causa disso, e é por isso que passou despercebido: as credenciais existem,
os setores existem, e a portaria leria os dois normalmente se alguém apresentasse o papel.
O que não dá mais para saber, olhando o sistema, é **o que está escrito naqueles
ingressos** — a numeração que gerou o código sumiu.

O **Conferir os setores** (engrenagem → Setores) enxerga exatamente esse caso e **não faz
nada** com ele: ele avisa que aqueles setores não têm mais código no pedido, mas têm
ingresso publicado, e deixa como está. Desligar um setor que tem ingresso impresso é decisão
de gente, não de rotina.

Se aqueles dois lotes ainda vão a algum evento de verdade, vale reconstruir a numeração
deles antes — não pelo controle de acesso, que funciona, mas para o sistema voltar a saber o
que está no papel.
