from pathlib import Path


SQL = (Path(__file__).parents[1] / "sql" / "link_cliente_pedido_enderecos_portal.sql").read_text(encoding="utf-8")


def test_lista_enderecos_e_limitada_ao_cliente_do_pedido():
    bloco = SQL.split("'enderecos_entrega'", 1)[1].split("'endereco_faturamento'", 1)[0]
    assert "e.id_cliente = v_prop.id_cliente" in bloco
    assert "v_prop.id_faturado" not in bloco


def test_copias_privadas_de_outros_pedidos_nao_entram_no_modal():
    bloco = SQL.split("'enderecos_entrega'", 1)[1].split("'endereco_faturamento'", 1)[0]
    assert "NOT LIKE 'portal-entrega-pedido:%'" in bloco
    assert "e.id::text = v_prop.id_endereco_ent" in bloco


def test_modal_recebe_apenas_os_campos_necessarios_da_entrega():
    bloco = SQL.split("'enderecos_entrega'", 1)[1].split("'endereco_faturamento'", 1)[0]
    for campo in ("recebedor", "cpf_recebedor", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep"):
        assert f"'{campo}'" in bloco
    for campo in ("limite_credito", "risco_credito", "email", "telefone"):
        assert campo not in bloco
