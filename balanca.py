# -*- coding: utf-8 -*-
"""A balanca da gráfica, lida pelo agente da estacao.

Balanca Urano CP 3/0.5 POP -- 3 kg de capacidade, divisao de 0,5 g. O operador do
Painel do Acabamento pesa o material e ate 24/08/2026 digitava no campo o numero
que lia no visor. Este modulo e o que faz o numero chegar sozinho.

## O que o manual da balanca manda fazer

Manual de operacao da linha CP POP, item 11.13.2 ("Configuracao da saida serial
padrao e USB", senha 191249):

    Protocolo usado: taxa 9600 bps, 8 data bits, sem paridade, 2 stop bits.
    (...) o computador faz a solicitacao de peso para a balanca, enviando um
    caracter de comando (04 ou 05 em hexadecimal). Tao logo a balanca receba
    este comando, a mesma ira transmitir a informacao.

E o quadro que ela transmite, do desenho da mesma pagina:

    [sinal][estavel] DD/MM/AA _ <descricao, 20 caracteres> _ TTTTTTg _ LLLLLLg
      __ MMM,MMMg _ PPPPPP <CR><LF><CK><CK>
                                tara      liquido   peso medio   pecas

O peso liquido vem em GRAMAS, seis digitos. Os campos de peso do painel sao em
quilos, com tres casas -- e a divisao por 1000 cai exatamente nelas.

## Duas coisas da balanca que nenhum codigo resolve

1. **A saida de dados e OPCIONAL de fabrica.** A CP POP tem o conector RJ45
   (RS-232C) e o conector USB como acessorios. Balanca sem eles nao e lida por
   software nenhum, e nenhuma mensagem de erro daqui muda isso -- por isso o
   `comoResolver` diz a palavra "opcional" em vez de mandar o operador procurar
   defeito onde nao ha.
2. **A saida precisa estar ligada no teclado dela**: `FUNCAO` `8`, senha
   `191249`, opcao "Tipo 1" (responde a pedido do computador) ou "Tipo 2".
   "Deslig" tambem e uma das opcoes, e a balanca pode estar nela -- caso em que
   ela simplesmente nao responde, sem erro nenhum na porta.

Essas duas sao a razao de este modulo nunca devolver "erro": ele devolve motivo e
saida, em portugues, para a tela repetir ao operador.
"""
import json
import os
import re
import sys
import time

# ─── Onde a escolha da porta fica guardada ───────────────────────────────────
#
# Ao lado do executavel, como o `print_configs.json` do `db.py`, e pela mesma
# razao: em qual porta COM a balanca esta e propriedade FISICA daquela maquina.
# Guardar no banco compartilhado faria a estacao do acabamento e a da impressao
# disputarem a mesma linha. Ficando ao lado do executavel, sobrevive a
# atualizacao do agente -- o MSI troca so o NewProd.exe.
if getattr(sys, "frozen", False):
    DB_DIR = os.path.dirname(sys.executable)
else:
    DB_DIR = os.path.dirname(os.path.abspath(__file__))

ARQUIVO_DE_CONFIG = os.path.join(DB_DIR, "balanca_config.json")

# ─── O protocolo, como o manual descreve ─────────────────────────────────────

COMANDO = b"\x05"          # 0x04 ou 0x05; os dois pedem o peso
BAUD = 9600
BITS_DE_DADOS = 8
STOP_BITS = 2
FIM_DO_QUADRO = b"\x0d\x0a"

# Quanto esperar por um quadro depois de pedir. A balanca responde na hora; meio
# segundo e folga para o conversor USB-serial acordar.
ESPERA_DA_PORTA = 0.5

# De quanto em quanto tempo pedir de novo enquanto o peso balanca no prato.
INTERVALO = 0.15

# Quantos pedidos sem NENHUMA resposta antes de desistir daquela porta. Balanca
# em "Deslig" nao responde nunca: insistir os 4 segundos inteiros so faria o
# operador esperar de pe na frente da tela.
PEDIDOS_ATE_DESISTIR = 2

# O visor mostra `888888` quando o peso passa da capacidade (manual, item 8).
SOBRECARGA = 888888

# Os campos numericos, ancorados no FIM do quadro. Ancorar no fim e o que torna
# a descricao de 20 caracteres inofensiva: ela pode conter digitos e espacos
# ("CAIXA 12 STAFF DIA 2") e nao desloca nada.
CAMPOS = re.compile(
    r"(?P<tara>\d{6})g\s+(?P<liquido>\d{6})g\s+(?P<medio>[\d.,]+)g\s+(?P<pecas>\d{6})\s*$"
)

DICA_DO_TECLADO = (
    "Na balança: FUNÇÃO, 8, senha 191249, e escolha \"Tipo 1\" — é o modo em que "
    "ela responde ao computador. Confira também o cabo (a saída serial RJ45 e a "
    "USB são acessórios opcionais na CP POP: sem um deles instalado, não há o que ler)."
)


