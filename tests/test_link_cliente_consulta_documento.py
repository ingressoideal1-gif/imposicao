from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]
SQL = (RAIZ / "sql" / "link_cliente_consulta_documento.sql").read_text(encoding="utf-8")


def test_consulta_documento_exige_link_ativo_e_guarda_apenas_hash():
    fonte = SQL.lower()
    assert "numero_pedido = p_numero" in fonte
    assert "token = p_token" in fonte
    assert "ativo is true" in fonte
    assert "documento_hash text not null" in fonte
    assert "p_documento_hash" in fonte
    assert "documento text" not in fonte


def test_consulta_documento_tem_limites_e_serializa_por_link():
    fonte = SQL.lower()
    assert "for update" in fonte
    assert "v_total >= 10" in fonte
    assert "v_distintos >= 5" in fonte
    assert "interval '1 hour'" in fonte


def test_tabela_e_funcoes_nao_ficam_expostas_ao_portal():
    fonte = SQL.lower()
    assert "enable row level security" in fonte
    assert "revoke all on table public.portal_consultas_documento from public, anon, authenticated" in fonte
    assert "revoke all on function public.link_cliente_registrar_consulta_documento(text,text,text) from public" in fonte
    assert "grant execute on function public.link_cliente_registrar_consulta_documento(text,text,text) to service_role" in fonte
    assert "revoke all on function public.portal_segredo_cpfhub() from public" in fonte
    assert "grant execute on function public.portal_segredo_cpfhub() to service_role" in fonte


def test_segredo_e_lido_do_vault_e_nao_embutido_no_sql():
    fonte = SQL.lower()
    assert "vault.decrypted_secrets" in fonte
    assert "name = 'cpfhub_token'" in fonte
    assert "x-api-key" not in fonte


def test_edge_aceita_o_token_historico_de_doze_caracteres():
    fonte = (RAIZ / "supabase" / "functions" / "consulta-documento-entrega" / "index.ts").read_text(
        encoding="utf-8"
    )
    assert "token.length < 20" not in fonte
    assert "!token || token.length > 200" in fonte
