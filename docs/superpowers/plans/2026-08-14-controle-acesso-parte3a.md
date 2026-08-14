# Controle de acesso, parte 3a — a tela do dono do evento

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa por tarefa. Os
> passos usam caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** dar ao dono do evento uma tela de celular onde ele ajusta os dados do evento,
define lotação e tipo de uso de cada setor, cria os aparelhos da portaria com a lista de
setores de cada um, e carrega os próprios códigos de staff — tudo atrás de uma elevação de
15 minutos obtida com a senha dele.

**Arquitetura:** o navegador fala só com o backend no Render; o backend usa a
`service_role` pela porta única `acesso_api.supabase()`. Toda leitura exige o JWT do
Supabase e ser dono do evento; toda escrita exige, além disso, um token de elevação
assinado com HMAC, preso ao evento, à conta e ao navegador.

**Tecnologias:** FastAPI, PyMuPDF (não usado aqui), Supabase REST/Auth, JavaScript sem
framework, pytest, Pester, puppeteer.

**Spec:** [docs/superpowers/specs/2026-08-14-controle-acesso-parte3a-design.md](../specs/2026-08-14-controle-acesso-parte3a-design.md)

## Restrições globais

Valem para **toda** tarefa deste plano.

- **Nenhum SQL.** As sete tabelas da parte 2 já têm todas as colunas. Nenhuma tarefa cria
  ou altera tabela.
- **A `service_role` sai por um lugar só:** `acesso_api.supabase()`. Nenhum arquivo novo
  monta a própria requisição com a chave. Quem precisar contar linhas usa
  `acesso_api.contar()`, criado na Tarefa 3, no mesmo arquivo.
- **A interface nunca explica como o código do QR é gerado.** Regra do usuário: é "segredo
  de Estado".
- **Todo controle da tela tem rótulo em texto.** Nada depende de ícone para ser entendido.
- **A tela nunca perde o que o usuário digitou** por causa de falha de rede ou elevação
  vencida.
- Alfabeto do código do aparelho: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, **6** caracteres.
- Iterações do PBKDF2: **10 000** (já em `qr_ideal.ITERACOES`). Nunca mudar.
- Validade da elevação: **15 minutos**.
- Assinatura HMAC-SHA256 em base64url, **27** caracteres, como em `qr_pedido.py`.
- Conferir **assinatura antes de validade**, sempre.
- Trabalho direto na branch `main`. Sem worktree, sem branch de feature.
- Rodar os testes com `.\venv\Scripts\python.exe -m pytest tests/ -q` e o Pester com
  `.\ferramentas\conferir.ps1`.
- Publicar é ação do usuário. Nenhuma tarefa deste plano roda `publicar.ps1`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `acesso_elevacao.py` | emitir e conferir o token de 15 min; só criptografia | 1 |
| `ferramentas/copiar_para_render.ps1` | conhece a 4ª variável e o serviço certo do Render | 2 |
| `acesso_api.py` | ganha `contar()`; `/saude` cobra as quatro variáveis | 2, 3 |
| `acesso_config.py` | o router da configuração do evento | 3–7 |
| `app.py` | monta o router novo sob a mesma condição do outro | 3 |
| `frontend/acesso-conta.js` | login, "esqueci a senha" e `pedir()`, compartilhados | 8 |
| `frontend/evento.js` | passa a usar o `acesso-conta.js` | 8 |
| `security_config.py` | os quatro nomes novos em `PAINEL_ARQUIVOS` | 8, 9 |
| `frontend/controle.css` | o visual, celular primeiro | 9 |
| `frontend/controle.html` | a estrutura da tela, sem lógica | 9 |
| `frontend/controle.js` | estado, chamadas, elevação, gravações | 9–11 |
| `frontend/evento.html` | a porta para a tela nova | 12 |
| `docs/STATUS_PROJETO.md` | o estado real do projeto | 12 |

---

## Tarefa 1: O token de elevação

**Arquivos:**
- Criar: `acesso_elevacao.py`
- Testar: `tests/test_acesso_elevacao.py`

**Interfaces:**
- Consome: `db.ler_env_local(nome)`, que já existe.
- Produz:
  - `SEGREDO_ENV = "ACESSO_ELEVACAO_SEGREDO"`
  - `VALIDADE_MINUTOS = 15`
  - `configurado() -> bool`
  - `gerar(evento_id: str, conta_id: str, navegador: str, minutos: int = VALIDADE_MINUTOS) -> tuple[str, int]` — devolve `(token, expira_em_epoch)`
  - `conferir(token: str, evento_id: str, conta_id: str, navegador: str) -> None` — levanta `ValueError` com `"token malformado"`, `"assinatura invalida"` ou `"token vencido"`

- [ ] **Passo 1: escrever os testes que falham**

Criar `tests/test_acesso_elevacao.py`:

```python
# -*- coding: utf-8 -*-
"""A elevação de 15 minutos: só criptografia, sem HTTP e sem banco.

O celular fica na mão do porteiro, e ele entra com a conta do cliente — é assim
que a parte 2 desenhou o acesso. A senha do dono é o que separa OPERAR de
CONFIGURAR, e por isso ela precisa ser reapresentada de tempos em tempos, em vez
de virar uma sessão que nunca vence.

Este módulo não sabe de evento nem de usuário: recebe três identificadores e uma
validade, assina, e depois confere. Quem decide se aquele evento é daquela conta
é o `acesso_config.py`.
"""

import time

import pytest

import acesso_elevacao as ae

EVENTO = "11111111-1111-1111-1111-111111111111"
CONTA = "22222222-2222-2222-2222-222222222222"
NAV = "33333333-3333-3333-3333-333333333333"


@pytest.fixture(autouse=True)
def segredo(monkeypatch):
    monkeypatch.setattr(ae, "_SEGREDO_CACHE", "segredo-de-teste-com-tamanho-suficiente")


def test_o_token_recem_emitido_confere():
    token, expira = ae.gerar(EVENTO, CONTA, NAV)
    ae.conferir(token, EVENTO, CONTA, NAV)          # não levanta
    assert expira > time.time()


def test_assinatura_adulterada_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token[:-1] + ("A" if token[-1] != "A" else "B"), EVENTO, CONTA, NAV)


def test_token_vencido_e_recusado():
    token, _ = ae.gerar(EVENTO, CONTA, NAV, minutos=-1)
    with pytest.raises(ValueError, match="token vencido"):
        ae.conferir(token, EVENTO, CONTA, NAV)


def test_elevacao_de_outro_navegador_e_recusada():
    """A trava que existe porque o aparelho fica na mao do porteiro."""
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, EVENTO, CONTA, "44444444-4444-4444-4444-444444444444")


def test_elevacao_de_outro_evento_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, "55555555-5555-5555-5555-555555555555", CONTA, NAV)


def test_elevacao_de_outra_conta_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, EVENTO, "66666666-6666-6666-6666-666666666666", NAV)


def test_token_com_numero_de_partes_errado_e_malformado():
    for ruim in ("", "a.b.c", "a.b.c.d.e.f", None):
        with pytest.raises(ValueError, match="token malformado"):
            ae.conferir(ruim, EVENTO, CONTA, NAV)


def test_ponto_no_identificador_e_recusado_antes_de_assinar():
    """A armadilha de montar o corpo assinado por concatenacao.

    O `navegador` vem do navegador do cliente. Se ele pudesse conter um ponto,
    daria para deslocar os campos dentro do corpo assinado e fazer uma assinatura
    valer para outra combinacao de evento e conta.
    """
    with pytest.raises(ValueError, match="identificador invalido"):
        ae.gerar(EVENTO, CONTA, "aa.bb")
    with pytest.raises(ValueError, match="identificador invalido"):
        ae.conferir("x.y.z.1.2", EVENTO, CONTA, "aa.bb")


def test_sem_segredo_configurado_nao_assina(monkeypatch):
    """Falha FECHADA. Assinar com segredo vazio pareceria protegido."""
    monkeypatch.setattr(ae, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(ae.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(ae.SEGREDO_ENV, raising=False)
    assert ae.configurado() is False
    with pytest.raises(RuntimeError, match=ae.SEGREDO_ENV):
        ae.gerar(EVENTO, CONTA, NAV)


def test_a_validade_padrao_e_de_quinze_minutos():
    assert ae.VALIDADE_MINUTOS == 15
    _token, expira = ae.gerar(EVENTO, CONTA, NAV)
    assert 14 * 60 < expira - time.time() <= 15 * 60
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_elevacao.py -q`
Esperado: FALHA com `ModuleNotFoundError: No module named 'acesso_elevacao'`

- [ ] **Passo 3: escrever o módulo**

Criar `acesso_elevacao.py`:

```python
# -*- coding: utf-8 -*-
"""A elevação de 15 minutos que separa operar de configurar.

Sem a senha do dono, a tela do evento é somente leitura — decisão do usuário em
13/08/2026. Este módulo é o pedaço criptográfico dessa regra: ele assina e
confere um bilhete curto, e não sabe de HTTP, de banco nem de quem é dono do quê.

## Por que elevação, e não sessão

O celular da portaria fica na mão do porteiro, e ele entra com a conta do
cliente. Uma autorização que não vence transformaria aquele aparelho num painel
de configuração permanente.

## Por que um segredo só para isto

Reaproveitar o `QR_PEDIDO_SEGREDO` funcionaria. Não vale: no dia em que um
segredo precisar ser trocado, trocar aquele invalidaria todo QR do Pedido em
circulação, inclusive os que já estão no WhatsApp dos clientes.
"""

import base64
import hashlib
import hmac
import os
import re
import time

import db

SEGREDO_ENV = "ACESSO_ELEVACAO_SEGREDO"

VALIDADE_MINUTOS = 15

# Mesmo tamanho do `qr_pedido.py`: 27 caracteres base64url são 162 bits, muito
# acima do necessário para impedir forja.
TAMANHO_ASSINATURA = 27

# O corpo assinado é montado por concatenação com pontos, então nenhum campo
# pode conter ponto — senão daria para deslocar os campos e fazer uma assinatura
# valer para outra combinação. UUID e identificador de navegador cabem aqui.
IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_SEGREDO_CACHE = None


def _segredo() -> bytes:
    global _SEGREDO_CACHE
    if _SEGREDO_CACHE is None:
        _SEGREDO_CACHE = os.environ.get(SEGREDO_ENV) or db.ler_env_local(SEGREDO_ENV)
    if not _SEGREDO_CACHE:
        raise RuntimeError(
            f"{SEGREDO_ENV} nao configurada. Sem ela nao ha como provar que a "
            "senha do dono foi conferida, e a tela ficaria somente leitura para "
            "sempre."
        )
    return _SEGREDO_CACHE.encode("utf-8")


def configurado() -> bool:
    """Se dá para emitir elevação neste servidor. Não levanta."""
    try:
        _segredo()
        return True
    except RuntimeError:
        return False


def _conferir_identificadores(*valores):
    for v in valores:
        if not IDENTIFICADOR.match(str(v or "")):
            raise ValueError("identificador invalido")


def _assinar(corpo: str) -> str:
    mac = hmac.new(_segredo(), corpo.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")[:TAMANHO_ASSINATURA]


def gerar(evento_id: str, conta_id: str, navegador: str,
          minutos: int = VALIDADE_MINUTOS) -> tuple:
    """`<evento>.<conta>.<navegador>.<vencimento>.<assinatura>` e o vencimento."""
    _conferir_identificadores(evento_id, conta_id, navegador)
    expira = int(time.time()) + int(minutos) * 60
    corpo = f"{evento_id}.{conta_id}.{navegador}.{expira}"
    return f"{corpo}.{_assinar(corpo)}", expira


def conferir(token: str, evento_id: str, conta_id: str, navegador: str) -> None:
    """Levanta `ValueError` dizendo o que houve. Silêncio é aprovação.

    A assinatura é recalculada sobre os valores que o CHAMADOR afirma, e não
    sobre os que vieram no token. Assim um bilhete emitido para outro evento,
    outra conta ou outro navegador simplesmente não bate — sem precisar de uma
    comparação campo a campo que alguém possa esquecer de escrever.

    A ordem é assinatura antes de validade, como no `qr_pedido.conferir`:
    conferir a validade primeiro contaria a quem estivesse tentando que aquele
    token existiu algum dia, e o vencimento é justamente o campo que o atacante
    controlaria no palpite.
    """
    _conferir_identificadores(evento_id, conta_id, navegador)

    partes = str(token or "").split(".")
    if len(partes) != 5 or not all(partes):
        raise ValueError("token malformado")
    expira = partes[3]
    if not expira.isdigit():
        raise ValueError("token malformado")

    corpo = f"{evento_id}.{conta_id}.{navegador}.{expira}"
    if not hmac.compare_digest(_assinar(corpo), partes[4]):
        raise ValueError("assinatura invalida")

    if int(expira) < time.time():
        raise ValueError("token vencido")
```

- [ ] **Passo 4: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_elevacao.py -q`
Esperado: 10 passando

- [ ] **Passo 5: commitar**

```bash
git add acesso_elevacao.py tests/test_acesso_elevacao.py
git commit -m "feat(acesso): o bilhete de 15 minutos que separa operar de configurar"
```

---

## Tarefa 2: A quarta variável chega ao servidor

**Arquivos:**
- Modificar: `acesso_api.py` (função `saude`)
- Modificar: `ferramentas/copiar_para_render.ps1`
- Testar: `tests/test_acesso_saude.py` (criar), `ferramentas/CopiarParaRender.Tests.ps1` (existente)

**Interfaces:**
- Consome: `acesso_elevacao.SEGREDO_ENV` e `acesso_elevacao.configurado()`, da Tarefa 1.
- Produz: `/api/acesso/saude` passa a listar quatro variáveis.

**Contexto que o executor precisa:** o `/saude` existe porque as variáveis falham em
lugares diferentes e tarde. Sem a `SUPABASE_SERVICE_KEY` o router nem é montado; sem o
`ACESSO_AGENTE_SEGREDO` a faixa de códigos é recusada com o papel já impresso; sem o
`QR_PEDIDO_SEGREDO` o atendente descobre na frente do cliente que não sai QR; sem o
`ACESSO_ELEVACAO_SEGREDO` o dono não consegue configurar nada e a tela fica somente
leitura para sempre.

**Também nesta tarefa:** o `copiar_para_render.ps1` manda ir em `ideal-imposition-api` no
Render. **É o projeto errado** — o serviço certo é `imposicao`, e esse texto é exatamente o
que fez as chaves subirem no lugar errado em 14/08/2026, custando uma rodada inteira de
diagnóstico.

- [ ] **Passo 1: escrever os testes que falham**

Criar `tests/test_acesso_saude.py`:

```python
# -*- coding: utf-8 -*-
"""O /saude é a única chance de descobrir uma variável faltando ANTES do cliente.

Cada uma das quatro falha num lugar diferente e tarde. Conferir as quatro num
endpoint só é o que transforma "não funcionou" em "falta a variável X".

A resposta diz SE cada variável existe, nunca o que ela vale — este endpoint não
pede login.
"""

import pytest
from fastapi import HTTPException

import acesso_api
import acesso_elevacao


VARIAVEIS = [
    "SUPABASE_SERVICE_KEY",
    "ACESSO_AGENTE_SEGREDO",
    "QR_PEDIDO_SEGREDO",
    "ACESSO_ELEVACAO_SEGREDO",
]


@pytest.fixture
def tudo_presente(monkeypatch):
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "segredo")
    monkeypatch.setattr(acesso_api, "supabase", lambda *a, **k: [])
    import qr_pedido
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", "segredo-do-qr-do-pedido")
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-da-elevacao")


