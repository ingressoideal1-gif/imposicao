"""Blocos de lugares importados do mapa; não acessa banco ou arquivos."""
import re


def grupos(rows):
    if not rows or not any(r and (r.get("Origem") == "Mapa de Teatro" or
            (r.get("Mapa_ID") and r.get("Setor_ID") and r.get("Revisao_Mapa"))) for r in rows):
        return None
    primeiro = rows[0] or {}
    blocos, vistos = [], set()
    for pos, row in enumerate(rows):
        row = row or {}
        if (row.get("Origem") != "Mapa de Teatro"
                or not row.get("Mapa_ID") or not row.get("Setor_ID")
                or not re.fullmatch(r"[a-f0-9]{64}", str(row.get("Revisao_Mapa", "")))
                or any(row.get(k) != primeiro.get(k) for k in ("Mapa_ID", "Setor_ID", "Revisao_Mapa"))
                or not isinstance(row.get("Bloco"), str) or not row["Bloco"].strip()
                or row["Bloco"] != row.get("Fila") or not str(row.get("Numero", "")).strip()):
            raise ValueError("O banco do teatro está incompleto ou mistura setores. Importe novamente o setor.")
        if not blocos or blocos[-1]["fila"] != row["Bloco"]:
            if row["Bloco"] in vistos:
                raise ValueError("As linhas de um conjunto do teatro devem permanecer juntas no banco.")
            vistos.add(row["Bloco"])
            blocos.append({"fila": row["Bloco"], "inicio": pos, "quantidade": 0})
        blocos[-1]["quantidade"] += 1
    return blocos


def montar_sets(modelos, poses):
    fontes = [grupos(m["rows"]) for m in modelos]
    if not any(fontes):
        return None
    if not all(fontes):
        raise ValueError("Combine o mapa de teatro somente com modelos que também leem setores de um mapa.")
    if not isinstance(poses, int) or isinstance(poses, bool) or poses < 1:
        raise ValueError("Quantidade de poses inválida.")
    blocos = []
    for modelo, fonte in zip(modelos, fontes):
        if len(modelo["items"]) != len(modelo["rows"]):
            raise ValueError("A quantidade do modelo não corresponde aos lugares selecionados no banco do teatro.")
        for bloco in fonte:
            inicio = bloco["inicio"]
            blocos.append(modelo["items"][inicio:inicio + bloco["quantidade"]])
    sets = []
    for inicio in range(0, len(blocos), poses):
        lote = blocos[inicio:inicio + poses]
        folhas = max(map(len, lote))
        alocacoes = [b + [None] * (folhas - len(b)) for b in lote]
        alocacoes += [[None] * folhas for _ in range(poses - len(lote))]
        sets.append({"type": "strict", "num_sheets": folhas,
                     "cell_allocations": alocacoes, "depth": 1,
                     "model_idx": None, "teatro": True})
    return sets
