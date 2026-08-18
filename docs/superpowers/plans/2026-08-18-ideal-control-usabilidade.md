# Ideal Control — usabilidade (18/08/2026)

> **Para agentes:** executar com `superpowers:subagent-driven-development`, uma tarefa por
> subagente, revisao por tarefa. Cada tarefa e autocontida: o brief e o unico requisito.

**Objetivo:** tirar o atrito das telas do Ideal Control (PWA em `frontend/`, casa
`controle.html` + portao `portaria.html`) e do bloco "Acesso do cliente" do painel da
grafica, sem mudar o que ja esta aprovado e rodando.

**Decisoes do usuario (18/08/2026):**
1. **Entrar libera 15 minutos** — como a engrenagem: depois de entrar (ou de trocar a
   senha), o Carregar e a engrenagem nao pedem a senha de novo dentro dos 15 minutos.
2. **Engrenagem com secoes recolhidas** — cada secao fechada com o resumo; abre a que
   precisa; lembra o que estava aberto.
3. **"Enviar por WhatsApp"** no bloco Acesso do cliente do painel, com e-mail, senha
   provisoria e link de instalacao ja escritos.
4. **Nome do aparelho na hora** — ao tocar "Sim, usar este aparelho", um campo opcional
   com a sugestao "Aparelho N".

Fora isso, sem perguntar: mostrar/ocultar senha, botoes com estado de espera, subtitulo
na barra do evento, passos na casa vazia, e-mail e versao no menu do olho, "Atualizar" em
Meus Pedidos, teclado certo, Enter em todo formulario.

## Restricoes globais (valem para TODAS as tarefas)

- Portugues em tudo o que a pessoa le. Nada de `alert/confirm/prompt`.
- `frontend/*.js`: ES5, IIFE, `'use strict'`, `textContent` para texto de gente/ERP.
- Todo controle novo tem rotulo em TEXTO (nao so icone). Vocabulario: **aparelho**, nunca
  "portao" em texto de tela.
- Nao mudar id nem classe que o JS ou os testes ja usam. Nao mudar o texto dos botoes que
  ja existem (os testes leem).
- Estados de topo da casa (`#lista`+`#bloco-novo-evento`, `#menu-geral`, `#engrenagem`,
  `#meus-pedidos`, `#bloco-entrar`, `#trocar-senha`; sub-estado `#caixa-carregar`) e o
  `conta.esconderTelaInicial()`/`NA_FRENTE` do `conta.js` continuam mandando.
- `.sumindo` = "nao esta na tela" (unico `!important` do `controle.css`).
- Arquivo JS novo em `frontend/` entra em: `controle.html` (tag `<script ... ?v=632>`, a
  mesma versao dos outros), `frontend/sw.js` (`ARQUIVOS`), `security_config.PAINEL_ARQUIVOS`,
  e `tests/test_lista_eventos.py::MODULOS_GLOBAIS` se expor um `window.X` que outro arquivo
  chame sem guarda.
- Testes: pytest com puppeteer (`tests/test_controle_tela.py::_no_navegador` e os arneses de
  `test_conta_tela.py`, `test_carregar_pedido_tela.py`, `test_meus_pedidos_tela.py`,
  `test_portaria_tela.py`, `test_ideal_control_tela.py`); Edge Functions com
  `npx deno test --allow-env --allow-read supabase/functions/` (so funcoes puras tem teste;
  o `index.ts` passa por `npx deno check`). Rodar o arquivo de teste tocado + os vizinhos.
  Nunca enfraquecer uma assercao para passar.
- Commit por tarefa, `git add` por nome (outra sessao edita a mesma arvore), mensagem em
  portugues, sem `git add -A`.
- Servidor: nada volta ao Render; tudo e Supabase. Segredo nunca vai na resposta.
- Elevacao existente: `gerarElevacao(eventoId, contaId, navegador)` /
  `conferirElevacao(token, eventoId, contaId, navegador)` em
  `supabase/functions/_compartilhado/assinatura.ts`; identificadores casam
  `/^[A-Za-z0-9_-]{1,64}$/`. Cabecalhos `X-Elevacao` e `X-Navegador` ja estao no CORS.

