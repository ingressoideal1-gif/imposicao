# -*- coding: utf-8 -*-
"""
Migra producao_numeracoes.preview_jpg de data URL base64 para arquivo .jpg em
artes/previews-numeracoes/, deixando na coluna apenas a URL publica.

Uso:
    venv/Scripts/python.exe migrar_previews_para_storage.py

E idempotente: linhas que ja tenham URL sao puladas. Se o upload de uma linha
falhar, a linha NAO e alterada -- trocar a coluna por uma URL inexistente
perderia o preview de vez.
"""
import base64
import datetime
import json
import sys

import requests

BUCKET = "artes"
PREFIXO = "previews-numeracoes"
TABELA = "producao_numeracoes"


def ler_env(caminho=".env.local"):
    env = {}
    with open(caminho, "r", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main():
    env = ler_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    # A chave anonima e usada em tudo: a service key deste projeto e rejeitada
    # pelo PostgREST com 401, e a anonima e o caminho que o app usa de verdade.
    h = {"apikey": anon, "Authorization": "Bearer " + anon}
    h_json = dict(h, **{"Content-Type": "application/json"})

    # 1. Ler tudo
    res = requests.get(
        url + "/rest/v1/" + TABELA + "?select=id,name,preview_jpg",
        headers=h, timeout=60)
    res.raise_for_status()
    linhas = res.json()
    print("Linhas na tabela: %d" % len(linhas))

    # 2. Backup ANTES de qualquer escrita
    carimbo = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_backup = "backup_preview_jpg_%s.json" % carimbo
    with open(nome_backup, "w", encoding="utf-8") as f:
        json.dump(linhas, f, ensure_ascii=False)
    print("Backup gravado em %s" % nome_backup)

    pendentes = [l for l in linhas
                 if (l.get("preview_jpg") or "").startswith("data:")]
    ja_url = [l for l in linhas
              if (l.get("preview_jpg") or "").startswith("http")]
    vazias = [l for l in linhas if not (l.get("preview_jpg") or "")]
    print("A migrar: %d | ja em URL: %d | sem preview: %d"
          % (len(pendentes), len(ja_url), len(vazias)))

    if not pendentes:
        print("Nada a fazer.")
        return 0

    # Quem for rodar isto por engano precisa ver, sem precisar ler o codigo, contra
    # qual projeto e quantas linhas isto vai escrever.
    print("\nProjeto de destino: %s" % url)
    print("Migrando %d linha(s) para %s/%s/<id>.jpg" % (len(pendentes), BUCKET, PREFIXO))

    migradas, falhas = [], []

    for linha in pendentes:
        num_id = linha["id"]
        nome = linha.get("name") or "(sem nome)"
        conteudo = linha["preview_jpg"]

        try:
            b64 = conteudo.split("base64,", 1)[1]
            binario = base64.b64decode(b64)
        except Exception as e:
            falhas.append((num_id, nome, "base64 invalido: %s" % e))
            continue

        objeto = "%s/%s.jpg" % (PREFIXO, num_id)
        up = requests.post(
            "%s/storage/v1/object/%s/%s" % (url, BUCKET, objeto),
            headers=dict(h, **{"Content-Type": "image/jpeg",
                               "x-upsert": "true"}),
            data=binario, timeout=120)

        if up.status_code not in (200, 201):
            falhas.append((num_id, nome, "upload HTTP %d: %s"
                           % (up.status_code, up.text[:120])))
            continue

        publica = "%s/storage/v1/object/public/%s/%s" % (url, BUCKET, objeto)

        pat = requests.patch(
            "%s/rest/v1/%s?id=eq.%s" % (url, TABELA, num_id),
            headers=h_json, json={"preview_jpg": publica}, timeout=60)

        if pat.status_code not in (200, 204):
            falhas.append((num_id, nome, "patch HTTP %d: %s"
                           % (pat.status_code, pat.text[:120])))
            continue

        migradas.append((num_id, nome, publica, len(binario)))
        print("  OK %-40s %6.1f KB" % (nome[:40], len(binario) / 1024.0))

    # 3. Verificar de verdade: a coluna virou URL E o arquivo existe e e JPEG
    print("\nVerificando...")
    res = requests.get(
        url + "/rest/v1/" + TABELA + "?select=id,name,preview_jpg",
        headers=h, timeout=60)
    res.raise_for_status()

    restou_base64 = [l for l in res.json()
                     if (l.get("preview_jpg") or "").startswith("data:")]

    urls_ruins = []
    for _id, nome, publica, _tam in migradas:
        r = requests.get(publica, timeout=60)
        tipo = r.headers.get("content-type", "")
        if r.status_code != 200 or "image/jpeg" not in tipo:
            urls_ruins.append((nome, publica, r.status_code, tipo))

    print("\n=== RESULTADO ===")
    print("Migradas: %d" % len(migradas))
    print("Falhas:   %d" % len(falhas))
    for num_id, nome, motivo in falhas:
        print("  FALHOU %s (%s): %s" % (nome, num_id, motivo))
    print("Ainda em base64 na tabela: %d" % len(restou_base64))
    for l in restou_base64:
        print("  - %s (%s)" % (l.get("name"), l["id"]))
    print("URLs que nao responderam JPEG: %d" % len(urls_ruins))
    for nome, publica, cod, tipo in urls_ruins:
        print("  - %s -> HTTP %s tipo %s" % (nome, cod, tipo))

    ok = not falhas and not restou_base64 and not urls_ruins
    print("\n%s" % ("SUCESSO" if ok else "INCOMPLETO"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