def interpretar_quadro(dados):
    """Le o quadro cru da balanca e devolve os campos dele.

    Levanta `ValueError` quando aquilo nao e um quadro -- porta muda, lixo
    eletrico, quadro cortado no meio.

    ## Por que o sinal e a marca de estavel sao lidos como CONJUNTO

    O desenho do manual poe os dois nas duas primeiras casas do quadro, com as
    duas chaves apontando para a mesma dupla, e nao diz qual vem primeiro.
    Apostar numa ordem e errar daria um peso "sempre instavel" (ou "sempre
    negativo") sem nada na tela que explicasse por que. Olhando o par junto, nao
    ha aposta a errar: se um dos dois e `*`, o peso estabilizou; se um dos dois e
    `-`, ele e negativo.

    ## Por que o checksum NAO recusa o quadro

    Ele e conferido e devolvido em `checksum_confere`, para o diagnostico
    mostrar. Mas recusar por ele seria apostar de novo: se a minha leitura de
    "somatorio de todos os bytes a esquerda" estiver deslocada de um byte, uma
    balanca que funciona viraria uma que nunca le. Os campos numericos ja provam
    que o quadro e um quadro.
    """
    if not isinstance(dados, (bytes, bytearray)):
        raise ValueError("quadro precisa vir em bytes")

    corte = bytes(dados).find(FIM_DO_QUADRO)
    if corte == -1:
        raise ValueError("quadro sem o CR LF do fim")

    corpo = bytes(dados)[:corte]
    resto = bytes(dados)[corte + len(FIM_DO_QUADRO):]
    texto = corpo.decode("latin-1")

    achado = CAMPOS.search(texto)
    if not achado:
        raise ValueError("o que veio da porta não tem os campos de peso da CP POP")

    marcas = texto[:2]
    estavel = "*" in marcas
    negativo = "-" in marcas

    gramas = int(achado.group("liquido"))
    sobrecarga = gramas == SOBRECARGA

    checksum_confere = None
    if len(resto) >= 2:
        soma = sum(corpo) + sum(FIM_DO_QUADRO)
        checksum_confere = bytes([(soma >> 8) & 0xFF, soma & 0xFF]) == resto[:2]

    return {
        "gramas": gramas,
        "peso_kg": None if sobrecarga else round((-gramas if negativo else gramas) / 1000.0, 3),
        "tara_kg": round(int(achado.group("tara")) / 1000.0, 3),
        "pecas": int(achado.group("pecas")),
        "estavel": estavel,
        "negativo": negativo,
        "sobrecarga": sobrecarga,
        "checksum_confere": checksum_confere,
        "bruto": texto,
    }


# ─── A porta serial ──────────────────────────────────────────────────────────


def _abrir_porta(porta, timeout=None):
    """Abre a porta com os parametros do manual. Trocada nos testes."""
    import serial  # importado aqui: o modulo carrega mesmo sem pyserial

    return serial.Serial(
        port=porta,
        baudrate=BAUD,
        bytesize=BITS_DE_DADOS,
        parity="N",
        stopbits=STOP_BITS,
        timeout=ESPERA_DA_PORTA if timeout is None else timeout,
        write_timeout=1.0,
    )


def portas_disponiveis():
    """As portas COM desta maquina. Lista vazia quando nao ha nenhuma."""
    try:
        from serial.tools import list_ports
    except Exception:
        return []
    try:
        return [{"porta": p.device, "descricao": (p.description or "").strip()}
                for p in list_ports.comports()]
    except Exception:
        return []


def porta_guardada():
    try:
        with open(ARQUIVO_DE_CONFIG, "r", encoding="utf-8") as f:
            return (json.load(f) or {}).get("porta") or None
    except Exception:
        return None


def guardar_porta(porta):
    try:
        with open(ARQUIVO_DE_CONFIG, "w", encoding="utf-8") as f:
            json.dump({"porta": porta}, f)
        return True
    except Exception:
        return False


def _conversar(porta, segundos):
    """Pede o peso ate ele estabilizar, ou ate o prazo acabar.

    A porta e aberta UMA vez e reaproveitada em todos os pedidos: abrir porta
    serial no Windows custa mais que o proprio pedido, e o operador esta de pe na
    frente da tela. Ela e fechada em `finally` -- porta serial esquecida aberta e
    porta que trava a leitura seguinte, inclusive de outro programa.

    Devolve `(leitura, erro)`, e um dos dois e sempre `None`.
    """
    try:
        p = _abrir_porta(porta)
    except Exception as e:
        return None, str(e) or e.__class__.__name__

    ultima = None
    mudas = 0
    prazo = time.monotonic() + max(0.0, segundos)
    try:
        while True:
            try:
                p.reset_input_buffer()
            except Exception:
                pass
            p.write(COMANDO)
            dados = p.read_until(FIM_DO_QUADRO)
            if dados.endswith(FIM_DO_QUADRO):
                dados += p.read(2)          # o checksum de dois bytes

            try:
                ultima = interpretar_quadro(dados)
            except ValueError:
                mudas += 1
                if ultima is None and mudas >= PEDIDOS_ATE_DESISTIR:
                    break
            else:
                if ultima["estavel"] or ultima["sobrecarga"]:
                    break

            if time.monotonic() >= prazo:
                break
            time.sleep(INTERVALO)
    except Exception as e:
        return None, str(e) or e.__class__.__name__
    finally:
        try:
            p.close()
        except Exception:
            pass

    return ultima, None


