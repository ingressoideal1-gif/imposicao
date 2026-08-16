# Fase 2b — o resto do controle de acesso vira Edge Function

**Data:** 16/08/2026
**Estado:** desenho, aguardando decisão
**Vem depois de:** `2026-08-16-portaria-edge-function.md` (Fase 2a, fechada na v595)

---

## O tamanho real disto

A portaria eram 3 rotas e um consumidor. A Fase 2b são **30 rotas, ~2.400 linhas de
Python e quatro consumidores diferentes**, cada um com sua própria forma de se
autenticar.

| Arquivo | Rotas | Linhas |
|---|---|---|
| `acesso_config.py` | 10 | 826 |
| `acesso_interno.py` | 12 | 739 |
| `acesso_api.py` | 8 | 775 |
| `acesso_elevacao.py` | — (biblioteca) | 115 |
| `acesso_publicacao.py` | — (cliente, roda na estação) | 292 |

Tratar isso como "a portaria, de novo, só que maior" seria o erro. A portaria tinha um
consumidor (o celular) e um modo de autenticar (token de aparelho). Aqui há quatro de
cada, e eles não podem migrar juntos.

---

## Os quatro consumidores

Esta é a divisão que governa todo o resto do desenho.

### 1. A estação — `acesso_publicacao.py` dentro do `NewProd.exe`

Publica a faixa de códigos **depois** que o papel saiu. Chama `/pedidos/{p}/abrir`,
`/pedidos/{p}/credenciais` e `/pedidos/{p}/fechar`. Autentica com o segredo compartilhado
`ACESSO_AGENTE_SEGREDO`, conferido com `hmac.compare_digest` em `acesso_api.py:202`.

**É o mais perigoso dos quatro, e por isso vai por último.** Quando ele falha, o papel já
saiu. Os ingressos existem fisicamente e não valem no banco, e ninguém descobre até
alguém tentar entrar — dias depois, no portão. Todos os outros três falham na frente de
quem está olhando.

### 2. O painel da gráfica — `script.js:15062`

Uma rota só: `/pedidos/{p}/qr`, que gera o QR do Pedido. Autentica com o JWT do Supabase.

**O risco aqui é o mais irreversível de todos** e merece ser dito com clareza: esses QR
já estão no WhatsApp dos clientes. A assinatura é HMAC com `QR_PEDIDO_SEGREDO`, 27
caracteres base64url. Portar isso para Deno com **um byte de diferença** invalida todo QR
em circulação, e a descoberta acontece quando um cliente tentar abrir o dele.

### 3. A tela do cliente — `acesso-conta.js`

Fala com `/api/acesso/*`: `/evento`, `/meus-eventos`, `/reivindicar`, mais as dez rotas de
`acesso_config.py` (setores, bloqueios, aparelhos, códigos). Autentica com o JWT da conta
do Vibe **mais** um bilhete de elevação de 15 minutos, assinado com
`ACESSO_ELEVACAO_SEGREDO`.

### 4. A tela interna da gráfica — `ideal-control.js`

Fala com `/api/acesso/interno/*`, 12 rotas. Autentica com JWT **e** papel (ADM ou
Atendimento) lido de `imposition_user_permissions`.

---

## Decisão de arquitetura: quatro funções, não uma

Uma função `acesso` com 30 rotas seria um arquivo enorme com um único raio de explosão:
um erro de digitação no roteamento derrubaria a portaria do cliente junto com a publicação
da estação.

**Quatro Edge Functions, uma por consumidor**, espelhando a divisão acima:

| Função | Substitui | `verify_jwt` |
|---|---|---|
| `acesso-interno` | `acesso_interno.py` | `true` |
| `acesso-conta` | `acesso_config.py` + parte de `acesso_api.py` | `true` |
| `acesso-pedido` | `/pedidos/{p}/qr` | `true` |
| `acesso-estacao` | `/pedidos/{p}/{abrir,credenciais,fechar}` | **`false`** |

`acesso-estacao` é a única com `verify_jwt = false`, pela mesma razão da portaria: a
estação manda um segredo nosso, não um JWT do Supabase. As outras três recebem JWT de
verdade — e aí está um ganho que a portaria não teve.

### O ganho que só aparece aqui

Hoje, `_usuario_logado` (`acesso_api.py:479`) faz uma requisição do Render para o
`/auth/v1/user` do Supabase **a cada chamada**, só para saber quem está falando. Numa Edge
Function isso desaparece duas vezes: o portão do Supabase já confere a assinatura do JWT
antes de invocar a função, e o `sub` sai das claims sem rede nenhuma.

Some-se a isso a travessia que a Fase 2a já eliminou na portaria (navegador → Render →
Supabase vira navegador → Supabase) e a tela do dono deixa de pagar **duas** idas à rede
por requisição.

---

## A ordem, e por que ela é esta

1. **`acesso-interno`** — a tela da própria gráfica. Se quebrar, quem vê é a equipe, na
   hora, e o Render continua no ar. É o ensaio mais barato.
2. **`acesso-conta`** — a tela do cliente. Mais rotas e a elevação entra em cena.
3. **`acesso-pedido`** — o QR do Pedido. Sozinho, porque a paridade criptográfica dele
   precisa de atenção que não cabe dividida com outra coisa.
