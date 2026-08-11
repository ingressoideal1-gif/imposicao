# -*- coding: utf-8 -*-
"""Descobre COMO o RIP quer que o arquivo apareca na pasta observada.

Rode com o RIP aberto e observando a pasta:

    .\\venv\\Scripts\\python.exe ferramentas\\diagnostico_hotfolder.py "C:\\caminho\\do\\hot_folder"

O script larga o mesmo PDF na pasta cinco vezes, cada uma por um caminho
diferente de sistema de arquivos, e espera para ver qual delas o RIP consome.
Cada metodo produz uma sequencia distinta de eventos do Windows:

    rename      -> FILE_ACTION_RENAMED_NEW_NAME   (o que o agente faz hoje)
    direto      -> FILE_ACTION_ADDED
    exclusivo   -> FILE_ACTION_ADDED, com o arquivo trancado enquanto escreve
    copia       -> FILE_ACTION_ADDED  (o mesmo que arrastar no Explorer)
    rename+toque-> RENAMED_NEW_NAME + FILE_ACTION_MODIFIED

Um observador que so trata "arquivo criado" nunca ve o primeiro. Se for esse o
caso, os metodos 2, 3 e 4 somem da pasta e o 1 fica.

Nada aqui altera o agente: e so diagnostico.
"""

import os
import shutil
import sys
import time

ESPERA_S = 15          # quanto dar ao RIP para reagir antes de julgar
INTERVALO_S = 3        # respiro entre um metodo e o proximo


def _pdf_de_teste(origem: str | None) -> bytes:
    if origem and os.path.isfile(origem):
        with open(origem, "rb") as f:
            return f.read()
    # Um PDF minimo, valido, de uma pagina A4 em branco. Serve para saber se o
    # arquivo e importado; nao serve para julgar o resultado impresso.
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n"
        b"%%EOF\n"
    )


# ─── Os cinco jeitos de fazer o arquivo aparecer ─────────────────────────────

def metodo_rename(pasta, nome, dados):
    """O que o agente faz hoje: .tmp dentro da pasta, depois rename."""
    destino = os.path.join(pasta, nome)
    temporario = destino + ".tmp"
    with open(temporario, "wb") as f:
        f.write(dados)
        f.flush()
        os.fsync(f.fileno())
    os.rename(temporario, destino)
    return destino


def metodo_direto(pasta, nome, dados):
    """Cria ja com o nome final e escreve por cima. Gera evento de criacao."""
    destino = os.path.join(pasta, nome)
    with open(destino, "wb") as f:
        f.write(dados)
        f.flush()
        os.fsync(f.fileno())
    return destino


def metodo_exclusivo(pasta, nome, dados):
    """Nome final, mas trancado: ninguem abre o arquivo enquanto escrevemos.

    Quem tentar ler no meio recebe ERROR_SHARING_VIOLATION, que e o mesmo que
    acontece com qualquer copia em andamento — e a razao pela qual observadores
    de hot folder costumam repetir a tentativa em vez de desistir.
    """
    import win32file
    import win32con
    destino = os.path.join(pasta, nome)
    h = win32file.CreateFile(
        destino,
        win32con.GENERIC_WRITE,
        0,                       # dwShareMode = 0: acesso exclusivo
        None,
        win32con.CREATE_NEW,
        win32con.FILE_ATTRIBUTE_NORMAL,
        None,
    )
    try:
        win32file.WriteFile(h, dados)
        win32file.FlushFileBuffers(h)
    finally:
        h.Close()
    return destino


def metodo_copia(pasta, nome, dados):
    """Grava fora da pasta e copia para dentro — o mesmo que arrastar no Explorer."""
    import tempfile
    fora = os.path.join(tempfile.gettempdir(), "hf_origem_" + nome)
    with open(fora, "wb") as f:
        f.write(dados)
    destino = os.path.join(pasta, nome)
    try:
        shutil.copyfile(fora, destino)
    finally:
        try:
            os.remove(fora)
        except OSError:
            pass
    return destino


def metodo_rename_mais_toque(pasta, nome, dados):
    """Rename como hoje, mais um toque na data para gerar evento de modificacao."""
    destino = metodo_rename(pasta, nome, dados)
    agora = time.time()
    os.utime(destino, (agora, agora))
    return destino


METODOS = [
    ("rename",       "o que o agente faz hoje", metodo_rename),
    ("direto",       "cria ja com o nome final", metodo_direto),
    ("exclusivo",    "nome final, trancado enquanto escreve", metodo_exclusivo),
    ("copia",        "igual a arrastar no Explorer", metodo_copia),
    ("rename_toque", "rename mais toque na data", metodo_rename_mais_toque),
]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("Faltou o caminho da pasta observada pelo RIP.")
        return 2

    pasta = sys.argv[1].strip().strip('"')
    origem = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.isdir(pasta):
        print(f"A pasta nao existe: {pasta}")
        return 2

    dados = _pdf_de_teste(origem)
    print(f"Pasta   : {pasta}")
    print(f"PDF     : {'arquivo ' + origem if origem else 'gerado aqui'} ({len(dados)} bytes)")
    print(f"Espera  : {ESPERA_S}s por metodo")
    print()
    print("Deixe o RIP ABERTO e observando esta pasta enquanto isto roda.")
    print()

    resultados = []
    for i, (nome_metodo, descricao, funcao) in enumerate(METODOS, start=1):
        arquivo = f"DIAG{i}_{nome_metodo}.pdf"
        print(f"[{i}/{len(METODOS)}] {nome_metodo:<13} — {descricao}")
        try:
            destino = funcao(pasta, arquivo, dados)
        except Exception as e:
            print(f"          nao consegui gravar: {e}")
            resultados.append((nome_metodo, "erro ao gravar"))
            continue

        print(f"          gravado: {os.path.basename(destino)} — aguardando {ESPERA_S}s...")
        time.sleep(ESPERA_S)

        if os.path.exists(destino):
            print("          CONTINUA NA PASTA — o RIP ignorou")
            resultados.append((nome_metodo, "ignorado"))
        else:
            print("          SUMIU — o RIP importou")
            resultados.append((nome_metodo, "IMPORTADO"))
        time.sleep(INTERVALO_S)

    print()
    print("=" * 52)
    print("  RESULTADO")
    print("=" * 52)
    for nome_metodo, veredito in resultados:
        marca = "OK " if veredito == "IMPORTADO" else "-- "
        print(f"  {marca}{nome_metodo:<14} {veredito}")
    print()

    importados = [n for n, v in resultados if v == "IMPORTADO"]
    if not importados:
        print("  Nenhum metodo funcionou. O observador do RIP pode estar parado,")
        print("  ou a pasta indicada nao e a que ele observa. Confira no Edge Print")
        print("  qual pasta esta associada ao preset e se ele esta ativo.")
    elif "rename" in importados:
        print("  O rename funciona. Entao a causa nao e o modo de gravacao —")
        print("  o problema esta em outro lugar e precisamos de mais evidencia.")
    else:
        print(f"  O rename NAO funciona, mas {', '.join(importados)} sim.")
        print("  Confirma a hipotese: o RIP so reage a arquivo CRIADO na pasta,")
        print("  nao a arquivo renomeado para dentro dela.")

    print()
    print("  Apague da pasta o que tiver sobrado antes de imprimir de verdade.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
