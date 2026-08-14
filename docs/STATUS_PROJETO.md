# Status do Projeto — Ideal Imposition

**Última atualização: 14 de agosto de 2026**

Este documento diz onde o projeto está **hoje** e por onde continuar. Se você está
retomando depois de um tempo, comece por aqui.

---

## O que está no ar

| | Versão | Publicado em |
|---|---|---|
| Site + motor | **v561** | 14/08/2026 |
| Agente NewProd | **1.2.60** | 14/08/2026 |

As estações checam atualização a cada 30 minutos. Para adiantar numa delas: menu da
bandeja → **Atualizar agora**.

**O controle de acesso está ativo no servidor.** Conferido em 14/08 contra o Render, não
assumido:

```
GET /api/acesso/saude
{"ok":true,"variaveis":{"SUPABASE_SERVICE_KEY":true,"ACESSO_AGENTE_SEGREDO":true,
 "QR_PEDIDO_SEGREDO":true},"faltando":[],"banco":"ok"}
```

As oito rotas `/api/acesso/*` respondem, e as quatro travas seguraram: publicar faixa sem o
segredo do agente, gerar QR sem login, listar eventos sem login e trocar um token falso
pelo esqueleto — **401 em todas**.

> **Há dois serviços no Render nesta conta.** O certo é o chamado **`imposicao`**, que
> atende `https://imposicao.onrender.com`. As variáveis foram parar no outro na primeira
> tentativa, e o sintoma foi enganoso: `/api/acesso/saude` respondendo **404**, não 503 —
> porque sem a `SUPABASE_SERVICE_KEY` o `app.py` não monta o router, e a rota simplesmente
> não existe. Para confirmar que é o serviço certo antes de colar, compare o commit que o
> Render mostra com `git rev-parse --short origin/main`.

---

## Onde parou: controle de acesso por QR Ideal

O projeto grande de agosto é dar aos ingressos impressos um código que a portaria saiba
conferir. Ele tem três partes.

### ✅ Parte 1 — o código no papel (**no ar desde a v557**)

O elemento **QR Ideal** no editor de numeração. Cada ingresso sai com um código de 8
caracteres tirado de uma lista de 3 milhões que só existe nas estações da gráfica.

Documentação: [docs/qr_ideal.md](qr_ideal.md) · skill `.claude/skills/qr-ideal/`

### ✅ Parte 2 — o código chega à nuvem (**no ar desde a v561**)

Oito tarefas, todas implementadas e testadas. O ciclo fecha: o agente publica a faixa
sozinho ao imprimir, o atendente gera o QR do Pedido no painel, e o cliente lê com o
celular e cadastra o evento.

Publicada em 14/08/2026, com as três variáveis configuradas no Render e conferidas por
fora. **Falta o teste de ponta a ponta com um pedido de verdade** — ver abaixo.

Documentação: [docs/controle_acesso.md](controle_acesso.md)
Plano: [docs/superpowers/plans/2026-08-13-controle-acesso-parte2.md](superpowers/plans/2026-08-13-controle-acesso-parte2.md)
Spec: [docs/superpowers/specs/2026-08-13-controle-acesso-parte2-design.md](superpowers/specs/2026-08-13-controle-acesso-parte2-design.md)

**As sete tabelas `producao_acesso_*` já existem no banco** e foram conferidas uma a uma.

### ⏳ Parte 3 — o aplicativo da portaria (**não começou**)

É a maior das três. O que ela precisa entregar está no fim do
[docs/controle_acesso.md](controle_acesso.md), com as decisões que o usuário já tomou.

Em resumo: validação **local de verdade** com IndexedDB (o `sw.js` de hoje só guarda os
arquivos da tela — a portaria para quando a rede cai), login do cliente, aparelhos com
lista de setores própria, senha do dono travando a configuração do evento, reentrada,
lotação ao vivo e relatórios. Mais a mudança do Ideal Control (hoje em
`../ideal-IdealControl/`) para dentro deste repositório.

---

## ▶️ Por onde continuar

### 1. O teste que fecha tudo, e que só o usuário pode fazer

O servidor está pronto e provado por fora, mas **nenhum pedido de verdade passou pelo ciclo
inteiro ainda**. Este é o passo que falta:

1. No painel, num pedido aprovado, clicar em **🎟️ QR do Evento**.
2. Ler o QR com a câmera do celular.
3. Entrar e cadastrar o evento.
4. Conferir no Supabase que `producao_acesso_setores` ganhou um setor por modelo.

Depois, imprimir um trabalho com QR Ideal e conferir que `producao_acesso_credenciais`
recebeu a faixa daquele pedido.

### 2. Então: parte 3

Ela merece a própria spec, como as anteriores.

---

## Como configurar as variáveis do Render (para a próxima vez)

Já feito em 14/08. Fica registrado porque um serviço novo, ou uma troca de segredo, refaz
este caminho.

