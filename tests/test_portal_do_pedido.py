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


def _so_o_sql(texto):
    """Sem as linhas de comentario.

    Sem isto, a prosa que EXPLICA por que um campo ficou de fora contaria como o
    campo estando la -- e um arquivo bem comentado reprovaria por dizer a
    verdade.
    """
    return "\n".join(l for l in texto.splitlines() if not l.lstrip().startswith("--"))


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


def test_a_funcao_devolve_as_oito_chaves_que_a_tela_usa():
    corpo = _corpo_da_funcao()
    for chave in ("'pedido'", "'cliente'", "'endereco'", "'itens'", "'os'", "'frete'",
                  "'pagamentos'", "'entrega'"):
        assert chave in corpo, f"a chave {chave} sumiu do retorno"


def test_o_link_de_pagamento_vem_das_cobrancas_do_pedido():
    """O link mora em `pagamentos_v2.url_cobranca` -- por exemplo
    `https://pay.ai-ideal.com.br/i/a21f550f`, do pedido 20927 -- e a forma em
    `tipo_cobranca` (PIX, BOLETO, CARD_PARCELADO, E-FATURADO, E-CREDITO).

    O campo `propostas_os.link_pagamento`, que a v656 lia, esta vazio nas 23
    linhas daquela tabela: nunca foi por ali.
    """
    corpo = _corpo_da_funcao()
    assert "FROM pagamentos_v2" in corpo
    assert "p2.url_cobranca" in corpo
    assert "p2.tipo_cobranca" in corpo


def test_a_cobranca_cancelada_nao_vai_para_o_cliente():
    """O link de uma cobranca cancelada ainda abre. Mandar o cliente pagar uma
    cobranca que a grafica cancelou e pior do que nao mostrar nada."""
    corpo = _corpo_da_funcao()
    assert "<> 'CANCELADO'" in corpo


def test_a_funcao_nao_devolve_o_codigo_do_pix_nem_o_do_boleto():
    """Esta funcao e a porta de uma pagina publica: ela entrega o ENDERECO da
    cobranca, e o gateway mostra o resto depois de o cliente chegar la."""
    corpo = _so_o_sql(_corpo_da_funcao())
    for proibido in ("pix_copia_cola", "linha_digitavel", "cartao_checkout_id"):
        assert proibido not in corpo, f"{proibido} nao pode sair para o cliente"


def test_o_prazo_de_envio_vem_da_cotacao_escolhida():
    """`propostas` guarda o nome e o valor do frete, mas NAO o prazo. Ele mora
    em `cotacao_frete`, na linha que o cliente escolheu -- 2.164 pedidos ja tem
    uma, medido em 20/08/2026.

    A ordem por `created_at DESC` importa: um pedido pode ter mais de uma linha
    marcada como escolhida, porque a expedicao recota quando o peso ou o
    endereco mudam. Vale a ultima.
    """
    corpo = _corpo_da_funcao()
    assert "FROM cotacao_frete" in corpo
    assert "c.escolhido IS TRUE" in corpo
    assert "ORDER BY c.created_at DESC" in corpo


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


def test_a_pagina_nao_baixa_o_catalogo_de_produtos_inteiro():
    """`select('*')` em `produtos` trazia 44 colunas -- descricao, frase de
    conservacao, informacoes fiscais, CFOP, NCM -- para usar cinco. Medido em
    20/08/2026: 80 kB para entregar 12 kB, antes do primeiro pixel de uma pagina
    que o cliente abre no 4G.

    As LINHAS continuam vindo todas, e de proposito: quando o item nao traz
    `id_produto`, esta pagina acha o produto pelo nome e pelos apelidos, e uma
    lista filtrada por id deixaria de fora justamente o produto que so o nome
    encontraria.
    """
    fonte = _ler_cliente()
    assert "from('produtos').select('*')" not in fonte
    assert "'id, id_produto, nomeReal, apelidos, id_formato'" in fonte


def test_sem_endereco_escolhido_vale_o_principal():
    """Regra do usuario, 20/08/2026: sem endereco escolhido no pedido, mostrar
    sempre o PRINCIPAL do cadastro.

    Ela e necessaria -- 2.024 dos 4.001 pedidos dos ultimos 90 dias estao com
    `id_endereco_ent` vazio -- e resolve quase tudo: dos 1.218 clientes desses
    pedidos, 1.217 tem exatamente um endereco marcado como principal, nenhum tem
    dois, e o unico sem principal tem um endereco so.

    O `upper(btrim(...))` importa: a coluna vem do ERP com as duas grafias,
    "principal" e "Principal".
    """
    corpo = _so_o_sql(_corpo_da_funcao())
    assert "upper(btrim(COALESCE(e.tipo_endereco, ''))) = 'PRINCIPAL'" in corpo


def test_o_endereco_da_grafica_vem_do_cadastro_do_erp():
    """Na RETIRADA o endereco e o da grafica. Ele e LIDO de `empresas` -- se ela
    mudar de endereco, o ERP atualiza e a pagina acompanha, sem release."""
    corpo = _so_o_sql(_corpo_da_funcao())
    assert "FROM empresas" in corpo
    assert "'grafica'" in corpo
    # E nao escrito no codigo:
    assert "FELIZARDO" not in corpo.upper()


def test_a_nota_traz_o_endereco_do_cnpj_que_ela_mostra():
    """Pedido do usuario em 25/08/2026: *"no link onde mostra e pede confirmacao
    dos dados da nota fiscal, deve mostrar tambem o endereco relativo ao CNPJ
    mostrado"*.

    O detalhe que decide tudo: a busca e pelo `id_faturado`, o MESMO id que
    preenche o `cliente` da nota -- e nao pelo `id_cliente`, que e de quem recebe
    o pacote. Em 6 dos 62 links ativos daquele dia os dois sao diferentes (o
    pedido 20974 entrega na Rua General Osorio e fatura na Rua Marechal Deodoro),
    e usar o errado poria, embaixo de um CNPJ, o endereco de outra empresa.
    """
    corpo = _so_o_sql(_corpo_da_funcao())

    assert "'endereco_faturamento'" in corpo, "a funcao precisa devolver o campo"
    assert "v_end_fat" in corpo, "com uma variavel propria, separada da entrega"

    # A busca e pelo faturado.
    assert "e.id_cliente = COALESCE(v_prop.id_faturado, v_prop.id_cliente)" in corpo, (
        "o endereco da nota tem de sair do mesmo id que o cadastro da nota"
    )


def test_o_endereco_da_nota_nao_carrega_quem_recebe_o_pacote():
    """`recebedor` e `cpf_recebedor` sao da ENTREGA.

    Numa nota fiscal eles nao tem o que fazer, e esta pagina e publica: campo que
    a tela nao mostra nao sai do banco.
    """
    corpo = _so_o_sql(_corpo_da_funcao())
    i = corpo.index("'endereco_faturamento'")
    bloco = corpo[i:corpo.index("END,", i)]

    assert "recebedor" not in bloco, "o bloco da nota nao manda recebedor"
    assert "cpf_recebedor" not in bloco, "nem o CPF dele"
    assert "'cep'" in bloco and "'cidade'" in bloco, "mas manda o endereco todo"
