"""Classifica recusas sem persistir texto livre, URLs ou cabeçalhos brutos."""
import json
import platform
import sys
import urllib.request

MOTIVOS = {
    texto: texto.replace(' ', '_') for texto in (
        'origem recusada', 'identidade do agente necessaria', 'estacao fora do piloto',
        'vinculo da estacao invalido', 'vinculo do piloto divergente',
        'responsavel do piloto indisponivel', 'responsavel sem permissao do piloto',
        'empresa do responsavel divergente', 'sem permissao para consultar pedidos',
        'operador local invalido', 'empresa fora do piloto', 'empresa divergente',
        'permissoes indisponiveis', 'sessao necessaria', 'sessao invalida',
        'piloto sem empresa ou permissoes', 'operador sem permissao de producao e impressao',
        'operador de outra empresa')}
RESULTADOS = set(MOTIVOS.values()) | {'nao_catalogado', 'corpo_excede_limite', 'corpo_indisponivel',
                                    'resposta_html', 'resposta_nao_json', 'aguardando_leitura'}


def contexto(erro, estacao, empresa, base):
    headers = getattr(erro, 'headers', None) or {}
    tipo = headers.get('Content-Type', '').split(';')[0].strip().lower()
    servidor = headers.get('Server', '').strip().lower()
    dados = dict(estacao_enviada=estacao, empresa_padrao=empresa == 'Ingresso Ideal',
        destino_padrao=base == 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/piloto-local/',
        formato_resposta='json' if tipo == 'application/json' else 'html' if tipo == 'text/html' else 'outro',
        servidor_http=servidor if servidor in {'cloudflare', 'envoy', 'nginx', 'squid'} else 'outro',
        via_presente=bool(headers.get('Via')), cf_ray_presente=bool(headers.get('CF-Ray')),
        desafio_cloudflare=headers.get('CF-Mitigated', '').lower() == 'challenge')
    try:
        dados['proxy_https_configurado'] = bool(urllib.request.getproxies().get('https'))
    except Exception:
        pass
    if sys.platform == 'win32':
        try:
            v = sys.getwindowsversion()
            dados['windows_build'] = v.build
            dados['windows_edicao'] = platform.win32_edition()
        except Exception:
            pass
    return dados


def classificar_corpo(stream):
    """Uma leitura de no máximo 4097 bytes na thread de diagnóstico; fecha sempre."""
    if stream is None:
        return 'corpo_indisponivel'
    try:
        raw = (getattr(stream, 'read1', None) or stream.read)(4097)
        if len(raw) > 4096:
            return 'corpo_excede_limite'
        try:
            dados = json.loads(raw)
        except (ValueError, UnicodeError):
            return 'resposta_html' if raw.lstrip().lower().startswith((b'<!doctype html', b'<html')) else 'resposta_nao_json'
        detalhe = dados.get('detail') if isinstance(dados, dict) else None
        return MOTIVOS.get(detalhe, 'nao_catalogado') if isinstance(detalhe, str) else 'nao_catalogado'
    except Exception:
        return 'corpo_indisponivel'
    finally:
        try:
            stream.close()
        except Exception:
            pass
