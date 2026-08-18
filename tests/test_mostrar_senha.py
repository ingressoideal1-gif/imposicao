# -*- coding: utf-8 -*-
"""O olho de mostrar/ocultar senha, o teclado certo e o Enter em todo
formulario da casa do aplicativo.

Nasceu de um caso real: a senha provisoria que a grafica passa e algo como
`K7M2PQ9X` -- letras e numeros dificeis de acertar de cabeca, digitados com o
polegar, num campo que esconde cada tecla assim que ela sai do dedo.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_todo_campo_de_senha_tem_o_olho_ao_lado():
    """Cada `input[type=password]` da casa ganha um `.olho-senha` irmao,
    com "Mostrar" escrito -- rotulo em texto, regra do projeto."""
    saida = _no_navegador("""
        const campos = [...document.querySelectorAll('input[type="password"]')];
        return campos.map(c => {
            const botao = c.parentElement && c.parentElement.querySelector('.olho-senha');
            return { id: c.id, temBotao: !!botao, texto: botao && botao.textContent };
        });
    """)
    assert len(saida) >= 6, "esperava os seis campos de senha da casa"
    for campo in saida:
        assert campo["temBotao"], "%s nao tem o olho de mostrar a senha" % campo["id"]
        assert campo["texto"] == "Mostrar"


def test_tocar_no_olho_mostra_a_senha_e_tocar_de_novo_esconde():
    saida = _no_navegador("""
        const campo = document.getElementById('senha');
        const botao = campo.parentElement.querySelector('.olho-senha');
        botao.click();
        const depoisDeUmToque = { type: campo.type, texto: botao.textContent,
                                   pressionado: botao.getAttribute('aria-pressed') };
        botao.click();
        const depoisDeDois = { type: campo.type, texto: botao.textContent,
                                pressionado: botao.getAttribute('aria-pressed') };
        return { depoisDeUmToque, depoisDeDois };
    """)
    assert saida["depoisDeUmToque"] == {
        "type": "text", "texto": "Ocultar", "pressionado": "true"
    }
    assert saida["depoisDeDois"] == {
        "type": "password", "texto": "Mostrar", "pressionado": "false"
    }


def test_o_olho_aponta_para_o_campo_que_ele_controla():
    saida = _no_navegador("""
        const campo = document.getElementById('senha');
        const botao = campo.parentElement.querySelector('.olho-senha');
        return { ariaControls: botao.getAttribute('aria-controls') };
    """)
    assert saida["ariaControls"] == "senha"


def test_o_email_nao_oferece_maiuscula_automatica_nem_corretor():
    """O e-mail e digitado, nao escolhido -- e maiuscula automatica ou
    corretor trocam o que a pessoa quis digitar por outra coisa."""
    saida = _no_navegador("""
        const c = document.getElementById('email');
        return {
            autocapitalize: c.getAttribute('autocapitalize'),
            autocorrect: c.getAttribute('autocorrect'),
            spellcheck: c.getAttribute('spellcheck'),
        };
    """)
    assert saida["autocapitalize"] == "none"
    assert saida["autocorrect"] == "off"
    assert saida["spellcheck"] == "false"


def test_enter_no_email_leva_o_foco_para_a_senha():
    saida = _no_navegador("""
        const email = document.getElementById('email');
        email.focus();
        email.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return { focoNaSenha: document.activeElement.id === 'senha' };
    """)
    assert saida["focoNaSenha"] is True


def test_enter_na_confirmacao_da_senha_nova_dispara_o_salvar():
    """Espia com um listener proprio: `btn-trocar-senha` ja tem `onclick`
    (a validacao de verdade), e o Enter precisa disparar o MESMO clique --
    e nao um caminho paralelo que a burla."""
    saida = _no_navegador("""
        window.__clicou = false;
        document.getElementById('btn-trocar-senha')
            .addEventListener('click', () => { window.__clicou = true; });
        window.conta.mostrarTrocarSenha({ obrigatoria: false });
        const campo = document.getElementById('campo-senha-confirma');
        campo.value = 'novasenha123';
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(r => setTimeout(r, 30));
        return { clicou: window.__clicou };
    """)
    assert saida["clicou"] is True


def test_enter_na_senha_atual_e_na_senha_nova_avanca_para_o_proximo_campo():
    saida = _no_navegador("""
        window.conta.mostrarTrocarSenha({ obrigatoria: false });
        const atual = document.getElementById('campo-senha-atual');
        atual.focus();
        atual.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const focoNaNova = document.activeElement.id === 'campo-senha-nova';
        document.activeElement.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const focoNaConfirma = document.activeElement.id === 'campo-senha-confirma';
        return { focoNaNova, focoNaConfirma };
    """)
    assert saida["focoNaNova"] is True
    assert saida["focoNaConfirma"] is True


def test_os_tres_lugares_citam_o_arquivo_novo():
    """Sem os tres, `mostrar-senha.js` da 404 na estacao, fica congelado na
    versao do build, ou nem chega a carregar no navegador."""
    import security_config

    assert "mostrar-senha.js" in security_config.PAINEL_ARQUIVOS
    assert "mostrar-senha.js" in _ler("frontend/sw.js")
    assert "mostrar-senha.js" in _ler("frontend/controle.html")
