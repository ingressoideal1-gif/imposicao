# Acesso local ao NewProd — senha de 6 caracteres

Data: 2026-08-11

## Problema

O painel servido pelo agente na estação (`http://127.0.0.1:9000/app/`) é o mesmo
`frontend/` do site, mas hoje ele pula o login inteiro: em `script.js`, o bloco de
inicialização de auth trata `127.0.0.1` como ambiente confiável, libera todos os menus e
segue direto para `loadAll()`. Qualquer pessoa que se sente na máquina abre o painel
completo — inclusive o Menu Usuários e o ADM.

Exigir a conta do Supabase na estação não serve: o operador não tem conta, o login
depende de rede, e a imposição existe justamente para não depender de rede.

## Solução

Uma lista própria de operadores locais, sem vínculo nenhum com as contas do sistema. Cada
operador recebe do administrador um código de **6 caracteres alfanuméricos**, gerado no
Menu Usuários e entregue por fora (WhatsApp, telefone, papel). O código vale **apenas**
para entrar no painel do NewProd local; não dá acesso a nada no site.

O administrador gera, vê o código em texto claro na tela e envia. Não existe fluxo de
confirmação, e-mail, troca de senha pelo operador ou recuperação: se o código se perde, o
administrador gera outro.

## Modelo de dados

Tabela nova no Supabase, `imposition_acessos_locais`:

| coluna | tipo | observação |
|---|---|---|
| `id` | uuid | chave primária |
| `nome` | text | quem é o operador, para o admin se localizar |
| `codigo` | text | 6 caracteres, único |
| `is_admin` | bool | libera os menus Usuários e ADM na estação |
| `ativo` | bool | desligar sem perder o registro |
| `criado_em` / `atualizado_em` | timestamptz | |

O alfabeto do código é `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — sem `O`, `0`, `I` e `1`,
porque o código é ditado em voz alta e digitado à mão. São 32 símbolos em 6 posições, ou
cerca de um bilhão de combinações.

## Componentes

**`db.py` (nuvem).** `listar_acessos_locais()`, `salvar_acesso_local(data)`,
`excluir_acesso_local(id)` e `gerar_codigo_acesso(existentes)`, no mesmo padrão das
funções `*_user_permissions`. O gerador recebe os códigos já em uso e sorteia até achar um
livre, para que a unicidade não dependa de uma corrida contra o banco.

**`app.py` (nuvem).** `GET`, `POST` e `DELETE` em `/api/acessos-locais`.

**`agent_worker.py`.** `sincronizar_acessos()` baixa a lista pelo REST do Supabase e grava
`acessos_locais.json` ao lado do executável, no mesmo ciclo de 30 minutos que já
sincroniza o painel. Só substitui o arquivo quando o download vem inteiro — uma falha de
rede mantém a cópia anterior valendo.

**`app.py` (agente).** `POST /api/local/login` recebe `{codigo}` e confere contra o JSON
local, sem rede no caminho do operador. Responde `{ok, nome, is_admin}` ou 401 com
mensagem genérica. Após cinco erros seguidos, cada tentativa nova espera três segundos.
`GET /api/local/login/estado` informa se existe lista sincronizada.

**`frontend/script.js`.** No lugar do bypass da estação, uma tela "NewProd — Acesso local"
com um campo de seis caracteres. A sessão fica em `sessionStorage`: fechou o navegador,
pede de novo. Quem não é admin não vê os menus Usuários e ADM — sem isso, qualquer
operador leria na própria estação os códigos de todos os colegas.

**`frontend/index.html` + `script.js`.** No Menu Usuários, um card "Acesso Local —
NewProd" com a lista de operadores, o código visível em fonte monoespaçada, botão de
copiar, gerar novo código, ativar/desativar, marcar como admin e excluir. O botão de criar
pede apenas o nome e já devolve o código pronto.

## Degradação

Se o agente ainda não tem lista sincronizada — instalação nova, ou máquina que nunca
alcançou a nuvem —, o painel libera o acesso como hoje e mostra um aviso. Travar a
produção porque a internet caiu seria pior do que o problema que este trabalho resolve.

Em `file://` nada muda: não há servidor local a quem perguntar.

## Limites conhecidos

O código fica em texto claro no banco, na tela do administrador e no JSON da estação. Isso
é requisito, não descuido: o administrador precisa ler o código para entregá-lo. O que
está sendo construído é uma tranca de estação, não uma barreira criptográfica.

Enquanto o RLS seguir adiado, a tabela é legível pela chave anônima como todas as outras
do projeto. Quando a fase 1 do RLS acontecer, esta deve ser a primeira tabela a fechar.

## Publicação

O trabalho toca o site e o código que o executável embute. Publicar só o site colocaria a
tela de login na estação sem os endpoints que a fazem funcionar, então saem juntos:
`.\publicar.ps1 "mensagem"` e `.\publicar_agente.ps1 1.2.28`.
