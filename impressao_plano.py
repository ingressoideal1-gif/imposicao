"""Plano de folhas independente de marca, estacao e protocolo de envio.

Recebe a sequencia final do motor, ja filtrada por face. Cada trecho comeca
em folha nova. Numeros de bandeja Windows nao sao identificadores do RIP.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Trecho:
    arquivo: str
    paginas: int
    bandeja: str
    duplex: str


def planejar(trechos, *, copias=1):
    """Retorna intervalos 1-based e limites fisicos, sem reordenar arquivos.

    O adaptador futuro deve implementar inicio_em_nova_folha, inclusive ao
    terminar duplex impar. Somente concatenar PDFs nao satisfaz este plano.
    """
    if type(copias) is not int or not 1 <= copias <= 999:
        raise ValueError('Copias invalidas.')
    partes = []
    pagina = folha = 1
    for trecho in trechos:
        if not isinstance(trecho, Trecho):
            raise ValueError('Trecho invalido.')
        if type(trecho.paginas) is not int or trecho.paginas < 1:
            raise ValueError('Quantidade de paginas invalida.')
        if not isinstance(trecho.arquivo, str) or not trecho.arquivo.strip():
            raise ValueError('Arquivo ausente.')
        if not isinstance(trecho.bandeja, str) or not trecho.bandeja.strip():
            raise ValueError('Bandeja logica ausente.')
        if trecho.duplex not in ('simplex', 'duplex_long_edge', 'duplex_short_edge'):
            raise ValueError('Duplex invalido.')
        dupla = trecho.duplex != 'simplex'
        folhas = (trecho.paginas + 1) // 2 if dupla else trecho.paginas
        partes.append({
            'ordem': len(partes) + 1, 'arquivo': trecho.arquivo,
            'pagina_inicial': pagina, 'pagina_final': pagina + trecho.paginas - 1,
            'folha_inicial': folha, 'folha_final': folha + folhas - 1,
            'bandeja': trecho.bandeja, 'duplex': trecho.duplex,
            'inicio_em_nova_folha': True,
            'ultimo_verso_sem_conteudo': dupla and trecho.paginas % 2 == 1,
        })
        pagina += trecho.paginas
        folha += folhas
    if not partes:
        raise ValueError('Trabalho vazio.')
    return {'schema': 1, 'estado': 'aguardando_adaptador',
            'paginas_por_copia': pagina - 1, 'folhas_por_copia': folha - 1,
            'copias': copias, 'copias_agrupadas': True, 'trechos': partes}


def preparar_para_destino(trechos, *, estacao, impressora, perfil, copias=1):
    """Resolve bandejas por destino; nao imprime nem escolhe outro modo.

    Perfil deve vir da configuracao local validada, nao do nome da marca.
    Recursos declaram o contrato exigido do futuro adaptador; nao sao prova
    de suporte fisico. Saida continua sem autorizacao de envio.
    """
    if not isinstance(perfil, dict):
        raise ValueError('Perfil ausente.')
    if not isinstance(estacao, str) or not estacao.strip():
        raise ValueError('Estacao ausente.')
    if not isinstance(impressora, str) or not impressora.strip():
        raise ValueError('Impressora ausente.')
    if str(perfil.get('estacao', '')).casefold() != estacao.casefold():
        raise ValueError('Perfil pertence a outra estacao.')
    if perfil.get('impressora') != impressora:
        raise ValueError('Perfil pertence a outra impressora.')
    adaptador = perfil.get('adaptador')
    if not isinstance(adaptador, str) or not adaptador.strip():
        raise ValueError('Adaptador ausente.')
    plano = planejar(trechos, copias=copias)
    recursos = perfil.get('recursos', {})
    exigidos = ['trabalho_unico', 'inicio_em_nova_folha']
    if copias > 1:
        exigidos.append('copias_agrupadas')
    mapa = perfil.get('bandejas', {})
    if not isinstance(mapa, dict) or not isinstance(recursos, dict):
        raise ValueError('Perfil invalido.')
    for parte in plano['trechos']:
        destino = mapa.get(parte['bandeja'])
        if not isinstance(destino, str) or not destino.strip():
            raise ValueError('Bandeja sem correspondencia no destino: ' + parte['bandeja'])
        parte['bandeja_destino'] = destino
        modos = perfil.get('duplex', [])
        if not isinstance(modos, (list, tuple)) or parte['duplex'] not in modos:
            raise ValueError('Duplex nao declarado no destino: ' + parte['duplex'])
    if len({p['bandeja_destino'] for p in plano['trechos']}) > 1:
        exigidos.append('bandeja_por_trecho')
    if len({p['duplex'] for p in plano['trechos']}) > 1:
        exigidos.append('duplex_por_trecho')
    for recurso in exigidos:
        if recursos.get(recurso) is not True:
            raise ValueError('Destino sem recurso declarado: ' + recurso)
    plano['destino'] = {'estacao': estacao, 'impressora': impressora,
                        'adaptador': adaptador}
    plano['envio_habilitado'] = False  # planejamento nao equivale a adaptador implementado
    return plano
