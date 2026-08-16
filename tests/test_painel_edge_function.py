# -*- coding: utf-8 -*-
"""O corte das rotas sensíveis do painel para Edge Function.

`/api/user/permissions` e `/api/acessos-locais` saíram do Render em 16/08/2026 e
foram para `supabase/functions/painel`. São as duas rotas que mexem nas tabelas
que só a chave de serviço alcança desde o passo 3 do RLS.

## O que estes testes protegem

Não é o corte em si — é o que ele conserta. No Render, **qualquer sessão válida**
gravava na grade de permissões, e "qualquer sessão" quer dizer todo cliente do
ERP parceiro: a conta com que o cliente entra é a mesma do Vibe, por decisão
registrada em `conta-do-cliente-e-a-do-vibe`. Um cliente podia mandar
`{"user_id": "<o dele>", "perm_admin_edit": true}` e virar dono do Menu
Usuários — onde ficam os códigos de acesso de todas as estações.

Três coisas precisam continuar verdadeiras, e nenhuma delas aparece como erro
quando quebra:

1. o frontend fala com a função, e não com o Render;
2. a chamada leva a sessão junto (a função mora em `supabase.co`, e o envelope
   de `fetch` corta `supabase.co` por causa de recursão — a ordem daquele corte
   é o que faz a diferença);
3. o primeiro acesso pergunta **quantos** usuários existem, e não pede a grade
   inteira de todo mundo.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(*caminho):
    with open(os.path.join(RAIZ, *caminho), encoding="utf-8") as f:
        return f.read()


SCRIPT = _ler("frontend", "script.js")
CONFIG_JS = _ler("frontend", "supabase-config.js")
CONFIG_TOML = _ler("supabase", "config.toml")
FUNCAO = _ler("supabase", "functions", "painel", "index.ts")


# ─── 1. O frontend aponta para a função ───────────────────────────────────────


def test_as_rotas_sensiveis_sairam_do_render():
    for rota in ("user/permissions", "acessos-locais"):
        assert f"${{API_NUVEM}}/api/{rota}" not in SCRIPT, (
            f"/api/{rota} ainda vai ao Render; o corte foi desfeito"
        )
        assert f"${{API_PAINEL}}/api/{rota}" in SCRIPT


def test_a_base_da_funcao_e_o_projeto_certo():
    """O mesmo `project-ref` do `security_config.py`.

    A conta tem projetos vazios com nomes parecidos, e uma função publicada no
    projeto errado sobe sem erro, responde bonito e não enxerga credencial
    nenhuma. É o mesmo cuidado do passo 7 da conferência diária.
    """
    ref = re.search(r"https://([a-z0-9]+)\.supabase\.co", _ler("security_config.py")).group(1)
    assert f"https://{ref}.supabase.co/functions/v1/painel" in CONFIG_JS


# ─── 2. A sessão vai junto ────────────────────────────────────────────────────


def test_a_funcao_do_painel_passa_antes_do_corte_de_supabase():
    """A ordem das duas linhas é o teste.

    O envelope de `fetch` recusa `supabase.co` para não chamar a si mesmo quando
    o SDK renova a sessão. A função do painel MORA em `supabase.co` — se o corte
    vier primeiro, ela é a única rota do painel que sai sem se identificar, e a
    resposta é 401 numa tela que sempre funcionou.
    """
    envelope = CONFIG_JS[CONFIG_JS.index("function eDoNossoMotor"):]
    envelope = envelope[:envelope.index("window.fetch = function")]
    # Só as linhas de CÓDIGO: o comentário logo acima explica esta mesma ordem e
    # cita `supabase.co`, o que faria a busca crua achar o texto errado.
    codigo = [l.strip() for l in envelope.splitlines()
              if l.strip() and not l.strip().startswith("//")]
    linha_painel = next(i for i, l in enumerate(codigo) if "API_PAINEL" in l)
    linha_corte = next(i for i, l in enumerate(codigo) if "supabase.co" in l)
    assert linha_painel < linha_corte, (
        "o corte de supabase.co ficou na frente; a chamada sai sem sessão"
    )


def test_a_verificacao_de_jwt_esta_ligada():
    """Desligá-la não daria erro nenhum de imediato — e essa é a armadilha.

    Toda decisão desta função sai do `sub` das claims. Sem a conferência do
    portão, o `sub` vira um campo que qualquer um escreve, e basta montar um JWT
    com o `sub` de um administrador para ler os códigos de todas as estações.
    """
    bloco = CONFIG_TOML[CONFIG_TOML.index("[functions.painel]"):]
    bloco = bloco.split("[functions.", 2)[1]
    assert "verify_jwt = true" in bloco


# ─── 3. O primeiro acesso não pede a grade de todo mundo ──────────────────────


def test_o_primeiro_acesso_pergunta_quantos_e_nao_a_lista():
    trecho = SCRIPT[SCRIPT.index("async function ensureUserPermissions"):]
    trecho = trecho[:trecho.index("function mostrarFalhaDePermissoes")]
    assert "/api/user/permissions/quantos" in trecho
    assert "data.total" in trecho
    assert "Array.isArray(data.permissions)" not in trecho, (
        "voltou a pedir a lista inteira para descobrir se está vazia"
    )


def test_a_tela_usa_o_que_o_banco_gravou_e_nao_o_que_ela_propos():
    """No primeiro acesso quem decide é o servidor.

    Se a tela seguisse com o corpo que mandou, ela mostraria um menu que o banco
    não concedeu — e a pessoa clicaria num botão que responde 403.
    """
    trecho = SCRIPT[SCRIPT.index("async function ensureUserPermissions"):]
    trecho = trecho[:trecho.index("function mostrarFalhaDePermissoes")]
    assert "const gravado = await salvarPermissoesNoMotor" in trecho
    assert "return { ...gravado }" in trecho


# ─── 4. A função não confia no corpo ──────────────────────────────────────────


def test_o_primeiro_acesso_e_escrito_pelo_servidor():
    """O corpo é descartado, e é isso que fecha a autopromoção."""
    trecho = FUNCAO[FUNCAO.index("async function gravarPermissoes"):]
    trecho = trecho[:trecho.index("// ─── Acessos locais")]
    # O corpo é substituído por inteiro antes de gravar.
    assert re.search(r"corpo\s*=\s*\{", trecho), "o corpo recebido não é substituído"
    assert "PADRAO_ADMIN" in trecho and "PADRAO_VISUALIZADOR" in trecho
    assert "so um administrador muda a permissao de outra pessoa" in trecho


def test_o_padrao_do_primeiro_acesso_so_usa_coluna_que_existe():
    """Coluna inventada faz o PostgREST recusar a gravação INTEIRA com 400.

    O efeito não é uma coluna a menos: é ninguém novo conseguindo entrar no
    painel, num caminho que só roda no primeiro login de cada pessoa — ou seja,
    que ninguém exercita ao testar com a própria conta. Já aconteceu aqui com
    `email`, que a função escrevia e a tabela não tem.

    A lista de referência é o `ROLE_DEFAULTS` do painel, que é o que a tela vem
    mandando ao banco há meses e portanto é sabidamente aceito.
    """
    conhecidas = set(re.findall(r"\bperm_[a-z_]+", SCRIPT))
    assert "perm_admin_edit" in conhecidas, "não achei o ROLE_DEFAULTS no script.js"

    bloco = FUNCAO[FUNCAO.index("const PADRAO_VISUALIZADOR"):FUNCAO.index("/** A linha de permissoes")]
    usadas = set(re.findall(r"\bperm_[a-z_]+", bloco))
    assert usadas, "os padrões do primeiro acesso sumiram"
    assert usadas <= conhecidas, f"colunas que a tela nunca gravou: {usadas - conhecidas}"


def test_o_primeiro_acesso_nao_grava_email():
    """A tabela não tem essa coluna — conferido contra o banco em 16/08/2026."""
    trecho = FUNCAO[FUNCAO.index("async function gravarPermissoes"):]
    trecho = trecho[:trecho.index("// ─── Acessos locais")]
    corpo = trecho[trecho.index("corpo = {"):]
    assert "email" not in corpo[:corpo.index("};")]


def test_a_lista_de_codigos_exige_o_modulo_usuarios_ate_para_ler():
    """Ler já é o estrago: os códigos saem em texto claro, e cada um destranca
    o painel de uma estação."""
    trecho = FUNCAO[FUNCAO.index('if (p[0] === "acessos-locais")'):]
    trecho = trecho[:trecho.index('if (p[0] === "ordens")')]
    leitura = trecho[trecho.index('req.method === "GET"'):]
    assert "exigirModuloUsuarios" in leitura[:200]


def test_o_modulo_sai_da_grade_e_nao_do_papel():
    """O usuário edita a grade ao vivo; olhar o `role` recusaria quem ele
    liberou de propósito."""
    puro = _ler("supabase", "functions", "painel", "puro.ts")
    corpo = puro[puro.index("export function podeVerUsuarios"):]
    assert "perm_admin_view" in corpo and "perm_admin_edit" in corpo
    assert "role" not in corpo, (
        "a decisão voltou a olhar o papel; quem manda é a grade, que o dono da "
        "gráfica edita ao vivo"
    )
