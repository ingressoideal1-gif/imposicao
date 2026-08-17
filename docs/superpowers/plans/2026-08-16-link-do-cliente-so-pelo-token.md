# O link do cliente passa a valer só pelo token

**Data:** 16/08/2026
**Estado:** Tarefas 1 e 2 feitas. Tarefas 3 e 4 escritas, não iniciadas.

---

## O que foi medido, e não suposto

Com a chave anônima — a que está no código-fonte de **toda** página do painel, e
que qualquer pessoa lê com Ctrl+U:

```
GET  /rest/v1/pedidos_links_cliente?select=*     ->  200, 42 linhas, com TOKEN
```

E os privilégios de tabela, lidos do próprio banco em 16/08/2026:

```
anon           -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE
authenticated  -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE
```

`relrowsecurity = false`: a tabela não tem RLS. Ou seja, a chave pública não só
**lista todos os links de aprovação com os tokens** — ela apaga a tabela inteira.

## Por que isso é grave em produção, e não no papel

O token é a única coisa que separa o link de aprovação do resto da internet. Com
a lista na mão:

1. Abre-se a arte de qualquer cliente da gráfica.
2. Marca-se qualquer pedido como **`APROVADO`** sem que ninguém tenha aprovado.
   Aprovação de arte é autorização de imprimir — é dinheiro, papel e tempo de
   máquina.
3. Apaga-se a tabela, e com ela todos os links já enviados a clientes.

Nada disso é regressão da saída do Render: a tabela nasceu assim, em maio. O que
mudou é que agora sabemos.

## O que NÃO resolve

Fechar `/api/mapas_teatro` e as outras rotas de catálogo do Render. Foi a minha
primeira ideia e está errada: a chave anônima lê as mesmas tabelas direto no
PostgREST. A porta não é o Render, é o privilégio de tabela.

## O desenho

O caminho já existe neste repositório e é o do **catálogo de fontes**, fechado em
16/08: quem escreve não fala com a tabela, fala com uma função que confere quem é
antes de escrever. Aqui há dois tipos de quem, e eles precisam de portas
diferentes.

**O cliente** não tem login, e nunca vai ter — a página dele abre por um link
mandado no WhatsApp. O que ele tem é o **token**. Então a porta dele é uma função
no banco (`SECURITY DEFINER`) que recebe número e token, confere, e devolve ou
escreve **só aquela linha**. Sem token certo, a função não devolve nada — e não
existe consulta que liste as outras.

**O painel** tem login na nuvem, mas na estação o operador entra pelo código
local e pode não ter sessão nenhuma do Supabase. É exatamente o dilema que o
catálogo de fontes já resolveu: nuvem pela Edge Function `painel` (com sessão),
estação pelo relay `acesso-estacao` (com o `ACESSO_AGENTE_SEGREDO` do agente).

Só depois que os dois lados tiverem porta é que a tabela pode ser fechada. A
ordem importa mais do que a pressa: fechar antes derruba a aprovação do cliente
em produção, que é uma tela que a gráfica não pode perder.

---

## As quatro tarefas

### Tarefa 1 — As funções no banco (aditivo, não fecha nada)

`sql/link_cliente_funcoes.sql`, com duas funções `SECURITY DEFINER` e
`search_path` fixado:

- `link_cliente_abrir(p_numero, p_token)` — confere o par, conta o acesso e
  devolve a linha **sem o token**. Devolver o token de volta seria entregar ao
  navegador do cliente exatamente o que estamos protegendo.
- `link_cliente_status(p_numero, p_token, p_status)` — confere o par e grava o
  status. Aceita apenas os três valores que a página do cliente escreve hoje
  (`APROVADO`, `Em Alteração`, `Enviar Arte`); qualquer outro é recusado, para
  que o token não vire caneta livre sobre a coluna.

Pode rodar a qualquer momento: só acrescenta.

### Tarefa 2 — `cliente.js` passa a usar as funções

Quatro pontos de chamada, todos com o token já em mãos: validar o link, contar o
acesso (que virou parte de abrir), aprovar e pedir alteração. Enquanto a tabela
seguir aberta, o comportamento é idêntico — a diferença aparece só na Tarefa 4.

Sobra **um** uso direto no `cliente.js`, e ele fica de propósito: o bloco
AUTO-STATUS, que só roda no contexto interno (`isInternal`) e ali é cópia morta,
porque a página do cliente sempre define o container dela. Ele pertence à Tarefa
3. O `tests/test_link_do_cliente_pelo_token.py` prende o número em **um**: uma
escrita direta nova derruba o teste antes de a Tarefa 4 fechar a porta.

### Tarefa 3 — O painel para de escrever direto na tabela

Treze pontos em `script.js`, todos escrita de `status_arte` ou criação de link
(`getOrCreateLinkCliente`). Vão para a Edge Function `painel`, com o relay pela
`acesso-estacao` para o caso da estação sem sessão.

É a tarefa mais cara e a que exige mais cuidado: é o fluxo da Fila de Arte, que
está aprovado e rodando. Merece o teste de tela que o projeto já usa.

### Tarefa 4 — Fechar a tabela

`REVOKE ALL ... FROM anon, authenticated`, `GRANT` só a `service_role`, RLS
ligado, e `GRANT EXECUTE` das duas funções a `anon`.

Vale a lição já escrita no `sql/rls_passo3_fechar_leitura.sql`: **REVOKE, e não
política ausente.** Política ausente devolve `200` com lista vazia, e código que
não distingue "não achei" de "não posso" trata lista vazia como resposta boa.
REVOKE devolve `401`, que ninguém confunde com dado.

Só rodar depois de a Tarefa 3 estar **publicada** e rodando por um ciclo.

---

## As outras quatro tabelas sem RLS

Encontradas na mesma auditoria, com os mesmos privilégios abertos a `anon`:
`producao_ordens_servico`, `producao_os_itens`, `producao_os_log`,
`producao_usuarios`. **As quatro estão vazias hoje** — zero linhas —, então não
há vazamento, mas há porta: qualquer um insere linha nelas.

Ficam fora deste plano de propósito. Fechá-las é mais simples (nada as lê pela
chave pública), e vale um passo próprio depois que este terminar.