def test_o_saude_cobra_as_QUATRO_variaveis(tudo_presente):
    resposta = acesso_api.saude()
    assert sorted(resposta["variaveis"]) == sorted(VARIAVEIS)
    assert resposta["ok"] is True
    assert resposta["faltando"] == []


def test_a_elevacao_faltando_aparece_pelo_nome(tudo_presente, monkeypatch):
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(acesso_elevacao.SEGREDO_ENV, raising=False)

    with pytest.raises(HTTPException) as e:
        acesso_api.saude()
    assert e.value.status_code == 503
    assert e.value.detail["faltando"] == ["ACESSO_ELEVACAO_SEGREDO"]


def test_a_resposta_nunca_traz_o_VALOR_de_nenhuma_variavel(tudo_presente):
    """O endpoint nao pede login: dizer o valor seria entregar o segredo."""
    resposta = acesso_api.saude()
    assert all(v is True for v in resposta["variaveis"].values())


def test_o_nome_do_servico_no_render_esta_certo():
    """`ideal-imposition-api` NAO existe; o servico e `imposicao`.

    Esse texto errado mandou as chaves para o projeto errado em 14/08/2026. Um
    endereco errado numa instrucao operacional custa mais que um bug: manda a
    pessoa fazer a coisa certa no lugar errado, e o sintoma aparece longe dali.
    """
    import os
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(raiz, "ferramentas", "copiar_para_render.ps1"),
              encoding="utf-8") as f:
        texto = f.read()
    assert "ideal-imposition-api" not in texto
    assert "imposicao" in texto
```

Acrescentar ao fim de `ferramentas/CopiarParaRender.Tests.ps1`:

```powershell
Describe 'A quarta variavel' {
    $script:fonte = Get-Content (Join-Path $PSScriptRoot 'copiar_para_render.ps1') -Raw

    It 'conhece a ACESSO_ELEVACAO_SEGREDO' {
        $script:fonte | Should Match 'ACESSO_ELEVACAO_SEGREDO'
    }

    It 'aceita a nova no -Somente' {
        # Sem isto o parametro recusaria justamente a variavel nova, e quem
        # fosse recopiar so ela levaria um erro de validacao sem explicacao.
        $script:fonte | Should Match "ValidateSet\([^)]*ACESSO_ELEVACAO_SEGREDO"
    }

    It 'nao manda ninguem para o projeto errado do Render' {
        $script:fonte | Should Not Match 'ideal-imposition-api'
    }
}
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_saude.py -q`
Esperado: FALHA — `sorted(resposta["variaveis"])` traz três nomes, não quatro.

- [ ] **Passo 3: acrescentar a variável ao `/saude`**

Em `acesso_api.py`, dentro da função `saude()`, trocar o bloco `presenca` por:

```python
    import qr_pedido
    import acesso_elevacao

    presenca = {
        CHAVE_ENV: bool(SERVICE_KEY),
        SEGREDO_ENV: bool(AGENTE_SEGREDO),
        qr_pedido.SEGREDO_ENV: qr_pedido.configurado(),
        acesso_elevacao.SEGREDO_ENV: acesso_elevacao.configurado(),
    }
```

E acrescentar ao final da docstring da função:

```
    A quarta, `ACESSO_ELEVACAO_SEGREDO`, falha do jeito mais silencioso de
    todos: o dono entra na tela do evento, digita a senha certa, e nada
    acontece — porque o servidor não tem como assinar a elevação.
```

- [ ] **Passo 4: ensinar a quarta variável ao script de cópia**

Em `ferramentas/copiar_para_render.ps1`:

1. No `ValidateSet` do parâmetro `-Somente`, acrescentar `'ACESSO_ELEVACAO_SEGREDO'`.
2. No array `$VARIAVEIS`, acrescentar como quarto item:

```powershell
    @{ Nome = 'ACESSO_ELEVACAO_SEGREDO'
       Sem  = 'o dono nao configura o evento -- a tela fica somente leitura'
       Tipo = 'segredo' }
```

3. Trocar o comentário do topo do array de `# As tres, na ordem...` para
   `# As quatro, na ordem em que o servidor precisa delas.`
4. Trocar a linha do Render por:

```powershell
Write-Host '  No Render: Dashboard -> imposicao -> Environment.' -ForegroundColor Yellow
```

5. Trocar a mensagem do `-Conferir` de `'  As tres passaram...'` para
   `'  As quatro passaram. Rode sem -Conferir para copiar uma a uma.'`
6. Trocar a sinopse do cabeçalho de `Confere as tres variaveis` para
   `Confere as quatro variaveis`.

- [ ] **Passo 5: sortear a variável no `.env.local`**

Rodar, sem imprimir o valor:

```powershell
$env_local = '.env.local'
if (-not (Select-String -Path $env_local -Pattern '^ACESSO_ELEVACAO_SEGREDO=' -Quiet)) {
    $b = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    $valor = -join ($b | ForEach-Object { $_.ToString('x2') })
    Add-Content -Path $env_local -Value "ACESSO_ELEVACAO_SEGREDO=$valor" -Encoding utf8
    'ACESSO_ELEVACAO_SEGREDO sorteada e gravada no .env.local'
} else {
    'ACESSO_ELEVACAO_SEGREDO ja existe no .env.local'
}
```

- [ ] **Passo 6: rodar para confirmar que passa**

Rodar:
```
.\venv\Scripts\python.exe -m pytest tests/test_acesso_saude.py -q
.\ferramentas\copiar_para_render.ps1 -Conferir
```
Esperado: 4 testes passando, e o script relatando `[ok]` nas quatro.

- [ ] **Passo 7: commitar**

```bash
git add acesso_api.py ferramentas/copiar_para_render.ps1 ferramentas/CopiarParaRender.Tests.ps1 tests/test_acesso_saude.py
git commit -m "feat(acesso): o /saude cobra a quarta variavel, e o Render certo"
```

---

## Tarefa 3: A leitura da tela do evento

**Arquivos:**
- Criar: `acesso_config.py`
- Modificar: `acesso_api.py` (acrescentar `contar()`)
- Modificar: `app.py:58-63`
- Testar: `tests/test_acesso_config.py`

**Interfaces:**
- Consome: `acesso_api.supabase(method, path, body=None, prefer=None)`,
  `acesso_api._usuario_logado(authorization) -> dict`, `acesso_api.disponivel() -> bool`.
- Produz:
  - `acesso_api.contar(path: str) -> int`
  - `acesso_config.router` (prefixo `/api/acesso`)
  - `acesso_config._evento_do_dono(evento_id: str, usuario: dict) -> dict`
  - `acesso_config._painel(evento_id: str) -> dict` — o corpo do `GET /eventos/{id}`

**Por que `contar()` mora no `acesso_api.py`:** ele precisa da `service_role`, e a regra do
projeto é que a chave saia de um arquivo só. Uma requisição montada dentro do
`acesso_config.py` daria uma segunda resposta à pergunta "quem tem a chave-mestra na mão?".

- [ ] **Passo 1: escrever os testes que falham**

Criar `tests/test_acesso_config.py`:

```python
# -*- coding: utf-8 -*-
"""A tela do dono: quem lê, quem escreve, e a guarda que não pode ser esquecida.

O evento é do dono. Toda leitura confere isso, e a conferência mora num auxiliar
só — `_evento_do_dono` — porque espalhá-la por oito funções é como ela some de
uma delas.

A resposta para "não existe" e para "não é seu" é a MESMA. Dizer a diferença
contaria a um estranho quais eventos existem.
"""

import pytest
from fastapi import HTTPException

import acesso_config as cfg

EVENTO = "11111111-1111-1111-1111-111111111111"
DONO = {"id": "22222222-2222-2222-2222-222222222222", "email": "dono@cliente.com"}
ESTRANHO = {"id": "99999999-9999-9999-9999-999999999999", "email": "outro@x.com"}
SETOR = "33333333-3333-3333-3333-333333333333"
APARELHO = "44444444-4444-4444-4444-444444444444"


class FakeBanco:
    """Um Supabase de mentira, no mesmo espírito do tests/test_acesso_api.py."""

    def __init__(self):
        self.eventos = [{
            "id": EVENTO, "dono_auth_id": DONO["id"], "nome_evento": "Baile",
            "data_evento": None, "local_evento": None, "status": "ativo",
            "sal": "ab" * 32,
        }]
        self.setores = [{
            "id": SETOR, "evento_id": EVENTO, "nome": "PISTA", "quantidade": 5000,
            "lotacao": None, "tipo_uso": "unico", "pedido_id_int": 18560,
            "modelo_id": 1000110, "status": "ativo",
        }]
        self.dispositivos = []
        self.dispositivo_setores = []
        self.credenciais = []
        self.pedidos = [{"pedido_id_int": 18560, "evento_id": EVENTO,
                         "publicado_em": "2026-08-14T00:00:00Z", "total_credenciais": 5000}]

    def _tabela(self, path):
        nome = path.split("?")[0]
        return {
            "producao_acesso_eventos": self.eventos,
            "producao_acesso_setores": self.setores,
            "producao_acesso_dispositivos": self.dispositivos,
            "producao_acesso_dispositivo_setores": self.dispositivo_setores,
            "producao_acesso_credenciais": self.credenciais,
            "producao_acesso_pedidos": self.pedidos,
        }[nome]

    def __call__(self, method, path, body=None, prefer=None):
        alvo = self._tabela(path)
        if method == "GET":
            return list(alvo)
        if method == "POST":
            linhas = body if isinstance(body, list) else [body]
            criadas = []
            for l in linhas:
                linha = dict(l)
                linha.setdefault("id", f"novo-{len(alvo)}")
                alvo.append(linha)
                criadas.append(linha)
            return criadas
        if method == "PATCH":
            for linha in alvo:
                linha.update(body)
            return alvo
        if method == "DELETE":
            alvo.clear()
            return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(cfg, "supabase", b)
    monkeypatch.setattr(cfg, "contar", lambda path: len(b.credenciais))
    return b


# ── A guarda ────────────────────────────────────────────────────────────────

def test_o_dono_alcanca_o_proprio_evento(banco):
    assert cfg._evento_do_dono(EVENTO, DONO)["id"] == EVENTO


def test_conta_estranha_e_recusada(banco):
    with pytest.raises(HTTPException) as e:
        cfg._evento_do_dono(EVENTO, ESTRANHO)
    assert e.value.status_code == 403


def test_evento_inexistente_da_a_MESMA_resposta_de_evento_alheio(banco):
    """Respostas diferentes contariam quais eventos existem."""
    banco.eventos.clear()
    with pytest.raises(HTTPException) as inexistente:
        cfg._evento_do_dono(EVENTO, DONO)
    assert inexistente.value.status_code == 403


# ── O painel ────────────────────────────────────────────────────────────────

def test_o_painel_traz_setores_aparelhos_e_pedidos(banco):
    painel = cfg._painel(EVENTO)
    assert painel["evento"]["nome_evento"] == "Baile"
    assert painel["setores"][0]["nome"] == "PISTA"
    assert painel["setores"][0]["quantidade"] == 5000
    assert painel["aparelhos"] == []
    assert painel["pedidos"][0]["pedido_id_int"] == 18560


def test_o_painel_compara_o_encomendado_com_o_publicado(banco):
    """A conferencia que a parte 2 prometeu.

    Quem tivesse o segredo do agente conseguiria ocupar uma posicao da tiragem
    com um hash proprio. A divergencia entre o que o ERP encomendou e o que esta
    publicado e onde isso apareceria.
    """
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR} for i in range(4999)]
    painel = cfg._painel(EVENTO)
    assert painel["setores"][0]["publicadas"] == 4999
    assert painel["setores"][0]["quantidade"] == 5000


def test_o_painel_nunca_devolve_o_sal_do_evento(banco):
    """O sal nao e segredo, mas nao tem uso nenhum nesta tela.

    Ele serve ao celular da portaria, na parte 3b, e la ele vai por outro
    caminho. Mandar o que nao se usa e como um vazamento nasce.
    """
    import json
    assert "sal" not in json.dumps(cfg._painel(EVENTO))


def test_o_painel_conta_os_codigos_do_cliente(banco):
    banco.credenciais = [
        {"id": "c1", "setor_id": SETOR, "origem": "cliente"},
        {"id": "c2", "setor_id": SETOR, "origem": "qr_ideal"},
    ]
    assert cfg._painel(EVENTO)["codigos_cliente"] == 1


# ── A montagem do router ────────────────────────────────────────────────────

def test_o_router_da_configuracao_acompanha_o_da_publicacao():
    """Onde nao ha chave, nenhum dos dois existe."""
    import acesso_api
    import app

    tem_rota = any(getattr(r, "path", "") == "/api/acesso/eventos/{evento_id}"
                   for r in app.app.routes)
    assert tem_rota == acesso_api.disponivel()
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: FALHA com `ModuleNotFoundError: No module named 'acesso_config'`

- [ ] **Passo 3: acrescentar `contar()` ao `acesso_api.py`**

Logo depois da função `supabase()`:

```python
def contar(path: str) -> int:
    """Quantas linhas casam com o filtro, sem trazer as linhas.

    Existe porque a tela do dono precisa comparar o que o ERP encomendou com o
    que está publicado, e um evento de 12.000 ingressos traria 12.000 objetos
    para chegar a um número. O PostgREST devolve a contagem no cabeçalho
    `Content-Range` quando se pede `Prefer: count=exact`.

    Mora aqui, e não no `acesso_config.py`, porque precisa da `service_role`: a
    pergunta "quem tem a chave-mestra na mão?" continua tendo um arquivo só por
    resposta.
    """
    if not SERVICE_KEY:
        raise RuntimeError(f"{CHAVE_ENV} nao configurada.")

    juncao = "&" if "?" in path else "?"
    url = f"{db.SUPABASE_URL}/rest/v1/{path}{juncao}select=id&limit=1"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Prefer": "count=exact",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        faixa = resp.headers.get("Content-Range") or ""
    # "0-0/1234", ou "*/0" quando não há linha nenhuma.
    total = faixa.split("/")[-1]
    return int(total) if total.isdigit() else 0
```

- [ ] **Passo 4: escrever o módulo da configuração**

Criar `acesso_config.py`:

```python
# -*- coding: utf-8 -*-
"""A tela do dono do evento: ler e configurar.

Separado do `acesso_api.py` porque aquele arquivo já fazia três coisas — a
publicação da faixa, o QR do Pedido e a reivindicação — e configuração é a
quarta. O que NÃO se separou foi a chave: este módulo importa a `supabase()` de
lá em vez de abrir a própria conexão, para que a pergunta "quem tem a
chave-mestra do banco na mão?" continue tendo um arquivo só por resposta.

## As duas chaves de entrada

Toda LEITURA exige o JWT do Supabase e ser dono do evento. Toda ESCRITA exige,
além disso, um token de elevação — prova de que a senha do dono foi digitada nos
últimos 15 minutos, naquele navegador.

É a decisão do usuário em 13/08/2026: sem a senha é somente leitura. Ler
ingresso e registrar entrada, que é o trabalho do porteiro, nunca pedem senha —
mas isso é a parte 3b, e não passa por aqui.
"""

from fastapi import APIRouter, Header, HTTPException

import acesso_elevacao
from acesso_api import _usuario_logado, contar, supabase

router = APIRouter(prefix="/api/acesso", tags=["acesso"])


