# Tela de leitura do portão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ingresso bom passar sem interromper ninguém — câmera sempre ligada, faixa verde que troca sozinha, som e vibração — e o barrado continuar travando a tela.

**Architecture:** O `portaria.js` deixa de alternar entre "lendo" e "resposta" no caminho feliz. Ganha um debounce por código, um contador de público alimentado pelo servidor, e um relógio de 5 minutos que baixa só o que muda. Duas responsabilidades novas saem para arquivos próprios e puros: o aviso sonoro e o sincronismo. No servidor, uma rota decide a corrida entre dois portões pelo banco, com `ON CONFLICT DO NOTHING`.

**Tech Stack:** JavaScript ES5 em IIFE sem build; Deno/TypeScript nas Edge Functions; pytest com harness Node/puppeteer para o frontend; PowerShell na publicação.

## Global Constraints

- **Português em tudo** o que o usuário lê, e nos comentários.
- **ES5 em IIFE** nos arquivos de `frontend/`: sem `let`, `const`, arrow, template string ou `class`.
- **Nada de outra origem.** Esta tela abre sem rede; toda dependência é servida de `frontend/`.
- **Texto, nunca HTML** para nome de setor, de portão e motivo de bloqueio.
- **O portão nunca espera rede.** Qualquer ida ao servidor no caminho da leitura tem teto de tempo e queda para a decisão local.
- **Arquivo novo em `frontend/` entra em `security_config.PAINEL_ARQUIVOS`** e na lista do `sw.js`.
- **Versão dos scripts é uma só por página** (teste falha). A desta leva é **615**.
- **Testes:** `.\venv\Scripts\python.exe -m pytest tests/<arquivo> -v` · `.\node_modules\.bin\deno test --allow-all supabase/functions/...`
- **Publicar:** `.\publicar.ps1 "<msg>" -Sim` e `.\publicar_agente.ps1 <versão nova>`. Nunca `-SemFreio`.

---

### Task 1: A tabela que decide a corrida entre dois portões

**Files:**
- Create: `sql/schema_acesso_entradas_unicas.sql`
- Test: `tests/test_schema_acesso_entradas_unicas.py`

**Interfaces:**
- Produces: `producao_acesso_entradas_unicas (credencial_id UUID PRIMARY KEY, evento_id UUID, dispositivo_id UUID, setor_id UUID, momento TIMESTAMPTZ)`. A Task 2 consome.

- [ ] **Step 1: O teste que falha**

`tests/test_schema_acesso_entradas_unicas.py`, no molde do `tests/test_schema_acesso_setor_bloqueado.py` que já existe (leia-o e siga o estilo, inclusive o helper `_sem_comentarios`):

```python
def test_a_chave_primaria_e_a_credencial():
    """E ela que faz o banco decidir a corrida.

    Duas consultas separadas -- "ja existe?" e depois "grava" -- podem se
    cruzar entre dois portoes lendo o mesmo ingresso no mesmo segundo, e os
    dois entram. Chave primaria e `ON CONFLICT DO NOTHING` resolvem isso numa
    operacao so.
    """
    texto = _sem_comentarios().lower()
    assert "credencial_id" in texto
    assert "primary key" in texto


def test_a_tabela_e_separada_da_de_leituras():
    """Setor de reentrada permite entrar varias vezes, e a tabela de leituras
    guarda as duas coisas. Um indice unico la impediria a reentrada."""
    texto = _sem_comentarios().lower()
    assert "producao_acesso_entradas_unicas" in texto
    assert "alter table producao_acesso_leituras" not in texto


def test_guarda_quem_ganhou_a_corrida():
    """Quem perde precisa ouvir QUANDO e em QUAL portao a pessoa entrou --
    senao a recusa vira "nao sei, o sistema nao deixou"."""
    texto = _sem_comentarios().lower()
    for coluna in ("dispositivo_id", "momento", "setor_id", "evento_id"):
        assert coluna in texto


def test_nasce_com_rls_ligado_e_sem_politica():
    """Como as sete tabelas do schema_acesso: quem fala com ela e o backend,
    com a service_role. Com a chave anonima ninguem le nem escreve."""
    texto = _sem_comentarios().lower()
    assert "enable row level security" in texto
```

Mais os testes de forma que o arquivo irmão já tem: existe, é repetível (`if not exists`), e diz como desfazer.

- [ ] **Step 2: Rodar e ver falhar**

`.\venv\Scripts\python.exe -m pytest tests/test_schema_acesso_entradas_unicas.py -v` → FAIL, arquivo não existe.

- [ ] **Step 3: Escrever o SQL**

Arquivo completo e pronto para colar no SQL Editor, com cabeçalho explicando POR QUE a tabela é separada e o "COMO DESFAZER" comentado no fim — é o padrão de `sql/schema_acesso_setor_bloqueado.sql`. A tabela:

```sql
CREATE TABLE IF NOT EXISTS producao_acesso_entradas_unicas (
    -- A chave primaria E o mecanismo. Ver o cabecalho.
    credencial_id UUID PRIMARY KEY,
    evento_id     UUID NOT NULL,
    setor_id      UUID,
    dispositivo_id UUID,
    momento       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE producao_acesso_entradas_unicas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entradas_unicas_evento
    ON producao_acesso_entradas_unicas (evento_id);
```

- [ ] **Step 4: Rodar e ver passar**

- [ ] **Step 5: NÃO commitar.** Outro agente está na mesma pasta; quem commita é quem coordena.

---

### Task 2: As duas rotas novas do servidor

**Files:**
- Modify: `supabase/functions/portaria/index.ts`
- Test: `tests/test_acesso_portaria.py`

**Interfaces:**
- Consumes: a tabela da Task 1.
- Produces:
  - `POST /entrada` — corpo `{credencial_id, setor_id, id_local, momento, resultado, motivo}`. Registra a leitura (como o `/leituras` já faz) e, **se o setor for de entrada única**, tenta reivindicar a entrada. Responde `{primeira: true}` ou `{primeira: false, anterior: {momento, portao}}`. Setor de reentrada responde sempre `{primeira: true}`.
  - `GET /sincronizar?desde=<iso>` — responde `{evento: {ativo}, setores: [{id, bloqueado, bloqueado_motivo, abre_em, fecha_em, tipo_uso}], bloqueios: [...], entradas: [{credencial_id, momento}], totais: {<setor_id>: <entradas>}}`. **Sem credenciais** — é a rota leve.

- [ ] **Step 1: Os testes que falham**

Em `tests/test_acesso_portaria.py`, no estilo do arquivo (que confere o fonte da função, porque o pytest não executa TypeScript):

```python
def test_existe_a_rota_que_decide_a_corrida():
    texto = _ler("supabase/functions/portaria/index.ts")
    assert '"entrada"' in texto
    assert "producao_acesso_entradas_unicas" in texto


def test_a_corrida_e_decidida_pelo_BANCO_e_nao_por_duas_consultas():
    """Perguntar "ja existe?" e so entao gravar deixa dois portoes entrarem
    quando as duas leituras caem no mesmo instante."""
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "ignore-duplicates" in texto or "on_conflict" in texto


def test_reentrada_nao_entra_na_corrida():
    """Setor que permite sair e voltar nao tem "primeira entrada"."""
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "reentrada" in texto


def test_a_rota_leve_NAO_desce_credenciais():
    """E a razao de ela existir: em 4G de portao, a lista de ingressos e a
    diferenca entre alguns kB e varias paginas, a cada cinco minutos."""
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("sincronizar")
    trecho = texto[inicio:inicio + 3000]
    assert "producao_acesso_credenciais" not in trecho


def test_a_rota_leve_traz_as_entradas_de_todos_os_aparelhos():
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("sincronizar")
    trecho = texto[inicio:inicio + 3000]
    assert "entradas" in trecho and "totais" in trecho
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**

Leia o `index.ts` inteiro antes: o `rotaPedida` de `puro.ts` é quem separa o caminho, e as rotas atuais (`entrar`, `faixa`, `leituras`) mostram a forma exata a seguir — `aparelhoDoToken`, `banco()`, `ok()`, `erro()`.

Pontos que não podem sair errados:

- **O aparelho é quem o TOKEN diz que é.** Nunca aceite `dispositivo_id` do corpo — o `/leituras` já documenta isso, e vale igual aqui.
- **A leitura é gravada de qualquer jeito**, ganhando ou perdendo a corrida: é contagem que o cliente pagou para ter. O que muda é o `resultado`/`motivo` gravado.
- **`on_conflict=credencial_id` com `resolution=ignore-duplicates`** e depois um `GET` da linha para saber quem está lá. Se a linha devolvida tiver o `dispositivo_id` deste aparelho, ele ganhou.
- **O `?desde=`** é opcional: sem ele, a rota devolve as entradas todas (é o primeiro sincronismo depois de um boot).

- [ ] **Step 4: `deno check` e os testes**

`.\node_modules\.bin\deno check supabase/functions/portaria/index.ts` e o pytest.

- [ ] **Step 5: NÃO commitar.**

---

### Task 3: O aviso sonoro

**Files:**
- Create: `frontend/aviso-sonoro.js`
- Create: `tests/aviso_sonoro_harness.js`
- Test: `tests/test_aviso_sonoro.py`

**Interfaces:**
- Produces: `window.avisoSonoro` com `liberar()` (chamado no toque que destrava o áudio), `pronto()` → booleano, `liberado()` (bipe curto e agudo + vibração curta), `barrado()` (bipe longo e grave + duas vibrações).

- [ ] **Step 1: Os testes que falham**

Harness no molde de `tests/chaveiro_harness.js` (já existe — leia e copie a estrutura). Ele precisa **dublar** `AudioContext` e `navigator.vibrate` antes de carregar o arquivo, e devolver o que foi pedido a cada um:

```python
def test_liberado_e_barrado_soam_diferente():
    """O porteiro nao esta olhando a tela. Se os dois sons forem iguais, o som
    nao serve para nada."""
    a = chamar("liberado")
    b = chamar("barrado")
    assert a["osciladores"][0]["frequencia"] != b["osciladores"][0]["frequencia"]
    assert a["osciladores"][0]["duracao"] < b["osciladores"][0]["duracao"]


