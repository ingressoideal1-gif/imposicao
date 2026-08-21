# Peso estimado por setor e senha semanal de liberação — desenho

**Data:** 2026-08-21 · **Pedido do usuário:** no Painel do Acabamento, ao lado do
campo de Peso Real de cada setor, mostrar o **peso estimado** (soma dos pesos dos
produtos daquele setor no pedido). O peso real digitado **não pode divergir mais de
5 %** do estimado; acima disso abre um **popup exigindo a senha de liberação**. A
senha é **gerada automaticamente uma vez por semana**, tem **3 caracteres (1 letra +
2 números)** e **aparece no menu Usuários**.

## 1. De onde vem o estimado

O ERP não guarda "peso estimado por setor". Ele guarda o estimado **por linha da
proposta**, em gramas:

| Coluna | O que é |
|---|---|
| `produtos_proposta.peso_base` | copiado de `produtos.peso` (gramas) ao criar a linha |
| `produtos_proposta.peso_extra` | soma das variações (`recalcular_produto_com_variacoes`) |
| `produtos_proposta.peso_uni` | `peso_base + peso_extra` (trigger `trg_calcular_valor_sub_total`) |
| `produtos_proposta.peso_total` | **coluna gerada** `peso_uni * qtd` — gramas |

O setor de uma linha é o `setor_pcp` do produto (`produtos.id_produto =
produtos_proposta.id_produto`), a mesma origem dos cards da fila. Logo:

> **estimado do setor S (kg)** = Σ `peso_total` das linhas de `produtos_proposta`
> do pedido cujo produto tem `setor_pcp = S`, ÷ 1000.

Conferido contra os pedidos que já têm peso real: 21000/FLEXO est. 4,160 × real
4,16; 20974/LASER 0,450 × 0,45; 21074/FLEXO 270,400 × 270,4. `propostas.peso`
existe, mas está vazia em todas as 8.375 propostas — não é fonte.

`produtos_proposta` e `produtos` têm leitura pública (`SELECT … using=true`), então a
soma é feita **na tela**, nos dois caminhos (estação com chave anônima e site com
sessão), sem rota nova e sem tocar em tabela do parceiro.

## 2. A regra dos 5 %

`divergência = |real − estimado| / estimado`. Até **5 % inclusive** grava como hoje.
Acima, a gravação fica **pendente** e abre o popup. Sem estimado (setor sem linha
com peso, ou peso cadastrado zero) **não há com o que comparar**: o box mostra
`est. —` e grava sem conferir. Apagar o peso (campo vazio) também não confere.

A regra mora **na tela** (`frontend/acabamento.js`), como a conferência da
expedição; o servidor confere **só a senha**. Não se registra quem liberou — não foi
pedido, e exigiria tabela nova (`producao_…`); fica como acréscimo possível.

## 3. A senha semanal

Derivada, não sorteada e guardada: `HMAC-SHA256(PESO_LIBERACAO_SEGREDO,
"senha-liberacao-peso:" + <semana>)` → **1 letra (A–Z) + 2 dígitos (00–99)**, ex.
`K47`. `<semana>` é a **semana ISO no fuso de São Paulo** (`2026-W34`): muda sozinha
toda segunda-feira 00:00, ninguém gera nada, não existe tabela de senhas. A
comparação é em tempo constante (`iguaisEmTempoConstante`), maiúscula/minúscula e
espaços não contam.

O segredo `PESO_LIBERACAO_SEGREDO` vive em `imposition_segredos`, o plano B dos
outros três (a conta do projeto não grava em *Edge Functions → Secrets*). O valor
foi **sorteado dentro do banco** (`gen_random_bytes`) em 21/08/2026 — nunca passou
por arquivo, terminal ou transcrição. Trocar o valor troca a senha de todas as
estações na hora.

Módulo único: `supabase/functions/_compartilhado/senha_liberacao.ts`.

## 4. Onde a senha aparece e quem a confere

| | |
|---|---|
| **Aparece** | tela **Usuários** (menu Administração), card *"Senha de liberação de peso"*: a senha em destaque e a semana (*17/08 a 23/08*). Quem vê: quem pode ver o Menu Usuários (`perm_admin_view` ou `perm_admin_edit` — Administrador e Gerente), a mesma regra da lista de códigos locais. Rota `GET painel/api/senha-liberacao`. |
| **Confere (site, com sessão)** | `POST painel/api/senha-liberacao/conferir` `{senha}` → `{ok:true, confere:bool}`. Exige sessão válida, e nada mais: quem digita é o operador do acabamento. |
| **Confere (estação)** | agente `POST /api/senha-liberacao/conferir` `{senha}` → `acesso-estacao` `POST senha-liberacao/conferir` com o `ACESSO_AGENTE_SEGREDO` → `{status:"success", confere:bool}`. |

A senha **nunca desce para a tela do operador**: a tela manda o que foi digitado e
recebe sim ou não. A senha só é devolvida na rota de exibição, a quem pode ver o
Menu Usuários.

## 5. O que NÃO muda

A gravação do peso (`pesos.ts`, PostgREST no site), as tabelas do parceiro (nada
novo é escrito), o banco (nenhuma tabela/coluna; só a linha do segredo). As rotas da
estação no `acabamento.js` passam de três para **quatro** — a nova é da senha, e o
endereço continua sendo montado num lugar só (`urlDeApi`), com um único `/api/` no
arquivo.

## 6. Testes

- **Harness** (`tests/acabamento_harness.js`): estimado por setor (soma e gramas→kg,
  produto sem setor não entra, pedido sem linha = `—`); borda dos 5 % (5,0 % passa,
  5,01 % não); acima de 5 % abre o popup e **nada é gravado**; Cancelar devolve o valor
  anterior; senha errada avisa e não grava; senha certa grava pelo caminho de sempre
  (estação → agente; site → PostgREST); sem estimado grava direto; a rota nova entra
  na lista das rotas do agente.
- **Deno** (`senha_liberacao_test.ts`): formato `^[A-Z][0-9]{2}$`; mesma semana →
  mesma senha; semanas diferentes → senhas diferentes (em geral); a chave da semana
  vira na segunda 00:00 de São Paulo, não no UTC; `conferir` aceita ` k47 ` e recusa
  `K48`.
- **pytest**: as rotas do agente repassam à função com o segredo e não validam nada
  por conta própria; a rota de `acesso-estacao` exige `conferirAgente` antes do
  corpo; a rota de exibição do `painel` exige o módulo Usuários e a de conferir exige
  sessão; o card existe no `index.html` e o carregador no `script.js`.

## 7. Publicação

Site + Edge Functions `painel` e `acesso-estacao` (`publicar.ps1`) e o agente com as
rotas novas (`publicar_agente.ps1`, número novo). Documentação em
`docs/painel_do_acabamento.md`, `docs/REGRAS_BANCO.md` (nota de que a leitura do
estimado é só leitura) e `CHANGELOG.md`.