def _evento_do_dono(evento_id: str, usuario: dict) -> dict:
    """O evento, se ele for desta conta. 403 em qualquer outro caso.

    A MESMA resposta para "não existe" e para "não é seu": responder diferente
    contaria a um estranho quais eventos existem.
    """
    linha = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,dono_auth_id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    if not linha or str(linha.get("dono_auth_id")) != str(usuario.get("id")):
        raise HTTPException(status_code=403, detail="evento nao encontrado nesta conta")
    return linha


def _painel(evento_id: str) -> dict:
    """Tudo que a tela mostra, numa resposta só."""
    evento = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,lotacao,tipo_uso,pedido_id_int,modelo_id"
        "&order=nome.asc",
    ) or []
    for s in setores:
        # O número que a tela compara com `quantidade`. Divergência aqui é ou
        # impressão que ainda não terminou de publicar, ou credencial que
        # alguém publicou sem dever.
        s["publicadas"] = contar(
            f"producao_acesso_credenciais?setor_id=eq.{s['id']}&status=eq.ativo"
        )

    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}"
        "&select=id,nome,status,ultimo_visto&order=nome.asc",
    ) or []
    vinculos = supabase(
        "GET",
        "producao_acesso_dispositivo_setores?select=dispositivo_id,setor_id",
    ) or []
    for a in aparelhos:
        a["setores"] = [v["setor_id"] for v in vinculos
                        if str(v["dispositivo_id"]) == str(a["id"])]

    pedidos = supabase(
        "GET",
        f"producao_acesso_pedidos?evento_id=eq.{evento_id}"
        "&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc",
    ) or []

    return {
        "evento": evento,
        "setores": setores,
        "aparelhos": aparelhos,
        "pedidos": pedidos,
        "codigos_cliente": contar(
            f"producao_acesso_credenciais?evento_id=eq.{evento_id}&origem=eq.cliente"
        ),
    }


@router.get("/eventos/{evento_id}")
def ver_evento(evento_id: str, authorization: str = Header(None)):
    _evento_do_dono(evento_id, _usuario_logado(authorization))
    return _painel(evento_id)
```

**Nota para o executor:** o teste `test_o_painel_conta_os_codigos_do_cliente` e o
`test_o_painel_compara_o_encomendado_com_o_publicado` usam a mesma função falsa `contar`.
Para os dois passarem, a fixture `banco` precisa filtrar. Trocar a linha da fixture por:

```python
    def _contar(path):
        if "origem=eq.cliente" in path:
            return len([c for c in b.credenciais if c.get("origem") == "cliente"])
        return len(b.credenciais)
    monkeypatch.setattr(cfg, "contar", _contar)
```

- [ ] **Passo 5: montar o router no `app.py`**

Trocar o bloco de `app.py:58-63` por:

```python
import acesso_api
import acesso_config
if acesso_api.disponivel():
    app.include_router(acesso_api.router)
    app.include_router(acesso_config.router)
    print("[app] Controle de acesso ativo.", flush=True)
else:
    print(f"[app] Controle de acesso inativo ({acesso_api.CHAVE_ENV} ausente).", flush=True)
```

- [ ] **Passo 6: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: 8 passando

- [ ] **Passo 7: commitar**

```bash
git add acesso_config.py acesso_api.py app.py tests/test_acesso_config.py
git commit -m "feat(acesso): a leitura da tela do dono, com a guarda num lugar so"
```

---

## Tarefa 4: A elevação pela senha do dono

**Arquivos:**
- Modificar: `acesso_config.py`
- Testar: `tests/test_acesso_config.py`

**Interfaces:**
- Consome: `acesso_elevacao.gerar/conferir` (Tarefa 1), `_evento_do_dono` (Tarefa 3).
- Produz:
  - `acesso_config._conferir_senha(email: str, senha: str) -> bool`
  - `acesso_config._exigir_elevacao(evento_id, usuario, elevacao, navegador) -> None`
  - `POST /api/acesso/eventos/{evento_id}/elevar`

**Como a senha é conferida:** perguntando ao próprio Supabase, com a chave anônima, em
`POST {SUPABASE_URL}/auth/v1/token?grant_type=password`. É o mesmo caminho que o login da
tela usa, e o único que sabe se a senha está certa. Uma sessão nova nasce dessa chamada e é
descartada — não há efeito colateral.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_acesso_config.py`:

```python
# ── A elevação ──────────────────────────────────────────────────────────────

NAV = "55555555-5555-5555-5555-555555555555"


@pytest.fixture
def segredo_da_elevacao(monkeypatch):
    import acesso_elevacao
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-de-teste-longo-o-bastante")


@pytest.fixture
def senha_certa(monkeypatch):
    monkeypatch.setattr(cfg, "_conferir_senha", lambda email, senha: senha == "boa")


def test_a_senha_certa_eleva_por_quinze_minutos(banco, segredo_da_elevacao, senha_certa):
    import time
    r = cfg._elevar(EVENTO, DONO, "boa", NAV)
    assert r["token"]
    assert 14 * 60 < r["expira_em"] - time.time() <= 15 * 60


def test_a_senha_errada_nao_eleva(banco, segredo_da_elevacao, senha_certa):
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, DONO, "ruim", NAV)
    assert e.value.status_code == 401


def test_nao_eleva_para_evento_alheio_nem_com_a_senha_certa(banco, segredo_da_elevacao, senha_certa):
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, ESTRANHO, "boa", NAV)
    assert e.value.status_code == 403


def test_a_elevacao_recem_emitida_e_aceita(banco, segredo_da_elevacao, senha_certa):
    token = cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]
    cfg._exigir_elevacao(EVENTO, DONO, token, NAV)   # não levanta


def test_escrita_sem_elevacao_e_recusada_com_codigo_proprio(banco, segredo_da_elevacao):
    """A tela precisa distinguir 'sessao caiu' de 'elevacao venceu'.

    Sao consertos diferentes: um manda entrar de novo, o outro so pede a senha
    do dono. Confundi-los faz a tela deslogar quem nao precisava.
    """
    with pytest.raises(HTTPException) as e:
        cfg._exigir_elevacao(EVENTO, DONO, None, NAV)
    assert e.value.status_code == 401
    assert e.value.detail["codigo"] == "elevacao_expirada"


def test_elevacao_de_outro_navegador_e_recusada(banco, segredo_da_elevacao, senha_certa):
    token = cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]
    with pytest.raises(HTTPException) as e:
        cfg._exigir_elevacao(EVENTO, DONO, token, "66666666-6666-6666-6666-666666666666")
    assert e.value.detail["codigo"] == "elevacao_expirada"


def test_servidor_sem_segredo_de_elevacao_recusa_elevar(banco, senha_certa, monkeypatch):
    """Falha FECHADA, e com o nome da variavel na mensagem."""
    import acesso_elevacao
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(acesso_elevacao.SEGREDO_ENV, raising=False)
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, DONO, "boa", NAV)
    assert e.value.status_code == 503
    assert "ACESSO_ELEVACAO_SEGREDO" in str(e.value.detail)
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: FALHA com `AttributeError: module 'acesso_config' has no attribute '_elevar'`

- [ ] **Passo 3: escrever a elevação**

Acrescentar **aos imports do topo** de `acesso_config.py`:

```python
import json
import urllib.error
import urllib.request

import db
```

E, ao corpo do arquivo:

```python
def _conferir_senha(email: str, senha: str) -> bool:
    """A senha do dono está certa? Quem sabe é o Supabase.

    Usa a chave anônima de propósito: a API de autenticação a exige, e aqui não
    se toca em tabela nenhuma. Uma sessão nova nasce desta chamada e é
    descartada — não há efeito colateral.
    """
    corpo = json.dumps({"email": email, "password": senha}).encode("utf-8")
    req = urllib.request.Request(
        f"{db.SUPABASE_URL}/auth/v1/token?grant_type=password",
        data=corpo,
        headers={"apikey": db.SUPABASE_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return bool(json.loads(resp.read().decode("utf-8")).get("access_token"))
    except urllib.error.HTTPError:
        return False
    except Exception as e:
        # Rede fora não é senha errada, e confundir os dois manda o dono
        # procurar um papel com a senha quando o problema é outro.
        raise HTTPException(
            status_code=503, detail=f"nao consegui conferir a senha agora: {e}"
        )


def _elevar(evento_id: str, usuario: dict, senha: str, navegador: str) -> dict:
    _evento_do_dono(evento_id, usuario)

    if not acesso_elevacao.configurado():
        raise HTTPException(
            status_code=503,
            detail=f"{acesso_elevacao.SEGREDO_ENV} nao configurada neste servidor",
        )
    if not _conferir_senha(usuario.get("email") or "", senha or ""):
        # Uma frase só: não dizer se o problema foi o e-mail ou a senha.
        raise HTTPException(status_code=401, detail="senha nao confere")

    token, expira = acesso_elevacao.gerar(evento_id, usuario["id"], navegador)
    return {"token": token, "expira_em": expira,
            "minutos": acesso_elevacao.VALIDADE_MINUTOS}


def _exigir_elevacao(evento_id: str, usuario: dict, elevacao, navegador) -> None:
    """A porta de toda escrita. Silêncio é aprovação.

    O 401 vem com um código próprio porque a tela precisa distinguir "a sessão
    caiu" de "a elevação venceu": são consertos diferentes, e confundi-los faz a
    tela deslogar quem só precisava digitar a senha de novo.
    """
    try:
        acesso_elevacao.conferir(elevacao, evento_id, usuario.get("id"), navegador)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail={"codigo": "elevacao_expirada",
                    "mensagem": "digite a senha do dono para alterar o evento"},
        )


@router.post("/eventos/{evento_id}/elevar")
def elevar(evento_id: str, corpo: dict, authorization: str = Header(None)):
    return _elevar(
        evento_id,
        _usuario_logado(authorization),
        corpo.get("senha") or "",
        corpo.get("navegador") or "",
    )
```

- [ ] **Passo 4: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: 15 passando

- [ ] **Passo 5: commitar**

```bash
git add acesso_config.py tests/test_acesso_config.py
git commit -m "feat(acesso): a senha do dono eleva por 15 minutos, presa ao navegador"
```

---

## Tarefa 5: Gravar os dados do evento e dos setores

**Arquivos:**
- Modificar: `acesso_config.py`
- Testar: `tests/test_acesso_config.py`

**Interfaces:**
- Consome: `_evento_do_dono`, `_exigir_elevacao`.
- Produz:
  - `PATCH /api/acesso/eventos/{evento_id}`
  - `PATCH /api/acesso/setores/{setor_id}`
  - `acesso_config._texto(valor, campo, minimo, maximo) -> str`

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_acesso_config.py`:

```python
# ── Gravar evento e setor ───────────────────────────────────────────────────

@pytest.fixture
def elevado(banco, segredo_da_elevacao, senha_certa):
    return cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]


def test_gravar_o_nome_do_evento(banco, elevado):
    cfg._gravar_evento(EVENTO, DONO, elevado, NAV,
                       {"nome_evento": "Baile do Hawaii", "local_evento": "Clube"})
    assert banco.eventos[0]["nome_evento"] == "Baile do Hawaii"
    assert banco.eventos[0]["local_evento"] == "Clube"


def test_nome_de_evento_vazio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_evento(EVENTO, DONO, elevado, NAV, {"nome_evento": "   "})
    assert e.value.status_code == 422


def test_gravar_lotacao_e_tipo_de_uso_do_setor(banco, elevado):
    cfg._gravar_setor(SETOR, DONO, elevado, NAV,
                      {"lotacao": 4800, "tipo_uso": "reentrada"})
    assert banco.setores[0]["lotacao"] == 4800
    assert banco.setores[0]["tipo_uso"] == "reentrada"


def test_lotacao_pode_ser_apagada(banco, elevado):
    """Nulo quer dizer sem limite, e o dono precisa poder voltar atras."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": 4800})
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": None})
    assert banco.setores[0]["lotacao"] is None


def test_lotacao_negativa_e_recusada(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": -1})
    assert e.value.status_code == 422


def test_tipo_de_uso_inventado_e_recusado(banco, elevado):
    """So `unico` e `reentrada` existem. Um terceiro valor passaria pelo banco,
    que aceita texto livre, e a portaria decidiria errado na hora da fila."""
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"tipo_uso": "as_vezes"})
    assert e.value.status_code == 422


def test_a_quantidade_do_setor_nao_e_editavel(banco, elevado):
    """Quem manda na tiragem e o ERP. Aceitar o campo aqui deixaria a tela
    'corrigir' um numero que nao e dela, e a divergencia com o publicado — que e
    justamente o alarme — passaria a ser silenciada pelo proprio alarme."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"quantidade": 1})
    assert banco.setores[0]["quantidade"] == 5000


def test_setor_de_evento_alheio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, ESTRANHO, elevado, NAV, {"lotacao": 10})
    assert e.value.status_code == 403


def test_gravar_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, None, NAV, {"lotacao": 10})
    assert e.value.status_code == 401
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: FALHA com `AttributeError: module 'acesso_config' has no attribute '_gravar_evento'`

- [ ] **Passo 3: escrever as gravações**

Acrescentar a `acesso_config.py`:

```python
TIPOS_DE_USO = ("unico", "reentrada")

LOTACAO_MAXIMA = 10_000_000


def _texto(valor, campo: str, minimo: int, maximo: int) -> str:
    limpo = str(valor or "").strip()
    if not (minimo <= len(limpo) <= maximo):
        raise HTTPException(
            status_code=422,
            detail=f"{campo}: escreva de {minimo} a {maximo} caracteres",
        )
    return limpo


def _lotacao(valor):
    if valor is None or valor == "":
        return None          # sem limite
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="lotacao: escreva um numero inteiro")
    if not (0 <= n <= LOTACAO_MAXIMA):
        raise HTTPException(
            status_code=422,
            detail=f"lotacao: escreva de 0 a {LOTACAO_MAXIMA}, ou deixe vazio para sem limite",
        )
    return n