def test_barrado_vibra_mais_que_liberado():
    assert sum(chamar("barrado")["vibracao"]) > sum(chamar("liberado")["vibracao"])


def test_navegador_sem_vibrar_NAO_lanca():
    """iPhone nao tem `navigator.vibrate`. Uma excecao aqui derrubaria a
    leitura inteira por causa de um enfeite."""
    r = chamar("liberado", sem_vibrar=True)
    assert r["lancou"] is None


def test_navegador_sem_audio_NAO_lanca():
    r = chamar("liberado", sem_audio=True)
    assert r["lancou"] is None


def test_antes_de_liberar_nao_toca():
    """Navegador nenhum toca audio antes de um gesto. Tentar assim mesmo falha
    em silencio -- e silencio e o modo de errar que esta tela evita."""
    r = chamar("liberado", sem_liberar=True)
    assert r["osciladores"] == []
    assert r["pronto"] is False
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Escrever o arquivo**

ES5 em IIFE. `liberar()` cria o `AudioContext` (é o gesto que o navegador exige) e toca um som de duração zero para destravar. Tudo dentro de `try/catch`: som é enfeite, e enfeite não pode derrubar a leitura.

- [ ] **Step 4: Rodar e ver passar** · **Step 5: NÃO commitar.**

---

### Task 4: O sincronismo de 5 minutos

**Files:**
- Create: `frontend/portaria-sincronismo.js`
- Create: `tests/sincronismo_harness.js`
- Test: `tests/test_portaria_sincronismo.py`

**Interfaces:**
- Consumes: `window.portariaDeposito` (Task 5).
- Produces: `window.portariaSincronismo` com:
  - `aplicar(carga, novidade)` → a carga nova, **pura**, sem rede e sem IndexedDB. É ela que os testes exercitam.
  - `ligar(pedir, aoAplicar)` / `desligar()` — o relógio de 5 minutos.
  - `INTERVALO_MS` = 300000.

- [ ] **Step 1: Os testes que falham**

```python
def test_aplicar_troca_o_estado_do_evento():
    nova = aplicar(carga(), {"evento": {"ativo": False}})
    assert nova["evento"]["ativo"] is False


def test_aplicar_bloqueia_o_setor_sem_perder_o_resto_dele():
    """A rota leve manda so o que muda. Se `aplicar` substituir o setor
    inteiro, some a quantidade contratada -- e o contador quebra."""
    nova = aplicar(carga(), {"setores": [{"id": PISTA, "bloqueado": True,
                                          "bloqueado_motivo": "Interditado"}]})
    setor = [s for s in nova["setores"] if s["id"] == PISTA][0]
    assert setor["bloqueado"] is True
    assert setor["quantidade"] == 600


def test_aplicar_NAO_apaga_credenciais():
    """A rota leve nao as manda. Substituir a carga pelo que veio esvaziaria o
    evento inteiro e o portao recusaria todo mundo como "desconhecido"."""
    nova = aplicar(carga(), {"evento": {"ativo": True}})
    assert len(nova["credenciais"]) == 2


def test_aplicar_junta_as_entradas_de_outros_aparelhos():
    nova = aplicar(carga(), {"entradas": [{"credencial_id": "c-vip-9",
                                           "momento": "2026-08-20T22:10:00Z"}]})
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T22:10:00Z"


def test_entrada_local_mais_antiga_vence_a_do_servidor():
    """Quem entrou primeiro entrou primeiro. O relogio do servidor nao pode
    reescrever um horario que este aparelho registrou antes."""
    c = carga(); c["entradas"] = {"c-vip-9": "2026-08-20T21:00:00Z"}
    nova = aplicar(c, {"entradas": [{"credencial_id": "c-vip-9",
                                     "momento": "2026-08-20T22:10:00Z"}]})
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T21:00:00Z"


def test_novidade_vazia_nao_muda_nada():
    assert aplicar(carga(), {}) == carga()


def test_o_intervalo_e_de_cinco_minutos():
    assert chamar_valor("INTERVALO_MS") == 300000
```

