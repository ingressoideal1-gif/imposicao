"""Paridade do contrato em prévia/PDF/publicação, sem pool nem rede reais."""
import json
from types import SimpleNamespace
import urllib.error

import pytest
import qr_ideal as qr
import qr_contratos
import acesso_publicacao as pub


def contrato(modelo=1001859, offset=5000, **kw):
    return dict(pedido=23063, modelo=modelo, versao=2, inicio=7, passo=3, posicao=2,
                quantidade=10, deslocamento=offset, capacidade=30,
                pool_revisao="ideal-qr12-1", fonte_hash="sintetico", **kw)


class PoolSintetico:
    def codigo_indice(self, idx):
        return f"{idx:08X}"


def test_base_independente_ausente_nao_deriva_do_legado(monkeypatch,tmp_path):
    import qr_base_v2,migracao_estacao
    import qr_provisionamento
    def indisponivel(_):
        raise qr_provisionamento.ErroProvisionamentoQr('provisionamento_indisponivel')
    monkeypatch.setattr(qr_provisionamento, 'obter_automaticamente', indisponivel)
    monkeypatch.setattr(qr_base_v2,"_pool",None)
    monkeypatch.setattr(migracao_estacao,"pasta_dados",lambda:tmp_path)
    monkeypatch.setattr(migracao_estacao,"proteger_pasta",lambda _:None)
    with pytest.raises(ValueError,match="nao provisionada"):qr_base_v2.obter(PoolSintetico())
    assert list(tmp_path.iterdir())==[]


def test_base_provisionada_confere_integridade(monkeypatch,tmp_path):
    import hashlib,qr_base_v2,migracao_estacao
    monkeypatch.setattr(qr_base_v2,"_pool",None)
    monkeypatch.setattr(qr,"TOTAL",2)
    monkeypatch.setattr(migracao_estacao,"pasta_dados",lambda:tmp_path)
    monkeypatch.setattr(migracao_estacao,"proteger_pasta",lambda _:None)
    dados=b"ABCDEFGH12345678"
    (tmp_path/qr.POOL_V2_NOME).write_bytes(dados)
    with pytest.raises(ValueError,match="integridade"):qr_base_v2.obter(None)
    monkeypatch.setattr(qr_base_v2,"POOL_V2_SHA256",hashlib.sha256(dados).hexdigest())
    pool=qr_base_v2.obter(None)
    try:assert pool.codigo_indice(1)=="12345678"
    finally:pool.fechar()


def test_provisionamento_privado_atomico_e_sem_sobrescrita(monkeypatch,tmp_path):
    import hashlib,migracao_estacao
    from ferramentas import provisionar_qr12 as p
    dados=b"ABCDEFGH12345678"
    monkeypatch.setattr(p,"TOTAL",2)
    monkeypatch.setattr(p,"POOL_V2_SHA256",hashlib.sha256(dados).hexdigest())
    monkeypatch.setattr(migracao_estacao,"proteger_pasta",lambda _:None)
    origem=tmp_path/'recebida.bin';origem.write_bytes(dados)
    destino=tmp_path/'protegida'/'base.bin'
    p.provisionar(origem,destino);p.provisionar(origem,destino)
    assert destino.read_bytes()==dados
    destino.write_bytes(b"XXXXXXXXYYYYYYYY")
    with pytest.raises(ValueError,match="divergente"):p.provisionar(origem,destino)
    assert destino.read_bytes()==b"XXXXXXXXYYYYYYYY"


def test_prefixos_12_caracteres_modelos_mesma_coluna_e_mesmo_final():
    contratos = [contrato(), contrato(1001959,6000),contrato(1011859,7000)]
    pool = qr.PoolComContratos(PoolSintetico(),contratos,PoolSintetico())
    textos = [pool.conteudo(23063,c["modelo"],8) for c in contratos]
    assert textos == ["958100001389","959100001771","958100001B59"]
    assert all(len(t)==12 for t in textos)
    assert len(set(t[-8:] for t in textos))==3
    assert qr.prefixo_modelo(1001000)=="0001"
    assert qr.prefixo_modelo(1)=="1000"


@pytest.mark.parametrize("valor",[6,37,-1,3000007])
def test_nao_trunca_nem_da_volta(valor):
    with pytest.raises(ValueError,match="fora"):
        qr.indice_contrato(23063,1001859,valor,contrato())


def test_versao_antiga_preserva_conteudo_exato():
    c=contrato(); c["versao"]=1; c["deslocamento"]=None; c["pool_revisao"]="ideal-master-1"
    pool=qr.PoolComContratos(PoolSintetico(),[c],PoolSintetico())
    assert pool.conteudo(23063,1001859,8)==qr.prefixo(23063)+PoolSintetico().codigo_indice(qr.indice(23063,1001859,8))