def _setor_do_dono(setor_id: str, usuario: dict) -> dict:
    linha = (supabase(
        "GET", f"producao_acesso_setores?id=eq.{setor_id}&select=id,evento_id",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=403, detail="setor nao encontrado nesta conta")
    _evento_do_dono(linha["evento_id"], usuario)
    return linha


def _gravar_evento(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    mudanca = {}
    if "nome_evento" in corpo:
        mudanca["nome_evento"] = _texto(corpo["nome_evento"], "nome do evento", 1, 120)
    if "local_evento" in corpo:
        mudanca["local_evento"] = _texto(corpo["local_evento"], "local", 0, 200) or None
    if "data_evento" in corpo:
        mudanca["data_evento"] = corpo["data_evento"] or None

    if mudanca:
        supabase("PATCH", f"producao_acesso_eventos?id=eq.{evento_id}", mudanca,
                 prefer="return=minimal")
    return {"ok": True, "gravado": sorted(mudanca)}


def _gravar_setor(setor_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    setor = _setor_do_dono(setor_id, usuario)
    _exigir_elevacao(setor["evento_id"], usuario, elevacao, navegador)

    # `quantidade` NÃO entra: quem manda na tiragem é o ERP. Aceitá-la aqui
    # deixaria a tela silenciar a divergência que ela existe para mostrar.
    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do setor", 1, 60)
    if "lotacao" in corpo:
        mudanca["lotacao"] = _lotacao(corpo["lotacao"])
    if "tipo_uso" in corpo:
        tipo = str(corpo["tipo_uso"] or "").strip()
        if tipo not in TIPOS_DE_USO:
            raise HTTPException(
                status_code=422,
                detail="tipo de uso: escolha entre uma entrada so ou permite reentrada",
            )
        mudanca["tipo_uso"] = tipo

    if mudanca:
        supabase("PATCH", f"producao_acesso_setores?id=eq.{setor_id}", mudanca,
                 prefer="return=minimal")
    return {"ok": True, "gravado": sorted(mudanca)}


@router.patch("/eventos/{evento_id}")
def gravar_evento(evento_id: str, corpo: dict, authorization: str = Header(None),
                  x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_evento(evento_id, _usuario_logado(authorization),
                          x_elevacao, x_navegador, corpo)


@router.patch("/setores/{setor_id}")
def gravar_setor(setor_id: str, corpo: dict, authorization: str = Header(None),
                 x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_setor(setor_id, _usuario_logado(authorization),
                         x_elevacao, x_navegador, corpo)
```

- [ ] **Passo 4: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: 24 passando

- [ ] **Passo 5: commitar**

```bash
git add acesso_config.py tests/test_acesso_config.py
git commit -m "feat(acesso): gravar dados do evento e lotacao/uso dos setores"
```

---

## Tarefa 6: Os aparelhos da portaria

**Arquivos:**
- Modificar: `acesso_config.py`
- Testar: `tests/test_acesso_config.py`

**Interfaces:**
- Consome: `qr_ideal.hash_codigo(conteudo, sal)`; de tarefas anteriores,
  `_evento_do_dono(evento_id, usuario) -> dict`,
  `_exigir_elevacao(evento_id, usuario, elevacao, navegador) -> None` e
  `_texto(valor, campo, minimo, maximo) -> str`.
- Produz:
  - `acesso_config.ALFABETO_CODIGO`, `acesso_config.TAMANHO_CODIGO`
  - `acesso_config._sortear_codigo() -> str`
  - `POST /api/acesso/eventos/{evento_id}/aparelhos`
  - `PATCH /api/acesso/aparelhos/{aparelho_id}`
  - `POST /api/acesso/aparelhos/{aparelho_id}/codigo`

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_acesso_config.py`:

```python
# ── Os aparelhos ────────────────────────────────────────────────────────────

def test_o_codigo_do_aparelho_nao_tem_caractere_ambiguo():
    """O porteiro le do papel. `0` e `O`, `1` e `I` e `L` sao erro garantido."""
    for _ in range(200):
        codigo = cfg._sortear_codigo()
        assert len(codigo) == 6
        assert not set(codigo) & set("01OIL")


def test_criar_aparelho_devolve_o_codigo_UMA_vez(banco, elevado):
    r = cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A",
                                                         "setores": [SETOR]})
    assert len(r["codigo"]) == 6
    assert banco.dispositivos[0]["nome"] == "Portao A"
    # O que fica guardado e o hash, nunca o codigo.
    assert r["codigo"] not in str(banco.dispositivos[0])
    assert len(banco.dispositivos[0]["codigo_hash"]) == 64


def test_o_codigo_nao_volta_em_leitura_nenhuma(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    import json
    painel = json.dumps(cfg._painel(EVENTO))
    assert "codigo_hash" not in painel
    assert "codigo" not in painel


def test_o_aparelho_nasce_com_a_lista_de_setores(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    assert cfg._painel(EVENTO)["aparelhos"][0]["setores"] == [SETOR]


def test_aparelho_com_setor_de_outro_evento_e_recusado(banco, elevado):
    """Seria a mesma tiragem valendo em duas portas."""
    with pytest.raises(HTTPException) as e:
        cfg._criar_aparelho(EVENTO, DONO, elevado, NAV,
                            {"nome": "Portao A", "setores": ["setor-de-outro-evento"]})
    assert e.value.status_code == 422


def test_trocar_a_lista_de_setores_substitui_a_anterior(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    aparelho = banco.dispositivos[0]["id"]
    cfg._gravar_aparelho(aparelho, DONO, elevado, NAV, {"setores": []})
    assert cfg._painel(EVENTO)["aparelhos"][0]["setores"] == []


def test_revogar_o_aparelho(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    aparelho = banco.dispositivos[0]["id"]
    cfg._gravar_aparelho(aparelho, DONO, elevado, NAV, {"status": "revogado"})
    assert banco.dispositivos[0]["status"] == "revogado"


def test_gerar_outro_codigo_NAO_desconecta_quem_ja_entrou(banco, elevado):
    """A frase que a tela promete tem de ser verdade no codigo.

    Quem mantem o aparelho conectado e o `token_hash`. Se gerar codigo novo o
    apagasse, o dono derrubaria a portaria no meio do evento tentando so lembrar
    um codigo — e a tela estaria mentindo.
    """
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    banco.dispositivos[0]["token_hash"] = "token-de-um-aparelho-conectado"
    aparelho = banco.dispositivos[0]["id"]

    novo = cfg._novo_codigo(aparelho, DONO, elevado, NAV)
    assert len(novo["codigo"]) == 6
    assert banco.dispositivos[0]["token_hash"] == "token-de-um-aparelho-conectado"


def test_criar_aparelho_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._criar_aparelho(EVENTO, DONO, None, NAV, {"nome": "X", "setores": []})
    assert e.value.status_code == 401
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: FALHA com `AttributeError: module 'acesso_config' has no attribute '_sortear_codigo'`

- [ ] **Passo 3: escrever os aparelhos**

Acrescentar **aos imports do topo** de `acesso_config.py`:

```python
import secrets

import qr_ideal
```

E, ao corpo do arquivo:

```python
# Sem `0`, `O`, `1`, `I` e `L`: o porteiro lê este código de um papel, e esses
# cinco caracteres são erro garantido. São 31 símbolos, e 31^6 ≈ 8,9 x 10^8.
ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
TAMANHO_CODIGO = 6


def _sortear_codigo() -> str:
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(TAMANHO_CODIGO))


def _sal_do_evento(evento_id: str) -> str:
    linha = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=sal",
    ) or [None])[0]
    if not linha or not linha.get("sal"):
        raise HTTPException(status_code=409, detail="evento sem sal; recadastre o pedido")
    return linha["sal"]


def _hash_do_codigo(codigo: str, sal: str) -> str:
    """O mesmo PBKDF2 de 10.000 voltas do QR Ideal, com o sal do evento.

    Um código de seis caracteres é curto. O custo do KDF é o que torna caro
    tentar em massa contra o endpoint de entrada do aparelho, na parte 3b.
    """
    return qr_ideal.hash_codigo(codigo.strip().upper(), sal)


def _setores_do_evento(evento_id: str) -> set:
    return {str(s["id"]) for s in (supabase(
        "GET", f"producao_acesso_setores?evento_id=eq.{evento_id}&select=id") or [])}


def _conferir_setores(evento_id: str, setores) -> list:
    pedidos = [str(s) for s in (setores or [])]
    validos = _setores_do_evento(evento_id)
    intrusos = [s for s in pedidos if s not in validos]
    if intrusos:
        raise HTTPException(
            status_code=422,
            detail="ha setor que nao e deste evento na lista do aparelho",
        )
    return pedidos


def _trocar_setores(aparelho_id: str, setores: list) -> None:
    supabase("DELETE",
             f"producao_acesso_dispositivo_setores?dispositivo_id=eq.{aparelho_id}",
             prefer="return=minimal")
    if setores:
        supabase("POST", "producao_acesso_dispositivo_setores",
                 [{"dispositivo_id": aparelho_id, "setor_id": s} for s in setores],
                 prefer="return=minimal")


def _aparelho_do_dono(aparelho_id: str, usuario: dict) -> dict:
    linha = (supabase(
        "GET", f"producao_acesso_dispositivos?id=eq.{aparelho_id}&select=id,evento_id",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=403, detail="aparelho nao encontrado nesta conta")
    _evento_do_dono(linha["evento_id"], usuario)
    return linha


def _criar_aparelho(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    nome = _texto(corpo.get("nome"), "nome do aparelho", 1, 60)
    setores = _conferir_setores(evento_id, corpo.get("setores"))
    codigo = _sortear_codigo()

    criado = supabase("POST", "producao_acesso_dispositivos", {
        "evento_id": evento_id,
        "nome": nome,
        "codigo_hash": _hash_do_codigo(codigo, _sal_do_evento(evento_id)),
    })[0]
    _trocar_setores(criado["id"], setores)

    # O código volta AQUI e nunca mais: o que fica guardado é o hash.
    return {"id": criado["id"], "nome": nome, "codigo": codigo}


def _gravar_aparelho(aparelho_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)

    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do aparelho", 1, 60)
    if "status" in corpo:
        if corpo["status"] not in ("ativo", "revogado"):
            raise HTTPException(status_code=422, detail="status: ativo ou revogado")
        mudanca["status"] = corpo["status"]
    if mudanca:
        supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho_id}", mudanca,
                 prefer="return=minimal")

    if "setores" in corpo:
        _trocar_setores(aparelho_id,
                        _conferir_setores(aparelho["evento_id"], corpo["setores"]))
    return {"ok": True}


def _novo_codigo(aparelho_id, usuario, elevacao, navegador) -> dict:
    """Gera outro código curto. NÃO mexe no `token_hash`, de propósito.

    Quem mantém o aparelho conectado é o token dele. Se gerar código novo o
    apagasse, o dono derrubaria a portaria no meio do evento só por ter
    esquecido um código — e a tela, que promete o contrário em texto, estaria
    mentindo. Desligar o aparelho é a outra ação, separada: revogar.
    """
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)

    codigo = _sortear_codigo()
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho_id}",
             {"codigo_hash": _hash_do_codigo(codigo, _sal_do_evento(aparelho["evento_id"]))},
             prefer="return=minimal")
    return {"codigo": codigo}