São três, todas com o valor que já está no `.env.local` desta máquina:

- `SUPABASE_SERVICE_KEY` — sem ela o router `/api/acesso/*` nem é montado
- `ACESSO_AGENTE_SEGREDO` — sem ela a faixa de códigos nunca é publicada
- `QR_PEDIDO_SEGREDO` — sem ela não dá para gerar o QR do evento

```powershell
.\ferramentas\copiar_para_render.ps1
```

Ele confere as três, põe uma de cada vez na área de transferência (o valor **não** aparece
na tela) e espera você colar no Render antes de passar para a próxima. Com `-Conferir`, só
confere e sai; com `-Somente <NOME>`, copia uma e não limpa nada.

**A ordem é: variáveis primeiro, publicação depois** — senão o primeiro deploy sobe sem a
chave e o router não monta. Mas a conferência só funciona ao contrário: enquanto o Render
rodar código sem o `acesso_api`, o `/api/acesso/saude` responde **404**, e isso não é erro
de configuração.

> **Armadilha já vivida, e a razão de o script existir.** Ao copiar a
> `SUPABASE_SERVICE_KEY` com o mouse, um caractere sobrando no começo ou um `=` no fim fazem
> o Supabase responder `401 Invalid API key` — e a chave *parece* certa, com
> `role: service_role` e validade em 2035. A assinatura de um JWT tem **43 caracteres** e
> nunca termina em `=`. Isso já custou meia hora de investigação, e o script pega as duas
> violações.

E publicar é sempre os dois — site e agente, com número de versão novo:

```powershell
.\publicar.ps1 "mensagem"
.\publicar_agente.ps1 <versao>
```

O executável embute uma cópia do frontend, e o build do agente exige o
`ACESSO_AGENTE_SEGREDO` — ele lê do mesmo `.env.local` de onde saiu o valor colado no
Render, então os dois lados batem sem ninguém conferir.

---

## Riscos e pendências conhecidas

**RLS das tabelas antigas continua desligado.** É o maior risco em aberto do projeto:
chave anônima pública + RLS off significa que qualquer um lê e escreve o banco compartilhado
com o parceiro Vibecode, incluindo dados de clientes. Foi **decisão informada** do usuário
em 06/08/2026 ("nossa aplicação está em testes ainda, usuários restritos"), não esquecimento.

As sete tabelas do controle de acesso **nascem fechadas** — RLS ligado, zero políticas — e
isso não reabre aquela decisão: elas não têm tela lendo direto.

**Risco residual do controle de acesso.** Quem tiver o segredo do agente e pegar a janela
entre `abrir` e `fechar` consegue ocupar uma posição da tiragem com um hash próprio. A
parte 3 endereça, cruzando o total publicado com o que o ERP encomendou.

**`producao_produtos_formatos` tem uma chave única que não pega.** Declara
`UNIQUE (empresa_id, id_produto)` com `empresa_id` sempre nulo, e em Postgres nulo é
distinto de nulo dentro de índice único. A tabela está vazia, então não há dado errado —
mas a restrição não faz o que o nome promete.

**A migração `sql/schema_acesso_02` é opcional.** Ela só remove um índice redundante. Sem
ela, nada quebra.

**O `catalogo_fontes` promete uma coisa e o código faz outra.** O
`sql/schema_catalogo_fontes.sql` existe desde 30/07 e **nunca foi aplicado**, então o
Supabase responde 404 e o [db.py:1095](../db.py#L1095) desiste na primeira tentativa e usa o
catálogo local — que é o que sempre funcionou de verdade. Nada quebra, mas cada arranque
imprime duas linhas vermelhas no log, e log vermelho rotineiro treina qualquer um a ignorar
log vermelho. Duas saídas: aplicar o SQL e reiniciar, ou apagar o arquivo e assumir que o
catálogo é local por decisão. Hoje temos o pior dos dois.

---

## Saúde do repositório

- **228 testes pytest + 120 Pester**, todos passando. `pytest tests/` roda inteiro, sem
  exclusão, em cerca de 20 segundos — quase metade num teste só, o que publica 1.200
  credenciais de verdade pelo KDF lento.
- Em 13/08 a suíte foi recuperada: **dez** arquivos não rodavam, e um deles disparava um
  POST de verdade contra o Render de produção a cada execução.
  `tests/test_a_suite_esta_sa.py` impede a reincidência.
- Rode `.\ferramentas\conferir.ps1` antes de qualquer trabalho substantivo. Ele só consulta,
  e responde as seis perguntas que importam.

---

## Pendências antigas, não verificadas

Estavam neste documento desde 18/06/2026 e **não foram conferidas** nesta atualização.
Podem já ter sido feitas:

- Painel da Produção: retirar o "valor" abaixo do número do pedido e dar mais destaque ao
  número.
- Lista de Arte: o mesmo — retirar o valor, destacar o número do pedido.
