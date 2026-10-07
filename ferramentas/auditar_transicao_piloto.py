"""Preflight somente leitura da substituicao do legado; recebe inventario via stdin.

Nao acessa credenciais, nao instala e nao cancela trabalhos. Os dados de presenca
nao autorizam automaticamente encerrar um processo ou migrar uma estacao.
"""
import json
import sys
from datetime import datetime, timezone


def recente(valor, agora):
    try:
        data = datetime.fromisoformat(valor.replace('Z', '+00:00'))
        if data.tzinfo is None:
            return False
        return -30 <= (agora - data).total_seconds() <= 120
    except (AttributeError, ValueError, TypeError):
        return False


def auditar(rows, agora=None):
    agora = agora or datetime.now(timezone.utc)
    grupos = {}
    for row in rows:
        nome = row.get('name') or 'sem nome'
        dados = row.get('printers_json') or {}
        if isinstance(dados, str):
            dados = json.loads(dados)
        piloto = dados.get('canal') == 'piloto' or nome.endswith(' [Piloto]')
        host = nome.removesuffix(' [Piloto]')
        grupo = grupos.setdefault(host, {'estacao': host, 'instalacoes': []})
        gestao = dados.get('gestao') or {}
        fila = gestao.get('fila')
        sinal = recente(row.get('last_seen'), agora)
        coleta = recente(gestao.get('coletado_em'), agora)
        fila_conhecida = (sinal and coleta and gestao.get('fila_disponivel') is True
                          and isinstance(fila, dict)
                          and all(type(v) is int and v >= 0 for v in fila.values()))
        grupo['instalacoes'].append({
            'canal': 'piloto' if piloto else 'legado',
            'versao': dados.get('version'), 'presenca_recente': sinal,
            'ultimo_sinal': row.get('last_seen'),
            'fila': fila if fila_conhecida else None,
            'fila_conhecida': fila_conhecida,
            'recebe_fila_remota': dados.get('recebe_fila_remota'),
            'atualizacao_remota': dados.get('atualizacao_remota', 'nao comprovada'),
        })
    for grupo in grupos.values():
        instalacoes = grupo['instalacoes']
        impedimentos = []
        if not any(i['presenca_recente'] for i in instalacoes):
            impedimentos.append('Estacao sem presenca recente')
        if not any(i['fila_conhecida'] for i in instalacoes):
            impedimentos.append('Fila atual indisponivel')
        if any(i['fila_conhecida'] and sum(i['fila'].values()) > 0 for i in instalacoes):
            impedimentos.append('Trabalhos presentes no Windows; nao interromper')
        if not any(i['canal'] == 'piloto' for i in instalacoes):
            impedimentos.append('Instalacao do Piloto nao comprovada')
        # Mesmo uma fila vazia nao comprova motor ocioso, backup ou canal de migracao.
        impedimentos.extend(['Exige preflight local de motor, dados e backup',
                             'Exige pacote de transicao validado e confirmacao posterior'])
        grupo['pendencias'] = impedimentos
        grupo['migracao_autorizada_pelo_relatorio'] = False
    return {'consultado_em': agora.isoformat(), 'estacoes': list(grupos.values()),
            'limite': 'Presenca e fila nao comprovam painel saudavel ou impressao fisica.'}


if __name__ == '__main__':
    print(json.dumps(auditar(json.load(sys.stdin)), ensure_ascii=False, indent=2))
