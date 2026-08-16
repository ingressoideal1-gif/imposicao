# Desligar o Render e levar a nuvem para o Supabase — decisão e desenho

**Data:** 16/08/2026
**Estado:** decidido, não iniciado. A execução começa em 16/08/2026 pela Fase 1.

---

## A decisão, em uma frase

O servidor do Render deixa de existir. Tudo que ele faz hoje ou vai para o Supabase
(Edge Functions), ou deixa de existir por decisão — que é o caso da imposição na nuvem.

## A decisão que destravou tudo

Durante a conversa, a única função do Render que não tinha para onde ir era a **imposição
na nuvem**: PyMuPDF é Python, e Edge Function é Deno/TypeScript. Enquanto ela existisse, o
Render existia junto.

Em 16/08/2026 o usuário resolveu isso:

> "Até por questão de segurança, impressão só pode acontecer pela estação da gráfica."

Isso vai além do motivo original do agente local. **Tempo** explicava por que o caminho
normal é local; **segurança** explica por que não existe caminho de emergência. Sem
fallback na nuvem, o Render fica sem nenhuma função exclusiva — e pode ser desligado
inteiro.

O ganho de segurança é concreto e independente da migração: hoje, quando o painel não acha
a estação, ele envia **o PDF da arte inteiro** — o material do cliente, centenas de MB —
para um servidor de terceiro, e o operador só vê um selo discreto escrito "NUVEM"
([script.js:10206](../../../frontend/script.js#L10206)).

## Por que migrar, e não só desligar o fallback

Três razões, em ordem de peso.

### 1. O Render é um intermediário que só atrasa

Os três endpoints da portaria ([acesso_portaria.py](../../../acesso_portaria.py)) não têm
lógica pesada nenhuma — são recados para o Supabase:

| Endpoint | O que faz de verdade |
|---|---|
| `POST /entrar` | um PBKDF2 e duas consultas ao Supabase |
| `GET /faixa` | **quatro** consultas ao Supabase, paginadas |
| `POST /leituras` | um upsert e um patch |

O caminho de cada uma dessas consultas é: celular → Render → Supabase → Render → celular.
**Duas travessias de internet por consulta**, num serviço que dorme — tanto que existe uma
gambiarra de pré-aquecimento no [script.js:30098](../../../frontend/script.js#L30098) só
para acordá-lo quando a página abre.

Como Edge Function, isso roda dentro da própria infraestrutura do Supabase: uma travessia,
sem cold start. Quem sente a diferença é o porteiro, no portão, com fila e 4G.

### 2. Uma classe inteira de defeito deixa de ser possível

Hoje o Render roda **o mesmo `app.py`** da estação. Foi exatamente por isso que, em
15/08/2026, a nuvem se declarou "NewProd Agent ativo", o painel acreditou, e a imposição
foi para a rede exibindo o selo "⚡ AGENTE LOCAL" na tela. Está documentado no
[app.py:216](../../../app.py#L216) e coberto por
[tests/test_onde_estou_rodando.py](../../../tests/test_onde_estou_rodando.py).

Precisou-se de uma função (`security_config.is_cloud_runtime()`) só para a nuvem parar de
se passar por estação. Com a nuvem sendo Edge Function, ela **não tem como** se passar por
agente: não é o mesmo código, não responde `/api/status`, não tem o formato. O defeito não
é corrigido — ele deixa de ser possível por construção.

### 3. Os segredos passam a morar em um lugar só

O [render.yaml](../../../render.yaml) declara três variáveis que existem apenas por causa
do Render: `SUPABASE_SERVICE_KEY`, `ACESSO_AGENTE_SEGREDO` e `QR_PEDIDO_SEGREDO`. Elas
somem do inventário de segredos junto com o serviço.

## O risco que eu levantei e depois retirei

Na primeira análise eu disse que reescrever a regra do QR Ideal em TypeScript criaria uma
segunda cópia perigosa da regra de hash — e que isso era o maior risco da migração.

**Está errado, e fica registrado para não ser reapresentado como objeção.** A segunda cópia
já existe e já funciona: o [frontend/qr-ideal-hash.js](../../../frontend/qr-ideal-hash.js)
é o mesmo PBKDF2 do [qr_ideal.py](../../../qr_ideal.py), em JavaScript, rodando no celular
da portaria. E existe um teste que abre um navegador de verdade e compara os dois valores
([tests/test_qr_ideal_hash.py](../../../tests/test_qr_ideal_hash.py)).

Edge Function é Deno, que usa o mesmo `crypto.subtle` do navegador. A função na nuvem
**importa o arquivo que já existe e já é testado**. O número de implementações da regra
continua dois (Python na estação, que publica; JavaScript na nuvem e no celular, que
conferem) — igual a hoje.

## O que se perde, sendo justo

- **Os logs.** O log do Render é hoje a principal ferramenta para descobrir o que deu
  errado em produção. O log de Edge Function é mais pobre e mais chato de ler. É perda
  real, e não há como compensá-la inteiramente.
- **O freio de força bruta vira tabela.** O `_FALHAS` do
  [acesso_portaria.py](../../../acesso_portaria.py) vive na memória do processo, e o
  próprio código já admite que não sobrevive a um reinício do Render. Na Edge Function, que
  é stateless por natureza, ele **precisa** virar tabela. Não é uma regressão da migração —
  é uma dívida existente que a migração obriga a pagar.
- **Um segundo comando de publicação.** Ver abaixo.

## O que muda na publicação — e por que isso precisa ser construído junto

Hoje um `git push` publica **duas** coisas: o site na Vercel e o motor no Render, porque os
dois escutam o mesmo repositório.

Depois da migração, o push publica **só o site**. As Edge Functions saem por um comando
separado (`supabase functions deploy`). Se o `publicar.ps1` não aprender esse passo, o
usuário vai publicar o site achando que publicou tudo — e é exatamente a mesma armadilha
que já existe com o agente, registrada em `agente-publica-junto-com-o-site`.

Portanto: **a Fase 4 não é "desligar o Render", é "ensinar o `publicar.ps1` a publicar as
três coisas".** Desligar o Render é a última linha dela.

O agente continua saindo por `.\publicar_agente.ps1 <versão>`, como sempre, e continua
tendo de sair junto com o site.

---

## O mapa: o que o Render faz hoje, e para onde vai

| Função no Render | Destino | Fase |
|---|---|---|
| `POST /api/impose` (imposição na nuvem) | **Deixa de existir** — decisão de segurança | 1 |
| `/api/acesso/portaria/*` | Edge Function | 2 |
| `/api/acesso/*` (config, publicação, interno, elevação, conta) | Edge Function | 2 |
| Catálogo: formatos, numerações, saídas, cores, modelos, mapas, fontes | Edge Function | 3 |
| Permissões e acessos locais | Edge Function | 3 |
| `GET /api/proxy` e `GET /api/fonte` | Storage direto (o navegador já pode) | 3 |
| `POST /api/email/enviar` | Edge Function | 3 |
| `GET /api/health`, `/api/status`, `/api/version` | Somem — eram do agente, não da nuvem | 4 |
| `GET /api/qr-ideal` | **Não se aplica** — o pool de 24 MB nunca esteve na nuvem | — |
| `POST /api/update`, `/api/update/check` | **Não se aplica** — já recusam na nuvem hoje | — |

O `app.py` **não desaparece**: ele continua sendo o motor da estação, servido pelo
`NewProd.exe`. O que desaparece é a segunda cópia dele rodando no Render.

---

## As quatro fases

Cada fase é publicável sozinha e deixa a aplicação funcionando. Cada uma ganha seu próprio
plano detalhado quando chegar a vez; só a Fase 1 já tem plano escrito.

### Fase 1 — Fechar a porta da imposição na nuvem

**Plano:** [2026-08-16-fechar-a-porta-da-nuvem.md](../plans/2026-08-16-fechar-a-porta-da-nuvem.md)

Independente de todo o resto, e por isso vem primeiro: o ganho de segurança vale por si e
não precisa esperar migração nenhuma.

O painel para de desviar a imposição para o Render, e o motor na nuvem passa a recusar
impor. Quando não há estação, o operador recebe uma recusa clara em vez de um trabalho
lento com a arte viajando para fora da gráfica.

### Fase 2 — Controle de acesso e portaria viram Edge Function

É onde está o ganho de velocidade. Os arquivos envolvidos hoje são
[acesso_api.py](../../../acesso_api.py), [acesso_portaria.py](../../../acesso_portaria.py),
[acesso_config.py](../../../acesso_config.py),
[acesso_interno.py](../../../acesso_interno.py),
[acesso_publicacao.py](../../../acesso_publicacao.py),
[acesso_elevacao.py](../../../acesso_elevacao.py) e
[acesso_conta](../../../frontend/acesso-conta.js) do lado do painel.

Pontos que o plano da Fase 2 terá de resolver, e que já se sabe que existem:

1. **A regra do hash não se reescreve.** A Edge Function importa o
   `frontend/qr-ideal-hash.js`. O teste que compara Python e JavaScript passa a cobrir os
   três consumidores.
2. **O `_FALHAS` vira tabela**, com limpeza por janela de tempo. Sem isso o freio de força
   bruta some — hoje ele já é frágil, mas na Edge Function seria inexistente.
3. **O teto de 1000 linhas do PostgREST continua valendo**, e a paginação de 500 do
   `POR_PAGINA` continua obrigatória pelo mesmo motivo. Está explicado em detalhe no topo
   do `acesso_portaria.py`, e essa explicação tem de viajar junto para o código novo.
4. **A publicação da faixa sai do agente e vai para a Edge Function**, mas quem monta a
   faixa continua sendo o agente em Python — o `acesso_publicacao.py` roda na estação.
   Muda só o destino da chamada.
5. **Migração sem janela de parada:** as duas versões precisam responder ao mesmo tempo
   durante um período, porque o celular da portaria só atualiza quando recarrega a página.
   O plano tem de dizer como fazer o corte sem derrubar um evento em andamento.

### Fase 3 — Catálogo, proxy, fontes e e-mail

Mecânico e de baixo risco, mas volumoso: são cerca de 40 endpoints em
[app.py](../../../app.py) que só repassam chamadas ao `db.py`.

**Não depende de RLS.** Uma Edge Function com a chave de serviço faz exatamente o que o
Render faz hoje. O RLS continua adiado, como decidido, e só se torna necessário se um dia o
navegador for falar direto com o banco — que é mais rápido ainda, mas é decisão separada e
posterior.

O `/api/proxy` e o `/api/fonte` são um caso à parte: no **agente** eles continuam
existindo, porque servem o cache local de fontes e é isso que faz a estação desenhar texto
sem rede. O que some é a cópia deles na nuvem.

### Fase 4 — Ensinar o `publicar.ps1` a publicar tudo, e desligar o Render

1. O `publicar.ps1` passa a publicar site **e** Edge Functions, com o mesmo freio que já
   tem hoje: conferir antes de escrever, e falhar alto se um dos dois não subir.
2. O `conferir.ps1` ganha a pergunta "as Edge Functions publicadas são as do repositório?",
   junto das seis que já faz.
3. Sai o rewrite `/api/*` do [vercel.json](../../../vercel.json) e do
   [frontend/vercel.json](../../../frontend/vercel.json).
4. Sai o [render.yaml](../../../render.yaml), saem as três variáveis do painel do Render,
   sai o `imposicao.onrender.com` do `security_config.ALLOWED_ORIGINS`.
5. Desliga o serviço no Render.

A ordem importa: o serviço só é desligado **depois** de o painel já não apontar para ele há
pelo menos um ciclo de publicação, para que voltar atrás continue sendo `.\voltar.ps1` e
não uma recriação de serviço.

---

## Levantamento de riscos — 16/08/2026

Feito a pedido do usuário antes de começar as Fases 2 a 4, e **medido**, não estimado.
Conclusão curta: **não há bloqueio que impeça a migração.** Há cinco coisas que vão morder,
em ordem de custo, e quatro que pareciam problema e não são.

### 1. O agente instalado é o acoplamento duro — e é o maior risco

`acesso_publicacao.py:31` tem `BASE_PADRAO = "https://imposicao.onrender.com"`, e esse
arquivo é **compilado dentro do NewProd.exe**. Toda estação instalada carrega esse endereço.

Ele é lido de variável de ambiente com esse valor como reserva, então trocá-lo no código é
fácil — o problema é a **frota**. Uma estação que não atualizou continua publicando a faixa
no Render; com o Render desligado, ela **para de publicar em silêncio**: o papel sai
impresso, com QR, e o código nunca chega à nuvem. O operador não tem como perceber — é o
modo de falhar preferido deste projeto.

O agente só atualiza quando está **aberto**, e checa a cada 30 minutos. Uma estação
desligada por uma semana fica com o endereço velho a semana inteira.

**Consequência para a Fase 4:** desligar o Render não é o passo seguinte a publicar. É o
passo seguinte a **confirmar que toda estação ativa já está na versão nova** — dá para
conferir pelo `ultimo_visto` dos agentes. Vale considerar deixar o Render no ar respondendo
só um redirecionamento, por um período de carência.

### 2. `qr-ideal-hash.js` não é um módulo ES

A spec diz que a Edge Function "importa o arquivo que já existe e já é testado". **Não
importa, do jeito que ele está.** O arquivo é uma IIFE que publica o resultado assim:

```js
if (typeof window !== 'undefined') { window.qrIdealHash = qrIdealHash; }
if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }
```

Em Deno não existe `module`, e `window` foi removido no Deno 2. Os dois caminhos falham em
silêncio e a função não sai do arquivo. O conserto é pequeno — acrescentar um `export`
mantendo os dois caminhos legados —, mas **não é zero**, e o `tests/test_qr_ideal_hash.py`
precisa passar a comparar os **três** consumidores, não dois.

### 3. O catálogo já tem duas implementações, e a Fase 3 cria a terceira

`db.py:236` força `IS_SUPABASE_ACTIVE = False` quando `sys.frozen` — ou seja, **na estação
o catálogo é lido do disco**, não do Supabase. Isso é deliberado, e é a razão de o painel
da estação ser rápido.

Então já existem hoje dois caminhos para o mesmo catálogo: JSON local na estação, Supabase
no Render. A Fase 3 acrescentaria um terceiro, em TypeScript, e toda regra que hoje vive no
`db.py` passaria a ter três cópias.

**Vale decidir se a Fase 3 compensa.** Alternativas: deixar o catálogo como está e não
migrar nada dele; ou o navegador falar direto com o PostgREST — mais rápido que as duas, e
dependente do RLS, que está adiado por decisão.

### 4. O freio de força bruta precisa virar tabela

`acesso_portaria.py:60`: `_FALHAS = {}` na memória do processo. Edge Function é stateless
por natureza — sem tabela, o freio das dez tentativas em cinco minutos deixa de existir. Já
estava previsto na spec; o levantamento confirma que é a **única** estrutura em memória no
caminho da portaria.

### 5. A publicação vira três comandos

Já registrado acima. O `publicar.ps1` precisa aprender antes de o Render sair.

---

### O que **não** é problema (verificado, não suposto)

**Nenhuma dependência exclusiva de Python no caminho migrado.** Os módulos de acesso
importam só biblioteca padrão — `hashlib`, `hmac`, `json`, `urllib`, `secrets`, `re`,
`time`, `base64`, `datetime`, `collections` — mais o FastAPI. Nada de PyMuPDF, Pillow ou
reportlab. Todos têm equivalente direto em Deno (`crypto.subtle`, `fetch`).

**O tamanho das respostas cabe.** Medido contra produção: a faixa inteira do evento de
2.000 ingressos — a resposta mais pesada de todas, a que o celular baixa e guarda — dá
**423 KB**, em cinco páginas. Projetando para 12.000 ingressos, ~2,5 MB. Longe de qualquer
limite de Edge Function.

**O endpoint de e-mail é código morto.** `/api/email/enviar` usa `smtplib`, que é TCP cru e
seria de fato impossível numa Edge Function. Mas a busca por chamadores no frontend e no
Python devolve **zero** — só a própria definição. É caso de apagar, não de migrar.

**`/api/proxy` traduz direto.** Usa `requests.get` com allowlist; em Deno é `fetch` com a
mesma allowlist. E continua existindo no **agente** de qualquer jeito, porque serve o cache
local de fontes.

---

### Ferramenta que falta

Não existe pasta `supabase/` no repositório e **a CLI do Supabase não está instalada** nesta
máquina. O primeiro passo da próxima sessão é instalar, `supabase init` e `supabase link`.

### O que não deu para verificar daqui

**O plano do projeto Supabase.** A chave que temos é de projeto (`service_role`), não de
gerência, então a API de gerenciamento não responde. Edge Functions existem em todos os
planos, inclusive o gratuito, então não espero bloqueio — mas os limites de invocação do
plano atual valem uma olhada no painel antes da Fase 2.

---

## O que fica registrado como fora de escopo

- **RLS.** Continua adiado por decisão do usuário. A migração foi desenhada para não
  depender dele.
- **Trocar o Supabase de projeto ou de plano.** Nada aqui exige isso.
- **Mexer no agente além do necessário.** O `app.py` continua servindo a estação com o
  mesmo código; a Fase 1 acrescenta uma recusa que só se ativa na nuvem.
