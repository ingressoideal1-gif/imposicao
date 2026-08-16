# -*- coding: utf-8 -*-
import time
import datetime
import json
import os
import re
import sys
import uuid
import shutil
import tempfile
import threading
import urllib.request
import urllib.error
import urllib.parse

import db
import print_service
import ppd_parser
import hotfolder

# O config fica num caminho fixo por maquina, nao ao lado do executavel: antes,
# rodar do codigo-fonte ou reinstalar em outra pasta gerava um AGENT_ID novo e
# uma linha nova em print_agents. Uma unica maquina chegou a acumular 21
# registros, todos com status "online", porque nada nunca os remove.
_APPDATA = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
_CONFIG_DIR = os.path.join(_APPDATA, "NewProd Agent")
try:
    os.makedirs(_CONFIG_DIR, exist_ok=True)
except Exception:
    _CONFIG_DIR = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
CONFIG_FILE = os.path.join(_CONFIG_DIR, "agent_config.json")

# Caminho antigo, para herdar o ID de quem ja estava instalado em vez de
# aparecer como agente novo depois da atualizacao.
_CONFIG_ANTIGO = os.path.join(
    os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)),
    "agent_config.json")

AGENT_ID = None
for _origem in (CONFIG_FILE, _CONFIG_ANTIGO):
    if AGENT_ID:
        break
    if os.path.exists(_origem):
        try:
            with open(_origem, "r") as f:
                AGENT_ID = json.load(f).get("agent_id")
        except Exception:
            pass

if not AGENT_ID:
    AGENT_ID = str(uuid.uuid4())
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump({"agent_id": AGENT_ID}, f)
    except Exception:
        pass

AGENT_NAME = os.environ.get("COMPUTERNAME", "Agente Ideal")

def _relay_ativo() -> bool:
    """O relay de nuvem depende só de haver URL e chave.

    NÃO usar db.IS_SUPABASE_ACTIVE aqui. Ela é False de propósito no executável
    (db.py força isso quando sys.frozen) para que o CATÁLOGO seja lido do
    formats_db.json local — decisão de desempenho, porque a imposição roda na
    estação e não pode depender de rede.

    A fila de impressão não tem nada a ver com isso. Amarrada àquela flag, o
    process_queue recebia None do _supabase_request, caía no `if not jobs:
    return` e encerrava em silêncio a cada 5 segundos: os trabalhos ficavam
    eternamente em 'pending' e nenhuma linha aparecia no log. O heartbeat
    seguia funcionando porque monta a requisição direto, sem passar por aqui —
    o que fazia tudo PARECER conectado.
    """
    return bool(db.SUPABASE_URL and db.SUPABASE_KEY)


