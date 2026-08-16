# Fase 2b — execução

> Desenho: `docs/superpowers/specs/2026-08-16-fase-2b-acesso-para-edge-functions-design.md`

**Objetivo:** as 30 rotas de `/api/acesso/*` que sobraram passam a rodar como Edge Function
ao lado do banco, em quatro funções, sem janela de parada.

**Arquitetura:** quatro funções (`acesso-interno`, `acesso-conta`, `acesso-pedido`,
`acesso-estacao`), cada uma com o padrão que a Fase 2a provou: as duas pilhas no ar ao mesmo
tempo, teste de paridade contra o banco de verdade, corte de uma linha no frontend.

## Restrições globais

- **`POR_PAGINA` abaixo de 1000** em qualquer paginação nova — `max_rows = 1000` do PostgREST
  vence qualquer `limit` da URL, caladamente.
- **Datas na querystring terminam em `Z`**, nunca `+00:00` — o `+` decodifica como espaço e o
  PostgREST devolve 400. Já mordeu em 16/08/2026.
- **Nenhum segredo é rotacionado** enquanto as duas pilhas convivem: o mesmo valor dos dois
  lados.
- **CORS reusa `_compartilhado/cors.ts`**, nunca recopia. Foi o defeito que quase escapou na
  Fase 2a.
- **Verificar com o comando cru**, nunca `| tail` — o código de saída do cano é o do `tail`,
  e isso já me fez declarar verde uma coisa vermelha.
- **`deno check` e `deno test` rodam por `npx deno`** nesta máquina; não há `deno` no PATH.

---

## Tarefa 0: a fundação compartilhada

**Arquivos:**
- Criar: `supabase/functions/_compartilhado/cors.ts`
- Criar: `supabase/functions/_compartilhado/assinatura.ts`
- Criar: `supabase/functions/_compartilhado/assinatura_test.ts`
- Criar: `supabase/functions/_compartilhado/sessao.ts`
- Modificar: `supabase/functions/portaria/puro.ts` (passa a importar de `cors.ts`)

**Produz:** `origemPermitida`, `comCors`, `respostaDePreflight`; `assinarBilhete`,
`conferirBilhete`; `usuarioDoJwt`, `papelDoUsuario`.

`cors.ts` recebe o que hoje está em `portaria/puro.ts`, sem mudar comportamento — os testes
de origem que já existem continuam passando.

`assinatura.ts` é o HMAC-SHA256 base64url que `qr_pedido.py` e `acesso_elevacao.py` usam. Os
dois montam o corpo por concatenação com pontos e **recusam campo com ponto dentro**; sem
essa recusa dá para deslocar campos e fazer uma assinatura valer para outra combinação.

`sessao.ts` tira o `sub` das claims do JWT (sem rede — o portão do Supabase já conferiu a
assinatura) e lê o papel em `imposition_user_permissions`.

---

## Tarefa 1: `acesso-interno` — a tela da própria gráfica

12 rotas, papel ADM ou Atendimento. É o ensaio mais barato: se quebrar, quem vê é a equipe,
na hora, e o Render continua no ar.

---

## Tarefa 2: `acesso-conta` — a tela do cliente

As 10 rotas de `acesso_config.py` mais `/evento`, `/meus-eventos` e `/reivindicar`. A
elevação de 15 minutos entra aqui.

---

## Tarefa 3: `acesso-pedido` — o QR do Pedido

Uma rota. A paridade é nos dois sentidos: a função confere token que o Python emitiu, e o
Python confere token que ela emitiu. Hoje não há QR em circulação, mas o dia em que houver
chega sem avisar.

---

## Tarefa 4: `acesso-estacao` — a publicação da faixa

Três rotas, segredo compartilhado, `verify_jwt = false`. A idempotência do `_abrir_pedido` é
o que não pode regredir: reabrir devolve o MESMO sal, senão os ingressos já impressos param
de valer.

---

## Tarefa 5: o heartbeat passa a reportar versão

`print_agents` ganha coluna de versão e o agente a preenche. Destrava saber quando as 11
estações migraram — e conserta a conferência do `conferir.ps1`, que hoje só enxerga a
máquina local.

---

## Tarefa 6: os cortes

Um por vez, cada um com sua paridade verde antes.

---

# Fechada em 16/08/2026

As seis tarefas foram executadas. As cinco funções estão no ar, os quatro consumidores
foram cortados, e o Render continua respondendo o mesmo endereço antigo como volta atrás.

## O que o plano previu errado, e o que isso ensinou

**O bloqueador do heartbeat não era bem um bloqueador.** O plano dizia que `print_agents`
não guardava a versão do agente. Não guardava em *coluna* — mas o heartbeat já a mandava
dentro do `printers_json` havia semanas. O que faltava era alguém **olhar**: a conferência
diária respondia "esta máquina está em dia?" quando a pergunta era "as onze estações
estão?". Consultar o banco antes de escrever custou dois minutos e mudou a tarefa inteira.

**Deduzir o comportamento do FastAPI em vez de medi-lo custou quatro divergências.** O 404
e o 405 do Render dependem do MÉTODO, e não do caminho: `GET /pedidos/1/qr` responde 404
mesmo com o caminho existindo para POST, porque o apanhador de arquivos estáticos do
`app.py` casa qualquer GET. Quem descobriu foram os testes de paridade, rodando contra as
duas pilhas — e a mesma dedução errada já estava na `acesso-interno` desde a Tarefa 1,
onde o teste dela só exercitava GET.

**Consolidar duplicações revelou três defeitos** que nenhum teste pegaria: o sal de evento
novo saía com metade dos bytes, o nome padrão do setor divergia entre as duas pilhas, e o
preflight não autorizava os cabeçalhos da elevação — este último teria bloqueado **toda
escrita** da tela do dono, no navegador, sem log nenhum do nosso lado.

## O que ficou provado contra o banco de verdade

41 casos de paridade, nas quatro pilhas. Os dois que valem por todos:

- **O QR do Pedido, nos dois sentidos:** o token que uma pilha emite, a outra abre. Os
  casos de mesa provam o algoritmo; só isto prova que as duas usam o mesmo **segredo de
  produção** — que é o que invalidaria QR em circulação.
- **O sal do pedido é o mesmo nas duas.** Se regredisse, todo ingresso já impresso pararia
  de valer, e a descoberta seria na portaria do evento.

## O que a Fase 3 precisa antes de desligar o Render

O `conferir.ps1` agora conta quantas estações falam com cada pilha, lendo o `acesso_base`
que o heartbeat reporta. Enquanto houver uma apontando para `imposicao.onrender.com`, o
Render fica. Duas estações rodam agente velho demais para reportar qualquer coisa
(`PRD-ACABAMENTO` e `CESAR-CPD`) — elas precisam atualizar antes de a conta fechar.