@router.post("/eventos/{evento_id}/aparelhos")
def criar_aparelho(evento_id: str, corpo: dict, authorization: str = Header(None),
                   x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _criar_aparelho(evento_id, _usuario_logado(authorization),
                           x_elevacao, x_navegador, corpo)


@router.patch("/aparelhos/{aparelho_id}")
def gravar_aparelho(aparelho_id: str, corpo: dict, authorization: str = Header(None),
                    x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_aparelho(aparelho_id, _usuario_logado(authorization),
                            x_elevacao, x_navegador, corpo)


@router.post("/aparelhos/{aparelho_id}/codigo")
def novo_codigo(aparelho_id: str, authorization: str = Header(None),
                x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _novo_codigo(aparelho_id, _usuario_logado(authorization),
                        x_elevacao, x_navegador)
```

**Nota para o executor:** o `FakeBanco` do arquivo de teste precisa dar um `id` diferente a
cada dispositivo. O `linha.setdefault("id", f"novo-{len(alvo)}")` do `POST` já faz isso.
Ele também precisa responder ao `DELETE` sem limpar a tabela inteira; trocar o ramo
`DELETE` da classe por:

```python
        if method == "DELETE":
            if "dispositivo_id=eq." in path:
                alvo_id = path.split("dispositivo_id=eq.")[1].split("&")[0]
                sobrando = [l for l in alvo if str(l["dispositivo_id"]) != alvo_id]
                alvo.clear()
                alvo.extend(sobrando)
            else:
                alvo.clear()
            return []
```

- [ ] **Passo 4: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: 33 passando

- [ ] **Passo 5: commitar**

```bash
git add acesso_config.py tests/test_acesso_config.py
git commit -m "feat(acesso): aparelhos da portaria, com codigo curto e lista de setores"
```

---

## Tarefa 7: Os códigos do próprio cliente

**Arquivos:**
- Modificar: `acesso_config.py`
- Testar: `tests/test_acesso_config.py`

**Interfaces:**
- Consome, de tarefas anteriores: `_evento_do_dono`, `_exigir_elevacao`,
  `_setores_do_evento(evento_id) -> set`, `_sal_do_evento(evento_id) -> str`,
  `qr_ideal.hash_codigo(conteudo, sal) -> str`.
- Produz: `POST /api/acesso/eventos/{evento_id}/codigos`, `acesso_config.MAXIMO_CODIGOS`.

**Regra que não se negocia:** `codigo_visivel` só existe quando `origem='cliente'`. O
código é do cliente e ele precisa administrar a própria lista de staff; o nosso nunca
aparece em claro.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_acesso_config.py`:

```python
# ── Os códigos do cliente ───────────────────────────────────────────────────

def test_importar_codigos_do_cliente(banco, elevado):
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["STAFF01", "STAFF02"], "setor_id": SETOR})
    assert r["gravados"] == 2
    assert {c["codigo_visivel"] for c in banco.credenciais} == {"STAFF01", "STAFF02"}
    assert all(c["origem"] == "cliente" for c in banco.credenciais)
    assert all(c["setor_id"] == SETOR for c in banco.credenciais)


def test_o_codigo_do_cliente_fica_legivel_e_o_nosso_nunca(banco, elevado):
    """`codigo_visivel` so existe com origem='cliente'. E a linha divisoria
    entre o que e do cliente e o que e nosso."""
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["CORTESIA1"], "setor_id": SETOR})
    for c in banco.credenciais:
        assert (c.get("codigo_visivel") is not None) == (c["origem"] == "cliente")


def test_o_hash_nao_e_o_codigo(banco, elevado):
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["STAFF01"], "setor_id": SETOR})
    assert len(banco.credenciais[0]["codigo_hash"]) == 64
    assert banco.credenciais[0]["codigo_hash"] != "STAFF01"


def test_repetidos_no_mesmo_envio_viram_um(banco, elevado):
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1", "a1", " A1 ", "B2"], "setor_id": SETOR})
    assert r["gravados"] == 2


def test_linha_vazia_e_ignorada(banco, elevado):
    """Colar de uma planilha traz linha em branco. Isso nao e erro do cliente."""
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1", "", "   ", "B2"], "setor_id": SETOR})
    assert r["gravados"] == 2


def test_lista_grande_demais_e_recusada(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": [f"C{i}" for i in range(5001)], "setor_id": SETOR})
    assert e.value.status_code == 413


def test_setor_de_outro_evento_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1"], "setor_id": "setor-alheio"})
    assert e.value.status_code == 422


def test_importar_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, None, NAV,
                              {"codigos": ["A1"], "setor_id": SETOR})
    assert e.value.status_code == 401
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_config.py -q`
Esperado: FALHA com `AttributeError: module 'acesso_config' has no attribute '_importar_codigos'`

- [ ] **Passo 3: escrever a importação**

Acrescentar a `acesso_config.py`:

```python
MAXIMO_CODIGOS = 5000

TAMANHO_MAXIMO_DO_CODIGO = 64


def _importar_codigos(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    """Grava os códigos que o CLIENTE forneceu: staff, cortesia, lista VIP.

    Eles são hasheados com o sal do EVENTO — não com o sal de um pedido, que é
    o que os códigos do QR Ideal usam. E ficam legíveis em `codigo_visivel`,
    porque são do cliente e ele precisa administrar a própria lista.

    Reenviar a mesma lista é inofensivo: a chave única
    `uq_acesso_credencial_hash_simples` ignora o repetido.
    """
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    brutos = corpo.get("codigos") or []
    if len(brutos) > MAXIMO_CODIGOS:
        raise HTTPException(
            status_code=413,
            detail=f"envie no maximo {MAXIMO_CODIGOS} codigos por vez",
        )

    setor_id = str(corpo.get("setor_id") or "")
    if setor_id not in _setores_do_evento(evento_id):
        raise HTTPException(status_code=422, detail="escolha um setor deste evento")

    # Aparar, subir para maiúscula e reduzir repetidos preservando a ordem em
    # que o cliente colou — a ordem é a única pista que ele tem para conferir.
    vistos, limpos = set(), []
    for bruto in brutos:
        codigo = str(bruto or "").strip().upper()
        if not codigo or codigo in vistos:
            continue
        if len(codigo) > TAMANHO_MAXIMO_DO_CODIGO:
            raise HTTPException(
                status_code=422,
                detail=f"ha codigo com mais de {TAMANHO_MAXIMO_DO_CODIGO} caracteres",
            )
        vistos.add(codigo)
        limpos.append(codigo)

    if not limpos:
        return {"gravados": 0}

    sal = _sal_do_evento(evento_id)
    supabase(
        "POST",
        "producao_acesso_credenciais?on_conflict=codigo_hash",
        [{
            "evento_id": evento_id,
            "setor_id": setor_id,
            "codigo_hash": qr_ideal.hash_codigo(c, sal),
            "codigo_visivel": c,
            "origem": "cliente",
        } for c in limpos],
        prefer="resolution=ignore-duplicates,return=minimal",
    )
    return {"gravados": len(limpos)}


@router.post("/eventos/{evento_id}/codigos")
def importar_codigos(evento_id: str, corpo: dict, authorization: str = Header(None),
                     x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _importar_codigos(evento_id, _usuario_logado(authorization),
                             x_elevacao, x_navegador, corpo)
```

- [ ] **Passo 4: rodar a suíte inteira**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/ -q`
Esperado: 41 passando em `test_acesso_config.py`, e nenhuma regressão no resto.

- [ ] **Passo 5: commitar**

```bash
git add acesso_config.py tests/test_acesso_config.py
git commit -m "feat(acesso): o cliente carrega os proprios codigos de staff e cortesia"
```

---

## Tarefa 8: O login compartilhado

**Arquivos:**
- Criar: `frontend/acesso-conta.js`
- Modificar: `frontend/evento.js`, `frontend/evento.html`, `security_config.py`
- Testar: `tests/test_acesso_conta.py`

**Interfaces:**
- Produz, em `window.AcessoConta`:
  - `API` — string, a base do backend
  - `pedir(caminho, opcoes) -> Promise<objeto>` — lança `Error` com `.corpo` e `.status`
  - `sessao() -> Promise<sessao|null>`
  - `entrar(email, senha) -> Promise<sessao>` — lança `Error` com a frase pronta
  - `esqueciSenha(email) -> Promise<string>` — devolve a frase pronta
  - `navegadorId() -> string` — UUID por instalação, em `localStorage`

**Por que compartilhar:** `evento.js` e `controle.js` fazem o mesmo login, com as mesmas
frases. Duas cópias divergem, e divergência de login tranca o cliente para fora do evento
dele.

- [ ] **Passo 1: escrever os testes que falham**

Criar `tests/test_acesso_conta.py`:

```python
# -*- coding: utf-8 -*-
"""Um login só para as duas telas do cliente.

`evento.html` (onde o QR do Pedido cai) e `controle.html` (a tela do dono) fazem
o mesmo login, com as mesmas frases. Duas cópias divergem, e divergência de
login tranca o cliente para fora do evento dele.

Também mora aqui o `navegadorId()`: o identificador da instalação do navegador,
que a elevação assina junto. Ele NÃO é o aparelho de portaria cadastrado no
banco — são coisas diferentes, e confundi-las faria o celular do dono virar
aparelho de portaria.
"""

import os
import re

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_existe_uma_implementacao_so_de_login():
    """`signInWithPassword` num arquivo so."""
    donos = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if nome.endswith(".js") and "signInWithPassword" in _ler(f"frontend/{nome}"):
            donos.append(nome)
    assert donos == ["acesso-conta.js"], f"mais de um dono do login: {donos}"


def test_o_modulo_nao_depende_de_nada_alem_do_sdk():
    texto = _ler("frontend/acesso-conta.js")
    assert "import " not in texto
    assert "require(" not in texto
    assert "supabaseClient" in texto


def test_a_tela_do_QR_usa_o_modulo():
    assert "AcessoConta" in _ler("frontend/evento.js")


@pytest.mark.parametrize("nome", ["acesso-conta.js"])
def test_o_modulo_esta_na_lista_que_as_estacoes_baixam(nome):
    """Sem isto o evento.html da estacao pede um arquivo que nunca chega."""
    import security_config
    assert nome in security_config.PAINEL_ARQUIVOS


def test_o_evento_html_carrega_o_modulo_ANTES_do_evento_js():
    """Ordem importa: o `evento.js` chama o modulo no arranque."""
    texto = _ler("frontend/evento.html")
    assert texto.index("acesso-conta.js") < texto.index("evento.js")


def test_a_versao_do_script_acompanha_as_outras():
    """Uma tag com ?v= velho serve arquivo velho do cache do navegador."""
    versoes = set(re.findall(r'\.js\?v=(\d+)', _ler("frontend/evento.html")))
    assert len(versoes) == 1, f"evento.html tem versoes misturadas: {sorted(versoes)}"


def test_o_navegador_id_nao_pode_conter_ponto():
    """O corpo assinado da elevacao e montado com pontos.

    Um ponto no identificador deslocaria os campos e faria uma assinatura valer
    para outra combinacao de evento e conta. O `acesso_elevacao.py` recusa, e o
    gerador daqui nunca produz um.
    """
    texto = _ler("frontend/acesso-conta.js")
    assert "randomUUID" in texto or "crypto.getRandomValues" in texto
    assert "acesso_navegador_id" in texto


def test_a_frase_do_login_manda_usar_a_conta_do_Vibe():
    """A conta e a MESMA do ERP. Uma conta criada aqui passaria no login e
    deixaria o evento pendurado numa identidade sem relacao com o cadastro."""
    texto = _ler("frontend/acesso-conta.js")
    assert "Vibe" in texto
    assert "signUp" not in texto
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_acesso_conta.py -q`
Esperado: FALHA com `FileNotFoundError` em `frontend/acesso-conta.js`

- [ ] **Passo 3: escrever o módulo**

Criar `frontend/acesso-conta.js`:

```javascript
/**
 * A conta do cliente, compartilhada pelas duas telas dele.
 *
 * `evento.html` — onde o QR do Pedido cai — e `controle.html` — a tela do dono —
 * fazem o mesmo login, com as mesmas frases. Duas cópias divergem, e divergência
 * de login tranca o cliente para fora do evento dele.
 *
 * A conta é a MESMA que o cliente já tem no ERP Vibe: os dois sistemas apontam
 * para o mesmo projeto Supabase, logo o mesmo `auth.users`. Por isso não existe
 * criar conta aqui. Uma conta criada nesta tela funcionaria — e seria o pior
 * caso, porque o login passaria e só muito depois alguém descobriria que o
 * evento ficou pendurado numa identidade sem nenhuma relação com o cadastro do
 * cliente na gráfica.
 *
 * Nada aqui fala com o banco direto. O que este módulo usa do Supabase é só o
 * login; toda leitura e escrita de tabela passa pelo backend, que tem a chave.
 */
(function () {
    'use strict';

    // Mesma regra do resto do app: servido pela estação, fala com a estação;
    // servido pela Vercel, fala com o motor na nuvem.
    var ehLocal = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0;
    var API = (ehLocal || location.port === '9000') ? '' : 'https://imposicao.onrender.com';

    /**
     * Uma chamada ao backend. Erro vira `Error` com `.status` e `.corpo`, para
     * quem chama poder distinguir "sessão caiu" de "elevação venceu".
     */
    function pedir(caminho, opcoes) {
        return fetch(API + '/api/acesso' + caminho, opcoes).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (corpo) {
                if (!r.ok) {
                    var detalhe = corpo.detail;
                    var texto = (detalhe && detalhe.mensagem) || detalhe || ('Erro ' + r.status);
                    var erro = new Error(typeof texto === 'string' ? texto : 'Erro ' + r.status);
                    erro.status = r.status;
                    erro.corpo = detalhe;
                    throw erro;
                }
                return corpo;
            });
        });
    }

    function sessao() {
        return supabaseClient.auth.getSession().then(function (r) {
            return (r.data && r.data.session) || null;
        });
    }

    function entrar(email, senha) {
        return supabaseClient.auth
            .signInWithPassword({ email: (email || '').trim(), password: senha || '' })
            .then(function (r) {
                if (r.error) {
                    // A mensagem do Supabase vem em inglês e fala de "credentials".
                    // Quem lê é o cliente, no celular, e o que ele precisa saber é
                    // QUAL conta tentar.
                    throw new Error('E-mail ou senha não conferem. Use a mesma conta do Vibe, '
                        + 'onde você acompanha os seus pedidos.');
                }
                if (!r.data.session) {
                    throw new Error('Não consegui abrir a sessão. Tente de novo em instantes.');
                }
                return r.data.session;
            });
    }

    /**
     * Recuperar age sobre a conta que JÁ existe. É a saída certa para quem
     * esqueceu a senha — criar outra conta "resolveria" o login e quebraria o
     * vínculo com o cadastro do cliente.
     */
    function esqueciSenha(email) {
        return supabaseClient.auth.resetPasswordForEmail((email || '').trim())
            .then(function () {
                // Sempre a mesma resposta, tenha o e-mail conta ou não: responder
                // diferente diria a um estranho quais e-mails têm cadastro.
                return 'Se este e-mail tiver conta, enviamos o link para trocar a senha.';
            });
    }

    /**
     * O identificador desta instalação do navegador.
     *
     * A elevação de 15 minutos é assinada junto com ele, para que o bilhete não
     * viaje de um aparelho para outro. NÃO confundir com o aparelho de portaria
     * cadastrado no banco: aquele tem nome, código e lista de setores; este é só
     * "este navegador, nesta instalação".
     *
     * Sem ponto, nunca: o corpo assinado da elevação é montado com pontos, e um
     * ponto aqui deslocaria os campos.
     */
    function navegadorId() {
        var CHAVE = 'acesso_navegador_id';
        var id = null;
        try { id = localStorage.getItem(CHAVE); } catch (e) { id = null; }
        if (!id) {
            id = (crypto.randomUUID
                ? crypto.randomUUID()
                : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''));
            try { localStorage.setItem(CHAVE, id); } catch (e) { /* aba anônima */ }
        }
        return id;
    }

    window.AcessoConta = {
        API: API,
        pedir: pedir,
        sessao: sessao,
        entrar: entrar,
        esqueciSenha: esqueciSenha,
        navegadorId: navegadorId
    };
})();
```

- [ ] **Passo 4: migrar o `evento.js`**

1. Apagar de `frontend/evento.js` as funções `pedir`, `sessao`, e os corpos de `entrar` e
   `esqueciSenha`, além das duas linhas que calculam `ehLocal` e `API`.
2. Trocar `entrar()` por:

```javascript
    function entrar() {
        var email = $('email').value.trim();
        var senha = $('senha').value;
        if (!email || !senha) {
            falhar('erro-login', 'Preencha e-mail e senha.');
            return;
        }
        esconder('erro-login');
        $('btn-entrar').disabled = $('btn-esqueci').disabled = true;

        AcessoConta.entrar(email, senha)
            .then(function (sess) {
                $('btn-entrar').disabled = $('btn-esqueci').disabled = false;
                entrou(sess);
            })
            .catch(function (e) {
                $('btn-entrar').disabled = $('btn-esqueci').disabled = false;
                falhar('erro-login', e.message);
            });
    }
```

3. Trocar `esqueciSenha()` por:

```javascript
    function esqueciSenha() {
        var email = $('email').value.trim();
        if (!email) {
            falhar('erro-login', 'Escreva o seu e-mail acima e toque de novo.');
            return;
        }
        esconder('erro-login');
        $('btn-esqueci').disabled = true;
        AcessoConta.esqueciSenha(email).then(function (frase) {
            $('btn-esqueci').disabled = false;
            falhar('erro-login', frase + ' Depois de trocar, volte a ler este QR.');
        });
    }
