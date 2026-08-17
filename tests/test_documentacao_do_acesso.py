# -*- coding: utf-8 -*-
"""A documentação do controle de acesso não pode contradizer o código.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 o `docs/controle_acesso.md` afirmava, numa seção, que a gravação usa
`?on_conflict=codigo_hash` — e, cinquenta linhas abaixo, contava a história de a chave ter
passado a ser `chave_dedup` justamente porque a antiga descartou 31 ingressos. O documento
se contradizia, e a metade errada era a que alguém leria primeiro para entender como a
publicação funciona.

Documentação que mente é pior que documentação que falta: quem lê acredita, e vai
investigar no lugar errado com uma certeza a mais. Nesta aplicação isso custou dois dias e
62 ingressos.

Este arquivo não tenta conferir a prosa — isso nenhum teste faz. Ele cobra os poucos fatos
**verificáveis** que os dois documentos afirmam e que, quando envelhecem, mandam o leitor
para o lado errado:

1. o nome da coluna de deduplicação;
2. a lista de variáveis de ambiente exigidas;
3. quantas tabelas `producao_acesso_*` existem;
4. que todo link e todo arquivo citado existem de verdade.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DOCS = RAIZ / "docs"
ACESSO = DOCS / "controle_acesso.md"
QR = DOCS / "qr_ideal.md"


def _texto(p):
    return p.read_text(encoding="utf-8")


def test_a_chave_de_deduplicacao_documentada_e_a_que_o_codigo_usa():
    """O erro concreto de 15/08: o documento dizia `codigo_hash` e o código já
    pedia `chave_dedup`. As duas colunas existem, então nada estourava — só a
    explicação estava errada."""
    codigo = _texto(RAIZ / "acesso_api.py")
    m = re.search(r"producao_acesso_credenciais\?on_conflict=(\w+)", codigo)
    assert m, "o acesso_api.py nao pede on_conflict nenhum na gravacao do lote"
    coluna = m.group(1)

    doc = _texto(ACESSO)
    citadas = set(re.findall(r"on_conflict=(\w+)", doc))
    assert citadas == {coluna}, (
        f"a documentacao cita on_conflict={citadas or '{}'} e o codigo usa "
        f"'{coluna}' — quem ler vai investigar a coluna errada"
    )


def test_as_variaveis_documentadas_sao_as_que_a_saude_confere():
    """Faltar uma na tabela é o pior caso: cada variável falha num lugar
    diferente e tarde, e quem for configurar um servidor novo vai pela tabela."""
    codigo = _texto(RAIZ / "acesso_api.py")
    corpo = codigo[codigo.find("def saude"):]
    corpo = corpo[:corpo.find("\n@")] if "\n@" in corpo else corpo

    esperadas = {"SUPABASE_SERVICE_KEY", "ACESSO_AGENTE_SEGREDO",
                 "QR_PEDIDO_SEGREDO", "ACESSO_ELEVACAO_SEGREDO"}
    doc = _texto(ACESSO)
    faltando = [v for v in esperadas if v not in doc]
    assert not faltando, (
        "variavel exigida pelo servidor e ausente da documentacao: " + ", ".join(faltando)
    )

    # E o texto não pode continuar dizendo "as três" depois que virou quatro.
    assert "responde as quatro" in doc, (
        "a documentacao ainda anuncia um numero de variaveis diferente de quatro"
    )


def test_a_contagem_de_tabelas_bate_com_o_schema():
    """"As sete tabelas" ficou escrito enquanto já existiam oito. Um número
    errado aqui faz quem for auditar o RLS deixar uma tabela de fora.

    A contagem soma **todos** os arquivos de esquema do acesso, e não só o
    `schema_acesso.sql`: a oitava tabela, `producao_acesso_bloqueios`, nasceu
    numa migração posterior. Contar só o primeiro arquivo daria sete — o número
    que estava errado no documento — e o teste passaria verde concordando com o
    erro.
    """
    tabelas = set()
    for arquivo in sorted((RAIZ / "sql").glob("*acesso*.sql")):
        tabelas |= set(re.findall(
            r"create table if not exists\s+(producao_acesso_\w+)", _texto(arquivo), re.I))
    assert tabelas, "nao achei create table nenhum nos arquivos de esquema do acesso"

    doc = _texto(ACESSO)
    # O mapa acaba, e quando acaba o teste falha pedindo a palavra que falta —
    # de proposito. Um `str(len)` aqui deixaria a doc dizer "11 tabelas" e o
    # teste concordar, quando o texto do documento e escrito por extenso.
    numero = {
        7: "sete", 8: "oito", 9: "nove", 10: "dez",
        11: "onze", 12: "doze", 13: "treze", 14: "quatorze", 15: "quinze",
    }.get(len(tabelas))
    assert numero, f"schema tem {len(tabelas)} tabelas e este teste nao sabe soletrar"
    assert f"{numero} tabelas" in doc, (
        f"o schema cria {len(tabelas)} tabelas e a documentacao anuncia outro numero"
    )


def test_todo_arquivo_citado_pelos_documentos_existe():
    """Link quebrado em documento é o mesmo problema, na forma mais barata de
    detectar: o leitor clica, não acha, e desconfia do resto da página."""
    quebrados = []
    for doc in (ACESSO, QR):
        for alvo in re.findall(r"\]\(([^)#]+)\)", _texto(doc)):
            if alvo.startswith(("http://", "https://", "mailto:")):
                continue
            if not (doc.parent / alvo).resolve().exists():
                quebrados.append(f"{doc.name} -> {alvo}")
    assert not quebrados, "link para arquivo que nao existe:\n  " + "\n  ".join(quebrados)


def test_os_dois_documentos_apontam_para_o_endereco_que_funciona():
    """Desde 15/08/2026 o QR Ideal so sai pelo painel do proprio agente: o
    navegador bloqueia a pagina da Vercel de falar com a estacao. Um documento
    que nao diga isso manda o operador para o unico caminho que falha."""
    for doc in (ACESSO, QR):
        assert "localhost:9000" in _texto(doc), (
            f"{doc.name} nao diz por onde abrir o painel para a estacao ser alcancada"
        )