---

### Task 1: Mostrar/ocultar senha, teclado certo, Enter em todo formulario

**Arquivos:**
- Criar: `frontend/mostrar-senha.js`
- Modificar: `frontend/controle.html`, `frontend/controle.css`, `frontend/sw.js`,
  `security_config.py`, `frontend/conta.js` (Enter), `frontend/portaria.js` (Enter)
- Teste: `tests/test_mostrar_senha.py` (novo, no arnes de `test_conta_tela.py`)

**O que fazer:**
1. `mostrar-senha.js` (IIFE, ES5): no `DOMContentLoaded`, para cada
   `input[type="password"]` de `controle.html`, envolve o campo num
   `<span class="campo-senha">` e acrescenta depois dele um
   `<button type="button" class="olho-senha">Mostrar</button>`. Toque alterna
   `type` entre `password` e `text`, o rotulo entre **Mostrar** e **Ocultar**, e
   `aria-pressed`. `aria-controls` aponta para o id do campo. Ao esconder um bloco de
   estado (`.sumindo` no ancestral) nada precisa ser feito. Expor
   `window.mostrarSenha = { ligar: ligar }` (idempotente: nao envolve duas vezes).
   Comentario de cabecalho explicando o porque (senha provisoria `K7M2PQ9X` digitada no
   celular).
2. CSS: `.campo-senha { position: relative; display: block; }`; o campo continua
   `width: 100%` com `padding-right: 84px`; `.olho-senha` absoluto a direita, `width: auto`,
   `min-height: 0`, altura do campo, fundo transparente, texto `.8rem` `700` na cor
   `var(--teal-claro)`, sem sombra, `margin: 0`. Nao pode cobrir o texto digitado.
3. Teclado: nos campos `#email` e `#entrar-config-email` acrescentar
   `autocapitalize="none" autocorrect="off" spellcheck="false"`. No `#carregar-senha`,
   `#senha`, `#campo-senha-*`, `#entrar-config-senha`: `autocapitalize="none"`.
4. Enter: `#email` Enter -> foco em `#senha`; `#campo-senha-confirma` Enter -> clique em
   `#btn-trocar-senha`; `#campo-senha-atual` e `#campo-senha-nova` Enter -> foco no
   proximo; `#entrar-config-email` Enter -> foco em `#entrar-config-senha`;
   `portaria.html` `#campo-numero` Enter -> clique em `#btn-conferir`.
5. Registrar `mostrar-senha.js` em `controle.html` (depois de `conta.js`), `sw.js`,
   `PAINEL_ARQUIVOS`; `MODULOS_GLOBAIS` nao precisa (ninguem chama `window.mostrarSenha`).

**Testes (novo `tests/test_mostrar_senha.py`, arnes de `test_conta_tela.py`):**
- todo `input[type=password]` da casa tem um `.olho-senha` irmao com texto "Mostrar";
- tocar troca `type` para `text` e o texto para "Ocultar"; tocar de novo volta;
- `#email` tem `autocapitalize="none"`;
- Enter em `#campo-senha-confirma` dispara o clique de `#btn-trocar-senha` (espiar com
  um listener que marca `window.__clicou = true`);
- `sw.js`, `PAINEL_ARQUIVOS` e `controle.html` citam `mostrar-senha.js`.

---

### Task 2: Botoes com estado de espera

**Arquivos:**
- Criar: `frontend/botao-espera.js`
- Modificar: `frontend/conta.js`, `frontend/carregar-pedido.js`, `frontend/controle.js`,
  `frontend/lista-eventos.js`, `frontend/controle.html`, `frontend/sw.js`,
  `security_config.py`, `tests/test_lista_eventos.py` (`MODULOS_GLOBAIS`)