```

4. Trocar as chamadas restantes: `pedir(` vira `AcessoConta.pedir(`, e `sessao()` vira
   `AcessoConta.sessao()`.

- [ ] **Passo 5: carregar o módulo no `evento.html`**

Em `frontend/evento.html`, antes da tag do `evento.js`:

```html
    <script src="/acesso-conta.js?v=566"></script>
```

- [ ] **Passo 6: acrescentar à lista que as estações baixam**

Em `security_config.py`, no array `PAINEL_ARQUIVOS`, logo depois de `"evento.js"`:

```python
    "acesso-conta.js",
```

- [ ] **Passo 7: rodar para confirmar que passa**

Rodar:
```
.\venv\Scripts\python.exe -m pytest tests/test_acesso_conta.py tests/test_painel_estacao.py -q
```
Esperado: 8 + 8 passando

- [ ] **Passo 8: commitar**

```bash
git add frontend/acesso-conta.js frontend/evento.js frontend/evento.html security_config.py tests/test_acesso_conta.py
git commit -m "refactor(acesso): um login so para as duas telas do cliente"
```

---

## Tarefa 9: A tela, em leitura

**Arquivos:**
- Criar: `frontend/controle.css`, `frontend/controle.html`, `frontend/controle.js`
- Modificar: `security_config.py`
- Testar: `tests/test_controle_tela.py`

**Interfaces:**
- Consome: `window.AcessoConta` (Tarefa 8), `GET /api/acesso/eventos/{id}` (Tarefa 3),
  `GET /api/acesso/meus-eventos` (parte 2).
- Produz, em `window.Controle` (exposto para o teste de navegador):
  - `Controle.estado` — `{sessao, evento_id, painel, elevacao}`
  - `Controle.carregarPainel() -> Promise`
  - `Controle.desenhar()`

**Nota de layout:** o visual segue as mesmas variáveis de cor do `evento.html` — o cliente
chega de lá, e mudar de identidade no meio do caminho faz parecer outro sistema. A
diferença é que aqui elas moram num arquivo, porque esta tela é aberta muitas vezes e vale
o cache; o `evento.html` continua com o CSS embutido, porque é a porta de entrada e vale a
requisição a menos.

- [ ] **Passo 1: escrever os testes que falham**

Criar `tests/test_controle_tela.py`:

```python
# -*- coding: utf-8 -*-
"""A tela do dono, no navegador de verdade.

O que estes testes protegem não é a aparência: é que a tela não minta. Ela
mostra números que vêm do ERP e números que vêm da publicação, e o dono toma
decisão de produção olhando para eles.
"""

import json
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Estrutura, sem navegador ────────────────────────────────────────────────

def test_os_tres_arquivos_estao_na_lista_que_as_estacoes_baixam():
    import security_config
    for nome in ("controle.html", "controle.js", "controle.css"):
        assert nome in security_config.PAINEL_ARQUIVOS


def test_a_pagina_carrega_o_login_compartilhado_ANTES_do_controle():
    texto = _ler("frontend/controle.html")
    assert texto.index("acesso-conta.js") < texto.index("controle.js")


def test_a_versao_dos_scripts_e_uma_so():
    versoes = set(re.findall(r'\.(?:js|css)\?v=(\d+)', _ler("frontend/controle.html")))
    assert len(versoes) == 1, f"controle.html tem versoes misturadas: {sorted(versoes)}"


def test_a_tela_nunca_explica_como_o_codigo_do_QR_e_gerado():
    """Regra do usuario: e segredo de Estado.

    A tela do dono e a que mais tenta explicar, porque e onde ele configura. Uma
    frase sobre pool, hash ou sal aqui vira documentacao publica do mecanismo.
    """
    proibidas = ["pbkdf2", "pool", "hash do codigo", "sal do evento", "iteracoes"]
    for arquivo in ("frontend/controle.html", "frontend/controle.js"):
        texto = _ler(arquivo).lower()
        for palavra in proibidas:
            assert palavra not in texto, f"{arquivo} explica o mecanismo: '{palavra}'"


def test_todo_botao_tem_rotulo_em_texto():
    """Regra do projeto: controle novo precisa de rotulo em texto.

    Um botao so com icone obriga o dono a adivinhar, e ele esta no celular,
    talvez na porta do evento.
    """
    html = _ler("frontend/controle.html")
    for botao in re.findall(r"<button[^>]*>(.*?)</button>", html, re.S):
        sem_tag = re.sub(r"<[^>]+>", "", botao)
        letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", sem_tag)
        assert len(letras) >= 3, f"botao sem rotulo em texto: {botao.strip()[:60]}"


# ── No navegador ────────────────────────────────────────────────────────────

PAINEL_FALSO = {
    "evento": {"id": "ev-1", "nome_evento": "Baile do Hawaii",
               "data_evento": None, "local_evento": "Clube"},
    "setores": [
        {"id": "s1", "nome": "PISTA", "quantidade": 5000, "publicadas": 5000,
         "lotacao": None, "tipo_uso": "unico", "pedido_id_int": 18560, "modelo_id": 1000110},
        {"id": "s2", "nome": "VIP", "quantidade": 800, "publicadas": 640,
         "lotacao": 700, "tipo_uso": "reentrada", "pedido_id_int": 18560, "modelo_id": 1000111},
    ],
    "aparelhos": [{"id": "a1", "nome": "Portao A", "status": "ativo",
                   "ultimo_visto": None, "setores": ["s1"]}],
    "pedidos": [{"pedido_id_int": 18560, "publicado_em": "2026-08-14T00:00:00Z",
                 "total_credenciais": 5640}],
    "codigos_cliente": 42,
}


def _no_navegador(script_extra):
    """Abre o controle.html num Chrome de verdade, com o backend interceptado.

    O `controle.html` referencia os scripts por caminho ABSOLUTO (`/controle.js`),
    que é como o Vercel e a estação os servem. Sob `file://` isso apontaria para
    a raiz do disco, e a página carregaria vazia — sem erro nenhum, o que é o
    pior modo de falhar num teste. Por isso o driver intercepta cada pedido e
    responde com o arquivo lido de `frontend/`.
    """
    driver = f"""
const fs = require('fs');
const path = require('path');
const REPO = {json.dumps(RAIZ)};
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));
const PAINEL = {json.dumps(PAINEL_FALSO)};

const TIPOS = {{ '.js': 'application/javascript', '.css': 'text/css',
                '.html': 'text/html' }};

(async () => {{
  const browser = await puppeteer.launch({{ args: ['--no-sandbox'] }});
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  await page.setRequestInterception(true);
  page.on('request', req => {{
    const url = req.url();

    if (url.includes('/api/acesso/eventos/')) {{
      return req.respond({{ status: 200, contentType: 'application/json',
                           body: JSON.stringify(PAINEL) }});
    }}
    // O SDK do Supabase não é exercitado aqui: a sessão é semeada à mão.
    if (url.includes('cdn.jsdelivr') || url.includes('supabase-config')) {{
      return req.respond({{ status: 200, contentType: 'application/javascript',
                           body: 'window.supabaseClient = null;' }});
    }}

    // Caminho absoluto do site vira arquivo de frontend/.
    const nome = decodeURIComponent(url.split('?')[0].split('/').pop());
    const arquivo = path.join(REPO, 'frontend', nome);
    if (nome && fs.existsSync(arquivo) && TIPOS[path.extname(nome)]) {{
      return req.respond({{ status: 200, contentType: TIPOS[path.extname(nome)],
                           body: fs.readFileSync(arquivo, 'utf8') }});
    }}
    req.continue();
  }});

  await page.goto('file://' + path.join(REPO, 'frontend', 'controle.html').replace(/\\\\/g, '/'),
                  {{ waitUntil: 'networkidle0' }});
  await page.waitForFunction(() => window.Controle && window.AcessoConta);

  const saida = await page.evaluate(async () => {{
    window.supabaseClient = {{ auth: {{
      getSession: async () => ({{ data: {{ session: {{ access_token: 'jwt-de-teste' }} }} }})
    }} }};
    {script_extra}
  }});

  await browser.close();
  console.log(JSON.stringify({{ saida, erros }}));
}})();
"""
    r = subprocess.run(["node", "-e", driver], capture_output=True, text=True, cwd=RAIZ)
    if r.returncode != 0:
        raise AssertionError(r.stderr[:800])
    resultado = json.loads(r.stdout.strip().splitlines()[-1])
    assert not resultado["erros"], resultado["erros"]
    return resultado["saida"]


def test_a_tela_desenha_setores_aparelhos_e_codigos():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            titulo: document.getElementById('nome-evento-titulo').textContent,
            setores: document.querySelectorAll('#setores .cartao').length,
            aparelhos: document.querySelectorAll('#aparelhos .cartao').length,
            codigos: document.getElementById('codigos-total').textContent,
        };
    """)
    assert saida["titulo"] == "Baile do Hawaii"
    assert saida["setores"] == 2
    assert saida["aparelhos"] == 1
    assert "42" in saida["codigos"]


def test_a_divergencia_entre_encomendado_e_publicado_aparece_EM_TEXTO():
    """O VIP tem 800 encomendados e 640 publicados.

    Esse numero e a unica pista visivel de que ou a impressao nao terminou de
    publicar, ou alguem publicou o que nao devia. Escondê-lo transformaria a
    tela num relatorio que confirma o que o dono ja acha.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const vip = document.querySelectorAll('#setores .cartao')[1];
        return { texto: vip.textContent.replace(/\\s+/g, ' ') };
    """)
    assert "640" in saida["texto"] and "800" in saida["texto"]
    assert "confer" in saida["texto"].lower() or "falta" in saida["texto"].lower()


def test_a_quantidade_impressa_nao_e_editavel():
    """Quem manda na tiragem e o ERP."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        const campos = [...document.querySelectorAll('#setores input')].map(i => i.id);
        return { campos };
    """)
    assert not any("quantidade" in c for c in saida["campos"])


def test_sem_elevacao_a_tela_anuncia_que_esta_somente_leitura():
    """Uma tela que aceita o toque e nao grava e pior que uma que se declara."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        return {
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            aviso: (document.getElementById('aviso-leitura').textContent || '').trim(),
        };
    """)
    assert saida["somenteLeitura"] is True
    assert len(saida["aviso"]) > 10
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: FALHA — `frontend/controle.html` não existe.

- [ ] **Passo 3: escrever o CSS**

Criar `frontend/controle.css`. A primeira metade é cópia literal do bloco `<style>` do
`frontend/evento.html`, das linhas `:root {` até `.rodape { … }`, **sem alteração nenhuma** —
copiar do arquivo, não redigitar. A segunda metade é o que só esta tela usa:

```css
/*
 * A tela do dono do evento. Celular primeiro, uma coluna, sem abas.
 *
 * As cores acima repetem as do `evento.html` de propósito: o cliente chega de
 * lá, e mudar de identidade no meio do caminho faz parecer outro sistema. Lá
 * elas estão embutidas na página porque aquela é a porta de entrada e vale a
 * requisição a menos; aqui moram num arquivo porque esta tela é reaberta muitas
 * vezes e vale o cache.
 */

h3 { font-size: 1rem; margin: 0 0 4px; }

.secao { margin: 22px 0; }
.secao > h2 {
    font-size: .74rem; text-transform: uppercase; letter-spacing: .09em;
    color: var(--dim); margin: 0 0 10px;
}

/* A faixa da elevação. Fica GRUDADA no topo enquanto vale: uma trava que se
   desarma em silêncio é pior que nenhuma — o dono guarda o celular achando que
   trancou. */
#faixa-elevacao {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 14px; margin: 0 -16px 16px;
    background: rgba(245, 158, 11, .16);
    border-bottom: 1px solid var(--amber);
    font-size: .84rem;
}
#faixa-elevacao button { width: auto; margin: 0; padding: 7px 12px; font-size: .8rem; }

/* Em somente leitura os campos ficam visivelmente desligados. Aceitar o toque e
   não gravar é a pior das combinações. */
body.somente-leitura input,
body.somente-leitura select,
body.somente-leitura .so-com-senha { opacity: .55; }

.divergente { color: var(--amber); font-weight: 600; }
.confere { color: var(--dim); }

.opcao { display: flex; align-items: center; gap: 9px; margin: 7px 0; }
.opcao input[type="radio"] { width: auto; min-height: 0; }
.opcao label { margin: 0; color: var(--text); font-size: .9rem; }

.codigo-gerado {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 1.7rem; letter-spacing: .18em; text-align: center;
    padding: 14px; border-radius: 8px;
    background: rgba(20, 184, 166, .12); border: 1px dashed var(--teal);
}
```

- [ ] **Passo 4: escrever o HTML**

Criar `frontend/controle.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Configurar o evento — Ideal Control</title>
    <meta name="theme-color" content="#0a0f1e">
    <link rel="stylesheet" href="/controle.css?v=566">
</head>
<body>
<div class="folha">
    <header>
        <img src="/Logo Ideal Dark.png" alt="Ingresso Ideal">
        <span>Controle de acesso</span>
    </header>

    <!-- 1. Entrar -->
    <div id="bloco-entrar" class="cartao sumindo">
        <h1>Entre com a sua conta do Vibe</h1>
        <p style="font-size:.84rem;color:var(--dim);margin:0;">
            <strong>É o mesmo e-mail e a mesma senha</strong> que você usa para
            acompanhar os seus pedidos. Não existe cadastro separado aqui.
        </p>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" inputmode="email">
        <label for="senha">Senha</label>
        <input id="senha" type="password" autocomplete="current-password">
        <button id="btn-entrar">Entrar</button>
        <button id="btn-esqueci" class="secundario">Esqueci minha senha</button>
        <div id="erro-login" class="aviso erro sumindo" style="margin-top:14px;"></div>
    </div>

    <!-- 2. Escolher o evento -->
    <div id="lista-eventos" class="sumindo">
        <h1>Seus eventos</h1>
        <div id="eventos"></div>
        <p id="sem-eventos" class="aviso sumindo">
            Você ainda não cadastrou nenhum evento. Leia o QR que a gráfica enviou
            para cadastrar o primeiro.
        </p>
    </div>

    <!-- 3. O evento -->
    <div id="evento" class="sumindo">
        <div id="faixa-elevacao" class="sumindo">
            <span id="faixa-tempo">Modo configuração</span>
            <button id="btn-sair-config" class="secundario">Sair do modo configuração</button>
        </div>

        <a href="/controle.html" style="color:var(--dim);font-size:.84rem;">← Meus eventos</a>
        <h1 id="nome-evento-titulo">Evento</h1>

        <div id="aviso-gravacao" class="aviso sumindo" role="status"></div>
        <div id="aviso-leitura" class="aviso"></div>
        <button id="btn-elevar">Digitar a senha do dono</button>

        <div class="secao">
            <h2>Dados do evento</h2>
            <div class="cartao">
                <label for="campo-nome-evento">Nome do evento</label>
                <input id="campo-nome-evento" type="text">
                <label for="campo-data">Data e hora</label>
                <input id="campo-data" type="datetime-local">
                <label for="campo-local">Local</label>
                <input id="campo-local" type="text">
                <button id="btn-gravar-evento" class="so-com-senha">Gravar dados do evento</button>
            </div>
        </div>

        <div class="secao">
            <h2>Setores</h2>
            <div id="setores"></div>
        </div>

        <div class="secao">
            <h2>Aparelhos da portaria</h2>
            <div id="aparelhos"></div>
            <div class="cartao so-com-senha">
                <label for="novo-aparelho-nome">Nome do novo aparelho</label>
                <input id="novo-aparelho-nome" type="text" placeholder="Ex.: Portão A">
                <p style="font-size:.82rem;color:var(--dim);margin:12px 0 4px;">
                    Quais setores este aparelho valida
                </p>
                <div id="novo-aparelho-setores"></div>
                <button id="btn-criar-aparelho">Criar aparelho</button>
            </div>
        </div>

        <div id="caixa-codigo" class="cartao sumindo">
            <h2>Código deste aparelho</h2>
            <div class="codigo-gerado" id="codigo-valor"></div>
            <p style="font-size:.84rem;color:var(--dim);">
                Anote agora: este código <strong>não aparece de novo</strong>. Se
                você perdê-lo, é só gerar outro — e gerar outro
                <strong>não desconecta</strong> o aparelho que já está trabalhando
                na portaria. Para desligar um aparelho, use "Revogar".
            </p>
            <button id="btn-fechar-codigo" class="secundario">Já anotei, fechar</button>
        </div>

        <div class="secao">
            <h2>Meus códigos (staff, cortesia)</h2>
            <div class="cartao">
                <p id="codigos-total" style="font-size:.9rem;">0 códigos carregados</p>
                <div class="so-com-senha">
                    <label for="codigos-setor">Setor destes códigos</label>
                    <select id="codigos-setor"></select>
                    <label for="codigos-texto">Cole os códigos, um por linha</label>
                    <textarea id="codigos-texto" rows="6"
                              style="width:100%;font-family:inherit;font-size:1rem;"></textarea>
                    <button id="btn-importar-codigos">Carregar códigos</button>
                </div>
            </div>
        </div>
    </div>

    <p class="rodape">Ingresso Ideal</p>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/supabase-config.js?v=566"></script>
<script src="/acesso-conta.js?v=566"></script>
<script src="/controle.js?v=566"></script>
</body>
</html>
```

Todo botão leva rótulo em texto de pelo menos três letras — é o que
`test_todo_botao_tem_rotulo_em_texto` cobra. A caixa `#caixa-codigo` e os elementos
`#faixa-elevacao` e `#aviso-gravacao` já entram aqui porque as Tarefas 10 e 11 vão preenchê-los;
deixá-los para depois obrigaria a mexer no HTML três vezes.

- [ ] **Passo 5: escrever o `controle.js` em modo leitura**

Criar `frontend/controle.js` com:

```javascript
/**
 * A tela do dono do evento.
 *
 * Ela mostra dois números lado a lado em cada setor: o que o ERP encomendou e o
 * que está publicado. Divergência entre os dois é a única pista visível de que
 * ou a impressão ainda não terminou de publicar, ou alguém publicou o que não
 * devia — e por isso ela aparece em texto, nunca só numa cor.
 *
 * Enquanto não houver elevação, a tela se declara somente leitura. Aceitar o
 * toque e não gravar seria a pior das combinações.
 */
(function () {
    'use strict';

    var estado = {
        sessao: null,
        evento_id: null,
        painel: null,
        elevacao: null       // { token, expira_em }
    };

    var $ = function (id) { return document.getElementById(id); };

    function cabecalhos(extra) {
        var h = { Authorization: 'Bearer ' + (estado.sessao || {}).access_token };
        if (extra) { Object.keys(extra).forEach(function (k) { h[k] = extra[k]; }); }
        return h;
    }

    function carregarPainel() {
        return AcessoConta.pedir('/eventos/' + estado.evento_id, { headers: cabecalhos() })
            .then(function (p) { estado.painel = p; desenhar(); return p; });
    }

    function elevado() {
        return !!(estado.elevacao && estado.elevacao.expira_em * 1000 > Date.now());
    }

    function desenhar() {
        var p = estado.painel;
        if (!p) { return; }

        document.body.classList.toggle('somente-leitura', !elevado());
        $('aviso-leitura').textContent = elevado()
            ? ''
            : 'Você está vendo o evento. Para alterar qualquer coisa, toque em '
              + '"Digitar a senha do dono".';

        $('nome-evento-titulo').textContent = p.evento.nome_evento;
        $('campo-nome-evento').value = p.evento.nome_evento || '';
        $('campo-local').value = p.evento.local_evento || '';
        // `datetime-local` só aceita "AAAA-MM-DDTHH:MM"; o banco devolve com
        // segundos e fuso, e o campo fica VAZIO em silêncio se o formato não
        // bater — o dono acharia que a data nunca foi gravada.
        $('campo-data').value = (p.evento.data_evento || '').slice(0, 16);

        $('setores').innerHTML = '';
        p.setores.forEach(function (s) { $('setores').appendChild(cartaoDeSetor(s)); });

        $('aparelhos').innerHTML = '';
        p.aparelhos.forEach(function (a) { $('aparelhos').appendChild(cartaoDeAparelho(a)); });

        $('codigos-total').textContent = p.codigos_cliente + ' códigos carregados';
    }

    function cartaoDeSetor(s) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = s.nome;            // vem do ERP: TEXTO, nunca HTML
        el.appendChild(titulo);

        var contagem = document.createElement('p');
        contagem.style.fontSize = '.84rem';
        if (s.publicadas === s.quantidade) {
            contagem.className = 'confere';
            contagem.textContent = s.quantidade.toLocaleString('pt-BR')
                + ' ingressos encomendados, e os mesmos ' + s.publicadas.toLocaleString('pt-BR')
                + ' já estão no ar. Confere.';
        } else {
            contagem.className = 'divergente';
            contagem.textContent = s.quantidade.toLocaleString('pt-BR')
                + ' ingressos encomendados, mas ' + s.publicadas.toLocaleString('pt-BR')
                + ' estão no ar. Faltam ' + (s.quantidade - s.publicadas).toLocaleString('pt-BR')
                + ' — confira com a gráfica antes do evento.';
        }
        el.appendChild(contagem);

        var rotulo = document.createElement('label');
        rotulo.setAttribute('for', 'lotacao-' + s.id);
        rotulo.textContent = 'Lotação máxima (deixe vazio para sem limite)';
        el.appendChild(rotulo);

        var campo = document.createElement('input');
        campo.id = 'lotacao-' + s.id;
        campo.type = 'number';
        campo.min = '0';
        campo.inputMode = 'numeric';
        campo.value = (s.lotacao === null || s.lotacao === undefined) ? '' : s.lotacao;
        el.appendChild(campo);

        // A quantidade encomendada NÃO vira campo: quem manda nela é o ERP.
        el.appendChild(opcoesDeUso(s));
        return el;
    }

    function opcoesDeUso(s) {
        var caixa = document.createElement('div');
        var titulo = document.createElement('p');
        titulo.textContent = 'Uso do ingresso';
        titulo.style.margin = '14px 0 4px';
        titulo.style.fontSize = '.82rem';
        titulo.style.color = 'var(--dim)';
        caixa.appendChild(titulo);

        [['unico', 'Vale uma entrada só'],
         ['reentrada', 'Permite sair e voltar']].forEach(function (par) {
            var linha = document.createElement('div');
            linha.className = 'opcao';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'uso-' + s.id;
            radio.id = 'uso-' + s.id + '-' + par[0];
            radio.value = par[0];
            radio.checked = (s.tipo_uso === par[0]);
            var rot = document.createElement('label');
            rot.setAttribute('for', radio.id);
            rot.textContent = par[1];
            linha.appendChild(radio);
            linha.appendChild(rot);
            caixa.appendChild(linha);
        });
        return caixa;
    }

    function cartaoDeAparelho(a) {
        var el = document.createElement('div');
        el.className = 'cartao';

        var titulo = document.createElement('h3');
        titulo.textContent = a.nome;            // digitado pelo cliente: TEXTO
        el.appendChild(titulo);

        var situacao = document.createElement('p');
        situacao.style.fontSize = '.84rem';
        situacao.style.color = 'var(--dim)';
        var nomes = (estado.painel.setores || [])
            .filter(function (s) { return a.setores.indexOf(s.id) >= 0; })
            .map(function (s) { return s.nome; });
        situacao.textContent = (a.status === 'ativo' ? 'Ativo. ' : 'Revogado. ')
            + (nomes.length ? 'Valida: ' + nomes.join(', ') : 'Ainda não valida nenhum setor.');
        el.appendChild(situacao);
        return el;
    }

    // ── O arranque ───────────────────────────────────────────────────────────
    //
    // Três caminhos, nesta ordem: sem sessão, entrar; com sessão e `?evento=`,
    // abrir aquele evento; com sessão e sem evento, listar os que a conta tem.

    var mostrar = function (id) { $(id).classList.remove('sumindo'); };
    var esconder = function (id) { $(id).classList.add('sumindo'); };

    function abrir() {
        return AcessoConta.sessao().then(function (s) {
            if (!s) {
                mostrar('bloco-entrar');
                return null;
            }
            estado.sessao = s;
            esconder('bloco-entrar');

            var pedido = new URLSearchParams(location.search).get('evento');
            if (pedido) {
                estado.evento_id = pedido;
                mostrar('evento');
                return carregarPainel();
            }
            return listarEventos();
        });
    }

    function listarEventos() {
        return AcessoConta.pedir('/meus-eventos', { headers: cabecalhos() })
            .then(function (d) {
                var eventos = d.eventos || [];
                mostrar('lista-eventos');
                if (!eventos.length) { mostrar('sem-eventos'); return; }

                var caixa = $('eventos');
                caixa.innerHTML = '';
                eventos.forEach(function (ev) {
                    var link = document.createElement('a');
                    link.href = '/controle.html?evento=' + encodeURIComponent(ev.id);
                    link.className = 'cartao';
                    link.style.display = 'block';
                    link.style.textDecoration = 'none';
                    link.style.color = 'inherit';
                    link.textContent = ev.nome_evento;   // digitado pelo cliente: TEXTO
                    caixa.appendChild(link);
                });
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        $('btn-entrar').addEventListener('click', function () {
            var erro = $('erro-login');
            erro.classList.add('sumindo');
            AcessoConta.entrar($('email').value, $('senha').value)
                .then(abrir)
                .catch(function (e) {
                    erro.textContent = e.message;
                    erro.classList.remove('sumindo');
                });
        });
        $('senha').addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') { $('btn-entrar').click(); }
        });
        $('btn-esqueci').addEventListener('click', function () {
            AcessoConta.esqueciSenha($('email').value).then(function (frase) {
                var erro = $('erro-login');
                erro.textContent = frase;
                erro.classList.remove('sumindo');
            });
        });
        abrir();
    });

    window.Controle = {
        estado: estado,
        carregarPainel: carregarPainel,
        desenhar: desenhar,
        elevado: elevado,
        abrir: abrir
    };
})();
```

**Nota para o executor:** o `abrir()` roda no `DOMContentLoaded` e, no teste de navegador,
não acha sessão nenhuma — o que é certo, e é por isso que os testes semeiam
`Controle.estado.sessao` e chamam `carregarPainel()` à mão. Nenhum teste depende do
arranque automático.

- [ ] **Passo 6: acrescentar os três nomes à lista de sincronismo**

Em `security_config.py`, depois de `"acesso-conta.js"`:

```python
    "controle.html",
    "controle.js",
    "controle.css",
```

- [ ] **Passo 7: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: 10 passando

- [ ] **Passo 8: commitar**

```bash
git add frontend/controle.html frontend/controle.js frontend/controle.css security_config.py tests/test_controle_tela.py
git commit -m "feat(acesso): a tela do dono do evento, em leitura"
```

---

## Tarefa 10: A elevação na tela, e as gravações

**Arquivos:**
- Modificar: `frontend/controle.js`, `frontend/controle.html`
- Testar: `tests/test_controle_tela.py`

**Interfaces:**
- Consome: `POST /eventos/{id}/elevar`, `PATCH /eventos/{id}`, `PATCH /setores/{id}`.
- Produz: `Controle.elevar(senha)`, `Controle.gravar(caminho, corpo, metodo)`,
  `Controle.sairDaConfiguracao()`.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_controle_tela.py`:

```python
def test_a_faixa_de_configuracao_mostra_o_tempo_e_um_botao_de_sair():
    """Uma trava que se desarma calada e pior que trava nenhuma."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.desenhar();
        const faixa = document.getElementById('faixa-elevacao');
        return {
            visivel: !faixa.classList.contains('sumindo'),
            texto: faixa.textContent.replace(/\\s+/g, ' ').trim(),
            temBotaoSair: !!document.getElementById('btn-sair-config'),
            somenteLeitura: document.body.classList.contains('somente-leitura'),
        };
    """)
    assert saida["visivel"] is True
    assert "14" in saida["texto"] or "15" in saida["texto"]
    assert saida["temBotaoSair"] is True
    assert saida["somenteLeitura"] is False


def test_sair_da_configuracao_apaga_a_elevacao_na_hora():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle.sairDaConfiguracao();
        return {
            elevacao: Controle.estado.elevacao,
            somenteLeitura: document.body.classList.contains('somente-leitura'),
            guardado: sessionStorage.getItem('acesso_elevacao'),
        };
    """)
    assert saida["elevacao"] is None
    assert saida["somenteLeitura"] is True
    assert saida["guardado"] is None


