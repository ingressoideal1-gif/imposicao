# -*- coding: utf-8 -*-
"""O dono configura o aparelho NO PROPRIO APARELHO, com uma senha so.

O que estes testes protegem e a propriedade que o codigo de seis caracteres
comprava: a senha do dono nunca ficava no celular que ele entrega ao porteiro.
Trocar o codigo pela senha e deixar a sessao aberta seria pior que o desenho
antigo, nao melhor -- e o que impede isso e a ORDEM das operacoes ao salvar.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── O banco ─────────────────────────────────────────────────────────────────

def test_o_sql_libera_o_codigo_nulo_e_diz_por_que():
    """Aparelho configurado no proprio aparelho nao tem codigo -- e nao deve
    ter: codigo guardado no banco e codigo que pearia um SEGUNDO celular
    naquele portao."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql")
    assert "ALTER TABLE producao_acesso_dispositivos" in sql
    assert "DROP NOT NULL" in sql
    assert "codigo_hash" in sql


def test_o_sql_confere_o_que_fez():
    """Regra deste projeto: o script termina mostrando o resultado, senao nao
    ha como saber se deu certo -- foi assim que uma migracao anterior terminou
    com "Success. No rows returned" e ninguem soube dizer se rodara."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql")
    assert "information_schema.columns" in sql
    assert "is_nullable" in sql


def test_o_sql_nao_apaga_nada():
    """Os aparelhos que ja existem continuam com o codigo deles, e o caminho
    antigo continua funcionando: esta migracao permite a ausencia, nao a
    impoe."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql").upper()
    for perigoso in ("DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE"):
        assert perigoso not in sql, "a migracao contem " + perigoso


# ── O servidor ──────────────────────────────────────────────────────────────

def test_o_hash_do_token_tem_uma_definicao_so():
    """O defeito mais caro possivel aqui seria silencioso.

    Quem CUNHA o token e a criacao do aparelho; quem o CONFERE, a cada
    requisicao, e a portaria. Duas definicoes do mesmo hash divergiriam algum
    dia, e o sintoma seria o aparelho recusado sem motivo aparente -- no
    portao, com fila.
    """
    compartilhado = _ler("supabase/functions/_compartilhado/hash.ts")
    assert "export async function hashDoToken" in compartilhado
    assert "export function tokenNovo" in compartilhado

    portaria = _ler("supabase/functions/portaria/index.ts")
    assert "async function hashDoToken" not in portaria, (
        "a portaria tem copia propria do hash do token"
    )
    assert "hashDoToken" in portaria, "a portaria deixou de conferir o token"


def test_o_aparelho_daqui_nasce_com_token_e_sem_codigo():
    ts = _ler("supabase/functions/_compartilhado/configuracao.ts")
    assert "aplicarAparelhoAqui" in ts
    corpo = ts[ts.index("export async function aplicarAparelhoAqui"):]
    corpo = corpo[:corpo.index("\n}")]
    assert "codigo_hash: null" in corpo, (
        "codigo guardado e codigo que pearia um segundo celular naquele portao"
    )
    assert "token_hash" in corpo


def test_uma_senha_serve_para_entrar_e_para_elevar():
    """Decisao do usuario: "apenas uma senha".

    Entrar e elevar sao duas chamadas, e continuam sendo -- o login e do
    Supabase, a elevacao e nossa, assinada e com prazo. O que a decisao proibe e
    a PESSOA digitar duas vezes, e no portao, com o dono de pe, isso pesa.
    """
    js = _ler("frontend/acesso-conta.js")
    assert "entrarEElevar" in js
    corpo = js[js.index("function entrarEElevar"):]
    corpo = corpo[:corpo.index("\n    }")]
    assert "entrar(" in corpo and "/elevar" in corpo


def test_a_senha_nao_e_guardada():
    """Ela vive no argumento da funcao e morre com ela."""
    js = _ler("frontend/acesso-conta.js")
    corpo = js[js.index("function entrarEElevar"):]
    corpo = corpo[:corpo.index("\n    }")]
    for guardar in ("localStorage", "sessionStorage", "indexedDB"):
        assert guardar not in corpo, "a senha encosta em " + guardar


def test_a_rota_do_aparelho_daqui_exige_elevacao():
    """Criar aparelho e escrita de configuracao. Sem elevacao, quem pegasse o
    celular do dono destrancado criaria portao."""
    ts = _ler("supabase/functions/acesso-conta/index.ts")
    corte = ts.index('p[3] === "aqui"')
    trecho = ts[corte:ts.index("return ok", corte)]
    assert "exigirElevacao" in trecho


# ── O aparelho assume o portao ──────────────────────────────────────────────

