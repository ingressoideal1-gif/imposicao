# -*- coding: utf-8 -*-
"""Testes do hotfolder.py. Rode com: python tests/test_hotfolder.py

Cobre so a logica pura — nada de HTTP e nada do dialogo nativo, que exige
interacao humana. O que se testa aqui e exatamente o que quebra em producao sem
fazer barulho: nome que escapa da pasta, arquivo pela metade, sobrescrita.
"""

import os
import sys
import shutil
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hotfolder

_falhas = []
_total = 0


def checar(condicao, descricao):
    global _total
    _total += 1
    if condicao:
        print(f"  ok   {descricao}")
    else:
        print(f"  FALHA {descricao}")
        _falhas.append(descricao)


# ─── Sanitizacao do nome ──────────────────────────────────────────────────────

def teste_sanitizar():
    print("\nsanitizar_nome")
    s = hotfolder.sanitizar_nome

    checar(s("00001_Ingresso.pdf") == "00001_Ingresso.pdf",
           "nome comum passa intacto")
    checar(s("Ingresso") == "Ingresso.pdf",
           "extensao e forcada para .pdf")
    checar(s("Ingresso.PDF") == "Ingresso.pdf",
           "extensao maiuscula nao vira dupla")

    # Travessia de diretorio: o nome vem do navegador e vira caminho em disco.
    checar("/" not in s("../../etc/senha.pdf") and "\\" not in s("../../etc/senha.pdf"),
           "separador de caminho nunca sobrevive")
    checar(s("../../etc/senha.pdf") == "senha.pdf",
           "so o ultimo componente do caminho sobra")
    checar(s(r"..\..\windows\system32\evil.pdf") == "evil.pdf",
           "travessia com barra invertida tambem e cortada")
    checar(s("..") == "impressao.pdf",
           "nome feito so de pontos vira um nome utilizavel")

    checar(s('a<b>c:d"e|f?g*h.pdf') == "a_b_c_d_e_f_g_h.pdf",
           "caractere proibido pelo Windows vira sublinhado")
    checar(s("CON.pdf").upper() != "CON.PDF",
           "nome reservado do DOS e escapado")
    checar(s("Ingresso   ") == "Ingresso.pdf",
           "espaco no fim e removido (o Windows o descarta sozinho)")
    checar(len(s("x" * 400)) <= 154,
           "nome absurdamente longo e cortado")
    checar(s("") == "impressao.pdf" and s(None) == "impressao.pdf",
           "nome vazio ou ausente ganha um nome padrao")


# ─── Validacao da pasta ───────────────────────────────────────────────────────

def teste_validar():
    print("\nvalidar_pasta")
    tmp = tempfile.mkdtemp(prefix="hf_val_")
    try:
        ok, _ = hotfolder.validar_pasta(tmp)
        checar(ok, "pasta existente e gravavel e aceita")

        ok, msg = hotfolder.validar_pasta(os.path.join(tmp, "nao_existe"))
        checar(not ok and "nao existe" in msg, "pasta inexistente e recusada")

        arquivo = os.path.join(tmp, "sou_arquivo.txt")
        with open(arquivo, "w") as f:
            f.write("x")
        ok, msg = hotfolder.validar_pasta(arquivo)
        checar(not ok and "nao e uma pasta" in msg, "arquivo no lugar de pasta e recusado")

        ok, _ = hotfolder.validar_pasta("")
        checar(not ok, "caminho vazio e recusado")

        checar(not os.path.exists(os.path.join(tmp, f".newprod_sonda_{os.getpid()}.tmp")),
               "a sonda de escrita nao deixa lixo na pasta")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ─── Gravacao ─────────────────────────────────────────────────────────────────