def _resposta(leitura, porta):
    """Traduz uma leitura para o que a tela precisa dizer ao operador."""
    if leitura["sobrecarga"]:
        return {
            "ok": False, "porta": porta, "estavel": leitura["estavel"],
            "peso_kg": None, "bruto": leitura["bruto"],
            "motivo": "A balança está em sobrecarga.",
            "comoResolver": "A CP 3/0.5 POP pesa até 3 kg. Tire o material do prato "
                            "e pese em partes, ou use uma balança de mais capacidade.",
        }
    if not leitura["estavel"]:
        return {
            "ok": False, "porta": porta, "estavel": False,
            "peso_kg": leitura["peso_kg"], "bruto": leitura["bruto"],
            "motivo": "O peso ainda está instável.",
            "comoResolver": "Espere o material parar de balançar no prato e leia de novo. "
                            "A balança precisa estar numa base firme, sem vibração e sem "
                            "encostar em nada.",
        }
    return {
        "ok": True, "porta": porta, "estavel": True,
        "peso_kg": leitura["peso_kg"], "tara_kg": leitura["tara_kg"],
        "pecas": leitura["pecas"], "bruto": leitura["bruto"],
        "checksum_confere": leitura["checksum_confere"],
        "motivo": "", "comoResolver": "",
    }


def _nao_achei(motivo, como=None):
    return {"ok": False, "porta": None, "estavel": False, "peso_kg": None,
            "bruto": "", "motivo": motivo, "comoResolver": como or DICA_DO_TECLADO}


def ler_peso(porta=None, segundos=4.0):
    """O peso agora, em quilos.

    Com `porta`, fala so com ela. Sem, tenta a porta guardada e, se ela nao
    responder, procura entre as outras e guarda a que responder -- achar a
    balanca uma vez basta.
    """
    if porta:
        leitura, erro = _conversar(porta, segundos)
        if leitura:
            return _resposta(leitura, porta)
        if erro:
            return _nao_achei("Não deu para abrir a porta {} ({}).".format(porta, erro))
        return _nao_achei("A porta {} não respondeu como a balança CP POP.".format(porta))

    guardada = porta_guardada()
    if guardada:
        leitura, _erro = _conversar(guardada, segundos)
        if leitura:
            return _resposta(leitura, guardada)

    achado = procurar(segundos=segundos, ignorar=guardada)
    if achado["porta"]:
        return _resposta(achado["_leitura"], achado["porta"])

    if not achado["portas"]:
        return _nao_achei(
            "Este computador não tem nenhuma porta COM — não há onde a balança estar ligada.",
            "Ligue a balança ao computador. Atenção: na CP POP a saída de dados é "
            "opcional de fábrica — tanto o conector serial RJ45 quanto o USB são "
            "acessórios. Sem um deles na balança não há como lê-la, e o caminho é o "
            "cabo adaptador serial da Urano. " + DICA_DO_TECLADO)

    return _nao_achei(
        "Procurei nas {} porta(s) deste computador e nenhuma respondeu como a balança."
        .format(len(achado["portas"])))


def procurar(segundos=1.0, ignorar=None):
    """O diagnostico: o que cada porta COM desta maquina respondeu ao pedido.

    E o que responde a pergunta que nenhum codigo responde de longe -- se a
    balanca esta mesmo ligada nesta maquina. A primeira porta que responder um
    quadro valido e guardada.
    """
    portas = portas_disponiveis()
    achadas = []
    escolhida = None
    leitura_boa = None

    for p in portas:
        nome = p.get("porta")
        linha = {"porta": nome, "descricao": p.get("descricao", ""),
                 "respondeu": False, "detalhe": "", "peso_kg": None,
                 "estavel": False, "bruto": ""}

        if escolhida or nome == ignorar:
            linha["detalhe"] = ("já era a porta guardada, e ela não respondeu"
                                if nome == ignorar else "não precisei tentar")
            achadas.append(linha)
            continue

        leitura, erro = _conversar(nome, segundos)
        if leitura:
            linha.update({"respondeu": True, "peso_kg": leitura["peso_kg"],
                          "estavel": leitura["estavel"], "bruto": leitura["bruto"],
                          "detalhe": "respondeu um quadro da CP POP"})
            escolhida = nome
            leitura_boa = leitura
            guardar_porta(nome)
        else:
            linha["detalhe"] = erro or "não respondeu"
        achadas.append(linha)

    return {"porta": escolhida, "portas": achadas, "_leitura": leitura_boa,
            "comoResolver": DICA_DO_TECLADO}
