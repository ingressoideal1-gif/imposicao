# Fechar a porta da imposição na nuvem — plano de implementação

> **Para quem for executar:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para
> marcação.

**Objetivo:** fazer com que imposição e impressão só possam acontecer na estação da
gráfica — o painel deixa de desviar o trabalho para o Render, e o motor na nuvem passa a
recusar impor.

**Arquitetura:** duas barreiras independentes, porque uma sozinha não basta. No **cliente**,
o painel para de ter para onde desviar e recusa começar quando não acha estação. No
**servidor**, o `/api/impose` recusa quando está rodando na nuvem — assim um painel antigo,
já em cache no navegador de alguma estação, também é barrado.

**Decisão que originou:** `docs/superpowers/specs/2026-08-15-migrar-render-para-supabase-design.md`,
a partir de "até por questão de segurança, impressão só pode acontecer pela estação da
gráfica" (usuário, 15/08/2026).

**Tecnologias:** Python 3.10 / FastAPI / pytest no motor; JavaScript sem framework no
painel; testes de frontend por leitura do arquivo, no estilo já usado em
`tests/test_estacao_bloqueada_pelo_navegador.py`.

## Restrições globais

- **A recusa tem de dizer ao operador o que fazer.** Mensagem que só diz "erro" é falha de
  implementação neste projeto. O endereço `http://localhost:9000` aparece na frase.
- **A sondagem da estação está duplicada** entre `frontend/script.js` e
  `frontend/pedido.js`. Toda mudança de comportamento vale para os **dois** arquivos, e o
  teste lê os dois. Este projeto já perdeu uma madrugada com cópias divergentes.
- **Sem acentos no código-fonte JavaScript e nas mensagens**, seguindo o que já existe
  nessas funções (o arquivo mistura, mas as mensagens do operador nessas telas são sem
  acento).
- **A suíte roda com `filterwarnings = error::pytest.PytestUnhandledThreadExceptionWarning`**
  (ver `pytest.ini`). Thread que morre derruba o teste — é de propósito.
- **Nada aqui altera o agente da estação em comportamento**: na estação,
  `is_cloud_runtime()` é falso e tudo segue igual.
- **Publicação:** o agente sai junto com o site, sempre. Ver Tarefa 5.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade nesta mudança |
|---|---|
| `app.py` | `/api/impose` ganha a recusa na nuvem (linha ~789) |
| `frontend/script.js` | remove `MOTOR_NUVEM`/`baseParaImposicao`; o ramo "sem estação" recusa; a frase de aviso vira frase de recusa |
| `frontend/pedido.js` | o mesmo ramo "sem estação" recusa; usa `baseUrl` direto no upload |
| `tests/test_imposicao_so_na_estacao.py` | **criar** — cobre as duas barreiras |
| `tests/test_estacao_bloqueada_pelo_navegador.py` | atualizar — a frase mudou de sentido |

---

## Um defeito que existe hoje e some junto

Vale saber antes de mexer, porque explica por que a Tarefa 3 não é só limpeza.