def test_publicador_ticket_usa_ordinal_para_identidade_e_valor_impresso_para_hash():
    c=contrato();pool=qr.PoolComContratos(PoolSintetico(),[c],PoolSintetico());sal="00"*32
    itens=list(pub.itens_do_pedido(23063,{1001859:10},sal,pool,
        {1001859:dict(tipo="QR_IDEAL",inicio=7,passo=3,posicao=2)}))
    assert [i["numero"] for i in itens]==list(range(1,11))
    for i,item in enumerate(itens):
        assert item["hash"]==qr.hash_codigo(pool.conteudo(23063,1001859,8+i*3),sal)


@pytest.mark.parametrize("contratos", [[contrato()], [contrato(posicoes=[2, 3])]])
def test_cache_offline_sem_trocar_regra_e_recusa_http_sem_fallback(tmp_path,monkeypatch,contratos):
    p=tmp_path/"23063.json"
    monkeypatch.setattr(qr_contratos,"_caminho",lambda _:p)
    monkeypatch.setattr(pub,"_post",lambda _: contratos)
    assert qr_contratos.obter(23063)==contratos
    def sem_rede(_):raise urllib.error.URLError("sintetico")
    monkeypatch.setattr(pub,"_post",sem_rede)
    assert qr_contratos.obter(23063)==contratos
    def recusado(_):raise urllib.error.HTTPError("https://sintetico.invalid",409,"sintetico",{},None)
    monkeypatch.setattr(pub,"_post",recusado)
    with pytest.raises(ValueError,match="recusou"):qr_contratos.obter(23063)
    assert json.loads(p.read_text())==contratos


def test_sem_cache_nao_inventa_legado(tmp_path,monkeypatch):
    monkeypatch.setattr(qr_contratos,"_caminho",lambda _:tmp_path/"ausente.json")
    def sem_rede(_):raise urllib.error.URLError("sintetico")
    monkeypatch.setattr(pub,"_post",sem_rede)
    with pytest.raises(ValueError,match="conecte"):qr_contratos.obter(23063)


def test_preflight_valida_antes_do_primeiro_pdf(monkeypatch):
    import qr_base_v2
    monkeypatch.setattr(qr_base_v2,"obter",lambda _:PoolSintetico())
    monkeypatch.setattr(qr_contratos,"obter",lambda _: [contrato()])
    cfg=SimpleNamespace(multi_artes=None,pedido=23063,modelo=1001859,
        numeracao={"tipo":"TICKET","ticket_qtd":3,"elements":[{"type":"QR_IDEAL","ticket_pos":2}]},
        numeracao_2=None,total_items=10,seq_start=7,seq_increment=1,pool_qr=PoolSintetico())
    qr_contratos.preparar_config(cfg)
    assert cfg.pool_qr.conteudo(23063,1001859,35)=="9581000013A4"
    cfg.pool_qr=PoolSintetico();cfg.total_items=11
    with pytest.raises(ValueError,match="fora"):qr_contratos.preparar_config(cfg)


@pytest.mark.parametrize("posicoes", [[2], [2, 2], [2, 1], [2, 4], [2, "3"], [True, 2]])
def test_contrato_recusa_lista_de_vias_invalida(posicoes):
    with pytest.raises(ValueError, match="Contrato QR invalido"):
        qr_contratos._validar(23063, [contrato(posicoes=posicoes)])


def test_contrato_de_duas_vias_recusa_gabarito_incompleto(monkeypatch):
    c = contrato(posicoes=[1, 2])
    c.update(posicao=1)
    monkeypatch.setattr(qr_contratos, "obter", lambda _: [c])
    cfg = SimpleNamespace(
        multi_artes=None, pedido=23063, modelo=1001859, numeracao_2=None,
        numeracao={"tipo": "TICKET", "ticket_qtd": 3, "elements": [{"type": "QR_IDEAL"}]},
        total_items=10, seq_start=7, seq_increment=1, pool_qr=PoolSintetico(),
    )
    with pytest.raises(ValueError, match="faltam vias"):
        qr_contratos.preparar_config(cfg)
    c.pop("posicoes")
    cfg.numeracao["elements"].append({"type": "QR_IDEAL", "ticket_pos": 2})
    with pytest.raises(ValueError, match="diverge da posicao"):
        qr_contratos.preparar_config(cfg)


