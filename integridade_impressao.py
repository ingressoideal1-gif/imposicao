"""Contrato de impressão: validação local, sem banco, rede ou efeitos ao importar."""
import hashlib
import re
import os
import shutil
import threading

import newprod_temp

VERSION = 1
CAPABILITY = "integridade_impressao_v1"


class RecursosDoTrabalho:
    """Cache exclusivo em disco: fotos não mantêm a tiragem inteira na memória."""
    def __init__(self):
        self._trabalho = None
        self._entradas = {}
        self._lock = threading.RLock()
        self.total_bytes = 0

    def __contains__(self, chave):
        return chave in self._entradas

    def __getitem__(self, chave):
        caminho, digest = self._entradas[chave]
        with open(caminho, "rb") as arquivo:
            dados = arquivo.read()
        if hashlib.sha256(dados).hexdigest() != digest:
            raise ValueError("Recurso preparado foi alterado; impressão interrompida")
        return dados

    def __setitem__(self, chave, dados):
        with self._lock:
            if chave in self._entradas:
                return
            if self._trabalho is None:
                self._trabalho = newprod_temp.TrabalhoTemporario()
            verificar_espaco(self._trabalho.pasta, len(dados))
            digest = hashlib.sha256(dados).hexdigest()
            caminho = self._trabalho.caminho(digest + ".recurso")
            if not os.path.exists(caminho):
                with open(caminho, "xb") as arquivo:
                    arquivo.write(dados)
                self.total_bytes += len(dados)
            self._entradas[chave] = (caminho, digest)

    def close(self):
        if self._trabalho:
            self._trabalho.close()


def verificar_espaco(pasta, bytes_necessarios):
    # Reserva para metadados, PDF em gravação e arquivos auxiliares.
    if shutil.disk_usage(pasta).free < bytes_necessarios + 64 * 1024 * 1024:
        raise ValueError("Espaço insuficiente para preparar o trabalho completo antes da impressão")


def validar_pdf_para_entrega(dados, digest):
    import fitz
    if not re.fullmatch(r"[a-f0-9]{64}", str(digest)) or hashlib.sha256(dados).hexdigest() != digest:
        raise ValueError("Integridade do PDF de impressão não confirmada")
    with fitz.open(stream=dados, filetype="pdf") as doc:
        if not len(doc) or doc.needs_pass or doc.is_repaired:
            raise ValueError("PDF de impressão inválido ou incompleto")
        for pagina in doc:
            pagina.get_contents()


def validar_contrato(dados):
    contrato = dados.get("integridade")
    if not isinstance(contrato, dict) or contrato.get("version") != VERSION:
        raise ValueError("Atualize o painel: confirmação integral do trabalho obrigatória")
    if not re.fullmatch(r"[a-f0-9-]{36}", str(contrato.get("job_id", ""))):
        raise ValueError("Identificador de trabalho inválido")
    arquivos = contrato.get("arquivos")
    if not isinstance(arquivos, dict):
        raise ValueError("Manifesto de arquivos ausente")
    if not all(isinstance(contrato.get(chave), list) for chave in ("modelos", "numeracoes")):
        raise ValueError("Referências do trabalho não confirmadas")
    alvos = dados.get("multi_artes") or [dados]
    faces = contrato.get("faces")
    if not isinstance(faces, list) or len(faces) != len(alvos):
        raise ValueError("Contrato de faces incompleto")
    for i, (alvo, face) in enumerate(zip(alvos, faces)):
        if not isinstance(face, dict) or alvo.get("local_path") or alvo.get("local_verso_path"):
            raise ValueError("Contrato de recursos inválido")
        if dados.get("multi_artes") and bool(alvo.get("has_raw_file")) != face.get("front"):
            raise ValueError("Arquivo obrigatório do modelo não confirmado")
        for nome, chave in (("front", f"ma_file_{i}" if dados.get("multi_artes") else "file"),
                            ("back", f"ma_verso_{i}" if dados.get("multi_artes") else "file_verso")):
            if type(face.get(nome)) is not bool or face[nome] != (chave in arquivos):
                raise ValueError("Obrigatoriedade da arte não confirmada por face")
        for campo, referencia in (("numeracao", alvo.get("num1_id") or alvo.get("numeracao_id")),
                                  ("numeracao_2", alvo.get("num2_id") or alvo.get("numeracao_2_id"))):
            num = alvo.get(campo)
            if referencia and (not isinstance(num, dict) or str(num.get("id")) != str(referencia)):
                raise ValueError("Numeração obrigatória ausente ou divergente")
        if alvo.get("pdf_url") or alvo.get("pdf_verso_url"):
            raise ValueError("As artes devem estar preparadas antes da geração")
    for chave, arquivo in arquivos.items():
        if not re.fullmatch(r"file|file_verso|csv_file|ma_file_\d+|ma_verso_\d+", chave):
            raise ValueError("Recurso desconhecido no manifesto")
        if not isinstance(arquivo, dict) or not re.fullmatch(r"[a-f0-9]{64}", str(arquivo.get("sha256", ""))):
            raise ValueError("Hash de arquivo ausente")
        if type(arquivo.get("size")) is not int or arquivo["size"] <= 0:
            raise ValueError("Tamanho de arquivo inválido")
    if not isinstance(dados.get("formato"), dict) or not isinstance(dados.get("saida"), dict):
        raise ValueError("Formato e saída devem estar confirmados no trabalho")
    return contrato


async def validar_uploads(dados, formulario):
    contrato = validar_contrato(dados)
    esperados = contrato["arquivos"]
    for chave in formulario:
        if re.fullmatch(r"file|file_verso|csv_file|ma_file_\d+|ma_verso_\d+", chave) and chave not in esperados:
            raise ValueError("Upload não declarado no trabalho")
    for chave, esperado in esperados.items():
        upload = formulario.get(chave)
        if upload is None or not hasattr(upload, "read"):
            raise ValueError("Arte obrigatória não recebida: " + chave)
        h = hashlib.sha256()
        tamanho = 0
        await upload.seek(0)
        try:
            while bloco := await upload.read(1024 * 1024):
                tamanho += len(bloco)
                h.update(bloco)
        finally:
            await upload.seek(0)
        if tamanho != esperado["size"] or h.hexdigest() != esperado["sha256"]:
            raise ValueError("Integridade da arte não confirmada: " + chave)
    return contrato
