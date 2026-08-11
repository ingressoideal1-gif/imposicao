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
operador recebe do administrador um código de **6 caracteres alfanuméricos**, que o próprio
administrador escolhe e digita no Menu Usuários, e entrega por fora (WhatsApp, telefone,
papel). O código vale **apenas** para entrar no painel do NewProd local; não dá acesso a
nada no site.

O administrador vê o código em texto claro na tela. Não existe fluxo de confirmação,
e-mail, troca de senha pelo operador ou recuperação: se o código se perde, o administrador
digita outro.

Cada operador recebe também a **mesma grade de permissões por módulo** dos usuários do
sistema — perfil como atalho, e o ver/editar de cada módulo mais as ações. É essa grade que
o painel aplica na estação depois do login.

## Modelo de dados

Tabela nova no Supabase, `imposition_acessos_locais`:

| coluna | tipo | observação |
|---|---|---|
| `id` | uuid | chave primária |
| `nome` | text | quem é o operador, para o admin se localizar |
| `codigo` | text | 6 caracteres, único |
| `role` | text | perfil, o mesmo vocabulário de `ROLE_LABELS` |
| `permissoes` | jsonb | a grade `perm_*`, no formato que o painel já usa |
| `ativo` | bool | desligar sem perder o registro |
| `criado_em` / `atualizado_em` | timestamptz | |

O código aceita `A–Z` e `0–9`, exatamente 6 caracteres, e é normalizado para maiúsculas sem
espaços — quem digita não precisa acertar a forma. A unicidade é conferida antes da
gravação, para que a mensagem seja "esse código já é de outro operador" em vez do erro de
chave única do Postgres.

As permissões ficam em JSONB, e não em ~30 colunas booleanas como em
`imposition_user_permissions`: a lista de módulos cresce a cada tela nova, e cada
crescimento viraria um `ALTER TABLE`. O painel já trata permissão como um objeto de chaves
`perm_*`, então o formato aqui é o mesmo que ele consome.

Não há coluna `is_admin`. Ser admin é `perm_admin_view` dentro da grade — duas fontes para
a mesma pergunta acabariam discordando uma hora.

## Componentes

**`db.py` (nuvem).** `listar_acessos_locais()`, `salvar_acesso_local(data)`,
`excluir_acesso_local(id)` e `validar_codigo_acesso(codigo, existentes)`, no mesmo padrão
das funções `*_user_permissions`. A validação levanta `CodigoInvalido`, que vira mensagem
na tela. Uma atualização parcial — mudar o perfil, desativar — não toca no código: trocar a
senha de quem só mudou de perfil o deixaria do lado de fora sem ninguém entender por quê.

**`app.py` (nuvem).** `GET`, `POST` e `DELETE` em `/api/acessos-locais`. Código recusado
responde 400 com o motivo, e não 500.

**`agent_worker.py`.** `sincronizar_acessos()` baixa a lista pelo REST do Supabase e grava
`acessos_locais.json` ao lado do executável, no mesmo ciclo de 30 minutos que já
sincroniza o painel. Só substitui o arquivo quando o download vem inteiro — uma falha de
rede mantém a cópia anterior valendo.

**`app.py` (agente).** `POST /api/local/login` recebe `{codigo}` e confere contra o JSON
local, sem rede no caminho do operador. Responde `{ok, nome, role, permissoes}` ou 401 com
mensagem genérica. Após cinco erros seguidos, cada tentativa nova espera três segundos.
`GET /api/local/login/estado` informa se existe lista sincronizada.

**`frontend/script.js`.** No lugar do bypass da estação, uma tela "NewProd — Acesso local"
com um campo de seis caracteres. A sessão fica em `sessionStorage`: fechou o navegador,
pede de novo. Depois do login, `applyPermissions` recebe a grade daquele operador, então a
estação mostra exatamente o que o Menu Usuários liberou. Sem grade — acesso antigo, ou
estação com cópia velha — vale tudo menos a área de administração: trancar o operador para
fora do trabalho dele por um campo vazio seria pior, e esconder o Menu Usuários é
obrigatório de todo jeito, porque é lá que estão os códigos de todos os colegas.

**`frontend/index.html` + `script.js`.** No Menu Usuários, um card "Acesso Local —
NewProd" com a lista de operadores, o código visível em fonte monoespaçada com botão de
copiar e de trocar, o seletor de perfil, a grade de permissões e o excluir. Criar pede o
nome e o código. A grade é a função `renderGradePermissoes`, usada também pelo card dos
usuários do sistema — são a mesma lista, e duas cópias do mesmo HTML divergiriam no dia em
que um módulo novo entrasse no menu.

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

Criada pelo editor SQL, a tabela nasce com RLS ligado e sem política nenhuma — estado em
que o PostgREST devolve lista vazia na leitura e 401 na escrita, e nada funciona. Escrever
política para o papel `anon` não resolveria: é a mesma chave anônima que o site, o motor no
Render e o agente usam, então qualquer política larga o bastante para o motor gravar libera
a internet junto. Fechar de verdade exige uma chave `service_role` no motor e o agente
buscando a lista através do motor, em vez de direto do Supabase — que é exatamente o
trabalho da fase 1. Até lá, o `schema_acessos_locais.sql` desliga o RLS desta tabela, com a
razão escrita ao lado.

## Publicação

O trabalho toca o site e o código que o executável embute. Publicar só o site colocaria a
tela de login na estação sem os endpoints que a fazem funcionar, então saem juntos:
`.\publicar.ps1 "mensagem"` e `.\publicar_agente.ps1 1.2.28`.
