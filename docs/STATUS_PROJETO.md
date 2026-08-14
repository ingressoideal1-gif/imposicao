# Status do Projeto — Ideal Imposition

**Última atualização: 13 de agosto de 2026**

Este documento diz onde o projeto está **hoje** e por onde continuar. Se você está
retomando depois de um tempo, comece por aqui.

---

## O que está no ar

| | Versão | Publicado em |
|---|---|---|
| Site + motor | **v560** | 13/08/2026 |
| Agente NewProd | **1.2.59** | 13/08/2026 |

As estações checam atualização a cada 30 minutos. Para adiantar numa delas: menu da
bandeja → **Atualizar agora**.

---

## Onde parou: controle de acesso por QR Ideal

O projeto grande de agosto é dar aos ingressos impressos um código que a portaria saiba
conferir. Ele tem três partes.

### ✅ Parte 1 — o código no papel (**no ar desde a v557**)

O elemento **QR Ideal** no editor de numeração. Cada ingresso sai com um código de 8
caracteres tirado de uma lista de 3 milhões que só existe nas estações da gráfica.

Documentação: [docs/qr_ideal.md](qr_ideal.md) · skill `.claude/skills/qr-ideal/`

### ✅ Parte 2 — o código chega à nuvem (**pronta, aguardando publicação**)

Oito tarefas, todas implementadas e testadas. O ciclo fecha: o agente publica a faixa
sozinho ao imprimir, o atendente gera o QR do Pedido no painel, e o cliente lê com o
celular e cadastra o evento.

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

## ▶️ Para retomar amanhã, nesta ordem

### 1. Configurar três variáveis no Render

Todas com o valor que **já está** no `.env.local` desta máquina:

- `SUPABASE_SERVICE_KEY` — sem ela o router `/api/acesso/*` nem é montado
- `ACESSO_AGENTE_SEGREDO` — sem ela a faixa de códigos nunca é publicada
- `QR_PEDIDO_SEGREDO` — sem ela não dá para gerar o QR do evento

`GET /api/acesso/saude` diz qual está faltando.

> **Armadilha já vivida.** Ao copiar a `SUPABASE_SERVICE_KEY`, um caractere sobrando no
> começo ou um `=` no fim fazem o Supabase responder `401 Invalid API key` — e a chave
> *parece* certa, com `role: service_role` e validade em 2035. A assinatura de um JWT tem
> **43 caracteres** e nunca termina em `=`. Isso já custou meia hora de investigação.

### 2. Publicar

```powershell
.\publicar.ps1 "controle de acesso, parte 2"
.\publicar_agente.ps1 1.2.60
```

Os dois, sempre. O executável embute uma cópia do frontend, e o build do agente agora exige
o `ACESSO_AGENTE_SEGREDO` — ele lê do `.env.local` sozinho.

### 3. O teste que fecha tudo, e que só o usuário pode fazer

1. No painel, num pedido aprovado, clicar em **🎟️ QR do Evento**.
2. Ler o QR com a câmera do celular.
3. Entrar e cadastrar o evento.
4. Conferir no Supabase que `producao_acesso_setores` ganhou um setor por modelo.

Depois, imprimir um trabalho com QR Ideal e conferir que `producao_acesso_credenciais`
recebeu a faixa daquele pedido.

### 4. Então: parte 3

Ela merece a própria spec, como as anteriores.

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

---

## Saúde do repositório

- **223 testes pytest + 107 Pester**, todos passando. `pytest tests/` roda inteiro, sem
  exclusão, em 11 segundos.
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