- Teste: `tests/test_botao_espera.py` (novo)

**O que fazer:**
1. `botao-espera.js`: `window.botaoEspera = { comecar(botao, rotulo), terminar(botao) }`.
   `comecar` guarda o texto original em `botao.dataset.rotuloOriginal` (se ainda nao
   guardado), poe `disabled = true`, `aria-busy="true"` e `textContent = rotulo`.
   `terminar` devolve o texto, tira `disabled` e `aria-busy`. Idempotentes; aceitam
   `null` sem lancar.
2. Aplicar (SEMPRE em `finally`/`.then(...,...)` para o botao voltar mesmo com erro):
   - `#btn-entrar` -> "Entrando…" (conta.js);
   - `#btn-trocar-senha` -> "Salvando…" (conta.js);
   - `#btn-carregar-confirmar` -> "Carregando…" (carregar-pedido.js; ja desabilita —
     trocar pelo helper);
   - `#btn-entrar-config` -> "Conferindo…" (controle.js, login relampago);
   - `#btn-gravar-evento` -> "Gravando…"; botoes "Salvar nome" dos aparelhos ->
     "Salvando…"; "Carregar códigos neste setor" -> "Carregando…" (controle.js);
   - `Reabrir` dos finalizados -> "Reabrindo…" (lista-eventos.js);
   - `#btn-atualizar-pedidos` NAO existe ainda (Task 3) — nada aqui.
3. Registrar o arquivo em `controle.html` (antes de `conta.js`), `sw.js`,
   `PAINEL_ARQUIVOS`, e `MODULOS_GLOBAIS` (`"botaoEspera": "botao-espera.js"`).

**Testes (`tests/test_botao_espera.py`):**
- `comecar` desabilita, marca `aria-busy` e troca o texto; `terminar` devolve tudo;
- no arnes de `test_conta_tela.py`, com o `signInWithPassword` falso que demora
  (Promise pendente 300 ms), `#btn-entrar` fica "Entrando…" e `disabled` durante a espera
  e volta a "Entrar" depois — inclusive quando a resposta e erro.

---

### Task 3: A casa mais falante

**Arquivos:**
- Modificar: `supabase/functions/acesso-conta/index.ts` (select de `meusEventos` ganha
  `local_evento`), `frontend/lista-eventos.js`, `frontend/controle.html`,
  `frontend/controle.css`, `frontend/menu-geral.js`, `frontend/meus-pedidos.js`
- Testes: `tests/test_lista_eventos.py`, `tests/test_meus_pedidos_tela.py`,
  `tests/test_controle_tela.py` (menu)

**O que fazer:**
1. **Subtitulo na barra do evento** (`lista-eventos.js`, `linhaDeEvento`): dentro de
   `.nome-evento`, o nome continua no primeiro no de texto; acrescentar
   `<span class="sub-evento">` com, nesta ordem e separados por " · ": a data curta
   (`dd/mm`) se houver; o local se houver (`local_evento`, novo no select do servidor e
   em `linhas()`); e, se `ehAparelho`, "lê neste aparelho" + (nome do aparelho do
   chaveiro, se houver: "lê neste aparelho como Aparelho 1"). Sem nada, o span nao e
   criado. CSS: `.sub-evento { display:block; font-size:.78rem; font-weight:600;
   color: var(--dim); margin-top:2px; }` e `.barra-evento` alinha `align-items:center`.
   O `aria-label` da barra continua o mesmo.
2. **Casa vazia com passos** (`controle.html` `#sem-eventos`): manter o id e a classe
   `aviso`; o conteudo vira um paragrafo curto + `<ol class="passos">` com tres itens em
   texto: "Toque em **Meus Pedidos**", "Carregue um pedido que a gráfica já imprimiu",
   "Diga se este aparelho vai ler os ingressos". CSS: `.passos` sem marcador padrao,
   contador em bolinha verde-agua (`counter-reset`/`::before`), `gap` de 6px. A frase
   "Nenhum evento aqui ainda" continua no texto (teste existente).
