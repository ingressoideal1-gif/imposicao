# -*- coding: utf-8 -*-
"""A conta com que o cliente entra é a que ele já tem no ERP Vibe.

Regra do usuário, 14/08/2026: "a conta de cadastro ao abrir o controle de acesso
deve ser a mesma conta, email e senha, cadastrada pelo cliente no Vibe pelo
supabase".

Ela se sustenta quase sozinha, porque o Ideal Imposition e o Vibecode
compartilham o mesmo projeto Supabase e, portanto, o mesmo `auth.users`. O que
precisa de vigilância é o outro lado: **nenhuma tela nossa pode oferecer criação
de conta**.

Uma conta criada aqui funciona — ela existe no `auth.users` e o login passa. O
estrago é silencioso e só aparece depois: ela não tem relação nenhuma com o
cadastro do cliente no ERP, e o evento, os setores e a portaria inteira ficam
pendurados na identidade errada. Descobrir isso significa refazer o cadastro do
evento com o lote já impresso.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")


def _ler(nome):
    with open(os.path.join(FRONTEND, nome), encoding="utf-8") as f:
        return f.read()


def _login_do_cliente():
    """A superfície inteira do login do cliente.

    Desde a Tarefa 8, `evento.js` não fala com o Supabase direto: quem faz
    isso é `acesso-conta.js`, compartilhado com `controle.html`. Testar só
    `evento.js` checaria um arquivo que, de propósito, não tem mais essa
    lógica — a extração é o ponto da tarefa, não uma regressão.
    """
    return _ler("evento.js") + _ler("acesso-conta.js")


def test_o_mesmo_projeto_supabase_do_vibe():
    """Se os dois projetos divergissem, o login do cliente pararia de valer.

    E pararia de um jeito confuso: "e-mail ou senha inválidos" para uma senha
    que o cliente sabe estar certa, porque estaria certa — no outro projeto.
    """
    config = _ler("supabase-config.js")
    assert "vwbtitjlpelrcnsytzqw.supabase.co" in config

    # A tela do cliente não pode criar um client próprio apontando para outro
    # lugar: ela usa o `supabaseClient` que este arquivo monta.
    login = _login_do_cliente()
    assert "createClient" not in login
    assert "supabaseClient.auth" in login


def test_a_tela_do_cliente_nao_cria_conta():
    """O `signUp` é a única forma de nascer uma identidade fora do Vibe."""
    login = _login_do_cliente()
    assert "signUp" not in login, (
        "o login do cliente oferece criacao de conta; a conta tem de ser a do Vibe"
    )
    assert "signInWithPassword" in login


def test_o_painel_da_grafica_tambem_nao_cria_conta():
    """A mesma regra, no painel — ele sempre foi assim, e tem de continuar."""
    assert "signUp" not in _ler("script.js")


def test_a_tela_diz_de_que_conta_esta_falando():
    """Sem isso o cliente tenta uma conta que ele nao tem e culpa o sistema.

    A conta continua sendo a MESMA do ERP — o que mudou em 17/08/2026 foi de
    quem o cliente a recebe. Ele nao cria acesso em lugar nenhum: quem libera o
    e-mail dele e passa a senha provisoria e a grafica. Dizer "Vibe" na tela
    mandava-o procurar uma senha que ele talvez nunca tenha escolhido; dizer
    "a grafica liberou" nomeia quem ele pode chamar no telefone.

    A tela lida e a `controle.html`, a casa do aplicativo. O `evento.html`
    tinha esta frase antes e sai do projeto.
    """
    html = _ler("controle.html")
    assert re.search(r"a gráfica liberou", html), (
        "controle.html nao diz ao cliente de onde vem o acesso dele"
    )


def test_quem_esqueceu_a_senha_tem_saida_sem_criar_outra_conta():
    """A recuperacao age sobre a conta que existe; criar outra e o erro.

    Ate 17/08/2026 a saida era o `resetPasswordForEmail` do Supabase. Ela saiu
    porque o projeto nao tem SMTP: o link nunca chegava, e a tela prometia um
    e-mail que nao existia — pior do que nao oferecer saida nenhuma. A saida
    agora e a grafica passar uma senha provisoria NOVA, que derruba a anterior.
    O que este teste guarda continua sendo o mesmo: ha uma saida, e ela nao
    passa por criar outra conta.
    """
    login = _login_do_cliente()
    assert "esqueciSenha" in login
    assert "gráfica" in _ler("acesso-conta.js"), (
        "a saida de quem esqueceu a senha nao diz a quem pedir"
    )
