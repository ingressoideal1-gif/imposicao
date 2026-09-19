from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]
LEITURA = (RAIZ / "sql" / "link_cliente_pedido_enderecos_portal.sql").read_text(encoding="utf-8")
GRAVACAO = (RAIZ / "sql" / "link_cliente_salvar_faturamento.sql").read_text(encoding="utf-8")


def test_leitura_lista_somente_cadastros_vinculados_ao_cliente_do_pedido():
    assert "'cadastros_faturamento'" in LEITURA
    assert "id_cliente_titular = v_prop.id_cliente" in LEITURA
    assert "REVOKE ALL ON TABLE public.clientes_faturamento_portal" in LEITURA


def test_gravacao_exige_link_ativo_e_confere_vinculo_anterior():
    assert "token = p_token AND ativo IS TRUE FOR UPDATE" in GRAVACAO
    assert "COALESCE(v_prop.id_faturado, v_prop.id_cliente) IS DISTINCT FROM p_anterior_id" in GRAVACAO
    assert "cadastro fiscal não pertence a este cliente" in GRAVACAO


def test_cnpj_existente_nao_e_editado_e_cpf_nao_troca_documento():
    bloco = GRAVACAO.split("IF length(v_documento) = 11 THEN", 1)[1].split("ELSIF length(v_documento) <> 14", 1)[0]
    assert "UPDATE public.clientes" in bloco
    assert "o CPF do cadastro não pode ser trocado" in bloco
    assert "UPDATE public.clientes" not in GRAVACAO.split("ELSIF length(v_documento) <> 14", 1)[1]


def test_update_da_proposta_e_guardado_contra_efeitos_colaterais():
    assert "UPDATE public.propostas SET id_faturado = v_id" in GRAVACAO
    assert "to_jsonb(v_depois) - ARRAY['id_faturado','updated_at']" in GRAVACAO
    assert "cadastro fiscal persistido diverge do solicitado" in GRAVACAO


def test_documento_global_nao_e_associado_por_adivinhacao():
    assert "este documento já possui cadastro" in GRAVACAO
    assert "regexp_replace(coalesce(c.documento,''),'[^0-9]','','g') = v_documento" in GRAVACAO
