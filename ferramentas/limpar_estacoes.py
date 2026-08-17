# -*- coding: utf-8 -*-
"""Apaga os registros ORFAOS de estacao — os que a maquina abandonou.

## Que fantasma e esse

Cada linha de `print_agents` e uma instalacao, e nao uma maquina: a chave e um
`id` gerado na instalacao. Reinstalar o NewProd cria linha NOVA, e a antiga fica
para sempre — o agente novo escreve na dele, e a velha nunca mais recebe
heartbeat.

O resultado e a lista de estacoes mentindo sobre o tamanho da grafica. Em
17/08/2026 ela dizia "11 estacoes registradas" para 9 maquinas: DESKTOP-5N8AF7D
e PC-JR-HOME apareciam duas vezes cada, com a linha velha parada havia 9 e 10
dias. Quem le a conferencia diaria precisa saber quantas estacoes existem de
verdade — e essa conta e a base para decidir se todas migraram.

## O criterio, e por que NAO e "sem sinal ha muito tempo"

Apagar por idade do sinal e a ideia obvia e a errada. `DESKTOP-8B5SDS4` estava
sem sinal havia 6 dias e e uma maquina de verdade, so desligada — apaga-la
tiraria da lista uma estacao que volta amanha, e com ela o registro de que ela
existe e esta atrasada. Um limite de 30 dias tambem nao resolveria: os fantasmas
tinham 9 e 10 dias, e nao seriam pegos.

O criterio certo e a SUBSTITUICAO: so e orfa a linha cujo `name` tem OUTRA linha
com `last_seen` mais recente. Isso e prova, e nao estimativa — a mesma maquina se
registrou de novo, e a linha velha nunca mais vai ser escrita. Maquina com uma
linha so nunca e tocada aqui, por mais antiga que ela esteja.

## Por padrao nao apaga nada

Roda em modo consulta e mostra o que apagaria. `--confirmar` executa. Escrita em
banco de producao nao acontece por engano de linha de comando.
"""
import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def orfas(linhas):
    """As linhas que foram substituidas por um registro mais novo do mesmo nome.

    Pura, para poder ser testada sem banco. `linhas` sao dicionarios com `id`,
    `name` e `last_seen`.

    Nome sem duplicata NUNCA entra, e a linha mais recente de cada nome tambem
    nao — o que sai daqui e so o que a maquina ja abandonou.
    """
    mais_novo = {}
    for l in linhas:
        nome = (l.get("name") or "").strip()
        if not nome:
            continue
        visto = l.get("last_seen") or ""
        atual = mais_novo.get(nome)
        if atual is None or visto > (atual.get("last_seen") or ""):
            mais_novo[nome] = l

    fora = []
    for l in linhas:
        nome = (l.get("name") or "").strip()
        if not nome:
            continue
        vencedora = mais_novo[nome]
        # Compara por `id`: duas linhas do mesmo nome com o MESMO `last_seen`
        # (empate exato) nao podem ser as duas descartadas.
        if l.get("id") != vencedora.get("id"):
            fora.append(l)
    return fora


def _dias(visto, agora):
    try:
        return (agora - datetime.datetime.fromisoformat(
            (visto or "").replace("Z", "+00:00"))).days
    except Exception:
        return 999


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--confirmar", action="store_true",
                   help="apaga de verdade; sem isto so mostra")
    args = p.parse_args()

    import db
    if not (db.SUPABASE_URL and db.SUPABASE_KEY):
        print("     (sem Supabase configurado nesta maquina)")
        return 1

    alvo = f"{db.SUPABASE_URL}/rest/v1/print_agents?select=id,name,last_seen,versao&order=last_seen.desc"
    req = urllib.request.Request(alvo, headers={
        "apikey": db.SUPABASE_KEY, "Authorization": f"Bearer {db.SUPABASE_KEY}"})
    linhas = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))

    fora = orfas(linhas)
    agora = datetime.datetime.now(datetime.timezone.utc)

    if not fora:
        print(f"     {len(linhas)} registro(s), nenhum orfao. Nada a limpar.")
        return 0

    # Hifen simples, e nao travessao: o console da estacao e cp1252 e o
    # travessao sai como lixo na tela de quem le a conferencia.
    print(f"     {len(linhas)} registro(s); {len(fora)} orfao(s) - substituidos "
          f"por instalacao mais nova da MESMA maquina:")
    for l in fora:
        print(f"       {str(l.get('name'))[:22]:<22} {(l.get('versao') or '--'):>8}  "
              f"sem sinal ha {_dias(l.get('last_seen'), agora)}d   id={l.get('id')}")

    if not args.confirmar:
        print("     (consulta apenas - rode com --confirmar para apagar)")
        return 0

    # A `service_role` e necessaria para escrever. A anonima le a lista de
    # estacoes porque o painel precisa dela, mas apagar e outra coisa.
    chave = db.SUPABASE_SERVICE_KEY
    if not chave:
        print("     PAROU: SUPABASE_SERVICE_KEY nao esta no .env.local desta "
              "maquina, e apagar exige ela.")
        return 1

    apagados = 0
    for l in fora:
        url = f"{db.SUPABASE_URL}/rest/v1/print_agents?id=eq.{l['id']}"
        req = urllib.request.Request(url, method="DELETE", headers={
            "apikey": chave, "Authorization": f"Bearer {chave}",
            "Prefer": "return=minimal"})
        try:
            urllib.request.urlopen(req, timeout=30).read()
            apagados += 1
            print(f"       apagado: {l.get('name')} ({l['id']})")
        except urllib.error.HTTPError as e:
            # Uma falha nao pode derrubar as outras: cada linha e independente,
            # e parar no meio deixaria a lista pela metade sem ninguem saber.
            print(f"       FALHOU {l.get('name')}: {e.code} "
                  f"{e.read().decode('utf-8', 'replace')[:120]}")

    print(f"     {apagados} de {len(fora)} registro(s) orfao(s) apagado(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