def _supabase_request(method: str, path: str, body: dict = None, is_storage=False) -> dict | list | None:
    if not _relay_ativo():
        return None
    url = f"{db.SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": db.SUPABASE_KEY,
        "Authorization": f"Bearer {db.SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    req_data = None
    if body is not None:
        req_data = json.dumps(body).encode("utf-8")
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            resp_body = response.read().decode("utf-8")
            if resp_body:
                return json.loads(resp_body)
            return None
    except urllib.error.HTTPError as e:
        print(f"[agent_worker] Erro HTTP {method} {path}: {e.code} - {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"[agent_worker] Erro {method} {path}: {e}")
        return None

def download_file(file_url: str, dest_path: str):
    try:
        urllib.request.urlretrieve(file_url, dest_path)
        return True
    except Exception as e:
        print(f"[agent_worker] Erro ao baixar PDF: {e}")
        return False

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# As colunas `versao` e `painel_versao` de print_agents existem neste banco?
#
# Comeca otimista e desliga sozinha na primeira recusa. O motivo de nao ser o
# contrario — comecar desligada e ligar quando alguem avisasse — e que ninguem
# avisaria: as onze estacoes rodam sem supervisao, e uma flag que exige acao
# humana ficaria falsa para sempre em metade delas.
_COLUNAS_DE_VERSAO = True

# ...e volta a tentar de hora em hora.
#
# A primeira versao disto desistia PARA SEMPRE dentro do processo, e o defeito
# apareceu no mesmo dia: o ALTER TABLE roda no editor do Supabase, por uma
# pessoa, com os onze agentes JA no ar. Todos eles ja tinham desistido, entao a
# coluna nasceu e continuou vazia — ate cada estacao reiniciar, o que pode levar
# dias.
#
# Uma hora e o meio-termo: uma tentativa a cada 120 ciclos de heartbeat nao e
# desperdicio que se meça, e a informacao aparece sozinha na primeira hora
# depois do ALTER, sem ninguem ter de ir a lugar nenhum.
_INTERVALO_RETENTAR_COLUNAS_S = 3600
_QUANDO_RETENTAR_COLUNAS = 0.0


def _e_coluna_ausente(codigo: int, corpo: str) -> bool:
    """A recusa foi por coluna que o banco nao tem?

    O PostgREST responde 400 com `PGRST204` e a frase "Could not find the
    'versao' column of 'print_agents' in the schema cache". Distinguir esse caso
    importa: qualquer outro 400 e defeito nosso e tem de continuar aparecendo no
    log, em vez de virar uma tentativa silenciosa a menos.
    """
    if codigo not in (400, 404):
        return False
    texto = (corpo or "").lower()
    return "pgrst204" in texto or ("column" in texto and "schema cache" in texto)


def _acesso_base() -> str:
    """Para qual pilha esta estacao publica a faixa de codigos.

    Vai no heartbeat porque e a pergunta da Fase 3: quando as onze estacoes
    tiverem migrado, o Render pode ser desligado. A VERSAO sozinha nao responde
    isso — o endereco sai de `ACESSO_BASE_URL`, uma variavel de ambiente, e uma
    estacao pode ser migrada sem trocar de executavel. Perguntar ao proprio
    modulo que publica e a unica resposta que nao pode mentir.
    """
    try:
        import acesso_publicacao
        return acesso_publicacao._base()
    except Exception:
        return ""


def sync_heartbeat():
    try:
        printers = print_service.get_printers()
        capabilities = {}
        for p in printers:
            capabilities[p] = print_service.get_printer_capabilities(p)

        from agent_version import AGENT_VERSION

        painel = versao_do_painel()

        # `version` e o executavel; `painel` e a tela que o operador ve. Os dois
        # se atualizam por caminhos diferentes e ja divergiram em producao, entao
        # um so dos numeros nao diz se a estacao esta em dia.
        #
        # Estes campos continuam no JSON mesmo depois de existirem colunas para
        # eles: o modal "Qual e esta estacao?" do painel le
        # `printers_json.version`, e ele roda na tela do operador, que pode estar
        # desatualizada. Quebrar aquela tela para arrumar a coluna seria trocar
        # um incomodo de quem publica por um incomodo de quem imprime.
        printers_json = {
            "printers": printers,
            "capabilities": capabilities,
            "local_ip": get_local_ip(),
            "version": AGENT_VERSION,
            "painel": painel,
            "acesso_base": _acesso_base(),
            "fontes": diagnostico_fontes(),
            "ultimo_update": ultimo_update()
        }

        # Formato UTC explícito com timezone, exigido pelo Supabase
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # UPSERT via POST com Prefer: resolution=merge-duplicates
        payload = {
            "id": AGENT_ID,
            "name": AGENT_NAME,
            "status": "online",
            "last_seen": now_iso,
            "printers_json": printers_json
        }

        # As colunas vao SEPARADAS do resto, porque sao a unica parte que o banco
        # pode nao ter ainda. Ver `sql/alter_print_agents_versao.sql`.
        colunas = {
            "versao": AGENT_VERSION,
            "painel_versao": (painel or {}).get("versao"),
        }
        _gravar_heartbeat(payload, colunas, now_iso)
    except Exception as e:
        print(f"[agent_worker] Erro fatal no sync_heartbeat: {e}", flush=True)


def _gravar_heartbeat(payload: dict, colunas: dict, now_iso: str):
    """Grava o heartbeat, com e sem as colunas novas.

    A ordem importa e e a razao de esta funcao existir: enquanto o ALTER TABLE
    nao for aplicado, mandar as colunas novas faria o PostgREST recusar o UPSERT
    INTEIRO. Nao seria uma informacao a menos — seria a estacao inteira sumindo
    do painel, porque `last_seen` para de ser atualizado. O operador veria
    "nenhuma estacao com sinal recente" e nao teria como imprimir pelo relay.

    Por isso a primeira recusa por coluna ausente derruba a flag e repete SEM
    elas. A partir dai, aquele processo so volta a tentar de hora em hora — ver
    `_INTERVALO_RETENTAR_COLUNAS_S`, e a razao de nao ser "nunca mais".
    """
    global _COLUNAS_DE_VERSAO, _QUANDO_RETENTAR_COLUNAS

    url = f"{db.SUPABASE_URL}/rest/v1/print_agents"
    headers = {
        "apikey": db.SUPABASE_KEY,
        "Authorization": f"Bearer {db.SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    def _enviar(corpo):
        """(deu_certo, codigo_http, texto). Nunca levanta: o heartbeat e o
        ultimo lugar onde uma excecao pode escapar — ela mataria a thread e a
        estacao sumiria do painel em silencio."""
        try:
            req = urllib.request.Request(
                url, data=json.dumps(corpo).encode("utf-8"), headers=headers, method="POST")
            urllib.request.urlopen(req, timeout=10)
            return True, 0, ""
        except urllib.error.HTTPError as e:
            return False, e.code, e.read().decode("utf-8", errors="replace")
        except Exception as e:
            return False, 0, str(e)

    tentar_colunas = _COLUNAS_DE_VERSAO or time.time() >= _QUANDO_RETENTAR_COLUNAS
    ok, codigo, texto = _enviar({**payload, **colunas} if tentar_colunas else payload)

    if tentar_colunas and not ok and _e_coluna_ausente(codigo, texto):
        if _COLUNAS_DE_VERSAO:
            print("[agent_worker] print_agents ainda nao tem as colunas de versao; "
                  "reportando so pelo printers_json. Rode "
                  "sql/alter_print_agents_versao.sql.", flush=True)
        _COLUNAS_DE_VERSAO = False
        _QUANDO_RETENTAR_COLUNAS = time.time() + _INTERVALO_RETENTAR_COLUNAS_S
        ok, codigo, texto = _enviar(payload)
    elif tentar_colunas and ok and not _COLUNAS_DE_VERSAO:
        # O ALTER TABLE rodou enquanto este processo estava no ar. E o caso
        # normal, e nao a excecao: o SQL e colado por uma pessoa, no editor do
        # Supabase, com os agentes todos ja rodando.
        _COLUNAS_DE_VERSAO = True
        print("[agent_worker] as colunas de versao apareceram; voltando a "
              "preenche-las.", flush=True)

    if ok:
        print(f"[agent_worker] Heartbeat OK - {now_iso}", flush=True)
    elif codigo:
        print(f"[agent_worker] Falha no heartbeat HTTP {codigo}: {texto}", flush=True)
    else:
        print(f"[agent_worker] Falha no heartbeat: {texto}", flush=True)

def titulo_do_job(file_url, job_id):
    """
    O nome que aparece na fila do Windows quando o trabalho chega pelo relay.

    O painel envia o arquivo ao Storage ja com o nome final — prefixo de ordem
    (00001_, 00002_...) mais o nome do material — entao basta ler o ultimo
    pedaco da URL. Antes daqui o titulo era "Cloud Print Job <hash>", que nao
    dizia nada a quem esta na frente da impressora e nao carregava a ordem.

    Trabalhos enfileirados por versoes antigas do painel nao tem esse nome; para
    eles o hash continua sendo a melhor identificacao disponivel.
    """
    try:
        caminho = urllib.parse.urlsplit(file_url or "").path
        nome = urllib.parse.unquote(os.path.basename(caminho)).strip()
        if nome:
            return nome
    except Exception:
        pass
    return f"Job {job_id[:8]}"


def _soltar_no_hot_folder(pasta: str, nome: str, pdf_path: str):
    """Larga o PDF baixado numa pasta observada pelo RIP. (sucesso, mensagem).

    A lista branca vale aqui tambem, e nao e formalidade: no relay o caminho vem
    do banco compartilhado, entao ele foi escrito por outra maquina. Pasta que
    esta estacao nunca autorizou nao recebe arquivo.
    """
    try:
        if not db.hot_folder_registrada(pasta):
            return False, (f"hot folder '{pasta}' nao esta registrada nesta estacao; "
                           "escolha a pasta no painel desta maquina")
        with open(pdf_path, "rb") as f:
            dados = f.read()
        destino = hotfolder.soltar(pasta, nome, dados,
                                   metodo=db.metodo_hot_folder(pasta))

        # O Edge Print importa e remove o arquivo. Sobrando arquivo, o watcher
        # provavelmente nao esta rodando. Pelo relay nao ha ninguem olhando a
        # tela desta maquina, entao o aviso vai para o log.
        def _conferir():
            time.sleep(hotfolder.SEGUNDOS_ATE_CONFERIR)
            if hotfolder.conferir([destino]):
                print(f"[agent_worker] hot folder: '{destino}' ainda esta na pasta "
                      f"{hotfolder.SEGUNDOS_ATE_CONFERIR}s depois — o RIP esta rodando?",
                      flush=True)
        threading.Thread(target=_conferir, daemon=True, name="HotFolderConfere").start()

        return True, f"gravado em {destino}"
    except Exception as e:
        return False, f"falha ao gravar no hot folder: {e}"


def process_queue():
    try:
        path = f"print_queue?agent_id=eq.{AGENT_ID}&status=eq.pending&order=created_at.asc&limit=1"
        jobs = _supabase_request("GET", path)
        
        if not jobs:
            return

        for job in jobs:

            job_id = job.get("id")
            file_url = job.get("file_url")
            printer_name = job.get("printer_name")
            ppd_options = job.get("ppd_options", {})

            # REIVINDICACAO ATOMICA: so assume o trabalho se ELE ainda estiver
            # 'pending'. O status=eq.pending na URL faz o proprio Postgres
            # decidir quem ganha; quem perder recebe lista vazia e sai.
            #
            # Sem isso, dois processadores lendo antes de qualquer um marcar
            # imprimem o mesmo arquivo duas vezes. Aconteceu de verdade: o
            # run_loop rodava em dobro no mesmo processo, e ha estacao com duas
            # linhas em print_agents com o mesmo nome. O guard do run_loop
            # resolve o caso de hoje; este trecho resolve a classe do problema.
            reivindicado = _supabase_request(
                "PATCH", f"print_queue?id=eq.{job_id}&status=eq.pending", {"status": "printing"})
            if not reivindicado:
                print(f"[agent_worker] Job {job_id} ja foi assumido por outro processador; ignorando.", flush=True)
                continue

            print(f"[agent_worker] Processando Job {job_id} para {printer_name}...", flush=True)
            
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            temp_pdf.close()
            
            if not download_file(file_url, temp_pdf.name):
                _supabase_request("PATCH", f"print_queue?id=eq.{job_id}", {"status": "error"})
                continue

            # Hot folder: o trabalho vai para uma pasta observada pelo RIP, e nao
            # para a fila do Windows. O caminho viaja dentro do ppd_options, que
            # ja e uma coluna JSON — nao ha coluna nova no Supabase por causa
            # disso. Sem caminho ali, nada muda: o fluxo segue pelo spooler.
            pasta = (ppd_options or {}).get("hot_folder_path") if isinstance(ppd_options, dict) else None
            if pasta:
                success, msg = _soltar_no_hot_folder(
                    pasta, titulo_do_job(file_url, job_id), temp_pdf.name)
            else:
                # Chamar diretamente a impressão via Windows GDI com as opções enviadas
                success, msg = print_service.send_print_job_windows(
                    printer_name=printer_name,
                    pdf_path=temp_pdf.name,
                    options=ppd_options,
                    job_title=titulo_do_job(file_url, job_id)
                )

            try:
                if os.path.exists(temp_pdf.name):
                    os.remove(temp_pdf.name)
            except:
                pass
                
            final_status = "completed" if success else "error"
            _supabase_request("PATCH", f"print_queue?id=eq.{job_id}", {"status": final_status})
            print(f"[agent_worker] Job {job_id} {final_status}: {msg}", flush=True)
    except Exception as e:
        print(f"[agent_worker] Erro fatal no process_queue: {e}", flush=True)

# 30 min, nao 6h: num dia de correcao chegamos a publicar 5 versoes dentro de uma
# unica janela de 6h, e as estacoes ficaram cegas a todas elas. O custo e baixo —
# o manifesto tem ~300 bytes, entao sao 2 requisicoes por hora por estacao.
INTERVALO_UPDATE_S = 30 * 60

# O sync dos BINARIOS continua em 6h: sao ~140 MB na primeira vez e depois so o que
# faltar.
INTERVALO_FONTES_S = 6 * 3600

# A LISTA e outra coisa: ~60 KB. Vai a cada 30 min, como o painel, porque e o que faz
# uma fonte cadastrada em outra estacao aparecer aqui. Quando a lista muda, o sync dos
# binarios e chamado na hora, sem esperar as 6h.
INTERVALO_CATALOGO_S = 30 * 60

# Painel a cada 30 min, como o manifesto: sao ~1,5 MB e a estacao precisa pegar
# a correcao publicada no mesmo dia. A primeira sincronizacao acontece 5s apos
# subir — antes disso vale a copia que ja estava no disco.
INTERVALO_PAINEL_S = 30 * 60

# Acessos locais a cada 5 min, e nao 30: sao poucas linhas, e quando o
# administrador gera um codigo alguem esta esperando para entrar do outro lado do
# telefone. Meia hora de espera nesse momento parece defeito.
INTERVALO_ACESSOS_S = 5 * 60

# Um unico run_loop por processo. Ver o comentario no proprio run_loop.
_loop_ativo = False
_loop_lock = threading.Lock()


# Resultado do ultimo teste de alcance ao Storage. Fica em memoria porque a
# sondagem custa uma requisicao de rede e o heartbeat roda a cada 30s.
_STORAGE_ALCANCAVEL = None


def _testar_alcance_storage():
    """A estacao consegue baixar fonte do Supabase? Preenchido pelo sync."""
    global _STORAGE_ALCANCAVEL
    import security_config
    alvo = (security_config.SUPABASE_PROJETO +
            "/storage/v1/object/public/fontes/comic.ttf")
    try:
        req = urllib.request.Request(alvo, method="HEAD",
                                     headers={"User-Agent": "NewProd Agent"})
        with urllib.request.urlopen(req, timeout=20) as r:
            _STORAGE_ALCANCAVEL = (r.status == 200)
    except Exception as e:
        _STORAGE_ALCANCAVEL = False
        print(f"[fontes] Storage inalcancavel desta estacao: {e}", flush=True)
    return _STORAGE_ALCANCAVEL


def diagnostico_fontes():
    """Estado das fontes nesta maquina, enviado junto do heartbeat.

    Existe porque nem sempre ha acesso fisico as estacoes da grafica: sem isto,
    diagnosticar um problema de fonte depende de alguem ir ate la rodar comandos.
    Os campos locais sao baratos (listagem de pasta); o alcance ao Storage vem da
    ultima sondagem feita no sync, para nao gastar rede a cada 30s.
    """
    try:
        import font_cache
        pasta = font_cache._pasta_cache()
        arquivos = os.listdir(pasta) if os.path.isdir(pasta) else []
        bytes_totais = 0
        for a in arquivos:
            try:
                bytes_totais += os.path.getsize(os.path.join(pasta, a))
            except OSError:
                pass

        urls = [(f.get("arquivo_url") or "") for f in db.get_catalogo_fontes()]
        return {
            "cache_arquivos": len(arquivos),
            "cache_mb": round(bytes_totais / 1048576, 1),
            "catalogo_total": len(urls),
            "catalogo_relativas": sum(1 for u in urls if u.startswith("/fonts_local")),
            "catalogo_gstatic": sum(1 for u in urls if "gstatic" in u),
            "catalogo_storage": sum(1 for u in urls if "supabase.co" in u),
            "storage_alcancavel": _STORAGE_ALCANCAVEL,
        }
    except Exception as e:
        return {"erro": str(e)[:140]}


def sincronizar_catalogo_fontes():
    """Traz a LISTA de fontes da tabela compartilhada para o disco desta estacao.

    E o que faz uma fonte cadastrada em outra estacao (ou pelo site) aparecer aqui. A
    estacao NUNCA consulta a tabela na hora de impor — le sempre o formats_db.json —,
    entao e esta funcao que mantem aquele arquivo verdadeiro.

    A cada 30 min e nao a cada 6h como o sync dos binarios: a lista tem ~60 KB contra
    ~140 MB, e uma fonte nova que demorasse 6h para aparecer faria o operador cadastrar
    de novo achando que a primeira falhou. Depois de trazer a lista, baixa so os
    binarios que ainda nao estao em cache — normalmente nenhum.
    """
    try:
        lista = db._supabase_call("GET", "catalogo_fontes?select=*&order=nome.asc",
                                  silencioso=True)
    except Exception as e:
        print(f"[fontes] Nao consegui ler o catalogo compartilhado: {e}", flush=True)
        return

    if not lista:
        # Lista vazia nao e resposta: ou a tabela ainda nao existe, ou deu erro. A
        # copia que ja esta no disco continua valendo — zerar o catalogo faria toda
        # arte sair em Helvetica.
        return

    if db.guardar_catalogo_local(lista):
        print(f"[fontes] Catalogo atualizado: {len(lista)} fonte(s)", flush=True)
        _sincronizar_fontes_em_thread()


def _sincronizar_catalogo_em_thread():
    import threading
    threading.Thread(target=sincronizar_catalogo_fontes, daemon=True,
                     name="SyncCatalogoFontes").start()


def sincronizar_fontes():
    """Baixa para o cache local toda fonte do catalogo que ainda nao esteja la.

    Deixa a estacao autonoma: depois do primeiro sync o agente serve as fontes
    de disco (/api/fonte), entao tanto a imposicao quanto a tela funcionam sem
    depender da rede. Tambem e o que faz uma fonte nova aparecer sozinha, sem
    reinstalar o agente.

    Roda numa thread propria: sao ~140 MB na primeira vez e nao pode segurar a
    fila de impressao.
    """
    try:
        import font_cache
        _testar_alcance_storage()   # alimenta o diagnostico do heartbeat

        fontes = db.get_catalogo_fontes()
        urls = [f.get("arquivo_url") or "" for f in fontes]
        urls = sorted({u for u in urls if u.startswith("http")})

        pasta = font_cache._pasta_cache()
        novas = falhas = 0
        for url in urls:
            destino = os.path.join(pasta, font_cache._nome_em_cache(url))
            if os.path.isfile(destino) and os.path.getsize(destino) > 0:
                continue
            try:
                font_cache.obter_bytes(url)
                novas += 1
            except Exception:
                falhas += 1

        if novas or falhas:
            print(f"[fontes] Sync: {novas} nova(s) em cache, {falhas} falha(s), "
                  f"{len(urls)} no catalogo", flush=True)
    except Exception as e:
        print(f"[fontes] Erro na sincronizacao: {e}", flush=True)


def _sincronizar_fontes_em_thread():
    import threading
    threading.Thread(target=sincronizar_fontes, daemon=True, name="SyncFontes").start()


# ─── Sincronismo do painel ────────────────────────────────────────────────────
# O painel embutido no executavel congelava na versao do build: atualiza-lo
# custava um release de agente por publicacao do site. Agora o agente baixa os
# arquivos e serve a copia local, que o app.py aponta em PAINEL_DIR.
#
# A imposicao continua na estacao. Quem escolhe o motor e o supabase-config.js,
# em tempo de execucao, pela porta da pagina — servido na 9000, API_BASE_URL
# fica vazio e o motor e o local. Ver security_config.PAINEL_BASE_URL.

PAINEL_DIR = os.path.join(db.DB_DIR, "painel")


def _painel_valido(pasta: str) -> bool:
    """Todos os arquivos presentes, nao vazios, e o index parecendo HTML."""
    import security_config
    for nome in security_config.PAINEL_ARQUIVOS:
        caminho = os.path.join(pasta, nome)
        if not os.path.isfile(caminho) or os.path.getsize(caminho) == 0:
            return False
    try:
        with open(os.path.join(pasta, "index.html"), "r", encoding="utf-8", errors="replace") as f:
            if "<html" not in f.read(4000).lower():
                return False
    except Exception:
        return False
    return True


def sincronizar_painel():
    """Baixa o painel da nuvem e substitui a copia local, se vier inteira.

    Baixa para uma pasta ao lado e so troca depois de validar o conjunto: um
    download pela metade nunca vira painel quebrado na estacao. Se a rede
    falhar, a copia anterior continua servindo — e, na primeira instalacao, a
    copia embutida no executavel, que o app.py semeia.
    """
    import security_config
    base = security_config.PAINEL_BASE_URL.rstrip("/")
    temp = PAINEL_DIR + ".novo"

    try:
        if os.path.isdir(temp):
            shutil.rmtree(temp, ignore_errors=True)
        os.makedirs(temp, exist_ok=True)

        for nome in security_config.PAINEL_ARQUIVOS:
            # Cache-buster: o painel na Vercel ja responde no-store, mas uma
            # borda intermediaria mal configurada devolveria arquivo velho — e o
            # sintoma seria exatamente o que estamos consertando.
            url = f"{base}/{nome}?t={int(time.time())}"
            req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} em {nome}")
                conteudo = resp.read()
            if not conteudo:
                raise RuntimeError(f"{nome} veio vazio")
            with open(os.path.join(temp, nome), "wb") as f:
                f.write(conteudo)

        if not _painel_valido(temp):
            raise RuntimeError("conjunto incompleto apos o download")

        os.makedirs(PAINEL_DIR, exist_ok=True)
        for nome in security_config.PAINEL_ARQUIVOS:
            os.replace(os.path.join(temp, nome), os.path.join(PAINEL_DIR, nome))

        print(f"[agent_worker] Painel sincronizado ({len(security_config.PAINEL_ARQUIVOS)} arquivos).", flush=True)
        return True

    except Exception as e:
        print(f"[agent_worker] Painel nao sincronizado ({e}). Segue a copia atual.", flush=True)
        return False
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def _sincronizar_painel_em_thread():
    import threading
    threading.Thread(target=sincronizar_painel, daemon=True, name="SyncPainel").start()


def versao_do_painel(pasta: str = None) -> dict:
    """Qual painel esta estacao serve ao operador. Entra no heartbeat.

    O heartbeat reportava so a versao do executavel, e isso escondeu um
    incidente inteiro: em 12/08/2026 uma estacao com o agente mais novo
    (1.2.36) servia o painel da v528, e o Refazer Celula falhava la e
    funcionava aqui. Da nuvem nao havia como ver a diferenca — era preciso ir
    ate a maquina. Agente e painel tem ciclos de vida separados, entao os dois
    numeros precisam viajar juntos.

    A versao sai do carimbo `?v=NNN` que o proprio index.html poe nos scripts —
    o mesmo numero do release do site. `quando` e a data do arquivo em disco,
    que denuncia sincronizacao parada mesmo quando o carimbo nao muda.
    """
    resultado = {"versao": None, "quando": None}

    if pasta:
        candidatos = [pasta]
    else:
        # Sem painel sincronizado, o app.py serve a copia embutida — e e essa
        # que o operador ve. Reportar a que esta no ar, nao a que deveria estar.
        candidatos = [PAINEL_DIR, os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")]

    for candidato in candidatos:
        caminho = os.path.join(candidato, "index.html")
        if not os.path.isfile(caminho):
            continue
        try:
            resultado["quando"] = datetime.datetime.fromtimestamp(
                os.path.getmtime(caminho), datetime.timezone.utc).isoformat()
            with open(caminho, "r", encoding="utf-8", errors="replace") as f:
                cabeca = f.read(8000)
            achado = re.search(r"\?v=(\d+)", cabeca)
            if achado:
                resultado["versao"] = achado.group(1)
        except Exception as e:
            print(f"[agent_worker] Nao consegui ler a versao do painel: {e}", flush=True)
        break

    return resultado


def sincronizar_acessos():
    """Baixa a lista de acessos locais e grava a copia da estacao.

    Vai direto ao REST do Supabase, como o resto do relay, e NAO passa pelo
    db.IS_SUPABASE_ACTIVE — que e False de proposito no executavel para manter o
    catalogo local. Uma falha de rede deixa a copia anterior valendo: o operador
    que ja tinha codigo continua entrando com a internet fora.
    """
    import acesso_local
    if not _relay_ativo():
        return False
    acessos = _supabase_request("GET", "imposition_acessos_locais?select=*")
    if acessos is None:
        print("[agent_worker] Acessos locais nao sincronizados. Segue a copia atual.", flush=True)
        return False

    # LISTA VAZIA NAO SUBSTITUI LISTA CHEIA, e este e o freio mais importante
    # deste arquivo. `acesso_local.ha_lista()` responde ao `app.py` se a estacao
    # deve pedir codigo no login; com a lista vazia ela responde NAO, e o painel
    # abre para quem sentar na maquina.
    #
    # Uma resposta vazia quase nunca significa "ninguem tem acesso": significa
    # que a leitura foi recusada. E vai significar isso literalmente quando o RLS
    # fechar a leitura desta tabela para a chave anonima -- o passo 3 de
    # `sql/rls_acessos_e_permissoes.sql`. Sem este freio, aquele passo destrancaria
    # onze computadores em vez de trancar um vazamento.
    #
    # Esvaziar de verdade a lista continua possivel: desative os operadores um a
    # um, ou apague a copia da estacao. O que nao se faz por acidente e destrancar
    # tudo com uma requisicao que voltou vazia.
    if not acessos and acesso_local.carregar_lista():
        print("[agent_worker] Acessos locais vieram VAZIOS e a estacao ja tinha "
              "lista: mantendo a copia atual. Confira a permissao de leitura da "
              "tabela imposition_acessos_locais.", flush=True)
        return False

    if acesso_local.salvar_lista(acessos):
        ativos = sum(1 for a in acessos if a.get("ativo") is not False)
        print(f"[agent_worker] Acessos locais sincronizados ({ativos} ativos).", flush=True)
        return True
    return False


def _sincronizar_acessos_em_thread():
    import threading
    threading.Thread(target=sincronizar_acessos, daemon=True, name="SyncAcessos").start()


# Registro da ultima tentativa de atualizacao, EM DISCO.
# Precisa sobreviver ao reinicio: se o msiexec falhar, o .bat reinicia o agente na
# versao antiga e um registro em memoria se perderia — justamente no caso que
# interessa diagnosticar. Fica ao lado do agent_config.json.
_ARQUIVO_UPDATE = os.path.join(_CONFIG_DIR, "ultimo_update.json")


def _registrar_update(etapa: str, versao_alvo=None, erro=None):
    """Grava em que ponto a atualizacao parou, para o heartbeat reportar."""
    from agent_version import AGENT_VERSION
    registro = {
        "quando": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "versao_no_momento": AGENT_VERSION,
        "versao_alvo": versao_alvo,
        "etapa": etapa,
        "erro": (str(erro)[:200] if erro else None),
    }
    try:
        with open(_ARQUIVO_UPDATE, "w", encoding="utf-8") as f:
            json.dump(registro, f, ensure_ascii=False)
    except Exception:
        pass
    return registro


def ultimo_update() -> dict:
    """Le o registro da ultima tentativa; entra no heartbeat."""
    try:
        if os.path.isfile(_ARQUIVO_UPDATE):
            with open(_ARQUIVO_UPDATE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def consultar_manifesto() -> dict:
    """Le o manifesto e compara com a versao local, sem baixar nada.

    Separado de verificar_atualizacao() para que a interface possa perguntar
    "tem versao nova?" de forma barata, sem disparar um download de 47 MB.
    """
    import security_config
    from agent_version import AGENT_VERSION, como_tupla

    resultado = {"versao_atual": AGENT_VERSION, "versao_disponivel": None,
                 "ha_atualizacao": False, "erro": None}
    try:
        url = f"{security_config.MANIFEST_URL}?t={int(time.time())}"
        req = urllib.request.Request(url, headers={"User-Agent": "NewProd Agent",
                                                   "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            manifesto = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        resultado["erro"] = f"Manifesto indisponivel: {e}"
        return resultado

    remota = manifesto.get("version")
    resultado["versao_disponivel"] = remota
    resultado["notas"] = manifesto.get("notes")
    resultado["ha_atualizacao"] = como_tupla(remota) > como_tupla(AGENT_VERSION)
    return resultado


def verificar_atualizacao(forcado: bool = False):
    """Consulta o manifesto e instala a versao nova, se houver.

    Modelo pull: a URL do manifesto e fixa (security_config), o instalador
    precisa estar no bucket de releases e o sha256 tem que bater. Nenhuma
    entrada externa decide o que e baixado.
    """
    import hashlib
    import subprocess
    import security_config
    from agent_version import AGENT_VERSION, como_tupla

    if not getattr(sys, "frozen", False):
        if forcado:
            print("[update] Modo desenvolvimento: atualizacao ignorada.", flush=True)
        return

    # O Storage fica atras do CDN da Cloudflare: mesmo com cache-control no-cache
    # na origem, a borda serve HIT com o manifesto anterior por um tempo apos a
    # publicacao. Sem o parametro variavel o agente ficaria cego ao release novo.
    # O MSI nao precisa disto — o nome do arquivo ja muda a cada versao.
    url_manifesto = f"{security_config.MANIFEST_URL}?t={int(time.time())}"
    try:
        req = urllib.request.Request(url_manifesto,
                                     headers={"User-Agent": "NewProd Agent",
                                              "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            manifesto = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[update] Manifesto indisponivel: {e}", flush=True)
        _registrar_update("manifesto_indisponivel", erro=e)
        return

    versao_nova = manifesto.get("version")
    url_msi = manifesto.get("url")
    sha_esperado = (manifesto.get("sha256") or "").lower()

    if como_tupla(versao_nova) <= como_tupla(AGENT_VERSION):
        if forcado:
            print(f"[update] Ja esta na versao mais recente ({AGENT_VERSION}).", flush=True)
        _registrar_update("sem_atualizacao", versao_alvo=versao_nova)
        return

    if not security_config.is_allowed_release_url(url_msi):
        print(f"[update] BLOQUEADO: instalador fora do bucket de releases: {url_msi!r}", flush=True)
        _registrar_update("url_bloqueada", versao_alvo=versao_nova, erro=url_msi)
        return
    if len(sha_esperado) != 64:
        print("[update] Manifesto sem sha256 valido — atualizacao abortada.", flush=True)
        _registrar_update("sha_ausente", versao_alvo=versao_nova)
        return

    print(f"[update] Versao {versao_nova} disponivel (atual {AGENT_VERSION}). Baixando...", flush=True)
    destino = os.path.join(tempfile.gettempdir(), f"NewProd_Setup_{versao_nova}.msi")
    try:
        req = urllib.request.Request(url_msi, headers={"User-Agent": "NewProd Agent"})
        with urllib.request.urlopen(req, timeout=600) as resp, open(destino, "wb") as f:
            f.write(resp.read())
    except Exception as e:
        print(f"[update] Falha no download: {e}", flush=True)
        _registrar_update("download_falhou", versao_alvo=versao_nova, erro=e)
        return

    sha_obtido = hashlib.sha256(open(destino, "rb").read()).hexdigest()
    if sha_obtido != sha_esperado:
        print(f"[update] BLOQUEADO: sha256 divergente "
              f"(esperado {sha_esperado[:12]}, obtido {sha_obtido[:12]}). Arquivo descartado.", flush=True)
        try:
            os.remove(destino)
        except Exception:
            pass
        _registrar_update("sha_divergente", versao_alvo=versao_nova,
                          erro=f"esperado {sha_esperado[:12]} obtido {sha_obtido[:12]}")
        return

    # O MSI nao consegue substituir o exe enquanto ele roda, e o pacote nao tem
    # CloseApplication configurado — por isso um script solto encerra o agente,
    # instala em silencio e sobe a versao nova.
    exe_path = sys.executable
    bat_path = os.path.join(tempfile.gettempdir(), "newprod_update.bat")
    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(f"""@echo off
timeout /t 3 /nobreak > nul
taskkill /IM "{os.path.basename(exe_path)}" /F > nul 2>&1
msiexec /i "{destino}" /qn
start "" "{exe_path}"
del "{destino}" > nul 2>&1
del "%~f0"
""")

    # Marcado ANTES de disparar o .bat: se o msiexec falhar, o agente reinicia na
    # versao antiga e este registro sobrevive, mostrando que chegou ate a instalacao.
    _registrar_update("instalando", versao_alvo=versao_nova)
    print(f"[update] sha256 conferido. Instalando {versao_nova} e reiniciando...", flush=True)
    subprocess.Popen([bat_path], shell=True,
                     creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))


def run_loop():
    # UM laco por processo. Ele e iniciado em dois lugares: o agent_tray chama
    # direto e o lifespan do app.py sobe uma thread. Os dois rodavam juntos, o
    # que aparecia como heartbeat em dobro no log -- inofensivo -- e como
    # IMPRESSAO EM DOBRO assim que o relay voltou a funcionar, porque os dois
    # liam o mesmo job pendente antes de qualquer um marca-lo.
    #
    # O guard fica aqui, e nao em quem chama, porque as duas chamadas sao
    # legitimas: o tray e o modo normal, o lifespan cobre quem sobe so o app.py.
    global _loop_ativo
    with _loop_lock:
        if _loop_ativo:
            print("[agent_worker] run_loop ja esta rodando neste processo; segunda chamada ignorada.", flush=True)
            return
        _loop_ativo = True

    print(f"Iniciando Agent Worker (Cloud Relay) - ID: {AGENT_ID}", flush=True)
    heartbeat_timer = 0
    update_timer = 60   # primeira checagem 1 min apos subir
    catalogo_timer = 10  # a LISTA antes dos binarios: e ela que diz o que baixar
    fontes_timer = 20   # sync de fontes logo no inicio
    painel_timer = 5    # painel quase de imediato: e o que o operador ve
    acessos_timer = 5   # junto com o painel: sem a lista, ninguem entra
    while True:
        try:
            if heartbeat_timer <= 0:
                sync_heartbeat()
                heartbeat_timer = 30
            if update_timer <= 0:
                verificar_atualizacao()
                update_timer = INTERVALO_UPDATE_S
            if catalogo_timer <= 0:
                _sincronizar_catalogo_em_thread()
                catalogo_timer = INTERVALO_CATALOGO_S
            if fontes_timer <= 0:
                _sincronizar_fontes_em_thread()
                fontes_timer = INTERVALO_FONTES_S
            if painel_timer <= 0:
                _sincronizar_painel_em_thread()
                painel_timer = INTERVALO_PAINEL_S
            if acessos_timer <= 0:
                _sincronizar_acessos_em_thread()
                acessos_timer = INTERVALO_ACESSOS_S
            process_queue()
            time.sleep(5)
            heartbeat_timer -= 5
            update_timer -= 5
            catalogo_timer -= 5
            fontes_timer -= 5
            painel_timer -= 5
            acessos_timer -= 5
        except Exception as e:
            print(f"[agent_worker] Erro no loop principal: {e}", flush=True)
            time.sleep(5)
            heartbeat_timer -= 5 # Garantir decremento
            update_timer -= 5
            catalogo_timer -= 5
            fontes_timer -= 5
            painel_timer -= 5
            acessos_timer -= 5


if __name__ == "__main__":
    run_loop()
