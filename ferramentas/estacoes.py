# -*- coding: utf-8 -*-
"""Quais estacoes estao respondendo, e o que cada uma esta rodando.

Existe porque a conferencia diaria (`ferramentas/conferir.ps1`) so enxergava a
maquina local. A pergunta que ela respondia era "esta maquina esta em dia?", e a
que importa e outra: **as onze estacoes da grafica estao em dia?**

A diferenca deixou de ser academica na Fase 2b. Para desligar o Render e preciso
saber quando todas migraram, e desligar antes que a ultima migre significa uma
grafica imprimindo ingressos que nunca sao publicados — o papel sai, a portaria
nao tem o que conferir, e ninguem descobre ate alguem tentar entrar.

## De onde sai cada numero

`versao` e `painel_versao` sao colunas de `print_agents`, preenchidas pelo
heartbeat (`sql/alter_print_agents_versao.sql`). Enquanto o ALTER TABLE nao for
aplicado, ou enquanto a estacao rodar um agente anterior a ele, as colunas ficam
nulas — e ai o valor sai de `printers_json`, onde o heartbeat sempre pos a
versao. Estacao que nao reporta de jeito nenhum roda algo anterior a
agosto/2026, e isso e dito com todas as letras.

`status` NAO e consultado, de proposito: ele diz "online" para maquinas cujo
ultimo sinal e de nove dias atras. Quem responde "esta viva?" e o `last_seen`.

## So consulta

Nenhuma escrita, nenhuma chave de servico — a mesma chave anonima que o painel
ja usa para listar estacoes. Pode rodar a qualquer momento.
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Sinal mais velho que isto e uma estacao que parou de falar, e nao uma que esta
# desatualizada. Dois dias cobrem um fim de semana inteiro sem gritar a toa.
DIAS_ATE_SUMIDA = 2


def versao_do_repositorio(raiz: str) -> str:
    try:
        with open(os.path.join(raiz, "agent_version.py"), encoding="utf-8") as f:
            m = re.search(r'AGENT_VERSION\s*=\s*"([\d.]+)"', f.read())
            return m.group(1) if m else ""
    except Exception:
        return ""


def como_numero(versao: str):
    """"1.2.92" -> (1, 2, 92), para comparar sem mentir.

    Comparar como TEXTO diria que "1.2.9" e maior que "1.2.92", que e
    exatamente o tipo de engano que faria a conferencia declarar em dia uma
    estacao atrasada.
    """
    try:
        return tuple(int(p) for p in str(versao).split("."))
    except Exception:
        return ()


def _pedir(url: str, chave: str, colunas: str):
    alvo = f"{url}/rest/v1/print_agents?select={colunas}&order=last_seen.desc"
    req = urllib.request.Request(alvo, headers={"apikey": chave,
                                                "Authorization": f"Bearer {chave}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _estacoes(url: str, chave: str):
    """As linhas, com ou sem as colunas novas.

    Pedir uma coluna que o banco nao tem faz o PostgREST recusar a consulta
    INTEIRA com 400 — nao e uma coluna a menos, e nenhuma linha. Sem esta volta,
    a conferencia diaria passaria a dizer "nao consegui consultar as estacoes"
    em toda maquina onde `sql/alter_print_agents_versao.sql` ainda nao rodou, e
    quem lesse acharia que o problema era rede.
    """
    completo = "name,apelido,last_seen,versao,painel_versao,printers_json"
    try:
        return _pedir(url, chave, completo)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        # O `printers_json` sozinho ja responde tudo, so que cavando o JSON.
        return _pedir(url, chave, "name,apelido,last_seen,printers_json")


def _versoes(linha: dict):
    """(versao do executavel, versao do painel), de onde estiver disponivel."""
    pj = linha.get("printers_json") or {}
    if isinstance(pj, str):
        try:
            pj = json.loads(pj)
        except Exception:
            pj = {}
    painel = pj.get("painel") or {}
    return (
        linha.get("versao") or pj.get("version") or "",
        linha.get("painel_versao") or (painel.get("versao") if isinstance(painel, dict) else "") or "",
        pj.get("acesso_base") or "",
    )


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    import db

    if not (db.SUPABASE_URL and db.SUPABASE_KEY):
        print("     (sem Supabase configurado nesta maquina)")
        return 0

    try:
        linhas = _estacoes(db.SUPABASE_URL, db.SUPABASE_KEY)
    except Exception as e:
        # Rede fora nao e ponto de atencao: seria um alerta que ninguem pode
        # resolver, todo dia, no lugar de um que importa.
        print(f"     (nao consegui consultar as estacoes: {str(e)[:80]})")
        return 0

    repo = versao_do_repositorio(raiz)
    agora = datetime.datetime.now(datetime.timezone.utc)
    atrasadas, mudas, vivas = [], [], 0
    por_base = {}

    for l in linhas:
        visto = l.get("last_seen") or ""
        try:
            quando = datetime.datetime.fromisoformat(visto.replace("Z", "+00:00"))
            dias = (agora - quando).days
        except Exception:
            dias = 999

        nome = (l.get("apelido") or l.get("name") or "?").strip()
        versao, painel, base = _versoes(l)
        sumida = dias >= DIAS_ATE_SUMIDA

        quanto = "hoje" if dias == 0 else f"ha {dias}d"
        marca = " (sem sinal)" if sumida else ""
        # `--` e nao vazio: coluna em branco parece defeito da conferencia, e o
        # que se quer dizer aqui e "esta estacao nao informa".
        print(f"     {nome[:22]:<22} {(versao or '--'):>8}  painel {(painel or '--'):>5}  "
              f"{quanto:>7}{marca}")

        if sumida:
            continue
        vivas += 1
        if base:
            por_base[base] = por_base.get(base, 0) + 1
        if not versao:
            mudas.append(nome)
        elif repo and como_numero(versao) < como_numero(repo):
            atrasadas.append(f"{nome} em {versao}")

    print(f"     {len(linhas)} estacao(oes) registradas, {vivas} com sinal recente")

    # Para onde cada estacao publica a faixa de codigos. E a conta da Fase 3: o
    # Render so pode ser desligado quando ninguem mais estiver apontando para
    # ele. So aparece depois que a estacao roda o agente que reporta isso.
    for base, quantas in sorted(por_base.items(), key=lambda x: -x[1]):
        print(f"     publica em {base}: {quantas}")

    if mudas:
        # Nao e "esta desatualizada": e uma estacao SEM TRANCA. O heartbeat passou
        # a informar a versao no agente 1.2.7 (07/08/2026), e o login por codigo
        # local so nasceu no 1.2.27 (11/08/2026) — quatro dias depois. Logo, quem
        # nao informa versao roda algo anterior aos dois, e o painel daquela
        # maquina abre para quem sentar nela, sem pedir codigo nenhum.
        print("ALERTA: estacao(oes) que nao informam a versao: " + ", ".join(mudas) +
              ". Rodam agente anterior ao 1.2.7 (07/08/2026), logo anterior ao "
              "login por codigo local (1.2.27) — o painel dessas maquinas ABRE SEM "
              "PEDIR CODIGO. Instale o NewProd atual nelas.")
    if atrasadas:
        print(f"ALERTA: estacao(oes) atras do repositorio ({repo}): " +
              ", ".join(atrasadas) + ". Ver GUIA_AGENTE.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