@pytest.mark.parametrize("modo", ["sequencial", "banco", "ideal"])
def test_pdf_ticket_imprime_dois_qrs_distintos_por_celula(modo, monkeypatch, tmp_path):
    import io
    import fitz
    from PIL import Image
    from engine import ImpositionConfig, ImpositionEngine, _generate_qr

    tipo = "QR_IDEAL" if modo == "ideal" else "QR"
    numeracao = {"tipo": "TICKET", "ticket_qtd": 2, "elements": [
        {"type": tipo, "ticket_pos": 2, "x_mm": 38, "y_mm": 15, "size_mm": 12},
        {"type": tipo, "x_mm": 12, "y_mm": 15, "size_mm": 12},
    ]}
    csv_data = None
    if modo == "banco":
        csv_data = [{"Ticket 1": "BANCO-01", "Ticket 2": "BANCO-02"},
                    {"Ticket 1": "BANCO-03", "Ticket 2": "BANCO-04"}]
        for el, coluna in zip(numeracao["elements"], ("Ticket 2", "Ticket 1")):
            el.update(source="database", csv_column=coluna)
    base, saida = tmp_path / "base.pdf", tmp_path / "ticket.pdf"
    with fitz.open() as doc:
        doc.new_page(width=50 * 72 / 25.4, height=30 * 72 / 25.4)
        doc.save(base)
    cfg = ImpositionConfig(
        base_file=str(base), out_pdf=str(saida), formato={"width_mm": 50, "height_mm": 30, "cols": 1, "rows": 1},
        numeracao=numeracao, saida={"width_mm": 50, "height_mm": 30}, seq_start=7, seq_end=10,
        pedido=23063, modelo=1001859, csv_data=csv_data, pool_qr=PoolSintetico(),
    )
    assert cfg.total_items == 2
    if modo == "ideal":
        import qr_base_v2

        c = contrato(posicoes=[1, 2])
        c.update(posicao=1, passo=2, quantidade=2, capacidade=4)
        monkeypatch.setattr(qr_base_v2, "obter", lambda _: PoolSintetico())
        monkeypatch.setattr(qr_contratos, "obter", lambda _: [c])
        qr_contratos.preparar_config(cfg)
        esperado = [cfg.pool_qr.conteudo(23063, 1001859, valor) for valor in range(7, 11)]
        sal = "00" * 32
        itens = list(pub.itens_do_pedido(23063, {1001859: 2}, sal, cfg.pool_qr, {
            1001859: {"tipo": tipo, "inicio": c["inicio"], "passo": c["passo"], "posicao": c["posicao"]},
        }))
        assert [i["numero"] for i in itens] == [1, 2]
        assert [i["hash"] for i in itens] == [qr.hash_codigo(codigo, sal) for codigo in esperado[::2]]
    elif modo == "banco":
        esperado = [linha[coluna] for linha in csv_data for coluna in ("Ticket 1", "Ticket 2")]
    else:
        esperado = ["7", "8", "9", "10"]
    assert len(set(esperado)) == 4
    ImpositionEngine(cfg).process()

    def pixels(dados):
        with Image.open(io.BytesIO(dados)) as imagem:
            return imagem.convert("L").tobytes()

    with fitz.open(saida) as doc:
        assert len(doc) == 2
        impressos = []
        for pagina in doc:
            imagens = sorted(pagina.get_image_info(xrefs=True), key=lambda entrada: entrada["bbox"][0])
            assert len(imagens) == 2
            impressos.extend(pixels(doc.extract_image(i["xref"])["image"]) for i in imagens)
    assert impressos == [pixels(_generate_qr(codigo)) for codigo in esperado]


def test_pdf_recebe_mesmo_codigo_da_previa(monkeypatch,tmp_path):
    import io
    import fitz
    from PIL import Image
    from engine import ImpositionConfig,ImpositionEngine,_generate_qr
    c=contrato();c.update(inicio=1,passo=1,posicao=1,quantidade=2,capacidade=2)
    pool=qr.PoolComContratos(PoolSintetico(),[c],PoolSintetico())
    base=tmp_path/"base.pdf";saida=tmp_path/"sintetico.pdf"
    with fitz.open() as doc:
        doc.new_page(width=50*72/25.4,height=30*72/25.4);doc.save(base)
    cfg=ImpositionConfig(base_file=str(base),out_pdf=str(saida),
        formato={"width_mm":50,"height_mm":30,"cols":1,"rows":1},
        numeracao={"tipo":"SEQUENCIAL","elements":[{"type":"QR_IDEAL","x_mm":25,"y_mm":15,"size_mm":15}]},
        saida={"width_mm":50,"height_mm":30},seq_start=1,seq_end=2,pedido=23063,modelo=1001859,pool_qr=pool)
    engine=ImpositionEngine(cfg)
    el={"type":"QR_IDEAL"}
    engine._injetar_qr_ideal(el,2)
    assert el["_qr_ideal_conteudo"]==pool.conteudo(23063,1001859,2)
    engine.process()
    pixels=lambda b:Image.open(io.BytesIO(b)).convert("L").tobytes()
    with fitz.open(saida) as doc:
        imagens=[pixels(doc.extract_image(i[0])["image"]) for p in doc for i in p.get_images(full=True)]
    assert set(imagens)=={pixels(_generate_qr(pool.conteudo(23063,1001859,i))) for i in (1,2)}