def test_elevacao_vencida_nao_conta_como_elevada():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) - 1 };
        Controle.desenhar();
        return { elevado: Controle.elevado(),
                 somenteLeitura: document.body.classList.contains('somente-leitura') };
    """)
    assert saida["elevado"] is False
    assert saida["somenteLeitura"] is True


def test_elevacao_vencida_no_meio_da_edicao_NAO_perde_o_que_foi_digitado():
    """O caso que faz o cliente desistir da tela.

    A gravacao volta 401, a tela pede a senha, e repete a MESMA gravacao. O que
    estava na caixa de texto continua la o tempo todo.
    """
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome que eu digitei';

        // A primeira gravacao volta 401 de elevacao vencida.
        let tentativas = 0;
        Controle._pedirParaTeste = async () => {
            tentativas++;
            if (tentativas === 1) {
                const e = new Error('venceu');
                e.status = 401;
                e.corpo = { codigo: 'elevacao_expirada' };
                throw e;
            }
            return { ok: true };
        };
        Controle._pedirSenhaParaTeste = async () => {
            Controle.estado.elevacao = { token: 'novo',
                                         expira_em: Math.floor(Date.now()/1000) + 900 };
        };

        const r = await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH');
        return {
            ok: !!r.ok,
            tentativas,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["ok"] is True
    assert saida["tentativas"] == 2
    assert saida["digitado"] == "Nome que eu digitei"


def test_falha_de_rede_avisa_e_mantem_o_que_foi_digitado():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        document.getElementById('campo-nome-evento').value = 'Nome que eu digitei';
        Controle._pedirParaTeste = async () => { throw new TypeError('Failed to fetch'); };
        let erro = null;
        try { await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH'); }
        catch (e) { erro = e.message; }
        return {
            erro,
            aviso: document.getElementById('aviso-gravacao').textContent,
            digitado: document.getElementById('campo-nome-evento').value,
        };
    """)
    assert saida["digitado"] == "Nome que eu digitei"
    assert len(saida["aviso"]) > 10