`baseParaImposicao` ([script.js:3552](../../../frontend/script.js#L3552)) devolve o endereço
da estação **só quando ele é `localhost` ou `127.0.0.1`** — é o que
`ehEnderecoDaPropriaMaquina` testa. Em qualquer outro caso, devolve a nuvem.

Mas a sondagem da estação também tenta o **IP de LAN** do agente
([script.js:10109](../../../frontend/script.js#L10109)), vindo de
`_activeAgentData.printers_json.local_ip`. Quando a estação é achada por esse endereço —
por exemplo `http://192.168.1.50:9000` — acontece isto:

1. `localActive = true`, e a tela mostra o selo **"⚡ AGENTE LOCAL"**;
2. `baseUrl = "http://192.168.1.50:9000"`;
3. `baseParaImposicao` olha esse endereço, vê que não é `localhost`, e devolve **a nuvem**.

Ou seja: a tela diz AGENTE LOCAL e o trabalho vai para o Render — o mesmo modo de falhar de
15/08/2026, por outro caminho. Remover o desvio corrige isso de graça.

---

### Tarefa 1: O motor na nuvem recusa impor

**Arquivos:**
- Modificar: `app.py:789` (início de `impose_file`)
- Criar: `tests/test_imposicao_so_na_estacao.py`

**Interfaces:**
- Consome: `security_config.is_cloud_runtime()`, que já existe (`security_config.py:145`) e
  já é usada por `/api/update`.
- Produz: `POST /api/impose` responde **403** com `detail` contendo `localhost:9000` quando
  na nuvem.

**Por que 403 e não 404:** os outros endpoints que recusam na nuvem (`/api/update`) usam 404
para esconder que existem, o que é certo para manutenção do agente. Aqui é o contrário: o
operador precisa **ler o motivo**, porque a mensagem é o que o manda para a estação. O 403
com `detail` chega ao operador por `descreverErroHttp`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/test_imposicao_so_na_estacao.py`:

```python
# -*- coding: utf-8 -*-
"""Imposicao e impressao so acontecem na estacao da grafica.

O QUE ESTE TESTE PREVINE

Ate 15/08/2026 o painel, quando nao achava a estacao, mandava o trabalho para o
motor na nuvem: o PDF da arte inteiro -- o material do cliente, centenas de MB --
subia para um servidor de terceiro, e o operador via apenas um selo discreto
escrito "NUVEM" no meio dos numeros do progresso.

Em 15/08/2026 o usuario decidiu que isso acaba: "ate por questao de seguranca,
impressao so pode acontecer pela estacao da grafica".

Sao DUAS barreiras, e este arquivo cobra as duas:

1. o painel nao tem mais para onde desviar, e recusa comecar sem estacao;
2. o motor na nuvem recusa impor -- porque um painel antigo, em cache no
   navegador de alguma estacao, continuaria tentando por semanas.
"""
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"


def test_na_nuvem_o_motor_recusa_impor(monkeypatch):
    import security_config
    import app as app_mod
    monkeypatch.setattr(security_config, "is_cloud_runtime", lambda: True)

    cliente = TestClient(app_mod.app)
    r = cliente.post("/api/impose", data={"payload": "{}"})

    assert r.status_code == 403, (
        f"a nuvem aceitou impor (status {r.status_code})"
    )


def test_a_recusa_diz_ao_operador_o_que_fazer(monkeypatch):
    """Recusa sem saida ensina o operador a procurar defeito onde nao ha."""
    import security_config
    import app as app_mod
    monkeypatch.setattr(security_config, "is_cloud_runtime", lambda: True)

    cliente = TestClient(app_mod.app)
    r = cliente.post("/api/impose", data={"payload": "{}"})

    detalhe = (r.json().get("detail") or "").lower()
    assert "localhost:9000" in detalhe, (
        "a recusa nao diz o endereco pelo qual o trabalho funciona"
    )
    assert "estacao" in detalhe, "a recusa nao diz onde a imposicao acontece"


def test_na_estacao_o_motor_nao_recusa(monkeypatch):
    """A barreira e da NUVEM. Na estacao nao pode existir.

    Nao se afirma 200 aqui: sem arte nem payload de verdade a imposicao falha por
    outro motivo, e isso e esperado. O que nao pode e ser 403.
    """
    import security_config
    import app as app_mod
    monkeypatch.setattr(security_config, "is_cloud_runtime", lambda: False)

    cliente = TestClient(app_mod.app)
    r = cliente.post("/api/impose", data={"payload": "{}"})

    assert r.status_code != 403, "a estacao esta recusando impor"
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
python -m pytest tests/test_imposicao_so_na_estacao.py -v
```

Esperado: `test_na_nuvem_o_motor_recusa_impor` e `test_a_recusa_diz_ao_operador_o_que_fazer`
FALHAM (o motor aceita e responde outro status). O terceiro já passa.

- [ ] **Passo 3: Implementar a recusa**

Em `app.py`, como **primeira instrução** do corpo de `impose_file` (logo depois da
assinatura, antes do `try`):

```python
    # 15/08/2026: imposicao e impressao so acontecem na estacao da grafica.
    # Decisao de seguranca do usuario -- ver
    # docs/superpowers/specs/2026-08-15-migrar-render-para-supabase-design.md
    #
    # Esta e a SEGUNDA barreira. A primeira e o painel, que nao desvia mais para
    # ca. Esta existe porque painel fica em cache no navegador da estacao: sem
    # ela, uma copia antiga continuaria mandando a arte do cliente para a nuvem
    # por semanas, sem ninguem perceber.
    #
    # 403 e nao 404 de proposito: aqui o operador PRECISA ler o motivo, porque a
    # mensagem e o que o manda para a estacao. O /api/update esconde; este avisa.
    if security_config.is_cloud_runtime():
        raise HTTPException(
            status_code=403,
            detail=("A imposicao so roda na estacao da grafica. Abra o painel por "
                    "http://localhost:9000, na maquina onde o NewProd esta aberto, "
                    "e refaca o trabalho por la."),
        )
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```
python -m pytest tests/test_imposicao_so_na_estacao.py -v
```

Esperado: 3 passed.

- [ ] **Passo 5: Confirmar que nada mais quebrou**

```
python -m pytest tests/test_onde_estou_rodando.py tests/test_api_qr_ideal.py -v
```

Esperado: tudo passa. Estes dois tocam o mesmo `app.py` e o mesmo `security_config`.

- [ ] **Passo 6: Commit**

```bash
git add app.py tests/test_imposicao_so_na_estacao.py
git commit -m "Imposicao: o motor na nuvem recusa impor"
```

---

### Tarefa 2: Sem estação, o painel recusa começar

**Arquivos:**
- Modificar: `frontend/script.js:10203-10213` (o ramo `else` da sondagem)
- Modificar: `frontend/script.js:3588-3595` (`explicarEstacaoNaoEncontrada` — a frase mudou
  de sentido: não é mais "vai para a nuvem", é "não dá para fazer")
- Modificar: `frontend/pedido.js:4854-4862` (o mesmo ramo `else`)
- Modificar: `tests/test_estacao_bloqueada_pelo_navegador.py` (a frase que ele cobra mudou)
- Modificar: `tests/test_imposicao_so_na_estacao.py` (acrescentar os testes de painel)

**Interfaces:**
- Consome: `explicarEstacaoNaoEncontrada(origem)` e `ehEnderecoDaPropriaMaquina(url)`, ambas
  já existentes em `script.js` e expostas em `window`.
- Produz: nas duas telas, o ramo sem estação termina em `throw` — a requisição de imposição
  nunca chega a ser montada.

**Cuidado com a frase vazia:** `explicarEstacaoNaoEncontrada` devolve `''` de propósito
quando a página já vem da própria máquina (`localhost:9000`) — ali não há navegador
bloqueando nada, o NewProd é que está fechado. Esse caso precisa de frase própria, senão a
recusa fica muda exatamente na estação.

- [ ] **Passo 1: Escrever os testes que falham**

Acrescentar ao fim de `tests/test_imposicao_so_na_estacao.py`:

```python
# As telas que impoem. Ambas carregam script.js antes de pedido.js.
TELAS = ["script.js", "pedido.js"]


def _texto(nome):
    return (FRONT / nome).read_text(encoding="utf-8")


def test_nenhuma_tela_continua_sem_estacao():
    """Sem estacao, o trabalho para. Nao ha caminho alternativo."""
    culpados = []
    for nome in TELAS:
        corpo = _texto(nome)
        if "explicarEstacaoNaoEncontrada" not in corpo:
            culpados.append(f"{nome}: nao trata a estacao ausente")
            continue
        if "recusaSemEstacao" not in corpo:
            culpados.append(f"{nome}: nao recusa quando a estacao nao responde")
    assert not culpados, "\n  ".join(["tela que segue sem estacao:"] + culpados)


def test_a_recusa_do_painel_nunca_fica_muda():
    """Servido pelo proprio agente, `explicarEstacaoNaoEncontrada` devolve ''
    de proposito -- ali nao ha navegador bloqueando, o NewProd e que esta
    fechado. Sem frase de reserva, a recusa fica muda justamente na estacao."""
    culpados = []
    for nome in TELAS:
        corpo = _texto(nome)
        if "recusaSemEstacao" not in corpo:
            continue
        if "|| 'A estacao (NewProd) nao respondeu" not in corpo:
            culpados.append(f"{nome}: sem frase de reserva quando o aviso vem vazio")
    assert not culpados, "\n  ".join(["recusa muda:"] + culpados)


def test_a_frase_nao_promete_mais_a_nuvem():
    """A frase antiga dizia que o trabalho ia para a nuvem "mais devagar". Ela
    virou mentira no instante em que a nuvem parou de aceitar."""
    corpo = _texto("script.js")
    assert "vai para a nuvem" not in corpo, (
        "a frase ainda promete ao operador um caminho que nao existe mais"
    )
```

- [ ] **Passo 2: Rodar e confirmar que falham**

```
python -m pytest tests/test_imposicao_so_na_estacao.py -v
```

Esperado: os três novos FALHAM (`recusaSemEstacao` não existe; a frase antiga ainda está
lá).

- [ ] **Passo 3: Reescrever a frase em `script.js`**

Substituir o corpo de `explicarEstacaoNaoEncontrada` (linha ~3588). O comentário grande
acima dela continua valendo e **não deve ser apagado** — ele é o registro do Chrome 151;
só o parágrafo que fala em cair na nuvem precisa virar o novo motivo.

```js
function explicarEstacaoNaoEncontrada(origem) {
    if (ehEnderecoDaPropriaMaquina(origem || window.location.origin)) return '';
    return 'A estacao (NewProd) nao foi encontrada, entao este trabalho NAO pode ser feito: '
        + 'imposicao e impressao so acontecem na estacao da grafica. Se o NewProd esta aberto '
        + 'nesta maquina, quem bloqueou foi o navegador — pagina da internet nao pode mais '
        + 'falar com a propria maquina. Abra o painel por http://localhost:9000 e refaca por la.';
}
```

- [ ] **Passo 4: Trocar o ramo `else` em `script.js`**

Substituir o bloco `else { ... }` da sondagem (linha ~10203):

```js
        } else {

            // 15/08/2026: nao existe mais caminho para a nuvem. Imposicao e
            // impressao so acontecem na estacao -- decisao de seguranca do
            // usuario. Ver docs/superpowers/specs/2026-08-15-migrar-render-para-supabase-design.md
            //
            // O trabalho PARA aqui, antes de montar o FormData: sem isto a arte
            // do cliente ja teria sido lida para a memoria a toa.
            const recusaSemEstacao = explicarEstacaoNaoEncontrada(window.location.origin)
                || 'A estacao (NewProd) nao respondeu nesta maquina. Abra o NewProd e tente de novo.';
            if (sub) sub.innerHTML = `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#7f1d1d;color:#fee2e2;font-size:0.85rem;line-height:1.45;text-align:left;font-weight:600;">&#9888; ${recusaSemEstacao}</div>`;
            console.warn('[Imposition] ' + recusaSemEstacao);
            throw new Error(recusaSemEstacao);

        }
```

Observação: a variável `avisoDaNuvem`, declarada antes da sondagem, deixa de ser
alimentada aqui. Ela é usada no `catch` (`const causa = avisoDaNuvem ? ...`) para colar o
motivo na mensagem de erro; agora o motivo **já é** a mensagem do erro, então ela fica
vazia e o `catch` continua correto sem alteração.

- [ ] **Passo 5: Trocar o ramo `else` em `pedido.js`**

O mesmo bloco, na linha ~4854 de `frontend/pedido.js`. O código é repetido de propósito —
os dois arquivos são duas telas com sondagens separadas, e este projeto já se queimou
tentando compartilhar essa parte:

```js
        } else {

            // 15/08/2026: nao existe mais caminho para a nuvem. Imposicao e
            // impressao so acontecem na estacao -- decisao de seguranca do
            // usuario. Ver docs/superpowers/specs/2026-08-15-migrar-render-para-supabase-design.md
            const recusaSemEstacao = (typeof explicarEstacaoNaoEncontrada === 'function'
                ? explicarEstacaoNaoEncontrada(window.location.origin) : '')
                || 'A estacao (NewProd) nao respondeu nesta maquina. Abra o NewProd e tente de novo.';
            if (sub) sub.innerHTML = `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#7f1d1d;color:#fee2e2;font-size:0.85rem;line-height:1.45;text-align:left;font-weight:600;">&#9888; ${recusaSemEstacao}</div>`;
            console.warn('[Imposition] ' + recusaSemEstacao);
            throw new Error(recusaSemEstacao);

        }
```

- [ ] **Passo 6: Atualizar `tests/test_estacao_bloqueada_pelo_navegador.py`**

Dois testes daquele arquivo cobram a frase antiga e o selo "NUVEM", que deixaram de existir.
Eles não devem ser apagados — o Chrome 151 continua bloqueando a estação, e é isso que eles
protegem. Atualizar assim:

Em `test_a_explicacao_existe_e_diz_o_que_fazer`, trocar a lista de palavras cobradas:

```python
    for palavra in ("estacao", "navegador"):
        assert palavra in frase.lower(), f"o aviso nao menciona {palavra!r}"
```

E substituir `test_NENHUMA_tela_cai_na_nuvem_sem_dizer_o_motivo` e
`test_a_mensagem_de_erro_carrega_o_motivo` por um único teste, já que o selo que eles
procuravam some:

```python
def test_NENHUMA_tela_conhece_um_motor_de_imposicao_na_nuvem():
    """A regra lida dos proprios arquivos, e nao de uma lista que alguem precise
    lembrar de atualizar: nenhuma tela pode ter endereco de nuvem para onde
    mandar imposicao."""
    culpados = []
    for nome in TELAS:
        corpo = _texto(nome)
        if "MOTOR_NUVEM" in corpo or "baseParaImposicao" in corpo:
            culpados.append(f"{nome}: ainda conhece um motor de imposicao na nuvem")
        if "NUVEM</span>" in corpo:
            culpados.append(f"{nome}: ainda mostra o selo NUVEM")
    assert not culpados, "\n  ".join(["tela com caminho para a nuvem:"] + culpados)
```

Este teste só passa depois da Tarefa 3 — o que é correto e proposital: ele é a trava que
obriga a limpeza a acontecer.

- [ ] **Passo 7: Rodar e confirmar o estado esperado**

```
python -m pytest tests/test_imposicao_so_na_estacao.py tests/test_estacao_bloqueada_pelo_navegador.py -v
```

Esperado: tudo passa **menos** `test_NENHUMA_tela_conhece_um_motor_de_imposicao_na_nuvem`,
que continua falhando porque `MOTOR_NUVEM` ainda existe. É a Tarefa 3 que o resolve.

- [ ] **Passo 8: Commit**

```bash
git add frontend/script.js frontend/pedido.js tests/test_imposicao_so_na_estacao.py tests/test_estacao_bloqueada_pelo_navegador.py
git commit -m "Imposicao: sem estacao, o painel recusa em vez de ir para a nuvem"
```

---

### Tarefa 3: Remover o desvio para a nuvem

**Arquivos:**
- Modificar: `frontend/script.js:3524-3557` (apagar `MOTOR_NUVEM` e `baseParaImposicao`)
- Modificar: `frontend/script.js:10262` (usar `baseUrl` direto)
- Modificar: `frontend/pedido.js:4888-4893` (usar `baseUrl` direto)

**Interfaces:**
- `ehEnderecoDaPropriaMaquina` **continua existindo** — `explicarEstacaoNaoEncontrada`
  depende dela, e `tests/test_estacao_bloqueada_pelo_navegador.py` cobra essa dependência.
- `baseParaImposicao` e `MOTOR_NUVEM` deixam de existir. Não há outro consumidor: a busca
  em `frontend/*.js` e `tests/` devolve só os pontos listados acima.

**Por que a razão original de `baseParaImposicao` evaporou:** ela existia para o upload
grande não passar pelo rewrite da Vercel, que recusa corpos grandes com
`FUNCTION_PAYLOAD_TOO_LARGE`. Agora o destino é sempre `http://localhost:8080` ou
`http://...:9000` — endereços diretos, sem Vercel no caminho. O problema não pode mais
ocorrer.

- [ ] **Passo 1: Confirmar que o teste que cobra a limpeza está falhando**

```
python -m pytest tests/test_estacao_bloqueada_pelo_navegador.py::test_NENHUMA_tela_conhece_um_motor_de_imposicao_na_nuvem -v
```

Esperado: FALHA, apontando `script.js` e `pedido.js`.

- [ ] **Passo 2: Apagar a constante e a função em `script.js`**

Remover, a partir da linha ~3524, o bloco que vai do comentário
`/** Endereço do motor na nuvem ... */` até `window.baseParaImposicao = baseParaImposicao;`,
**preservando** `ehEnderecoDaPropriaMaquina` e sua linha `window.ehEnderecoDaPropriaMaquina`,
que ficam no meio dele. No lugar do que saiu, deixar o registro:

```js
/**
 * NAO EXISTE motor de imposicao na nuvem, e nao deve voltar a existir.
 *
 * Ate 15/08/2026 havia aqui um `baseParaImposicao()` que, quando a pagina nao
 * estava em localhost, mandava o upload para `imposicao.onrender.com`. Isso
 * significava que a arte do cliente -- centenas de MB -- saia da grafica para um
 * servidor de terceiro, e o operador via so um selo discreto escrito "NUVEM".
 *
 * O usuario encerrou o assunto: "ate por questao de seguranca, impressao so pode
 * acontecer pela estacao da grafica". Sem estacao, o trabalho para e o operador
 * le por que.
 *
 * Ver docs/superpowers/specs/2026-08-15-migrar-render-para-supabase-design.md
 */
```

- [ ] **Passo 3: Usar `baseUrl` direto nas duas chamadas**

Em `frontend/script.js`, linha ~10261:

```js
        // O destino e sempre a estacao (localhost:8080 ou :9000): endereco
        // direto, sem a Vercel no caminho e sem limite de corpo.
        const urlImpose = `${baseUrl}/api/impose`;
```

Em `frontend/pedido.js`, linha ~4888:

```js
        // O destino e sempre a estacao: endereco direto, sem a Vercel no caminho.
        const urlImpose = `${baseUrl}/api/impose`;
```

- [ ] **Passo 4: Confirmar que não sobrou referência**

```
grep -rn "MOTOR_NUVEM\|baseParaImposicao" frontend/ tests/
```

Esperado: nenhuma linha, exceto as que estão dentro de comentários explicando que aquilo
não existe mais.

- [ ] **Passo 5: Rodar a suíte inteira**

```
python -m pytest tests/ -q
```

Esperado: tudo passa. Se `tests/test_painel_estacao.py` ou algum harness de navegador
reclamar, é sinal de consumidor não mapeado — investigar antes de seguir, não contornar.

- [ ] **Passo 6: Commit**

```bash
git add frontend/script.js frontend/pedido.js
git commit -m "Imposicao: remove o desvio do painel para o motor na nuvem"
```

---

### Tarefa 4: Ver funcionando de verdade

Teste não substitui olhar a tela. Esta tarefa não tem código; ela existe porque a mudança
é sobre o que o **operador** vê no momento em que o trabalho não acontece.

- [ ] **Passo 1: Subir o app e conferir os dois caminhos**

Usar a skill `rodar-app` do projeto. Conferir, nesta ordem:

1. **Com o NewProd aberto**, impor um trabalho pequeno pelo painel em
   `http://localhost:9000`: tem de funcionar exatamente como antes, com o selo
   "⚡ AGENTE LOCAL".
2. **Com o NewProd fechado**, tentar impor pelo painel publicado: tem de aparecer a tarja
   vermelha com a frase, e **nenhuma requisição** para `imposicao.onrender.com` na aba
   Network.

- [ ] **Passo 2: Conferir a segunda barreira direto no motor**

```bash
curl -i -X POST https://imposicao.onrender.com/api/impose -F "payload={}"
```

Esperado: `403`, com a frase que manda abrir `http://localhost:9000`. Só dá para conferir
**depois** de publicar; até lá, o teste do Passo 5 da Tarefa 1 é a garantia.

---

### Tarefa 5: Documentar e publicar

- [ ] **Passo 1: Atualizar a documentação que passou a mentir**

Conferir e corrigir onde a imposição na nuvem é descrita como caminho válido:

```
grep -rn -i "imposicao na nuvem\|motor da nuvem\|cai na nuvem\|nuvem (Render)" docs/*.md *.md
```

Pelo menos `docs/README.md` e `GUIA_AGENTE.md` precisam dizer que a estação é o único
caminho. O `CHANGELOG.md` ganha a entrada da mudança.

- [ ] **Passo 2: Commit da documentação**

```bash
git add docs/ CHANGELOG.md GUIA_AGENTE.md
git commit -m "Docs: a imposicao so acontece na estacao"
```

- [ ] **Passo 3: Conferir antes de publicar**

```powershell
.\ferramentas\conferir.ps1
```

Esperado: sem pontos de atenção além dos já conhecidos. Relatar ao usuário o que aparecer.

- [ ] **Passo 4: Publicar — o usuário decide a hora**

Publicar não é ação do assistente. Preparar, avisar e recomendar; o usuário dispara:

```powershell
.\publicar.ps1 "Imposicao e impressao so na estacao da grafica"
.\publicar_agente.ps1 <versao nova>
```

**Os dois comandos, sempre.** O executável embute uma cópia do frontend, e a mudança do
painel só chega inteira à estação nova pelo agente. Publicar só o site deixa estação recém
instalada nascendo com o painel antigo — que ainda desvia para a nuvem, e é justamente o
que esta mudança fecha.

---

## Auto-revisão

**Cobertura da decisão.** A decisão pedia que impressão e imposição só aconteçam na
estação. Tarefa 1 fecha o servidor; Tarefas 2 e 3 fecham o cliente; Tarefa 4 confirma na
tela; Tarefa 5 alinha a documentação e publica nas estações. Sem lacuna.

**Consistência de nomes.** `recusaSemEstacao` é o nome da variável nas duas telas e é o que
o teste procura. `explicarEstacaoNaoEncontrada` e `ehEnderecoDaPropriaMaquina` mantêm os
nomes atuais. `is_cloud_runtime` é a função existente, não uma nova.

**Ordem de falha proposital.** O teste
`test_NENHUMA_tela_conhece_um_motor_de_imposicao_na_nuvem` é escrito na Tarefa 2 e só passa
na Tarefa 3. Isso está declarado nos dois lugares para que quem executar não pense que
quebrou algo.

**Fora de escopo, de propósito.** Nada aqui desliga o Render nem move endpoint algum para o
Supabase — isso é das Fases 2 a 4 do documento de decisão. Depois desta fase o Render
continua no ar, servindo controle de acesso e catálogo, apenas sem impor.
