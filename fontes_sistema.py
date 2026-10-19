"""Resolucao de familias e estilos compartilhada pela preparacao e pelo motor."""
_FONTES_INSTALADAS = None

# `Bold`/`Italic` só contam como estilo no FIM do nome: há família com essas
# palavras no meio, e tratá-las como estilo apagaria a família inteira.
_SUFIXOS_DE_ESTILO = (
    ("bold italic", True, True),
    ("bolditalic", True, True),
    ("bold oblique", True, True),
    ("bold", True, False),
    ("italic", False, True),
    ("oblique", False, True),
)


def _familia_e_estilo_do_registro(nome: str):
    """"Comic Sans MS Bold (TrueType)" -> ("comic sans ms", True, False)."""
    import re
    n = re.sub(r"\s*\((TrueType|OpenType|All res|VGA res)\)\s*$", "", nome or "",
               flags=re.IGNORECASE).strip().lower()
    for sufixo, bold, italic in _SUFIXOS_DE_ESTILO:
        if n.endswith(" " + sufixo):
            return n[: -(len(sufixo) + 1)].strip(), bold, italic
    return n, False, False


def _fontes_instaladas() -> dict:
    """{(familia, bold, italic): "comic.ttf"} das fontes instaladas no Windows.

    Lida uma vez por processo. Fora do Windows devolve vazio, e aí tudo continua
    funcionando como antes desta função existir.
    """
    global _FONTES_INSTALADAS
    if _FONTES_INSTALADAS is not None:
        return _FONTES_INSTALADAS

    _FONTES_INSTALADAS = {}
    try:
        import winreg
        import os as _os
        caminho = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
        # HKCU cobre a fonte instalada só para o usuário, que e o caso comum de
        # quem instala fonte de cliente sem ser administrador da maquina.
        for raiz in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(raiz, caminho) as chave:
                    total = winreg.QueryInfoKey(chave)[1]
                    for i in range(total):
                        try:
                            nome, valor, _ = winreg.EnumValue(chave, i)
                        except OSError:
                            continue
                        if not isinstance(valor, str) or not valor:
                            continue
                        # Uma colecao (.ttc) lista varios arquivos numa entrada.
                        arquivo = _os.path.basename(valor.split(",")[0].strip())
                        _FONTES_INSTALADAS.setdefault(
                            _familia_e_estilo_do_registro(nome), arquivo)
            except OSError:
                continue
    except Exception as e:  # pragma: no cover — so em Windows quebrado
        print(f"[impose] nao consegui ler as fontes instaladas: {e}", flush=True)

    return _FONTES_INSTALADAS


def _chaves_de_fonte(family: str, bold: bool, italic: bool, instaladas: dict) -> list:
    """As chaves a tentar no catálogo, da melhor para a reserva.

    Pura de propósito: é o coração do conserto, e precisa poder ser conferida
    sem Windows, sem registro e sem rede.
    """
    import os as _os
    fam = (family or "").strip().lower()
    chaves = []

    def _por(bold_, italic_):
        arquivo = instaladas.get((fam, bold_, italic_))
        if not arquivo:
            return
        base = _os.path.splitext(arquivo)[0].lower()
        if base and base not in chaves:
            chaves.append(base)

    if bold or italic:
        _por(bold, italic)
        # Nem toda familia tem as quatro variacoes. Sem esta escada, um
        # `bold italic` numa familia que so tem bold voltaria para a regular —
        # perdendo os dois estilos em vez de um.
        if bold and italic:
            _por(True, False)
            _por(False, True)

    if fam and fam not in chaves:
        chaves.append(fam)
    _por(False, False)
    return chaves


