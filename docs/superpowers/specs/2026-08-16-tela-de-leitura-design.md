# A tela de leitura do portão — novo fluxo

**Data:** 16/08/2026
**Decidido com o usuário nesta conversa**, a partir de uma arte que ele desenhou e de
oito perguntas respondidas. Onde eu recomendei e ele aceitou, está registrado como
decisão dele; onde ele decidiu diferente da minha recomendação, também.

---

## O problema

A tela de hoje trata **toda** leitura como um evento que exige atenção: o QR é lido, a
câmera desliga, uma tela colorida ocupa o aparelho, e o porteiro precisa tocar em "Ler o
próximo" para a fila andar. Numa noite de dois mil ingressos, são dois mil toques —
com uma mão, no escuro, com a fila esperando.

O caso comum é o ingresso **bom**. Ele não deveria pedir nada de ninguém.

Junto disso, três coisas menores mas do mesmo tipo: um botão "Atualizar o evento" que o
porteiro tem de lembrar de tocar para receber um bloqueio que o dono criou; um "Configurar
este aparelho" no meio da tela de trabalho; e nenhum retorno sonoro, num aparelho que o
porteiro segura mas nem sempre olha.

## O que vamos construir

```
┌────────────────────────────────────────┐
│ ←   Portão 5                           │
│     CAMAROTE · PISTA · PISTA 2 · VIP   │
│  ┌──────────────────────────────────┐  │
│  │            câmera                │  │
│  └──────────────────────────────────┘  │
│           Última Leitura:              │
│  ┌──────────────────────────────────┐  │
│  │  Pista · 002005 · 20:43          │  │ ← verde
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  1.234 / 5.000 · 12 não enviadas │  │ ← destacado
│  └──────────────────────────────────┘  │
│  🔦        Digitar o número            │
└────────────────────────────────────────┘
```

---

## 1. O ingresso bom não interrompe ninguém

A câmera **fica ligada**. A faixa verde troca de conteúdo, o aparelho apita e vibra curto,
e a próxima pessoa passa sem ninguém tocar em nada.

**A hora entra na faixa** — decisão do usuário, sobre a arte original. Numa fila rápida,
sem ela o porteiro não distingue "este verde é do rapaz que acabou de passar" de "este
verde é de trinta segundos atrás e a câmera não leu nada desde então".

### A armadilha que a trava antiga tapava sem querer

Desligar a câmera a cada leitura era, também, a proteção contra ler o mesmo QR duas vezes.
Ela lê o mesmo código cerca de vinte vezes por segundo enquanto o papel estiver na frente
da lente.

**O mesmo código passa a ser ignorado por 2 segundos** depois de lido. Decisão do usuário
(eu havia sugerido 3). Outro ingresso, diferente, passa na hora — o silêncio é por
código, não por tempo de tela.

Sem isso, o segundo disparo cairia na regra `ja_entrou` e pintaria a tela de **vermelho**
para um ingresso **bom**, um piscar depois do verde. É o pior resultado possível: o
porteiro devolve quem tinha direito de entrar.

## 2. O ingresso barrado continua travando

Recusa não mudou: a cor ocupa a tela inteira, o motivo aparece grande, e o porteiro toca em
**Ler o próximo** para seguir. É a única forma de garantir que ele viu.

Vale para todas as recusas — `evento_inativo`, `desconhecido`, `setor_nao_autorizado`,
`setor_bloqueado`, `fora_da_janela`, `bloqueado`, `ja_entrou` — e para a escolha de setor
quando o mesmo número existe em dois setores do aparelho.

## 3. Som e vibração

Bipe **gerado no próprio aparelho** (Web Audio), sem arquivo nenhum: funciona sem rede e
não pesa no download, que é a regra desta tela.

| | som | vibração |
|---|---|---|
| liberado | curto e agudo | um toque curto |
| barrado | longo e grave | dois toques longos |

Vibração junto de propósito: no portão o som some no barulho, e o aparelho costuma estar
na mão.

### O toque que libera o som

Navegador nenhum toca áudio antes de a pessoa encostar na tela, e ler QR não conta como
encostar. A leitura abre com um **"Toque para começar a ler"** ocupando a tela; um toque, e
o som passa a valer.

Ele reaparece se o porteiro sair da leitura e voltar. É um toque, não um cadastro — e a
alternativa (tentar tocar som sem permissão) falha **em silêncio**, que é o modo de errar
que esta tela inteira existe para evitar.

## 4. O contador

`1.234 / 5.000`, sempre à vista, acima do "Digitar o número", destacado.

- **Soma todos os setores** que este portão valida — decisão do usuário, contra um seletor
  de setor na tela. Um controle a mais para tocar por engano, no escuro, com a fila andando.
- **Conta o que os outros portões leram**, e não só este aparelho.
- O denominador é a **quantidade contratada no ERP**, que é a regra do projeto para lotação.
- Ao lado, em letra menor, `· 12 não enviadas` — as leituras que ainda não subiram.
  Decisão do usuário: junto do contador, e não numa marca separada. Some quando zera.

## 5. A sincronização em background, a cada 5 minutos

