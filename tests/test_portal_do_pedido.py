# -*- coding: utf-8 -*-
"""A porta do Portal do Pedido: um JSON so, exigindo numero+token.

## Por que esta funcao existe

Ate 20/08/2026 a pagina do link do cliente montava a tela com SEIS consultas
diretas, todas com a chave anonima -- a que esta no codigo-fonte da pagina e que
qualquer um le com Ctrl+U. Uma delas era `select('*')` em `clientes`, que traz
`limite_credito`, `risco_credito` e `total_compras` junto do nome e do CNPJ que a
tela mostra.

Isso ja era demais para uma pagina publica. Com o Portal do Pedido, ela passa a
mostrar tambem VALORES -- orcamento, frete, total, link de pagamento --, e a
porta precisou mudar antes de o dinheiro entrar na tela.

`link_cliente_pedido` e a mesma solucao que `link_cliente_abrir` ja usa desde
16/08/2026: `SECURITY DEFINER`, o par numero+token exigido no corpo, e so os
campos que a tela mostra saindo de volta. RLS nao resolveria: ela nao sabe exigir
que alguem FILTRE por uma coluna, entao uma politica que deixasse o cliente ler a
linha dele deixaria `select=*` sem filtro devolver todas.

## O que estes testes prendem

Eles leem o arquivo SQL, no mesmo estilo do `test_link_do_cliente_pelo_token.py`.
Nao substituem a conferencia contra o banco (que esta no fim do proprio arquivo
SQL, e roda junto com ele) -- prendem as decisoes que sao faceis de desfazer sem
perceber: o `search_path` fixo, o par exigido, o token que nao volta, e a lista
de campos do cadastro.
"""
import glob
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "link_cliente_pedido.sql")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def _ler_cliente():
    """Todo o JavaScript da pagina do cliente, num texto so.

    O `cliente.js` foi dividido em `cliente-*.js`: ler um arquivo so deixaria de
    enxergar metade das regras.
    """
    arquivos = sorted(glob.glob(os.path.join(RAIZ, "frontend", "cliente*.js")))
    assert arquivos, "nao achei os arquivos da pagina do cliente"
    return "\n".join(_ler(a) for a in arquivos)


def _corpo_da_funcao():
    """So o que vai para o banco, sem o cabecalho explicativo.

    O cabecalho CITA os campos proibidos, para dizer por que eles ficaram de
    fora -- procurar por eles no arquivo inteiro reprovaria a propria
    explicacao.
    """
    sql = _ler(SQL)
    return sql[sql.index("CREATE OR REPLACE FUNCTION public.link_cliente_pedido"):]


def test_a_funcao_nasce_com_os_cuidados_de_security_definer():
    """Sem `search_path` fixo, quem controlasse o da sessao faria a funcao
    enxergar uma tabela sua com o mesmo nome."""
    corpo = _corpo_da_funcao()
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = public" in corpo


def test_a_funcao_exige_o_par_numero_e_token():
    corpo = _corpo_da_funcao()
    assert "l.numero_pedido = p_numero" in corpo
    assert "l.token = p_token" in corpo
    assert "l.ativo IS TRUE" in corpo, "link revogado tem de parar de abrir"


def test_a_funcao_nao_devolve_o_token():
    """Devolver o token ao navegador entregaria justamente o que se protege --
    e a pagina do cliente ja o tem na URL."""
    corpo = _corpo_da_funcao()
    assert "'token'" not in corpo


def test_a_funcao_nao_devolve_dado_financeiro_do_cadastro():
    """`select('*')` em `clientes` trazia limite de credito, risco e total de
    compras para uma pagina publica. A funcao lista os campos um a um."""
    corpo = _corpo_da_funcao()
    for proibido in ("limite_credito", "risco_credito", "total_compras", "usa_preco_fixo"):
        assert proibido not in corpo, f"{proibido} nao pode sair para o cliente"


def test_a_funcao_devolve_as_seis_chaves_que_a_tela_usa():
    corpo = _corpo_da_funcao()
    for chave in ("'pedido'", "'cliente'", "'endereco'", "'itens'", "'os'", "'entrega'"):
        assert chave in corpo, f"a chave {chave} sumiu do retorno"


def test_a_funcao_e_chamavel_pela_chave_anonima():
    """O cliente nao tem login, e nunca vai ter: o link dele chega pelo
    WhatsApp."""
    corpo = _corpo_da_funcao()
    assert "GRANT EXECUTE ON FUNCTION public.link_cliente_pedido(text, text) TO anon" in corpo


def test_o_arquivo_e_aditivo():
    """Fechar privilegio de tabela do parceiro nao e decisao deste projeto: as
    tabelas `propostas`, `clientes` e `enderecos` sao do ERP, e revogar acesso
    ali quebraria telas que nao sao nossas. O que este desenho faz e PARAR DE
    USAR aquela porta na pagina publica."""
    sql = _ler(SQL).upper()
    for perigoso in ("REVOKE", "DROP TABLE", "ALTER TABLE", "TRUNCATE", "DELETE FROM"):
        assert perigoso not in sql, f"{perigoso} nao pertence a este arquivo"


def test_o_nome_do_cliente_vem_da_coluna_que_existe():
    """`cliente_nome` nao existe em `propostas` -- a coluna e `cliente`.

    Por isso o `<p id="cliente-pedido-cliente">` do cabecalho ficou vazio desde
    sempre: um `|| ''` transformava a coluna inexistente em texto vazio, e campo
    vazio nao parece defeito -- parece pedido sem nome. O painel sempre acertou
    (`propReal?.cliente || ...`); so a pagina do cliente errava.
    """
    fonte = _ler_cliente()
    assert ".cliente_nome" not in fonte, "a leitura da coluna que nao existe voltou"
    assert "portal.pedido.cliente" in fonte


def test_a_carga_do_portal_passa_pela_funcao():
    fonte = _ler_cliente()
    assert "rpc('link_cliente_pedido'" in fonte