def test_o_token_e_guardado_ANTES_de_a_sessao_ser_encerrada():
    """Ordem errada aqui nao da erro na tela -- da um aparelho inutil no meio de
    um evento.

    O token e o que NAO da para recuperar: ele sai do servidor uma vez so. A
    conta, o dono reabre digitando a senha outra vez. Por isso o token vem
    primeiro.
    """
    js = _ler("frontend/aparelho.js")
    assert js.index("setItem(CHAVE_TOKEN") < js.index("signOut"), (
        "a sessao e encerrada antes de o token estar guardado"
    )


def test_o_token_entra_no_chaveiro_ANTES_de_a_sessao_sair():
    """A ordem inteira deste arquivo existe por isso.

    Gravar o chaveiro depois do `signOut` deixaria o aparelho com token e sem
    entrada na lista: o evento sumiria da tela inicial do proprio portao que o
    esta lendo.
    """
    texto = _ler("frontend/aparelho.js")
    assert texto.index("chaveiro.guardar") < texto.index("signOut")


def test_a_sessao_da_conta_nao_fica_no_aparelho():
    """O ponto que faz a mudanca valer.

    O codigo de seis caracteres existia para a senha do dono nunca chegar ao
    celular que fica com o porteiro. Trocar o codigo pela senha e DEIXAR a
    sessao aberta entregaria ao porteiro a conta inteira do cliente.
    """
    assert "signOut" in _ler("frontend/aparelho.js")


def test_o_portao_nao_entra_no_historico():
    """Sem `replace`, o botao "voltar" do celular devolveria o porteiro a tela
    de configuracao do dono."""
    js = _ler("frontend/aparelho.js")
    assert "location.replace" in js
    assert "location.href =" not in js


# ── A trava ─────────────────────────────────────────────────────────────────
#
# Decisao do usuario, 16/08/2026: "ao salvar registra apenas entradas
# configuradas, e nao deixa editar mais, somente com a senha".


def _corpo(js, assinatura):
    """O corpo de uma funcao de primeiro nivel destes arquivos.

    Todas moram dentro de um IIFE, entao a chave que as fecha e a primeira que
    aparece com exatamente quatro espacos de recuo.
    """
    corpo = js[js.index(assinatura):]
    return corpo[:corpo.index("\n    }")]


def test_a_trava_cobre_tambem_apagar():
    """Trava que protege a edicao e deixa o apagar livre nao e trava: desfaz-se
    o trabalho inteiro e refaz-se do zero sem senha nenhuma.

    `desparear` apagava token, carga, fila E entradas ali mesmo, sem que
    ninguem tivesse de provar quem era.
    """
    corpo = _corpo(_ler("frontend/portaria.js"), "function desparear")
    assert "irParaConfiguracao" in corpo
    for apagar in ("removeItem", "D.limpar"):
        assert apagar not in corpo, "desparear ainda apaga por conta propria"


def test_a_saida_do_portao_leva_a_lista_onde_a_senha_e_pedida():
    """O destino mudou em 16/08/2026: era `controle.html?configurar=1`, a tela
    de login, e passou a ser a lista de eventos. A senha continua sendo exigida
    -- quem a pede agora e a engrenagem de cada evento."""
    corpo = _corpo(_ler("frontend/portaria.js"), "function irParaConfiguracao")
    assert "controle.html" in corpo
    assert "configurar=1" not in corpo


def test_ha_saida_para_reconfigurar_o_aparelho():
    """Sem ela o celular fica preso no portao: com token guardado, a casa do
    aplicativo devolve este aparelho para a leitura, e da leitura nao havia
    como voltar."""
    assert 'id="btn-configurar-aparelho"' in _ler("frontend/portaria.html")


def test_a_fila_sobe_antes_de_o_aparelho_trocar_de_identidade():
    """Configurar cunha um token NOVO. Leitura enfileirada sob o token velho
    nao sobe depois -- e some a contagem que o cliente pagou para ter."""
    corpo = _corpo(_ler("frontend/portaria.js"), "function irParaConfiguracao")
    assert "sincronizar()" in corpo
    assert "contarFila" in corpo


def test_a_carga_do_aparelho_anterior_nao_sobrevive_a_configuracao():
    """A carga guarda o NOME do portao e os SETORES que ele valida.

    Reconfigurado o aparelho, a carga que esta no celular e do aparelho
    anterior: o topo mostraria o nome velho e a validacao usaria os setores
    velhos -- ingresso bom recusado como "OUTRA PORTA", sem nada na tela que
    explique. Quem avisa e esta marca, escrita ao assumir e lida no arranque.
    """
    marca = "ideal_portaria_reconfigurado"
    assert marca in _ler("frontend/aparelho.js")
    assert marca in _ler("frontend/portaria.js")