def teste_soltar():
    print("\nsoltar")
    tmp = tempfile.mkdtemp(prefix="hf_drop_")
    try:
        dados = b"%PDF-1.4 conteudo de teste"

        caminho = hotfolder.soltar(tmp, "00001_Ingresso.pdf", dados)
        checar(os.path.basename(caminho) == "00001_Ingresso.pdf",
               "grava com o nome pedido")
        with open(caminho, "rb") as f:
            checar(f.read() == dados, "o conteudo chega inteiro")

        checar(not [a for a in os.listdir(tmp) if a.endswith(".tmp")],
               "nenhum temporario sobra depois da gravacao")

        # Sobrescrever poderia apagar, em silencio, um trabalho que o RIP ainda
        # nao importou — e pior, enquanto ele o le.
        c2 = hotfolder.soltar(tmp, "00001_Ingresso.pdf", b"outro")
        checar(os.path.basename(c2) == "00001_Ingresso (2).pdf",
               "colisao vira ' (2)' em vez de sobrescrever")
        c3 = hotfolder.soltar(tmp, "00001_Ingresso.pdf", b"mais um")
        checar(os.path.basename(c3) == "00001_Ingresso (3).pdf",
               "a terceira colisao vira ' (3)'")
        with open(caminho, "rb") as f:
            checar(f.read() == dados, "o arquivo original continua intacto")

        # O nome sanitizado tem que valer tambem no caminho gravado, senao a
        # travessia de diretorio volta pela porta dos fundos.
        c4 = hotfolder.soltar(tmp, "../fora.pdf", b"x")
        checar(os.path.dirname(os.path.abspath(c4)) == os.path.abspath(tmp),
               "nome com travessia grava dentro da pasta, nunca fora")

        try:
            hotfolder.soltar(tmp, "vazio.pdf", b"")
            checar(False, "arquivo vazio e recusado")
        except ValueError:
            checar(True, "arquivo vazio e recusado")

        try:
            hotfolder.soltar(tmp, "gigante.pdf",
                             b"x" * (hotfolder.TAMANHO_MAXIMO_BYTES + 1))
            checar(False, "arquivo acima do teto e recusado")
        except ValueError:
            checar(True, "arquivo acima do teto e recusado")

        try:
            hotfolder.soltar(os.path.join(tmp, "sumida"), "a.pdf", b"x")
            checar(False, "pasta inexistente e recusada no envio")
        except OSError:
            checar(True, "pasta inexistente e recusada no envio")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def teste_falha_no_meio_nao_deixa_lixo():
    print("\nsoltar — falha no meio da gravacao")
    tmp = tempfile.mkdtemp(prefix="hf_meio_")
    original = os.fdopen
    try:
        class BombaNoWrite:
            def __init__(self, fd):
                self._fd = fd
            def __enter__(self):
                return self
            def __exit__(self, *a):
                os.close(self._fd)
                return False
            def write(self, _):
                raise OSError("disco cheio")

        os.fdopen = lambda fd, *a, **k: BombaNoWrite(fd)
        try:
            hotfolder.soltar(tmp, "quebra.pdf", b"conteudo")
            checar(False, "a falha de escrita sobe como erro")
        except OSError:
            checar(True, "a falha de escrita sobe como erro")
    finally:
        os.fdopen = original
        sobrou = os.listdir(tmp)
        checar(sobrou == [], f"nada sobra na pasta apos falha (sobrou: {sobrou})")
        shutil.rmtree(tmp, ignore_errors=True)


# ─── Conferencia de consumo ───────────────────────────────────────────────────

def teste_conferir():
    print("\nconferir")
    tmp = tempfile.mkdtemp(prefix="hf_conf_")
    try:
        ficou = hotfolder.soltar(tmp, "ficou.pdf", b"x")
        sumiu = hotfolder.soltar(tmp, "sumiu.pdf", b"x")
        os.remove(sumiu)   # e o que o Edge Print faz ao importar

        restantes = hotfolder.conferir([ficou, sumiu])
        checar(restantes == [ficou],
               "devolve so o que o RIP ainda nao consumiu")
        checar(hotfolder.conferir([]) == [] and hotfolder.conferir(None) == [],
               "lista vazia ou ausente nao quebra")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ─── Lista branca ─────────────────────────────────────────────────────────────

def teste_lista_branca():
    print("\nlista branca de pastas (db)")
    import db

    tmp_dir = tempfile.mkdtemp(prefix="hf_wl_")
    original = db.HOT_FOLDER_FILE
    db.HOT_FOLDER_FILE = os.path.join(tmp_dir, "hot_folders.json")
    try:
        pasta = tempfile.mkdtemp(prefix="hf_alvo_")
        try:
            checar(not db.hot_folder_registrada(pasta),
                   "pasta nunca escolhida nao esta registrada")
            checar(db.registrar_hot_folder(pasta), "registrar devolve sucesso")
            checar(db.hot_folder_registrada(pasta), "pasta registrada e reconhecida")

            # O caminho volta do banco compartilhado no relay, escrito por outra
            # maquina: barra a mais, maiuscula diferente, tudo pode acontecer.
            variante = pasta.replace("\\", "/").upper() + os.sep
            checar(db.hot_folder_registrada(variante),
                   "reconhece o mesmo caminho escrito de outra forma")

            checar(db.registrar_hot_folder(pasta) and len(db.list_hot_folders()) == 1,
                   "registrar de novo e idempotente")
            checar(not db.hot_folder_registrada(tmp_dir),
                   "outra pasta qualquer continua fora da lista")
            checar(not db.hot_folder_registrada(""),
                   "caminho vazio nunca esta registrado")
        finally:
            shutil.rmtree(pasta, ignore_errors=True)
    finally:
        db.HOT_FOLDER_FILE = original
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    print("TESTES DO HOT FOLDER")
    teste_sanitizar()
    teste_validar()
    teste_soltar()
    teste_falha_no_meio_nao_deixa_lixo()
    teste_conferir()
    teste_lista_branca()

    print()
    if _falhas:
        print(f"{len(_falhas)} de {_total} FALHARAM:")
        for f in _falhas:
            print(f"  - {f}")
        sys.exit(1)
    print(f"{_total} testes passando.")
