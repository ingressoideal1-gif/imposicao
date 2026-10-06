"""Reserva antes da prévia/PDF e cache local dos contratos imutáveis do QR."""
import json
import os
import tempfile
import threading
import time
import urllib.error

import acesso_publicacao
import qr_ideal


def _caminho(pedido):
    from migracao_estacao import pasta_dados
    if not str(pedido).isdigit():
        raise ValueError("Pedido QR invalido")
    return pasta_dados() / "qr-contratos" / (str(pedido) + ".json")


_cache = {}
_lock = threading.RLock()


def obter(pedido, cache_recente=False):
    # Prévia pede muitos itens do mesmo modelo. Uma consulta por pedido, sem
    # mudar a exigência de conferência no início de cada trabalho de produção.
    with _lock:
        salvo = _cache.get(str(pedido))
        if cache_recente and salvo and time.monotonic() - salvo[0] < 30:
            return json.loads(json.dumps(salvo[1]))
        contratos = _obter(pedido)
        _cache[str(pedido)] = (time.monotonic(), contratos)
        return json.loads(json.dumps(contratos))


def _obter(pedido):
    caminho = _caminho(pedido)
    try:
        contratos = acesso_publicacao._post(f"pedidos/{int(pedido)}/qr-contratos")
    except urllib.error.HTTPError:
        # Uma recusa do servidor nunca vira permissão pelo cache antigo.
        raise ValueError("QR Ideal: servidor recusou o contrato; confira a emissao antes de imprimir") from None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        if not caminho.is_file():
            raise ValueError("QR Ideal: conecte a estacao uma vez para reservar esta emissao") from None
        contratos = json.loads(caminho.read_text(encoding="utf-8"))
    else:
        _validar(pedido, contratos)
        caminho.parent.mkdir(parents=True, exist_ok=True)
        temporario = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=caminho.parent, delete=False) as f:
                temporario = f.name
                json.dump(contratos, f)
            os.replace(temporario, caminho)
        finally:
            if temporario and os.path.exists(temporario):
                os.unlink(temporario)
    _validar(pedido, contratos)
    return contratos


def _validar(pedido, contratos):
    if not isinstance(contratos, list):
        raise ValueError("Contrato QR invalido")
    modelos = set()
    for c in contratos:
        if c.get("modelo") in modelos:
            raise ValueError("Contrato QR repetido")
        modelos.add(c.get("modelo"))
        qr_ideal.indice_contrato(pedido, c.get("modelo"), c.get("inicio"), c)


def preparar_config(config):
    """Fecha o contrato e os limites antes do primeiro lote sair do motor."""
    artes = config.multi_artes or [{"pedido": config.pedido, "modelo": config.modelo,
        "numeracao": config.numeracao, "numeracao_2": getattr(config, "numeracao_2", None),
        "qtd": config.total_items}]
    usados = []
    por_pedido = {}
    for arte in artes:
        nums = [arte.get("numeracao") or {}, arte.get("numeracao_2") or {}]
        els = [e for n in nums for e in (n.get("elements") or []) if e.get("type") == "QR_IDEAL"]
        if not els:
            continue
        pedido = str(arte.get("pedido") or config.pedido or "")
        modelo = str(arte.get("modelo") or "")
        if not pedido or not modelo or config.pool_qr is None:
            raise ValueError("QR Ideal: faltam pedido, modelo ou base privada")
        if pedido not in por_pedido:
            por_pedido[pedido] = obter(pedido)
        contrato = next((c for c in por_pedido[pedido] if str(c["modelo"]) == modelo), None)
        if contrato is None:
            raise ValueError("QR Ideal: modelo sem contrato; confira a numeracao vinculada no pedido")
        if contrato["versao"] == 2:
            n = nums[0]
            passo = int(n.get("ticket_qtd", 1)) if n.get("tipo") == "TICKET" else 1
            inicio = int(n.get("start", 1)) if config.multi_artes else int(config.seq_start)
            qtd = int(arte.get("qtd", 0))
            if passo != contrato["passo"] or qtd < 1 or int(config.seq_increment) != 1:
                raise ValueError("QR Ideal: passo ou quantidade diverge do contrato")
            for el in els:
                pos = int(el.get("ticket_pos", 1)) if passo > 1 else 1
                if el.get("source") == "database" or el.get("fixed") or pos != contrato["posicao"]:
                    raise ValueError("QR Ideal: elemento diverge da posicao contratada")
                for valor in (inicio + pos - 1, inicio + (qtd - 1) * passo + pos - 1):
                    qr_ideal.indice_contrato(pedido, modelo, valor, contrato)
        usados.append(contrato)
    if usados:
        import qr_base_v2
        base_v2 = qr_base_v2.obter(config.pool_qr) if any(c["versao"] == 2 for c in usados) else None
        config.pool_qr = qr_ideal.PoolComContratos(config.pool_qr, usados, base_v2)
    return usados
