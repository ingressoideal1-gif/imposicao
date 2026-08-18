# -*- coding: utf-8 -*-
"""O campo opcional da caixa de confirmação (Task 6, 18/08/2026: "nome do
aparelho na hora"). Sem `opcoes.campo` a caixa continua exatamente como era --
`Promise<boolean>`; com ele, ganha um `<label>` + `<input>` entre o texto e os
botões, e a promessa passa a resolver com a string digitada (ou `null` ao
cancelar). Ver o cabeçalho do `frontend/caixa-confirmar.js` para o motivo de
esta caixa existir: `window.confirm`/`prompt` não respondem no aplicativo
instalado.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from test_controle_tela import _no_navegador  # noqa: E402

CAMPO = """
    campo: { id: 'campo-nome-aparelho', rotulo: 'Nome deste aparelho (opcional)',
             valor: 'Aparelho 3', maxlength: 60 }
"""


def test_sem_campo_continua_resolvendo_booleano():
    """Nenhum chamador atual muda: sem `opcoes.campo`, o comportamento de
    sempre -- confirmar dá `true`, cancelar dá `false`."""
    saida = _no_navegador("""
        const p1 = window.caixaConfirmar.perguntar('Finalizar?', { rotulo: 'Finalizar' });
        document.getElementById('btn-confirmar-sim').click();
        const r1 = await p1;

        const p2 = window.caixaConfirmar.perguntar('Finalizar?', { rotulo: 'Finalizar' });
        document.getElementById('btn-confirmar-nao').click();
        const r2 = await p2;

        return { r1, tipo1: typeof r1, r2, tipo2: typeof r2 };
    """)
    assert saida == {"r1": True, "tipo1": "boolean", "r2": False, "tipo2": "boolean"}


def test_campo_aparece_ENTRE_o_texto_e_os_botoes_com_os_atributos_certos():
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho no evento Click?', {
            rotulo: 'Sim, usar este aparelho', """ + CAMPO + """
        });
        const caixa = document.querySelector('.caixa-confirmar');
        const ordem = Array.from(caixa.children).map(el => el.tagName + (el.id ? '#' + el.id : ''));
        const input = document.getElementById('campo-nome-aparelho');
        const label = document.querySelector('label[for="campo-nome-aparelho"]');
        document.getElementById('btn-confirmar-nao').click();
        await p;
        return {
            ordem,
            tipo: input.type,
            maxlength: input.maxLength,
            valorInicial: input.value,
            autocomplete: input.autocomplete,
            rotuloTexto: label && label.textContent,
        };
    """)
    # <p>, depois <label> + <input>, depois a linha de botões.
    assert saida["ordem"] == ["P#texto-confirmar", "LABEL", "INPUT#campo-nome-aparelho",
                               "DIV"]
    assert saida["tipo"] == "text"
    assert saida["maxlength"] == 60
    assert saida["valorInicial"] == "Aparelho 3"
    assert saida["autocomplete"] == "off"
    assert saida["rotuloTexto"] == "Nome deste aparelho (opcional)"


def test_confirmar_com_campo_resolve_o_texto_digitado_e_aparado():
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho?', { """ + CAMPO + """ });
        document.getElementById('campo-nome-aparelho').value = '  Leitor da entrada  ';
        document.getElementById('btn-confirmar-sim').click();
        return await p;
    """)
    assert saida == "Leitor da entrada"


def test_confirmar_com_campo_VAZIO_resolve_a_sugestao():
    """Vazio não é "sem nome": vira o `valor` que já estava sugerido no campo."""
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho?', { """ + CAMPO + """ });
        document.getElementById('campo-nome-aparelho').value = '';
        document.getElementById('btn-confirmar-sim').click();
        return await p;
    """)
    assert saida == "Aparelho 3"


def test_cancelar_com_campo_resolve_null_e_NAO_string_vazia():
    """`null` é o único jeito de "cancelou" não se confundir com uma string --
    inclusive uma vazia, que `if (resultado)` trataria como verdadeira."""
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho?', { """ + CAMPO + """ });
        document.getElementById('campo-nome-aparelho').value = 'Nao importa';
        document.getElementById('btn-confirmar-nao').click();
        return await p;
    """)
    assert saida is None


def test_Enter_no_campo_confirma_como_o_botao_Sim():
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho?', { """ + CAMPO + """ });
        const campo = document.getElementById('campo-nome-aparelho');
        campo.value = 'Leitor 2';
        campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        return await p;
    """)
    assert saida == "Leitor 2"


def test_com_campo_o_foco_nasce_NELE_e_nao_em_Cancelar():
    """Diferente da caixa sem campo (foco em Cancelar, de propósito, contra um
    Enter solto): aqui há um campo para preencher, e o Enter dele é o gesto
    esperado -- por isso o foco nasce no campo, pronto para editar."""
    saida = _no_navegador("""
        const p = window.caixaConfirmar.perguntar('Usar este aparelho?', { """ + CAMPO + """ });
        const focoNoCampo = document.activeElement.id === 'campo-nome-aparelho';
        document.getElementById('btn-confirmar-nao').click();
        await p;
        return focoNoCampo;
    """)
    assert saida is True
