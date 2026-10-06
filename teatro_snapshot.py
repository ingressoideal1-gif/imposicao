"""Snapshot Vibe v1. Módulo puro: valida lugares e recebe a leitura do mapa por função."""
import hashlib
import json
import math
import re


def linhas(modelo):
    s = modelo.get("mapa_teatro_snapshot")
    mapa_id, setor_id = modelo.get("mapa_teatro_id"), modelo.get("mapa_teatro_setor_id")
    rev = modelo.get("mapa_teatro_revisao", "")
    if (not isinstance(s, dict) or type(s.get("versao")) is not int or s["versao"] != 1
            or not mapa_id or not setor_id or not isinstance(s.get("mapa"), dict)
            or not isinstance(s.get("setor"), dict) or s["mapa"].get("id") != mapa_id
            or s["setor"].get("id") != setor_id or not isinstance(s.get("cadeiras"), list)
            or not isinstance(s.get("tiposAssento"), list) or not re.fullmatch(r"[a-f0-9]{64}", str(rev))):
        raise ValueError("O vínculo ou snapshot do mapa deste modelo está incompleto. Confira no ERP.")
    tipos = {t["id"]: t for t in s["tiposAssento"] if isinstance(t, dict) and "id" in t}
    lugares, posicoes, rotulos = [], set(), set()
    for c in s["cadeiras"]:
        if not isinstance(c, dict) or not isinstance(c.get("chave"), str) or c["chave"] in posicoes:
            raise ValueError("O snapshot contém posição ausente ou repetida.")
        chave = c["chave"]; posicoes.add(chave)
        if c.get("tipo") == "Apagado" or c.get("isErased"): continue
        xy = chave.split(",")
        if len(xy) != 2 or any(not v.strip() for v in xy): raise ValueError("Posição inválida no snapshot.")
        try: x, y = map(float, xy)
        except ValueError: raise ValueError("Posição inválida no snapshot.") from None
        if not all(map(math.isfinite, (x, y))): raise ValueError("Posição inválida no snapshot.")
        if any(type(c.get(k)) not in (str, int) for k in ("prefixo", "num")):
            raise ValueError("O snapshot contém fila ou lugar inválido.")
        fila, lugar = str(c["prefixo"]), str(c["num"])
        if not fila.strip() or not lugar.strip() or (fila, lugar) in rotulos:
            raise ValueError("Lugar vazio ou repetido no snapshot.")
        rotulos.add((fila, lugar)); lugares.append((y, x, chave, fila, lugar, c.get("tipo") or "Normal"))
    grupos = {}
    for p in sorted(lugares): grupos.setdefault(p[3], []).append(p)
    rows = []
    for fila, lista in grupos.items():
        for y, x, chave, _, lugar, tipo in lista:
            sufixo = str(tipos.get(tipo, {}).get("sufixo") or "").strip()
            rows.append({"__id": json.dumps([mapa_id, setor_id, chave], ensure_ascii=False, separators=(",", ":")),
                "Mapa": s["mapa"].get("nome") or "", "Mapa_ID": mapa_id, "Revisao_Mapa": rev,
                "Setor": s["setor"].get("nome") or "", "Setor_ID": setor_id,
                "Conjunto": " ".join(str(s["setor"].get("nomeConjunto") or "Fila").split())[:40],
                "Fila": fila, "Numero": lugar + (" " + sufixo if sufixo else ""), "Lugar": lugar,
                "Bloco": fila, "Tipo": tipo, "Posicao_X": x, "Posicao_Y": y, "Origem": "Mapa de Teatro"})
    qtd = modelo.get("quantidade")
    if type(qtd) is not int or qtd < 1 or qtd != len(rows):
        raise ValueError("A quantidade do modelo não corresponde aos lugares ativos do snapshot. Confira no ERP.")
    return rows


def aplicar(payload, ler_mapa):
    """Confere mapa/setor atual e conserva os dados e revisão histórica do modelo."""
    avisos, atuais = [], {}
    for alvo in payload.get("multi_artes") or [payload]:
        num = alvo.get("numeracao") or {}
        modelo = num.get("teatro_modelo")
        if not modelo: continue
        if str(modelo.get("id")) != str(alvo.get("modelo")):
            raise ValueError("O snapshot não pertence ao modelo enviado ao motor.")
        rows = linhas(modelo)
        if alvo.get("qtd") is not None and alvo["qtd"] != modelo["quantidade"]:
            raise ValueError("A quantidade enviada diverge do modelo do snapshot.")
        mapa_id, setor_id = modelo["mapa_teatro_id"], modelo["mapa_teatro_setor_id"]
        if mapa_id not in atuais: atuais[mapa_id] = ler_mapa(mapa_id)
        atual = atuais[mapa_id]
        if not atual:
            raise ValueError("Mapa de teatro não encontrado na conferência atual. Confira o vínculo no ERP.")
        if atual.get("id") != mapa_id:
            raise ValueError("O mapa consultado não corresponde ao mapa do modelo.")
        if not any(s.get("id") == setor_id for s in atual.get("config", {}).get("setores", [])):
            raise ValueError("O setor do modelo não pertence ao mapa consultado.")
        # Bytes JCS produzidos pelo serializador compartilhado; reler a config
        # antes de calcular SHA-256 impede gerar a partir de uma conferência obsoleta.
        canonica = modelo.get("config_canonica_atual")
        if not isinstance(canonica, str) or json.loads(canonica) != atual.get("config"):
            raise ValueError("O mapa mudou durante a conferência. Reabra o modelo e gere novamente.")
        atual_rev = hashlib.sha256(canonica.encode("utf-8")).hexdigest()
        if atual_rev != modelo.get("revisao_atual"): raise ValueError("A revisão atual enviada ao motor não confere.")
        if atual_rev != modelo["mapa_teatro_revisao"]:
            avisos.append(f"Modelo {modelo['id']}: mapa alterado; usando snapshot histórico sem trocar a revisão.")
        if num.get("csv_data") != rows: raise ValueError("Os lugares enviados não correspondem ao snapshot do modelo.")
        num["csv_data"] = rows
    return avisos