3. **Menu do olho** (`controle.html` `#menu-geral`, `menu-geral.js`): acima do cartao
   "Minha conta", um `<p id="menu-conta-email" class="config-ajuda">` com
   "Conta: <strong>e-mail</strong>" (do `AcessoConta.sessao()`; se nao houver sessao,
   "Sem conta neste aparelho"), e no fim do menu um `<p id="menu-versao"
   class="config-ajuda">Ideal Control · v<versao></p>` lendo a mesma versao que
   `#versao-do-app` mostra (copiar o texto dele ao abrir o menu).
4. **Atualizar em Meus Pedidos** (`controle.html` `#meus-pedidos`, `meus-pedidos.js`):
   ao lado do "Voltar aos meus eventos", um `<button id="btn-atualizar-pedidos"
   class="secundario" type="button">Atualizar</button>` que chama de novo a busca
   (`desenhar`), com `botaoEspera.comecar(b, 'Atualizando…')`. Os dois botoes ficam numa
   `<div class="linha-botoes">` (flex, gap 8px, ambos `width:auto`).

**Testes:**
- `test_lista_eventos.py`: `linhas()` leva `local`; a barra mostra `.sub-evento` com
  data e local; com `ehAparelho` mostra "lê neste aparelho"; sem nada, nao cria o span;
- `test_meus_pedidos_tela.py`: `#btn-atualizar-pedidos` existe, refaz a busca (contar
  chamadas ao `/meus-pedidos` interceptado);
- `test_controle_tela.py`: o menu mostra o e-mail da sessao e a versao;
- `#sem-eventos` tem tres `li` e a frase "Nenhum evento aqui ainda".

---

### Task 4: Entrar libera 15 minutos

**Arquivos:**
- Modificar: `supabase/functions/acesso-conta/index.ts`, `supabase/functions/acesso-conta/puro.ts`
  (+ `puro_test.ts`), `frontend/acesso-conta.js`, `frontend/conta.js`,
  `frontend/carregar-pedido.js`, `frontend/controle.js`, `frontend/controle.html`
- Testes: `supabase/functions/acesso-conta/puro_test.ts`, `tests/test_conta_tela.py`,
  `tests/test_carregar_pedido_tela.py`, `tests/test_controle_tela.py`,
  `tests/test_sessao_vai_junto_no_fetch.py` (se contar rotas)

**Servidor (`acesso-conta/index.ts`):**
1. `const ELEVACAO_DE_CONTA = "conta";` — o pseudo-evento da elevacao de conta (casa o
   `IDENTIFICADOR`; nenhum evento real tem esse id).
2. `elevarConta(usuario, senha, navegador)`: `exigirSegredo(SEGREDO_ELEVACAO)`,
   `conferirSenha` (401 "senha nao confere" se falhar), `gerarElevacao(ELEVACAO_DE_CONTA,
   usuario.id, navegador)` -> `{ token, expira_em, minutos: 15 }`. Rota
   `POST /minha-conta/elevar` com corpo `{ senha, navegador }`.
3. `temElevacaoDeConta(usuario, req): Promise<boolean>` — `conferirElevacao(x-elevacao,
   ELEVACAO_DE_CONTA, usuario.id, x-navegador)`; `true`/`false`, nunca lanca (segredo
   ausente = false).
4. `carregar`: se `corpo.senha` vier vazio E `temElevacaoDeConta` for true, NAO chama
   `conferirSenha`; senao, o caminho de hoje (senha obrigatoria; 401 "senha nao confere").
   O `navegador` do corpo continua obrigatorio e tem de ser igual ao `X-Navegador`.
5. `elevar` (`POST /eventos/{id}/elevar`): se `senha` vier vazia E `temElevacaoDeConta`,
   emite a elevacao do evento sem conferir senha (o `eventoDoDono` continua). Senao, o
   caminho de hoje.
