"""Snapshots limitados dos logs; nenhuma rede ou leitura ocorre no import."""
import hashlib
import json
import re
import time
from datetime import datetime, timezone

ARQUIVOS = ('agent.log',) + tuple(f'agent.log.{i}' for i in range(1, 6))
LIMITE = 65536
LEITURA_MAXIMA = 5 * 1024 * 1024


def linha_segura(linha):
    # Nao publicar payloads arbitrarios, linhas de codigo ou configuracao.
    # Preserva somente mensagens dos caminhos de geracao/impressao conhecidos.
    linha = str(linha)[:4000]
    horario = re.match(r'^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} ', linha)
    prefixo = horario.group() if horario else ''
    corpo = linha[len(prefixo):]
    corpo = re.sub(r'^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\] ', '', corpo)
    if re.fullmatch(r'RuntimeError: (Entrega interrompida: conexao encerrada\.|Envio do lote nao confirmado; geracao interrompida\.)', corpo):
        return prefixo + corpo
    if re.fullmatch(r"\[integridade\] job=[a-f0-9-]{36} modelos=\['[0-9]+'(?:, '[0-9]+')*\] etapa=uploads_confirmados", corpo):
        return prefixo + corpo
    if not re.match(r'^\[(print|impose|DIAG impose(?: stream)?)\]|^\[engine\] (total_sheets=|strict_assembly:|sheet |loop done|save done|entrega por bloco:|Gerado:|Falha ao baixar arte)', corpo):
        return prefixo + '[linha omitida da consulta remota]'
    if re.search(r'(?i)password|senha|secret|segredo|token|apikey|authorization|codigo_acesso|pdf_content|csv_data|font_data', corpo):
        return prefixo + '[conteudo sensivel omitido]'
    corpo = re.sub(r'https?://\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REMOVIDO]', corpo)
    corpo = re.sub(r'(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', '[EMAIL]', corpo)
    corpo = re.sub(r'(?i)[a-z]:[\\/][^\r\n]*|\\\\[^\r\n]*', '[CAMINHO]', corpo)
    corpo = re.sub(r'\b[A-Za-z0-9_/-]{40,}\b', '[VALOR OMITIDO]', corpo)
    return (prefixo + corpo)[:2000]


def snapshot(raiz, arquivo):
    from pacotes_locais import _sem_links
    if arquivo not in ARQUIVOS:
        raise ValueError('Arquivo de log invalido')
    _sem_links(raiz)
    path = raiz / arquivo
    _sem_links(path)
    agora = datetime.now(timezone.utc).isoformat()
    try:
        with path.open('rb') as f:
            import os
            tamanho = os.fstat(f.fileno()).st_size
            inicio = max(0, tamanho - LEITURA_MAXIMA)
            f.seek(inicio)
            bruto = f.read(LEITURA_MAXIMA)
    except FileNotFoundError:
        return dict(arquivo=arquivo, coletado_em=agora, estado='ausente', tamanho=0, parcial=False, linhas=[])
    partes = bruto.decode('utf-8', errors='replace').splitlines()
    if inicio and partes:
        partes.pop(0)  # Nao expor fragmento que possa perder o prefixo de segredo.
    relevantes = [linha_segura(l) for l in partes]
    relevantes = [l for l in relevantes if not l.endswith('[linha omitida da consulta remota]')]
    parcial = bool(inicio or len(relevantes) > 300)
    linhas = relevantes[-300:]
    # O limite e de bytes serializados tambem, inclusive Unicode.
    while len(json.dumps(linhas, ensure_ascii=False).encode()) > LIMITE:
        linhas.pop(0)
        parcial = True
    return dict(arquivo=arquivo, coletado_em=agora, estado='disponivel', tamanho=tamanho,
                parcial=parcial, linhas=linhas)


class SincronizadorLogs:
    def __init__(self, raiz, enviar):
        self.raiz, self.enviar = raiz, enviar
        self.indice, self.proxima, self.falhas = 0, 0, 0

    def ciclo(self, agora=None):
        agora = time.monotonic() if agora is None else agora
        if agora < self.proxima:
            return
        self.proxima = agora + 30
        try:
            dados = snapshot(self.raiz, ARQUIVOS[self.indice])
            resumo = hashlib.sha256(json.dumps(dados, sort_keys=True).encode()).hexdigest()
            if self.enviar({**dados, 'resumo': resumo}) != {'confirmado': resumo}:
                raise ValueError('Confirmacao divergente')
            self.indice = (self.indice + 1) % len(ARQUIVOS)
            self.falhas = 0
        except Exception:
            # Nunca escrever o erro no proprio log: evita ciclo de telemetria.
            self.falhas += 1
            self.proxima = agora + min(900, 30 * 2 ** min(self.falhas, 5))


def iniciar():
    import threading
    import urllib.request
    import os
    from canais_newprod import pasta_local
    from coleta_autonoma import segredo_do_agente
    from pacotes_download import SemRedirecionamento

    def enviar(dados):
        req = urllib.request.Request(
            'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/historico-impressao/enviar-logs',
            data=json.dumps({**dados, 'estacao': os.environ.get('NEWPROD_PILOTO_ESTACAO', '')}).encode(),
            headers={'Content-Type': 'application/json', 'X-Agente-Segredo': segredo_do_agente()})
        with urllib.request.build_opener(SemRedirecionamento()).open(req, timeout=5) as r:
            return json.loads(r.read(8192))

    def rodar():
        sync = SincronizadorLogs(pasta_local() / 'gestao' / 'logs', enviar)
        while True:
            sync.ciclo()
            time.sleep(30)

    threading.Thread(target=rodar, name='LogsRemotos', daemon=True).start()