- [ ] **Step 2 a 4:** falhar, escrever, passar. **Step 5: NÃO commitar.**

---

### Task 5: O depósito guarda entradas de fora e os totais

**Files:**
- Modify: `frontend/portaria-deposito.js`
- Test: `tests/test_portaria_deposito.py`

**Interfaces:**
- Produces: `gravarEntradas(mapa)` (junta as entradas vindas do servidor às locais, sem apagar as locais) e `gravarTotais(mapa)` / `lerTotais()`.

- [ ] **Step 1: Os testes que falham**

Leia `tests/test_portaria_deposito.py` e `tests/portaria_deposito_harness.js` antes — eles já existem e têm a forma a seguir.

```python
def test_gravar_entradas_do_servidor_nao_apaga_as_locais():
    """A fila local pode ter leituras que ainda nao subiram. Substituir o mapa
    inteiro pelo do servidor apagaria justamente as que faltam contar."""


def test_totais_sobrevivem_ao_fechar_o_aplicativo():
    """O contador nao pode nascer zerado a cada abertura -- no meio do evento
    isso e um numero errado na tela do porteiro."""
```

- [ ] **Step 2 a 4.** **Step 5: NÃO commitar.**

---

### Task 6: A tela

**Files:**
- Modify: `frontend/portaria.html`, `frontend/portaria.js`
- Test: `tests/test_portaria_tela.py`

**Interfaces:**
- Consumes: `window.avisoSonoro` (3), `window.portariaSincronismo` (4), `window.portariaDeposito` (5).

- [ ] **Step 1: Os testes que falham**

```python
def test_ingresso_bom_NAO_desliga_a_camera():
    """O caso comum e o ingresso bom, e ele nao deveria pedir nada de ninguem.
    Dois mil ingressos eram dois mil toques em "Ler o proximo"."""


def test_o_mesmo_codigo_e_ignorado_por_2_segundos():
    """A camera le o mesmo QR ~20x por segundo enquanto o papel estiver na
    frente da lente. Sem isto, o segundo disparo cai em `ja_entrou` e pinta a
    tela de VERMELHO para um ingresso BOM, um piscar depois do verde."""


def test_outro_codigo_passa_na_hora():
    """O silencio e por CODIGO, nao por tempo de tela."""


def test_ingresso_barrado_TRAVA_e_oferece_ler_o_proximo():
    """Recusa e a unica coisa que exige que o porteiro tenha visto."""


def test_a_faixa_verde_mostra_setor_numero_e_hora():
    """A hora foi pedida pelo usuario: numa fila rapida, sem ela o porteiro nao
    distingue "acabou de passar" de "isto e de trinta segundos atras"."""


def test_o_contador_soma_todos_os_setores_deste_portao_sobre_o_contratado():
    """Decisao do usuario: um numero so, sem seletor de setor para tocar por
    engano no escuro."""


def test_saiu_o_botao_de_atualizar_o_evento():
    """Ele existia porque nao havia sincronismo automatico."""


def test_a_lanterna_e_o_digitar_ficam_no_rodape():


def test_ha_um_retorno_no_topo_e_ele_NAO_exige_fila_zerada():
    """A trava da fila existe para quando o aparelho troca de IDENTIDADE. Ir e
    voltar da lista nao troca o token, e a fila sobe igual."""


def test_a_leitura_comeca_com_um_toque_que_libera_o_som():
    """Navegador nenhum toca audio antes de a pessoa encostar na tela."""
```

- [ ] **Step 2 a 4.** **Step 5: NÃO commitar.**

---

### Task 7: Amarrar, ver funcionando e publicar

- [ ] **Step 1:** `security_config.PAINEL_ARQUIVOS` e `frontend/sw.js` ganham `aviso-sonoro.js` e `portaria-sincronismo.js`. Todo `?v=` do `portaria.html` vira `615` (o `publicar.ps1` renumera sozinho, mas os testes rodam antes dele).
- [ ] **Step 2:** suíte inteira: pytest, `deno test`, Pester.
- [ ] **Step 3:** skill `rodar-app` — ver o verde não interromper, o vermelho travar, e o contador aparecer.
- [ ] **Step 4:** `.\ferramentas\conferir.ps1`.
- [ ] **Step 5:** `.\ferramentas\rodar_sql.ps1 sql\schema_acesso_entradas_unicas.sql`.
- [ ] **Step 6:** `.\publicar.ps1 "<msg>" -Sim` — ele publica as Edge Functions junto.
- [ ] **Step 7:** `.\publicar_agente.ps1 1.2.109`. Obrigatório: o executável embute uma cópia do frontend.