def test_gravar_com_sucesso_anuncia_que_gravou():
    """Regra do projeto: o que o sistema faz sozinho se anuncia."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ ok: true });
        await Controle.gravar('/eventos/ev-1', { nome_evento: 'x' }, 'PATCH');
        return { aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert "grav" in saida["aviso"].lower()
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: FALHA — `Controle.gravar` não existe.

- [ ] **Passo 3: acrescentar a elevação e as gravações**

Acrescentar a `frontend/controle.js`, antes do `window.Controle`:

```javascript
    var CHAVE_ELEVACAO = 'acesso_elevacao';

    /**
     * Guardar a elevação no `sessionStorage`, e não no `localStorage`: fechar a
     * aba tem de encerrar o modo configuração. O aparelho é da portaria.
     */
    function guardarElevacao(e) {
        estado.elevacao = e;
        try {
            if (e) { sessionStorage.setItem(CHAVE_ELEVACAO, JSON.stringify(e)); }
            else { sessionStorage.removeItem(CHAVE_ELEVACAO); }
        } catch (err) { /* aba anônima */ }
    }

    function elevar(senha) {
        return AcessoConta.pedir('/eventos/' + estado.evento_id + '/elevar', {
            method: 'POST',
            headers: cabecalhos({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ senha: senha, navegador: AcessoConta.navegadorId() })
        }).then(function (r) {
            guardarElevacao({ token: r.token, expira_em: r.expira_em });
            desenhar();
            return r;
        });
    }

    function sairDaConfiguracao() {
        guardarElevacao(null);
        desenhar();
    }

    function avisar(texto, tipo) {
        var el = $('aviso-gravacao');
        el.textContent = texto;
        el.className = 'aviso ' + (tipo || 'ok');
    }

    // Substituíveis pelo teste de navegador, que não tem backend.
    function _pedir(caminho, opcoes) {
        return (window.Controle._pedirParaTeste || AcessoConta.pedir)(caminho, opcoes);
    }
    function _pedirSenha() {
        if (window.Controle._pedirSenhaParaTeste) {
            return window.Controle._pedirSenhaParaTeste();
        }
        return abrirCaixaDeSenha();
    }

    /**
     * Toda gravação passa por aqui.
     *
     * Elevação vencida não perde o que o dono digitou: a chamada volta 401 com
     * `codigo: 'elevacao_expirada'`, a tela pede a senha e REPETE a mesma
     * gravação. Nada é relido da tela nesse caminho, e nada é limpo.
     */
    function gravar(caminho, corpo, metodo, jaTentou) {
        var opcoes = {
            method: metodo || 'PATCH',
            headers: cabecalhos({
                'Content-Type': 'application/json',
                'X-Elevacao': (estado.elevacao || {}).token || '',
                'X-Navegador': AcessoConta.navegadorId()
            }),
            body: JSON.stringify(corpo)
        };

        return _pedir(caminho, opcoes).then(function (r) {
            avisar('Gravado.', 'ok');
            return r;
        }).catch(function (e) {
            var venceu = e.status === 401 && e.corpo && e.corpo.codigo === 'elevacao_expirada';
            if (venceu && !jaTentou) {
                return Promise.resolve(_pedirSenha()).then(function () {
                    return gravar(caminho, corpo, metodo, true);
                });
            }
            if (e.status === undefined) {
                // Sem status: foi a rede, não o servidor. O texto digitado fica.
                avisar('Sem conexão agora. O que você digitou continua aqui — '
                     + 'toque em gravar de novo quando a internet voltar.', 'erro');
            } else {
                avisar(e.message, 'erro');
            }
            throw e;
        });
    }

    /** A faixa que conta o tempo. Redesenha a cada 20 segundos. */
    function desenharFaixa() {
        var faixa = $('faixa-elevacao');
        if (!elevado()) {
            faixa.classList.add('sumindo');
            return;
        }
        faixa.classList.remove('sumindo');
        var falta = Math.max(0, estado.elevacao.expira_em - Math.floor(Date.now() / 1000));
        var m = Math.floor(falta / 60), s = falta % 60;
        $('faixa-tempo').textContent = 'Modo configuração · ' + m + ':'
            + String(s).padStart(2, '0') + ' restante';
    }

    setInterval(function () { if (estado.painel) { desenharFaixa(); } }, 20000);
```

E acrescentar `desenharFaixa();` ao fim da função `desenhar()`, e ao objeto exportado:

```javascript
        elevar: elevar,
        gravar: gravar,
        sairDaConfiguracao: sairDaConfiguracao,
```

- [ ] **Passo 4: ligar os botões**

Os elementos `#faixa-elevacao`, `#faixa-tempo`, `#btn-sair-config`, `#aviso-gravacao`,
`#aviso-leitura` e `#btn-elevar` já existem no HTML da Tarefa 9. Falta ligá-los, dentro do
`DOMContentLoaded` do `controle.js`:

```javascript
        $('btn-sair-config').addEventListener('click', sairDaConfiguracao);

        $('btn-elevar').addEventListener('click', function () {
            abrirCaixaDeSenha();
        });

        $('btn-gravar-evento').addEventListener('click', function () {
            gravar('/eventos/' + estado.evento_id, {
                nome_evento: $('campo-nome-evento').value,
                local_evento: $('campo-local').value,
                data_evento: $('campo-data').value || null
            }, 'PATCH').then(carregarPainel).catch(function () { /* já avisado */ });
        });
```

E a caixa de senha, que é o único lugar onde a senha do dono aparece:

```javascript
    /**
     * Pede a senha do dono. Devolve uma promessa que resolve quando a elevação
     * chega — é o que permite ao `gravar()` repetir a mesma gravação depois.
     *
     * `prompt` de propósito: é a única caixa de texto que o navegador não guarda
     * em preenchimento automático, e a senha do dono não pode ficar num campo
     * que o celular do porteiro memorize.
     */
    function abrirCaixaDeSenha() {
        var senha = window.prompt(
            'Digite a senha da sua conta do Vibe para liberar as alterações por '
            + acesso_minutos() + ' minutos.'
        );
        if (!senha) { return Promise.reject(new Error('cancelado')); }
        return elevar(senha).catch(function (e) {
            avisar(e.message, 'erro');
            throw e;
        });
    }

    function acesso_minutos() { return 15; }
```

- [ ] **Passo 5: rodar para confirmar que passa**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: 16 passando

- [ ] **Passo 6: commitar**

```bash
git add frontend/controle.js frontend/controle.html tests/test_controle_tela.py
git commit -m "feat(acesso): a elevacao na tela, e gravacao que nao perde o que foi digitado"
```

---

## Tarefa 11: Aparelhos e códigos na tela

**Arquivos:**
- Modificar: `frontend/controle.js`, `frontend/controle.html`
- Testar: `tests/test_controle_tela.py`

**Interfaces:**
- Consome: `POST /eventos/{id}/aparelhos`, `PATCH /aparelhos/{id}`,
  `POST /aparelhos/{id}/codigo`, `POST /eventos/{id}/codigos`.
- Produz: `Controle.criarAparelho(nome, setores)`, `Controle.mostrarCodigo(codigo)`,
  `Controle.importarCodigos(texto, setor_id)`.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_controle_tela.py`:

```python
def test_o_codigo_novo_aparece_uma_vez_com_o_aviso_de_que_nao_volta():
    """Ele nao esta guardado em lugar nenhum. Se a tela nao avisar, o dono
    fecha a caixa achando que consulta depois."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.mostrarCodigo('K7M2QP');
        const caixa = document.getElementById('caixa-codigo');
        return {
            codigo: document.getElementById('codigo-valor').textContent,
            texto: caixa.textContent.replace(/\\s+/g, ' ').toLowerCase(),
        };
    """)
    assert saida["codigo"] == "K7M2QP"
    assert "não" in saida["texto"] and ("de novo" in saida["texto"] or "outra vez" in saida["texto"])


def test_a_tela_diz_que_gerar_outro_codigo_nao_derruba_a_portaria():
    """Sem essa frase o dono nao gera com medo, e fica sem o codigo.

    A frase tem de ser verdade no backend, e o
    `test_gerar_outro_codigo_NAO_desconecta_quem_ja_entrou` cobra o outro lado.
    """
    html = _ler("frontend/controle.html").lower()
    assert "não desconecta" in html or "nao desconecta" in html


def test_criar_aparelho_manda_a_lista_de_setores_escolhida():
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = { caminho, corpo: JSON.parse(opcoes.body) };
            return { id: 'a2', nome: 'Portao B', codigo: 'ABC234' };
        };
        await Controle.criarAparelho('Portao B', ['s1', 's2']);
        return enviado;
    """)
    assert saida["caminho"] == "/eventos/ev-1/aparelhos"
    assert saida["corpo"]["nome"] == "Portao B"
    assert saida["corpo"]["setores"] == ["s1", "s2"]


def test_importar_codigos_quebra_o_texto_colado_em_linhas():
    """O cliente cola de uma planilha. Linha vazia nao e erro dele."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        let enviado = null;
        Controle._pedirParaTeste = async (caminho, opcoes) => {
            enviado = JSON.parse(opcoes.body);
            return { gravados: 3 };
        };
        await Controle.importarCodigos('STAFF01\\n\\nSTAFF02\\r\\n  STAFF03  \\n', 's1');
        return enviado;
    """)
    assert saida["codigos"] == ["STAFF01", "STAFF02", "STAFF03"]
    assert saida["setor_id"] == "s1"


def test_importar_anuncia_QUANTOS_entraram():
    """Regra do projeto: importar dados tem de produzir resultado visivel."""
    saida = _no_navegador("""
        Controle.estado.sessao = { access_token: 'jwt-de-teste' };
        Controle.estado.evento_id = 'ev-1';
        await Controle.carregarPainel();
        Controle.estado.elevacao = { token: 't', expira_em: Math.floor(Date.now()/1000) + 900 };
        Controle._pedirParaTeste = async () => ({ gravados: 3 });
        await Controle.importarCodigos('A\\nB\\nC', 's1');
        return { aviso: document.getElementById('aviso-gravacao').textContent };
    """)
    assert "3" in saida["aviso"]
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: FALHA — `Controle.mostrarCodigo` não existe.

- [ ] **Passo 3: escrever as funções**

Acrescentar a `frontend/controle.js`:

```javascript
    /**
     * Mostra o código curto UMA vez.
     *
     * Ele não está guardado em lugar nenhum — o que fica é um resumo dele. Se a
     * tela não disser isso em texto, o dono fecha a caixa achando que consulta
     * depois, e descobre na porta do evento que não dá.
     */
    function mostrarCodigo(codigo) {
        $('codigo-valor').textContent = codigo;
        $('caixa-codigo').classList.remove('sumindo');
    }

    function criarAparelho(nome, setores) {
        return gravar('/eventos/' + estado.evento_id + '/aparelhos',
                      { nome: nome, setores: setores }, 'POST')
            .then(function (r) {
                mostrarCodigo(r.codigo);
                return carregarPainel().then(function () { return r; });
            });
    }

    function novoCodigo(aparelho_id) {
        return gravar('/aparelhos/' + aparelho_id + '/codigo', {}, 'POST')
            .then(function (r) { mostrarCodigo(r.codigo); return r; });
    }

    function trocarSetoresDoAparelho(aparelho_id, setores) {
        return gravar('/aparelhos/' + aparelho_id, { setores: setores }, 'PATCH')
            .then(carregarPainel);
    }

    function revogarAparelho(aparelho_id) {
        return gravar('/aparelhos/' + aparelho_id, { status: 'revogado' }, 'PATCH')
            .then(carregarPainel);
    }

    /**
     * O cliente cola de uma planilha, do WhatsApp, de onde for. Linha vazia e
     * espaço em volta não são erro dele — são como o texto chega.
     */
    function importarCodigos(texto, setor_id) {
        var codigos = String(texto || '')
            .split(/[\r\n]+/)
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length > 0; });

        return gravar('/eventos/' + estado.evento_id + '/codigos',
                      { codigos: codigos, setor_id: setor_id }, 'POST')
            .then(function (r) {
                avisar(r.gravados + ' códigos entraram na lista deste setor.', 'ok');
                return carregarPainel().then(function () { return r; });
            });
    }
```

E ao objeto exportado:

```javascript
        mostrarCodigo: mostrarCodigo,
        criarAparelho: criarAparelho,
        novoCodigo: novoCodigo,
        trocarSetoresDoAparelho: trocarSetoresDoAparelho,
        revogarAparelho: revogarAparelho,
        importarCodigos: importarCodigos,
```

- [ ] **Passo 4: ligar os controles que faltam**

A caixa `#caixa-codigo`, o formulário de novo aparelho e o de códigos já existem no HTML da
Tarefa 9. Ligar, dentro do `DOMContentLoaded` do `controle.js`:

```javascript
        $('btn-fechar-codigo').addEventListener('click', function () {
            $('caixa-codigo').classList.add('sumindo');
            $('codigo-valor').textContent = '';
        });

        $('btn-criar-aparelho').addEventListener('click', function () {
            var marcados = Array.prototype.slice
                .call(document.querySelectorAll('#novo-aparelho-setores input:checked'))
                .map(function (c) { return c.value; });
            criarAparelho($('novo-aparelho-nome').value, marcados)
                .then(function () { $('novo-aparelho-nome').value = ''; })
                .catch(function () { /* já avisado */ });
        });

        $('btn-importar-codigos').addEventListener('click', function () {
            importarCodigos($('codigos-texto').value, $('codigos-setor').value)
                .then(function () { $('codigos-texto').value = ''; })
                .catch(function () { /* já avisado */ });
        });
```

E, no fim de `desenhar()`, preencher as duas listas que dependem dos setores:

```javascript
        // As caixas de setor do formulário de aparelho, e o seletor de setor dos
        // códigos. Redesenhadas junto com o painel para nunca oferecerem um setor
        // que deixou de existir.
        $('novo-aparelho-setores').innerHTML = '';
        $('codigos-setor').innerHTML = '';
        p.setores.forEach(function (s) {
            var linha = document.createElement('div');
            linha.className = 'opcao';
            var caixa = document.createElement('input');
            caixa.type = 'checkbox';
            caixa.value = s.id;
            caixa.id = 'novo-setor-' + s.id;
            var rot = document.createElement('label');
            rot.setAttribute('for', caixa.id);
            rot.textContent = s.nome;
            linha.appendChild(caixa);
            linha.appendChild(rot);
            $('novo-aparelho-setores').appendChild(linha);

            var op = document.createElement('option');
            op.value = s.id;
            op.textContent = s.nome;
            $('codigos-setor').appendChild(op);
        });
```

- [ ] **Passo 5: rodar a suíte inteira**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/ -q`
Esperado: 21 passando em `test_controle_tela.py`, e nenhuma regressão.

- [ ] **Passo 6: commitar**

```bash
git add frontend/controle.js frontend/controle.html tests/test_controle_tela.py
git commit -m "feat(acesso): aparelhos e codigos do cliente na tela do dono"
```

---

## Tarefa 12: A porta, e a documentação verdadeira

**Arquivos:**
- Modificar: `frontend/evento.html`, `frontend/evento.js`, `docs/STATUS_PROJETO.md`
- Testar: `tests/test_controle_tela.py`

**Interfaces:**
- Consome: tudo o que veio antes.
- Produz: o caminho do `evento.html` até o `controle.html`.

**Por que existe:** hoje a última tela do `evento.html` promete "configurar a lotação de
cada setor e liberar os aparelhos" e não leva a lugar nenhum. Uma promessa sem porta é pior
que nenhuma promessa.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar a `tests/test_controle_tela.py`:

```python
def test_a_tela_do_QR_leva_a_tela_do_dono():
    """A promessa da ultima tela do evento.html passa a ter porta."""
    assert "controle.html" in _ler("frontend/evento.html")


def test_a_porta_carrega_o_evento_recem_cadastrado():
    """Cair na lista de eventos depois de cadastrar um seria mandar o cliente
    procurar o que ele acabou de criar."""
    assert "controle.html?evento=" in _ler("frontend/evento.js")


def test_o_status_do_projeto_conhece_a_tela_nova():
    texto = _ler("docs/STATUS_PROJETO.md")
    assert "controle.html" in texto
    assert "ACESSO_ELEVACAO_SEGREDO" in texto
```

- [ ] **Passo 2: rodar para confirmar que falha**

Rodar: `.\venv\Scripts\python.exe -m pytest tests/test_controle_tela.py -q`
Esperado: FALHA — `controle.html` não aparece no `evento.html`.

- [ ] **Passo 3: abrir a porta**

Em `frontend/evento.html`, dentro do bloco `#pronto`, depois do parágrafo:

```html
            <a id="ir-para-controle" href="#" style="display:block;text-decoration:none;">
                <button>Configurar o evento agora</button>
            </a>
```

Em `frontend/evento.js`, no `.then` que mostra o bloco `pronto`:

```javascript
            $('ir-para-controle').href = '/controle.html?evento=' + encodeURIComponent(d.evento_id);
```

- [ ] **Passo 4: dizer a verdade no `STATUS_PROJETO.md`**

Acrescentar à seção do controle de acesso:

```markdown
**A parte 3a está no ar.** O dono do evento configura tudo em
[frontend/controle.html](../frontend/controle.html): dados do evento, lotação e tipo de uso
de cada setor, aparelhos da portaria com a lista de setores de cada um, e os códigos
próprios de staff e cortesia. Toda escrita exige uma elevação de 15 minutos obtida com a
senha do dono, assinada com `ACESSO_ELEVACAO_SEGREDO` e presa ao navegador — sem ela a tela
se declara somente leitura.

Cada setor mostra lado a lado quanto o ERP encomendou e quanto está publicado. É por aí que
apareceria o risco residual que a parte 2 registrou: quem tivesse o segredo do agente
conseguiria ocupar uma posição da tiragem com um hash próprio.

**Falta a portaria (3b)** — ler o QR, validar sem rede, fila de leituras — e o painel ao
vivo com os relatórios (3c). Cancelar credencial e desvincular pedido do evento também
esperam a 3c.
```

- [ ] **Passo 5: rodar tudo, incluindo os freios de publicação**

Rodar:
```
.\venv\Scripts\python.exe -m pytest tests/ -q
.\ferramentas\conferir.ps1
```
Esperado: toda a suíte passando, e o `conferir.ps1` terminando em `TUDO EM ORDEM` — exceto
o ponto 1, que vai acusar commits ainda não publicados. Isso é esperado: publicar é ação do
usuário.

- [ ] **Passo 6: commitar**

```bash
git add frontend/evento.html frontend/evento.js docs/STATUS_PROJETO.md tests/test_controle_tela.py
git commit -m "feat(acesso): a porta do QR ate a tela do dono, e o STATUS dizendo a verdade"
```

---

## Depois do plano: o que o usuário precisa fazer

Nenhuma tarefa acima publica nada. Quando ele decidir publicar:

1. `ACESSO_ELEVACAO_SEGREDO` precisa existir no **Render**, no serviço `imposicao`. Rodar
   `.\ferramentas\copiar_para_render.ps1 -Somente ACESSO_ELEVACAO_SEGREDO` e colar.
2. Conferir com `curl https://imposicao.onrender.com/api/acesso/saude` — as quatro
   variáveis têm de vir `true`.
3. `.\publicar.ps1 "mensagem"` e, na mesma leva, `.\publicar_agente.ps1 <versão nova>` — a
   `PAINEL_ARQUIVOS` mudou, e sem agente novo as estações não baixam os arquivos novos.