6. Comentario do topo com a contagem de rotas (+1). Em `puro.ts`, se houver logica pura a
   extrair (ex.: `precisaDeSenha(senha, temElevacaoDeConta)`), extrair e testar em
   `puro_test.ts`. `npx deno check` no `index.ts`.

**Cliente:**
7. `acesso-conta.js`: `elevarConta(sessao, senha)` -> `POST /minha-conta/elevar` com
   `{ senha, navegador: navegadorId() }`, guarda `{ token, expira_em }` em
   `sessionStorage['ideal_control_elevacao_conta']`; `elevacaoConta()` devolve o objeto se
   `expira_em` ainda nao passou (com 30 s de folga), senao `null` e limpa;
   `esquecerElevacaoConta()`. `sair()` chama `esquecerElevacaoConta()`.
8. `conta.js`: depois de `signInWithPassword` dar certo, `AcessoConta.elevarConta(sessao,
   senha)` de melhor esforco (erro nao atrapalha o login); depois de `trocarSenha` dar
   certo, o mesmo com a senha NOVA. A senha nao fica em variavel depois disso.
9. `carregar-pedido.js`: ao abrir a caixa, se `elevacaoConta()` valer: esconder
   `label[for="carregar-senha"]`, `#carregar-senha` e o `.olho-senha` dele (o wrapper
   `.campo-senha` da Task 1 — esconder o wrapper), e mostrar
   `<p id="carregar-sem-senha" class="config-ajuda">Você entrou há pouco: não precisa
   digitar a senha de novo.</p>` (novo em `controle.html`, nasce `sumindo`); o POST vai SEM
   `senha` e COM `X-Elevacao`/`X-Navegador`. Se voltar 401, mostrar o campo de senha com o
   erro "Sua liberação venceu. Digite a senha para continuar." e deixar tentar de novo
   pelo caminho da senha. Sem elevacao valida, tudo como hoje.
10. `controle.js` (`abrirEngrenagem`): antes de mostrar `#caixa-entrar-config`, se
    `elevacaoConta()` valer, tenta `POST /eventos/{id}/elevar` com corpo `{ navegador }` e
    cabecalhos `X-Elevacao`/`X-Navegador` da elevacao de conta; se der certo,
    `receberElevacao` e abre a engrenagem ja em modo configuracao; se falhar (qualquer
    erro), segue o caminho de hoje (a caixa pede a senha). Nada disso muda quando ja ha
    elevacao do evento.

**Testes:**
- deno: a funcao pura extraida;
- `test_conta_tela.py`: entrar chama `/minha-conta/elevar` e guarda a elevacao de conta;
  trocar senha tambem; `sair` limpa;
- `test_carregar_pedido_tela.py`: com elevacao de conta valida a caixa abre sem o campo
  de senha, mostra `#carregar-sem-senha`, e o POST leva `X-Elevacao` e nao leva `senha`;
  com 401 o campo volta com a frase; sem elevacao tudo como antes;
- `test_controle_tela.py`: engrenagem com elevacao de conta valida abre sem a caixa de
  senha (o `/elevar` interceptado responde token) e cai na caixa quando o `/elevar` recusa.

---

### Task 5: Engrenagem com secoes recolhidas

**Arquivos:**
- Modificar: `frontend/controle.html`, `frontend/controle.css`, `frontend/controle.js`
- Testes: `tests/test_controle_tela.py` (novos + adaptacao dos existentes)