Rota **nova e leve**, que desce só o que muda:

- o evento continua ativo?
- setores bloqueados, com motivo
- faixas de números bloqueadas
- **as entradas registradas por qualquer aparelho** desde o último sincronismo
- os totais por setor, para o contador

A lista de ingressos — a parte pesada — continua descendo só quando a gráfica publicar
mais. Em 4G de portão, é a diferença entre alguns kB e várias páginas.

Uma sincronização que falha não interrompe nada e não muda a tela: o portão segue lendo
com o que tem e tenta de novo em cinco minutos. O botão "Atualizar o evento" **sai** — ele
existia porque não havia isto.

## 6. A porta dupla, e como ela fecha

Cinco minutos é tempo de a mesma pessoa entrar por dois portões. Com sinal, isso fecha —
e o jeito honesto é o servidor **decidir quem chegou primeiro**, não apenas responder uma
pergunta que pode se cruzar com outra igual.

Ao ler, o aparelho manda aquela leitura na hora. O servidor **registra a entrada só se
ainda não houver uma** para aquela credencial, e responde qual das duas coisas aconteceu.
Quem perde a corrida ouve `ja_entrou`, com a hora e o nome do portão que ganhou.

**Com teto de 800 ms.** Se o servidor não responder nisso, o aparelho decide sozinho com o
que tem, e a leitura segue para a fila como sempre. O portão **nunca** espera rede — é a
mesma regra que governa o resto desta aplicação.

### Reentrada não entra nessa conta

Setor com `tipo_uso = 'reentrada'` permite sair e voltar: para ele não existe "primeira
entrada", e a corrida não se aplica. A conferência on-line vale **só** para setores de
entrada única.

Por isso a exclusividade **não** pode ser um índice único sobre a tabela de leituras — ela
guarda as duas coisas. Vai numa tabela própria, `producao_acesso_entradas_unicas`, com
`credencial_id` como chave primária, escrita apenas quando o setor é de entrada única. O
`INSERT ... ON CONFLICT DO NOTHING` é quem decide a corrida, e quem decide é o banco: duas
consultas separadas ("já existe?" e depois "grava") podem se cruzar entre dois portões e
deixar os dois entrarem.

## 7. A tela, item a item

| item | o que muda |
|---|---|
| topo | `←` volta para a lista; nome do portão; setores em verde |
| câmera | ocupa o meio, sempre ligada durante a leitura |
| última leitura | faixa verde com setor · número · hora |
| contador | `entraram / contratado · N não enviadas`, destacado |
| rodapé | ícone de lanterna à esquerda, "Digitar o número" ao lado |
| saiu | "Atualizar o evento", "Configurar este aparelho", "Ler o próximo" no caminho feliz |

O `←` **não exige fila zerada**. Aquela trava existe para quando o aparelho troca de
identidade — vira portão de outro evento, com token novo —, e não para ir e voltar da
lista: o token continua o mesmo e a fila sobe igual. Ela permanece onde importa, no "Sair
deste portão" da engrenagem.

A lanterna continua sumindo onde ela não existe de verdade (só o Chrome no Android a
expõe). Botão morto no escuro faz o porteiro achar que o aparelho travou.

## 8. Arquivos

| arquivo | responsabilidade |
|---|---|
| `frontend/portaria.html` | o layout novo |
| `frontend/portaria.js` | o fluxo sem trava no verde, o debounce, o contador |
| `frontend/aviso-sonoro.js` *(novo)* | o bipe e a vibração, puro, sem DOM |
| `frontend/portaria-deposito.js` | entradas vindas do servidor, totais por setor |
| `frontend/portaria-sincronismo.js` *(novo)* | o relógio de 5 minutos e a rota leve |
| `supabase/functions/portaria/index.ts` | as duas rotas novas |
| `sql/schema_acesso_entradas_unicas.sql` *(novo)* | a tabela que decide a corrida |

## 9. Testes

- **`aviso-sonoro.js`**: é puro; os dois padrões (liberado/barrado) e o caso do navegador
  sem `vibrate`, que não pode lançar.
- **O debounce de 2 s**: o mesmo código duas vezes em 500 ms produz **uma** leitura; outro
  código no meio passa na hora; o mesmo código depois de 2 s volta a valer.
- **A corrida**, no servidor: duas entradas simultâneas para a mesma credencial de setor
  único — uma ganha, a outra recebe `ja_entrou`. Setor de reentrada: as duas passam.
- **O teto de 800 ms**: servidor que não responde não pode travar a leitura.
- **O contador**: soma os setores do aparelho e usa a quantidade contratada.
- **No navegador**: o verde não interrompe; o vermelho trava e o "Ler o próximo" volta.

## 10. Publicação

SQL primeiro, funções depois, site e **agente na mesma leva** — o executável embute uma
cópia do frontend.

---

## O que fica de fora, de propósito

- **Seletor de setor na tela.** Decisão do usuário: o contador soma tudo.
- **Baixar a lista de ingressos a cada 5 minutos.** Só o que muda.
- **Bloquear o retorno com fila pendente.** A trava fica no "Sair deste portão".