4. **`acesso-estacao`** — por último, e só depois do pré-requisito abaixo.

Cada corte segue o padrão que a Fase 2a provou: as duas pilhas no ar ao mesmo tempo, teste
de paridade contra o banco de verdade, corte de uma linha, e volta atrás trocando de volta.

---

## O bloqueador que apareceu ao medir

**A tabela `print_agents` não guarda a versão do agente.** Consultada em 16/08/2026: 11
estações registradas, nenhuma coluna de versão. Pior, o campo `status` diz `online` para
máquinas cujo `last_seen` é de 06/08 — ele não significa nada.

Isso importa porque o corte da estação depende de saber **quando todas migraram**. O
endereço da estação não está congelado no executável — `acesso_publicacao.py:30` lê
`ACESSO_BASE_URL` do ambiente e só cai no Render como padrão —, então trocar é publicar
uma versão nova do agente. Mas as estações atualizam cada uma no seu ritmo, e desligar a
rota do Render antes que a última migre significa uma gráfica imprimindo ingressos que
nunca são publicados.

**Pré-requisito da etapa 4:** o heartbeat passa a reportar a versão, e `print_agents` ganha
uma coluna para ela. É mudança pequena no agente, e vale fazer cedo — ela também conserta
a conferência de sincronia do `conferir.ps1`, que hoje só enxerga a máquina local.

---

## Os três segredos

`ACESSO_AGENTE_SEGREDO`, `QR_PEDIDO_SEGREDO` e `ACESSO_ELEVACAO_SEGREDO` passam a viver
também nos secrets do Supabase (`supabase secrets set`), sem rotação: **o mesmo valor** dos
dois lados enquanto as duas pilhas convivem. Rotacionar durante a transição quebraria o
lado que ainda não migrou.

O `ACESSO_AGENTE_SEGREDO` tem uma terceira cópia, embutida no `NewProd.exe` pelo
`acesso_segredo.py` que o build gera. Essa não muda.

---

## O trabalho criptográfico, que é o coração do risco

A Fase 2a portou uma função de hash e provou a paridade contra o banco. Aqui são **duas
assinaturas HMAC**, e as duas geram bilhetes que já existem por aí:

| | Segredo | Quem já tem bilhete emitido |
|---|---|---|
| QR do Pedido (`qr_pedido.py`) | `QR_PEDIDO_SEGREDO` | clientes, no WhatsApp |
| Elevação (`acesso_elevacao.py`) | `ACESSO_ELEVACAO_SEGREDO` | ninguém — vence em 15 min |

A elevação é segura de portar: nenhum bilhete sobrevive quinze minutos, então um erro
aparece na hora e não deixa rastro. **O QR do Pedido não tem essa rede.**

Por isso o desenho propõe, para o `acesso-pedido`, uma prova mais forte que a da portaria:
antes do corte, a função nova **confere** tokens que o Python emitiu e o Python **confere**
tokens que ela emitiu — nos dois sentidos, com casos de mesa gravados no repositório. Só
depois disso ela passa a emitir.

Os dois módulos montam o corpo assinado por concatenação com pontos e recusam campo com
ponto dentro (`acesso_elevacao.py:37`); o porte precisa manter essa recusa, senão dá para
deslocar campos e fazer uma assinatura valer para outra combinação.

---

## O que esta fase deliberadamente NÃO faz

- **Não desliga o Render.** Isso é a Fase 3, e só depois que as quatro funções estiverem
  no ar e as estações todas migradas.
- **Não mexe na portaria**, que já está do outro lado.
- **Não rotaciona segredo nenhum.**
- **Não toca no `qr-ideal-hash.js`** do navegador.

---

## Riscos, do maior para o menor

1. **QR do Pedido em circulação** — um byte de diferença no HMAC invalida o que já está com
   os clientes. Mitigação: paridade nos dois sentidos antes de emitir.
2. **Publicação da estação falha em silêncio** — papel impresso, ingresso inválido,
   descoberto no portão. Mitigação: vai por último, e só depois de o heartbeat reportar
   versão.
3. **Elevação divergente** — o dono perde acesso de configuração, ou o pior: ganha sem
   direito. Mitigação: casos de mesa nos dois lados; a validade curta limita o estrago.
4. **Papel lido diferente** (`imposition_user_permissions`) — alguém vê tela que não devia.
   Mitigação: teste de paridade com usuários de papéis diferentes.
5. **CORS** — foi o defeito que quase escapou na Fase 2a. Já existe `origemPermitida` em
   `supabase/functions/portaria/puro.ts`; as quatro funções devem reusar, não recopiar.

---

## O que preciso de você

Uma decisão, e ela muda o tamanho do trabalho:

**A etapa 4 (estação) entra nesta fase ou vira a Fase 2c?** Ela é a única que depende de
mudar o agente e esperar 11 estações migrarem — trabalho de dias, não de horas, e com
janela de risco em produção. As três primeiras não dependem dela e podem ir inteiras.

Minha recomendação: **fazer 1, 2 e 3 agora, e a estação depois**, com o conserto do
heartbeat começando junto (é pequeno e destrava a medição enquanto o resto anda).