**O que fazer:**
1. HTML: cada `.secao` da engrenagem (`#bloco-evento`, `#bloco-aparelhos`,
   `#bloco-setores`, `#bloco-este-aparelho`, `#bloco-zona-de-risco`) passa a ter, no
   lugar do `<h2>` solto:
   ```html
   <button type="button" class="secao-cabecalho" aria-expanded="false"
           aria-controls="corpo-evento" id="abrir-evento">
     <span class="secao-titulo">Evento</span>
     <span class="secao-resumo" id="resumo-evento"></span>
     <span class="secao-seta" aria-hidden="true"></span>
   </button>
   <div class="secao-corpo" id="corpo-evento"> ...o conteudo de hoje... </div>
   ```
   ids: `abrir-evento`/`corpo-evento`/`resumo-evento`, `abrir-aparelhos`/..., `abrir-setores`,
   `abrir-este-aparelho`, `abrir-zona-de-risco`. O `<h2>` sai (o `.secao-titulo` faz o
   papel; manter o texto: "Evento", "Aparelhos", "Setores", "Este aparelho", "Zona de
   risco"). `#faixa-elevacao`, `#tranca`, `#btn-fechar-engrenagem`, `#nome-evento-titulo`
   e `#aviso-gravacao` ficam FORA das secoes, como hoje.
2. CSS: `.secao-cabecalho` e um botao largo, `text-align:left`, fundo do cartao, borda,
   radius 14px, `display:flex; align-items:center; gap:10px; min-height:56px;` titulo em
   `.74rem 800 uppercase letter-spacing .14em`, resumo em `.88rem` `var(--dim)`
   `flex:1` `text-align:right` `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`;
   seta (chevron por borda, como no menu do olho) que gira 180° quando `aria-expanded=true`.
   `.secao.recolhida .secao-corpo { display: none; }`. `.secao-corpo` tem `margin-top:12px`.
   Zona de risco: cabecalho com borda/titulo vermelhos (manter `var(--red)` no bloco
   `.zona-de-risco` do CSS — teste existente).
3. `controle.js`: `Controle.abrirSecao(nome)`, `fecharSecao(nome)`, `alternarSecao(nome)`,
   `abrirTodasSecoes()` (nome = 'evento' | 'aparelhos' | 'setores' | 'este-aparelho' |
   'zona-de-risco'). Estado por evento em
   `sessionStorage['ideal_control_secoes:' + evento_id]` (lista das abertas). Padrao para
   evento nunca aberto: **todas recolhidas**. `abrirEngrenagem` restaura o estado;
   `desenhar()` NUNCA fecha uma secao aberta. Toque no cabecalho alterna. Ao abrir uma
   secao, `scrollIntoView({block:'start', behavior:'smooth'})` respeitando
   `prefers-reduced-motion` (sem `smooth`).
4. Resumos, escritos em `desenhar()` com `textContent`:
   - evento: nome · data curta (`dd/mm HH:mm`) · local — o que houver; "inativo" se
     `status !== 'ativo'`;
   - aparelhos: "3 aparelhos · 1 revogado" / "1 aparelho" / "nenhum ainda";
   - setores: "3 setores · 1 bloqueado" / "nenhum";
   - este-aparelho: "Aparelho 1" (nome do chaveiro) ou "este celular não lê este evento";
   - zona-de-risco: "zerar entradas · finalizar".
5. Testes existentes que olham DENTRO de uma secao (medidas, `display`, botoes) passam a
   chamar `Controle.abrirTodasSecoes()` (ou `abrirSecao('...')`) depois de abrir a
   engrenagem — adaptar SEM enfraquecer assercoes. Novos testes: nasce tudo recolhido;
   tocar abre e grava; `desenhar()` nao fecha; resumo dos aparelhos e dos setores; estado
   por evento (abrir A, trocar para B: B nasce recolhido; voltar a A: A como estava).

---

### Task 6: Nome do aparelho na hora

**Arquivos:**
- Modificar: `frontend/caixa-confirmar.js`, `frontend/virar-portao.js`,
  `frontend/carregar-pedido.js`, `frontend/controle.css`
- Testes: `tests/test_carregar_pedido_tela.py`, `tests/test_controle_tela.py` (ou o
  arquivo que hoje testa o `virarPortao`), `tests/test_caixa_confirmar.py` se existir

**O que fazer:**
1. `caixa-confirmar.js`: nova opcao `opcoes.campo = { rotulo, valor, maxlength, id }`.
   Com ela, a caixa desenha, entre o texto e os botoes, um `<label for=id>rotulo</label>` +
   `<input id=id type=text maxlength=... value=valor autocomplete="off">`; Enter no campo
   confirma; a Promise resolve com **a string digitada (`trim`; vazia -> `valor`)** quando
   confirma e `null` quando cancela. Sem `campo`, o comportamento de hoje (boolean) fica
   igual — nenhum chamador atual muda.
2. `virar-portao.js` `criar(evento_id, sessao, elevacao, nomeEscolhido)`: se
   `nomeEscolhido` vier (string nao vazia), usa; senao "Aparelho N" como hoje. Onde hoje se
   pergunta "usar este aparelho?" (`abrir`) e onde o `carregar-pedido.js` pergunta "Quer usar
   este aparelho para ler os ingressos dele?": passar `campo: { id: 'campo-nome-aparelho',
   rotulo: 'Nome deste aparelho (opcional)', valor: 'Aparelho N', maxlength: 60 }`. Para
   sugerir o N certo, buscar o painel (`GET /eventos/{id}`) ANTES de perguntar (o `criar`
   ja busca; reaproveitar sem buscar duas vezes). O servidor ja aceita `nome` (1..60).
3. CSS: `.caixa-confirmar label` e `input` no padrao da folha (ja herdam); `margin-bottom:
   14px` no campo.

**Testes:**
- caixa com `campo`: resolve com o texto digitado; vazio -> sugestao; cancelar -> `null`;
  Enter confirma; sem `campo` continua boolean;
- "Sim, usar este aparelho" com nome digitado -> o POST `/aparelhos/aqui` leva `nome`
  digitado; sem digitar -> "Aparelho N" com N = aparelhos do evento + 1.

---

### Task 7: "Enviar por WhatsApp" no painel da grafica

**Arquivos:**
- Modificar: `frontend/ideal-control.js` (`mostrarSenhaProvisoria`), `frontend/index.html`
  (se o bloco precisar de container), `frontend/style.css` (se precisar)
- Teste: `tests/test_ideal_control_tela.py`

**O que fazer:**
1. Ao lado do "Copiar" da senha provisoria, um `<a id="ic-acesso-whatsapp" class="btn
   btn-secondary" target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>` com
   `href = 'https://wa.me/?text=' + encodeURIComponent(mensagem)`. A mensagem (pt-BR):
   ```
   Olá! Seu acesso ao Ideal Control (controle de acesso da Ingresso Ideal) está liberado.

   1) Instale o aplicativo: <URL de instalacao>
   2) Entre com o e-mail: <email>
   3) Senha provisória: <senha>

   No primeiro acesso o aplicativo pede para você escolher a sua senha.
   ```
   A URL de instalacao e a mesma que o QR usa (`/instalacao`); se ainda nao chegou, usar
   `https://ideal-imposition.vercel.app/ic/`.
2. O link so existe enquanto a senha esta na tela (mesmo ciclo do "Copiar"): some com ela.
3. Rotulo em texto; sem icone obrigatorio.

**Testes:** o `href` contem o e-mail, a senha e a URL codificados; `rel` tem `noopener`;
o texto e "Enviar por WhatsApp"; some quando a senha some.

---

### Task 8: Documentacao e CHANGELOG

**Arquivos:** `CHANGELOG.md` (entrada `## [v633 — 2026-08-18] *(a publicar)* — Usabilidade
do Ideal Control`), `docs/controle_acesso.md` (secao curta: "Entrar libera 15 minutos" — a
elevacao de conta, o pseudo-evento `conta`, onde e aceita; secoes recolhidas; nome do
aparelho; WhatsApp), `docs/STATUS_PROJETO.md` (uma linha).

Publicacao NAO faz parte desta tarefa: e ato do usuario (`.\publicar.ps1 ... -Sim` e
`.\publicar_agente.ps1 1.2.128`).
