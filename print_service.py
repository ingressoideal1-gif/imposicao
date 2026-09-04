import os
import base64
import json
import subprocess
import tempfile
import fitz  # PyMuPDF
from ppd_parser import PPDParser

import color_profiles

try:
    import win32print
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

# win32ui e' MODULO DIFERENTE de win32print, com dependencia nativa propria.
#
# `win32print` mora em `site-packages/win32/`; `win32ui` mora em
# `site-packages/pythonwin/`, so e' importavel porque o instalador do pywin32
# acrescenta essa pasta ao `sys.path`, e o `.pyd` carrega uma DLL propria que o
# `win32print` nao usa. Uma estacao pode ter `win32print` funcionando -- o
# catalogo de impressoras aparece normal, o painel abre -- e `win32ui` falhando
# so na hora de imprimir de verdade, porque e' so' o `_send_gdi_raster` (o
# FALLBACK que a Producao usa por padrao, ja que ela nunca manda `print_mode`)
# quem o usa.
#
# Sem uma bandeira propria, o ImportError vazava cru ate o operador: foi o que
# aconteceu no pedido 21524 em 03/09/2026 -- "DLL load failed while importing
# win32ui: Nao foi possivel encontrar o modulo especificado", como traceback
# dentro do erro HTTP, em vez de um recado que ele pudesse agir.
#
# Importar aqui, no topo do modulo, e nao dentro de `_send_gdi_raster`, tem uma
# segunda razao: import de nivel de modulo e' o que o PyInstaller enxerga com
# mais confianca ao decidir o que empacotar no executavel. Foi exatamente a
# falta disso, duas vezes antes -- `PIL.ImageCms` e `serial.serialwin32` --
# que fez este projeto aprender a declarar esses modulos explicitamente em
# `agent_tray.spec`; win32ui, win32gui e win32con estao la agora pelo mesmo
# motivo.
# ERRO_WIN32UI guarda o ImportError original -- e' ele que diz QUAL DLL faltou.
#
# Em 04/09/2026 a 1.2.302 saiu levando o `mfc140u.dll` dentro do executavel e a
# estacao devolveu a MESMA mensagem de antes, palavra por palavra. Sem a causa
# tecnica junto, nao havia como distinguir "a DLL nao veio no instalador" de "a
# DLL veio e nao carregou porque falta outra da cadeia" -- e a segunda hipotese
# era a certa. Uma linha de diagnostico teria poupado uma versao inteira.
try:
    import win32gui, win32ui, win32con
    HAS_WIN32UI = True
    ERRO_WIN32UI = ""
except ImportError as _e:
    HAS_WIN32UI = False
    ERRO_WIN32UI = str(_e)

PPD_DIR = "ppds"
os.makedirs(PPD_DIR, exist_ok=True)
PRINTER_PPD_MAP_FILE = "printer_ppd_map.json"

def get_printers():
    """Lists all printers on the Windows system or returns mocks if not on Windows."""
    if not HAS_WIN32:
        return ["Impressora Virtual PostScript", "Microsoft Print to PDF", "Xerox Altalink C8000"]
    try:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        printers = [p[2] for p in win32print.EnumPrinters(flags)]
        return printers
    except Exception as e:
        print(f"Error enumerating printers: {e}")
        return ["Default Printer"]

def get_ppd_list():
    """Returns a list of all uploaded and parsed PPDs."""
    ppds = []
    for f in os.listdir(PPD_DIR):
        if f.lower().endswith('.ppd'):
            path = os.path.join(PPD_DIR, f)
            parser = PPDParser(path)
            ppds.append({
                "filename": f,
                "model_name": parser.model_name,
                "nick_name": parser.nick_name,
                "options": parser.options
            })
    return ppds

def load_printer_ppd_map():
    if os.path.exists(PRINTER_PPD_MAP_FILE):
        try:
            with open(PRINTER_PPD_MAP_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_printer_ppd_map(mapping):
    with open(PRINTER_PPD_MAP_FILE, 'w') as f:
        json.dump(mapping, f, indent=4)

def convert_pdf_to_ps_with_ppd(pdf_path, selected_options_codes, dpi=150):
    """
    Converts PDF pages into PostScript Level 2 by rendering to JPEGs and encoding them in ASCII85.
    Injects custom PPD commands into the setup segment of the file.
    """
    doc = fitz.open(pdf_path)
    ps_lines = []

    # PS Header
    ps_lines.append("%!PS-Adobe-3.0")
    ps_lines.append("%%Creator: Ideal Imposition Print Service")
    ps_lines.append("%%LanguageLevel: 2")
    ps_lines.append(f"%%Pages: {len(doc)}")
    ps_lines.append("%%EndComments")

    # Setup Section where PPD codes are injected
    ps_lines.append("%%BeginSetup")
    for opt_key, code in selected_options_codes.items():
        if code:
            ps_lines.append(f"% Option: {opt_key}")
            ps_lines.append(code)
    ps_lines.append("%%EndSetup")

    # Helper function in PostScript to paint JPEG
    # This code handles scaling and uses ASCII85 & DCTDecode filter.
    ps_lines.append("""
/drawJPEG {
    /w exch def
    /h exch def
    gsave
    % Scale to match the page bounding box
    w h scale
    <<
        /ImageType 1
        /Width w
        /Height h
        /BitsPerComponent 8
        /Decode [0 1 0 1 0 1]
        /ImageMatrix [w 0 0 -h 0 h]
        /DataSource currentfile /ASCII85Decode filter /DCTDecode filter
    >> image
    grestore
} def
""")

    for i, page in enumerate(doc):
        ps_lines.append(f"%%Page: {i+1} {i+1}")
        
        # Page size in points (1 mm = 2.83465 points)
        rect = page.rect
        w_pts = int(rect.width)
        h_pts = int(rect.height)
        
        # Render page to high-res image
        pix = page.get_pixmap(dpi=dpi)
        img_data = pix.tobytes("jpg")
        img_w = pix.width
        img_h = pix.height
        
        # Encode to ASCII85
        a85_data = base64.a85encode(img_data).decode('ascii')
        
        # PostScript to position and render
        ps_lines.append(f"%%BeginPageSetup")
        ps_lines.append(f"<< /PageSize [{w_pts} {h_pts}] >> setpagedevice")
        ps_lines.append(f"%%EndPageSetup")
        
        ps_lines.append(f"{img_w} {img_h} drawJPEG")
        # Write ASCII85 data wrapped with standard '~>' PostScript EOD
        ps_lines.append(a85_data)
        ps_lines.append("~>")
        ps_lines.append("showpage")

    return "\n".join(ps_lines)

def send_print_job(printer_name, pdf_path, selected_options_codes, job_title="impressao.pdf"):
    """Converts a PDF to PS injecting PPD options, then sends directly to the print spooler."""
    try:
        ps_data = convert_pdf_to_ps_with_ppd(pdf_path, selected_options_codes)
        ps_bytes = ps_data.encode('utf-8')
    except Exception as e:
        return False, f"Failed to generate PostScript job: {e}"

    if not HAS_WIN32:
        # Save a mock print file to verify it in the scratch folder
        mock_output = os.path.join("C:\\Users\\Junior\\.gemini\\antigravity\\scratch", "spool_mock.ps")
        with open(mock_output, 'wb') as f:
            f.write(ps_bytes)
        return True, f"[MOCK] Job simulated. File saved in scratch/spool_mock.ps ({len(ps_bytes)} bytes)"

    try:
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            # We specify type 'RAW' so Windows doesn't try to parse it, passing it directly to the PostScript interpreter on the printer.
            hJob = win32print.StartDocPrinter(hPrinter, 1, (job_title, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, ps_bytes)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True, "Job sent to print spooler successfully."
    except Exception as e:
        return False, f"Windows Spooler Error: {e}"

def get_printer_capabilities(printer_name):
    """Retrieves all capabilities of the Windows printer driver (trays, papers, duplex, defaults)."""
    if not HAS_WIN32:
        return {
            "duplex_supported": True,
            "papers": [{"id": 9, "name": "A4"}, {"id": 8, "name": "A3"}],
            "trays": [{"id": 7, "name": "Auto"}, {"id": 4, "name": "Bypass Tray"}],
            "defaults": {
                "duplex": 1,
                "paper_size": 9,
                "tray": 7,
                "color": 2,
                "copies": 1
            }
        }
    
    try:
        import win32con
        h = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(h, 2)
            devmode = info["pDevMode"]
            
            # Query supported papers
            try:
                paper_names = win32print.DeviceCapabilities(printer_name, "", win32con.DC_PAPERNAMES)
                paper_ids = win32print.DeviceCapabilities(printer_name, "", win32con.DC_PAPERS)
                papers = [{"id": int(pid), "name": str(name)} for pid, name in zip(paper_ids, paper_names)]
            except Exception as e:
                print(f"Error getting papers: {e}")
                papers = []
                
            # Query supported trays
            try:
                tray_names = win32print.DeviceCapabilities(printer_name, "", win32con.DC_BINNAMES)
                tray_ids = win32print.DeviceCapabilities(printer_name, "", win32con.DC_BINS)
                trays = [{"id": int(tid), "name": str(name)} for tid, name in zip(tray_ids, tray_names)]
            except Exception as e:
                print(f"Error getting trays: {e}")
                trays = []
                
            # Check duplex support (assume True for production printers to prevent locking the dropdown)
            duplex_supported = True
                
            defaults = {
                "duplex": int(getattr(devmode, "Duplex", 1)) if devmode else 1,
                "paper_size": int(getattr(devmode, "PaperSize", 9)) if devmode else 9,
                "tray": int(getattr(devmode, "DefaultSource", 7)) if devmode else 7,
                "color": int(getattr(devmode, "Color", 2)) if devmode else 2,
                "copies": int(getattr(devmode, "Copies", 1)) if devmode else 1
            }
        finally:
            win32print.ClosePrinter(h)
            
        return {
            "duplex_supported": duplex_supported,
            "papers": papers,
            "trays": trays,
            "defaults": defaults
        }
    except Exception as e:
        print(f"Error getting capabilities for printer {printer_name}: {e}")
        return {
            "duplex_supported": False,
            "papers": [],
            "trays": [],
            "defaults": {
                "duplex": 1,
                "paper_size": 9,
                "tray": 7,
                "color": 2,
                "copies": 1
            }
        }

def _find_acrobat():
    """Localiza o executável do Adobe Acrobat DC no sistema."""
    candidates = [
        r"C:\Program Files\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
        r"C:\Program Files (x86)\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
        r"C:\Program Files\Adobe\Acrobat 2020\Acrobat\Acrobat.exe",
        r"C:\Program Files\Adobe\Acrobat 2017\Acrobat\Acrobat.exe",
        r"C:\Program Files (x86)\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
        r"C:\Program Files\Adobe\Acrobat Reader DC\Reader\AcroRd32.exe",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def _apply_devmode_options(printer_name, options):
    """
    Obt\u00e9m o DEVMODE da impressora, aplica as op\u00e7\u00f5es e valida via DocumentProperties.
    DocumentProperties garante que o driver (HP, Canon, Xerox, Konica, etc.) normalize
    o DEVMODE antes de criar o DC -- sem isso, op\u00e7\u00f5es podem ser ignoradas por alguns drivers.
    Retorna o devmode validado ou None.
    """
    if not HAS_WIN32:
        return None
    try:
        import win32con, pywintypes
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(hPrinter, 2)
            devmode = info["pDevMode"]
            if not devmode:
                return None

            # Aplicar opcoes do usuario
            if options.get("duplex") is not None:
                devmode.Duplex = int(options["duplex"])
            if options.get("paper_size") is not None:
                devmode.PaperSize = int(options["paper_size"])
            if options.get("tray") is not None:
                devmode.DefaultSource = int(options["tray"])
            if options.get("color") is not None:
                devmode.Color = int(options["color"])
            if options.get("copies") is not None:
                devmode.Copies = int(options["copies"])
            if options.get("orientation") is not None:
                devmode.Orientation = int(options["orientation"])  # 1=retrato, 2=paisagem

            # Validar DEVMODE via DocumentProperties (driver normaliza os valores)
            # Isso e critico para impressoras de diferentes fabricantes
            try:
                import win32api
                hWnd = win32api.GetConsoleWindow() if hasattr(win32api, 'GetConsoleWindow') else 0
                result = win32print.DocumentProperties(
                    hWnd,
                    hPrinter,
                    printer_name,
                    devmode,   # devmode de saida
                    devmode,   # devmode de entrada
                    0x0002 | 0x0008  # DM_IN_BUFFER | DM_OUT_BUFFER
                )
                if result < 0:
                    print(f"[print] Aviso: DocumentProperties retornou {result}, usando DEVMODE sem validacao")
            except Exception as dp_err:
                print(f"[print] Aviso DocumentProperties: {dp_err} -- usando DEVMODE direto")

            print(f"[print] DEVMODE ok: duplex={options.get('duplex')} papel={options.get('paper_size')} bandeja={options.get('tray')} cor={options.get('color')}")
            return devmode
        finally:
            win32print.ClosePrinter(hPrinter)
    except Exception as e:
        print(f"[print] Aviso DEVMODE: {e}")
    return None



def _find_ghostscript():
    """Localiza o executável do Ghostscript no sistema."""
    # Tentar no PATH primeiro
    for gs_name in ["gswin64c", "gswin32c", "gs"]:
        try:
            result = subprocess.run([gs_name, "--version"], capture_output=True, timeout=5)
            if result.returncode == 0:
                print(f"[print] Ghostscript encontrado no PATH: {gs_name} v{result.stdout.decode().strip()}")
                return gs_name
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    # Buscar em diretórios padrão
    search_dirs = [
        r"C:\Program Files\gs",
        r"C:\Program Files (x86)\gs",
    ]
    for search_dir in search_dirs:
        if os.path.isdir(search_dir):
            for root, dirs, files in os.walk(search_dir):
                for fname in files:
                    if fname.lower() in ("gswin64c.exe", "gswin32c.exe"):
                        full_path = os.path.join(root, fname)
                        print(f"[print] Ghostscript encontrado: {full_path}")
                        return full_path
    return None


def _rotulo_cor(cor_cfg):
    """Sufixo da mensagem de retorno dizendo o que foi aplicado de cor."""
    if not cor_cfg:
        return ""
    partes = []
    if cor_cfg.get("path"):
        partes.append(cor_cfg.get("nome") or "perfil")
    if cor_cfg.get("ajustes"):
        partes.append("ajustes")
    return f" [cores: {' + '.join(partes)}]" if partes else ""


def _send_pdf_raw(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
    """
    Envia o PDF diretamente ao spooler como dados RAW.
    A impressora precisa ter interpretador PDF embutido (Konica, Xerox, Canon, Ricoh modernas).
    Preserva 100% das fontes embutidas — zero conversão.

    Com cor_cfg, o perfil .icm da impressora e embutido como OutputIntent no
    PDF antes do envio: a controladora (Fiery, Konica, Ricoh) le o intent e
    converte no RIP dela.
    """
    if not HAS_WIN32:
        print(f"[print][PDF-RAW][MOCK] Job: {job_title} | Printer: {printer_name}")
        return True, "[MOCK] PDF RAW simulado com sucesso."

    pdf_temporario = None
    if cor_cfg and cor_cfg.get("path"):
        try:
            pdf_temporario = color_profiles.pdf_com_output_intent(pdf_path, cor_cfg)
            pdf_path = pdf_temporario
            print(f"[print][PDF-RAW] OutputIntent embutido: {cor_cfg['nome']} ({cor_cfg['classe']})")
        except Exception as e:
            print(f"[print][PDF-RAW] Aviso: OutputIntent nao embutido ({e}); enviando sem gerenciamento")

    try:
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            # Aplicar DEVMODE (duplex, bandeja, papel) via SetPrinter antes do job
            if devmode:
                try:
                    info = win32print.GetPrinter(hPrinter, 2)
                    info["pDevMode"] = devmode
                    win32print.SetPrinter(hPrinter, 2, info, 0)
                except Exception as dm_err:
                    print(f"[print][PDF-RAW] Aviso ao aplicar DEVMODE: {dm_err}")

            hJob = win32print.StartDocPrinter(hPrinter, 1, (job_title, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                with open(pdf_path, "rb") as f:
                    pdf_bytes = f.read()
                win32print.WritePrinter(hPrinter, pdf_bytes)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)

        size_mb = os.path.getsize(pdf_path) / (1024 * 1024)
        print(f"[print][PDF-RAW] Job enviado: {size_mb:.1f} MB para '{printer_name}'")
        sufixo_cor = _rotulo_cor(cor_cfg) if cor_cfg and cor_cfg.get("path") else ""
        return True, f"PDF enviado diretamente (RAW) para '{printer_name}' ({size_mb:.1f} MB).{sufixo_cor}"
    except Exception as e:
        err = f"Erro no envio PDF RAW: {e}"
        print(f"[print][PDF-RAW] {err}")
        return False, err
    finally:
        if pdf_temporario and os.path.exists(pdf_temporario):
            try:
                os.remove(pdf_temporario)
            except OSError:
                pass


def _send_ps_ghostscript(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
    """
    Converte PDF → PostScript via Ghostscript preservando fontes como Type 42 (vetorial).
    Funciona com qualquer impressora PostScript.

    Com cor_cfg, o GS converte as cores colorimetricamente para o perfil da
    impressora (inclusive o CMYK da arte do cliente) — e a conversao mais
    correta dos tres modos.
    """
    gs_exe = _find_ghostscript()
    if not gs_exe:
        return False, "Ghostscript nao encontrado no sistema."

    if not HAS_WIN32:
        print(f"[print][GS-PS][MOCK] Job: {job_title} | Printer: {printer_name}")
        return True, "[MOCK] Ghostscript PS simulado com sucesso."

    ps_path = None
    try:
        # Converter PDF → PostScript via Ghostscript
        ps_fd, ps_path = tempfile.mkstemp(suffix=".ps")
        os.close(ps_fd)

        cmd = [
            gs_exe, "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
            "-sDEVICE=ps2write",
            f"-sOutputFile={ps_path}",
            "-dEmbedAllFonts=true",
            "-dSubsetFonts=true",
            "-dCompressFonts=true",
        ] + color_profiles.args_ghostscript(cor_cfg) + [
            pdf_path
        ]
        print(f"[print][GS-PS] Convertendo PDF -> PS: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, timeout=120)

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            return False, f"Ghostscript falhou (code {result.returncode}): {stderr[:300]}"

        if not os.path.exists(ps_path) or os.path.getsize(ps_path) < 100:
            return False, "Ghostscript gerou arquivo PS vazio ou invalido."

        ps_size_mb = os.path.getsize(ps_path) / (1024 * 1024)
        print(f"[print][GS-PS] PS gerado: {ps_size_mb:.1f} MB")

        # Enviar PS para o spooler como RAW
        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            if devmode:
                try:
                    info = win32print.GetPrinter(hPrinter, 2)
                    info["pDevMode"] = devmode
                    win32print.SetPrinter(hPrinter, 2, info, 0)
                except Exception as dm_err:
                    print(f"[print][GS-PS] Aviso ao aplicar DEVMODE: {dm_err}")

            hJob = win32print.StartDocPrinter(hPrinter, 1, (job_title, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                with open(ps_path, "rb") as f:
                    win32print.WritePrinter(hPrinter, f.read())
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)

        print(f"[print][GS-PS] Job enviado com sucesso para '{printer_name}'")
        sufixo_cor = _rotulo_cor(cor_cfg) if cor_cfg and cor_cfg.get("path") else ""
        return True, f"PDF convertido para PostScript (Ghostscript) e enviado para '{printer_name}' ({ps_size_mb:.1f} MB).{sufixo_cor}"

    except subprocess.TimeoutExpired:
        return False, "Ghostscript timeout (>120s) na conversao PDF->PS."
    except Exception as e:
        import traceback
        err = f"Erro na impressao via Ghostscript: {e}\n{traceback.format_exc()}"
        print(f"[print][GS-PS] {err}")
        return False, err
    finally:
        if ps_path and os.path.exists(ps_path):
            try:
                os.remove(ps_path)
            except OSError:
                pass


PONTOS_POR_POLEGADA = 72.0


def retangulo_da_folha(largura_pt, altura_pt, dpi_x, dpi_y,
                       area_w, area_h, papel_w=0, papel_h=0,
                       offset_x=0, offset_y=0):
    """Onde a folha imposta e desenhada no papel, em pixels do dispositivo.

    ESCALA 100%, SEMPRE. O tamanho sai do PDF e do DPI da impressora, e de
    mais nada -- a area imprimivel nao entra na conta do TAMANHO, so na de
    saber se a folha coube.

    Ate 17/08/2026 este calculo era um "ajustar para caber": a pagina era
    esticada sobre `HORZRES` x `VERTRES`, que e a AREA IMPRIMIVEL do driver.
    Toda impressora tem margem morta, entao a area e sempre menor que o papel
    -- e a folha saia encolhida pela razao da margem, tipicamente de 3% a 6%,
    mesmo com o papel certo escolhido.

    Numa grafica isso nao e detalhe de acabamento. A imposicao carrega marca de
    corte, sangria e registro, e a guilhotina corta pela medida nominal: uma
    folha 4% menor faz o corte pegar arte, e a tiragem inteira vira refugo.
    Vale aqui a mesma regra que ja governa os elementos de numeracao -- tamanho
    original, escala 100%, sem distorcao.

    O deslocamento tambem importa. A origem do GDI e o canto da AREA
    imprimivel, e nao o do papel; centralizar sem descontar `PHYSICALOFFSET`
    joga a folha para um lado e a tira de esquadro com a borda pela qual ela
    vai ser cortada.

    @returns (dx, dy, largura_px, altura_px, coube)

    `coube` compara com o PAPEL, e nao com a area imprimivel. A diferenca nao e
    detalhe: uma folha imposta tem o tamanho da folha de papel, e area
    imprimivel nenhuma chega na borda -- entao contra a area NADA cabe, e o
    aviso dispararia em todo trabalho. Aviso que sempre aparece ninguem le.
    Perder a margem morta e o normal da grafica, que imprime em papel maior e
    refila depois; passar do PAPEL e que e erro de escolha de bandeja.

    Ainda assim a folha e desenhada em 100% nos dois casos. Encolher resolveria
    a tela e estragaria a tiragem em silencio; o corte, o operador ve.
    """
    largura_px = int(round(largura_pt / PONTOS_POR_POLEGADA * dpi_x))
    altura_px = int(round(altura_pt / PONTOS_POR_POLEGADA * dpi_y))

    if papel_w > 0 and papel_h > 0:
        # Centralizada no PAPEL, descontando de onde a area imprimivel comeca.
        dx = (papel_w - largura_px) // 2 - offset_x
        dy = (papel_h - altura_px) // 2 - offset_y
    else:
        # Driver antigo nao informa o papel fisico. Centraliza no que se sabe --
        # ainda em 100%, que e o que nao pode mudar.
        dx = (area_w - largura_px) // 2
        dy = (area_h - altura_px) // 2

    if papel_w > 0 and papel_h > 0:
        coube = largura_px <= papel_w and altura_px <= papel_h
    else:
        coube = largura_px <= area_w and altura_px <= area_h
    return dx, dy, largura_px, altura_px, coube


def _send_gdi_raster(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
    """
    Fallback: Envia PDF via GDI/PIL rasterizando para imagem.
    Funciona com qualquer impressora mas perde qualidade vetorial das fontes.

    Com cor_cfg, o raster sRGB passa pela transformacao LittleCMS do perfil da
    impressora antes de ir ao driver — sem isso o driver faz a conversao dele
    as cegas, que e a origem da variacao de cor deste modo.
    """
    if not HAS_WIN32:
        print(f"[print][GDI][MOCK] Job: {job_title} | Printer: {printer_name}")
        return True, "[MOCK] GDI raster simulado com sucesso."

    if not HAS_WIN32UI:
        # O caso do pedido 21524 (03/09/2026): sem isto, o ImportError caia no
        # `except Exception` la embaixo e o operador via um traceback em ingles
        # dentro do erro HTTP. Aqui ele ve o que falta e o que fazer.
        msg = ("Esta estação não consegue imprimir no modo GDI: falta o "
               "componente win32ui do Windows (pywin32) nesta máquina. "
               "Reinicie o NewProd; se persistir, reinstale o NewProd ou "
               "instale o \"Microsoft Visual C++ Redistributável (x64)\" da "
               "Microsoft nesta estação, e avise o suporte.")
        # A causa tecnica vai junto, em UMA linha e sem traceback: e o unico
        # dado que diz de onde partir da proxima vez.
        if ERRO_WIN32UI:
            msg += f" (causa: {ERRO_WIN32UI})"
        print(f"[print][GDI] {msg}")
        return False, msg

    try:
        from PIL import Image, ImageWin
        import io as _io

        hPrinter = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(hPrinter, 2)
            dm = devmode if devmode else info["pDevMode"]
            hdc = win32gui.CreateDC("WINSPOOL", printer_name, dm)
            dc = win32ui.CreateDCFromHandle(hdc)
            try:
                dc.StartDoc(job_title)
                print_w = dc.GetDeviceCaps(win32con.HORZRES)
                print_h = dc.GetDeviceCaps(win32con.VERTRES)
                dpi_x   = dc.GetDeviceCaps(win32con.LOGPIXELSX)
                dpi_y   = dc.GetDeviceCaps(win32con.LOGPIXELSY)
                render_dpi = max(dpi_x, dpi_y, 300)
                # O PAPEL inteiro e de onde a area imprimivel comeca dentro
                # dele. Sao estes quatro numeros que permitem desenhar em 100%
                # no lugar certo em vez de esticar sobre a area. Driver que nao
                # os informa devolve 0, e o `retangulo_da_folha` trata.
                papel_w = dc.GetDeviceCaps(win32con.PHYSICALWIDTH)
                papel_h = dc.GetDeviceCaps(win32con.PHYSICALHEIGHT)
                off_x   = dc.GetDeviceCaps(win32con.PHYSICALOFFSETX)
                off_y   = dc.GetDeviceCaps(win32con.PHYSICALOFFSETY)
                nao_coube = []

                # Transformacao de cor criada UMA vez por trabalho e usada em
                # todas as folhas; falha vira aviso e o job segue sem cor
                # gerenciada — producao nunca para por causa de perfil.
                transform_cor = None
                if cor_cfg and cor_cfg.get("path"):
                    try:
                        transform_cor = color_profiles.transform_para_gdi(cor_cfg)
                        print(f"[print][GDI] Gerenciamento de cores ativo: {cor_cfg['nome']} ({cor_cfg['classe']}, {cor_cfg['intento']})")
                    except Exception as e:
                        print(f"[print][GDI] Aviso: transformacao de cor falhou ({e}); imprimindo sem gerenciamento")
                ajustes_cor = (cor_cfg or {}).get("ajustes")
                if ajustes_cor:
                    print(f"[print][GDI] Ajustes de cor ativos: "
                          f"saturacao={ajustes_cor.get('saturacao', 100)} "
                          f"brilho={ajustes_cor.get('brilho', 0)} "
                          f"contraste={ajustes_cor.get('contraste', 0)}")

                doc = fitz.open(pdf_path)
                total_pages = len(doc)
                print(f"[print][GDI] {total_pages} pagina(s) @ {render_dpi} DPI para '{printer_name}' (raster fallback)")

                for page_num in range(total_pages):
                    page = doc[page_num]
                    dc.StartPage()

                    pix = page.get_pixmap(dpi=render_dpi)
                    img = Image.open(_io.BytesIO(pix.tobytes("png")))
                    # Ordem obrigatoria: ajustes em sRGB ANTES do perfil ICC
                    # (mesma ordem da previa na tela)
                    if ajustes_cor:
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        img = color_profiles.aplicar_ajustes(img, ajustes_cor)
                    if transform_cor is not None:
                        from PIL import ImageCms as _cms
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        img = _cms.applyTransform(img, transform_cor)
                    # ESCALA 100%: o tamanho vem do PDF e do DPI, e nao da area
                    # imprimivel. Ver `retangulo_da_folha` para por que
                    # "ajustar para caber" arruinava a tiragem.
                    dx, dy, draw_w, draw_h, coube = retangulo_da_folha(
                        page.rect.width, page.rect.height, dpi_x, dpi_y,
                        print_w, print_h, papel_w, papel_h, off_x, off_y)
                    if not coube:
                        nao_coube.append(page_num + 1)

                    dib = ImageWin.Dib(img)
                    dib.draw(hdc, (dx, dy, dx + draw_w, dy + draw_h))
                    dc.EndPage()
                    print(f"[print][GDI] pagina {page_num + 1}/{total_pages} "
                          f"enviada em 100% ({draw_w}x{draw_h} px @ {dpi_x}x{dpi_y} dpi)"
                          + ("" if coube else "  ATENCAO: maior que a area imprimivel"))

                dc.EndDoc()
                doc.close()
                print(f"[print][GDI] job concluido (raster)")
            finally:
                dc.DeleteDC()
        finally:
            win32print.ClosePrinter(hPrinter)

        # O aviso SOBE para a tela, e nao fica so no log. A folha saiu em 100% e
        # a impressora cortou o que passou da area imprimivel: o operador precisa
        # saber ANTES de mandar a tiragem toda, e o log do agente ele nao le.
        recado = ""
        if nao_coube:
            quais = ", ".join(str(n) for n in nao_coube[:8])
            recado = (f" ATENCAO: a folha e maior que a area imprimivel desta "
                      f"impressora (pagina(s) {quais}) e saiu CORTADA. Ela foi "
                      f"impressa em tamanho real, sem reducao — confira o papel "
                      f"e a bandeja escolhidos.")
        return True, (f"PDF enviado via GDI (raster) para '{printer_name}'."
                      f"{_rotulo_cor(cor_cfg)}{recado}")
    except Exception as e:
        import traceback
        err = f"Erro na impressao GDI: {e}\n{traceback.format_exc()}"
        print(err)
        return False, err


def send_print_job_windows(printer_name, pdf_path, options, job_title="impressao.pdf"):
    """
    Pipeline de impressão com suporte a múltiplas estratégias.

    O PADRÃO é "gdi", e não "pdf_raw" — a linha abaixo é a autoridade, e este
    texto já disse o contrário por um tempo. O GDI virou padrão de propósito
    (commit 1ee3c06): impressora desktop sem interpretador PostScript, como a
    Epson L3210 da gráfica, cospe o código PS em texto quando recebe RAW.

    Vale saber que o Painel de Produção NÃO manda `print_mode` nenhum — ele
    envia só papel, bandeja, duplex, cor, cópias e orientação. Ou seja: toda
    impressão do painel passa pelo GDI, e é por isso que o "ajustar para caber"
    que morava lá dentro afetava a gráfica inteira.

    Cuidado com o nome: este `print_mode` é o DRIVER, e não tem relação com o
    `print_mode` de "front"/"duplex" que o `engine.py` e o `db.py` usam para
    frente e verso. São dois campos homônimos com significados diferentes.

    O usuário pode selecionar o modo via options["print_mode"]:
      - "pdf_raw" (padrão) → envia PDF direto ao spooler (requer impressora com interpretador PDF)
      - "ghostscript" → converte PDF→PS vetorial via Ghostscript (qualquer impressora PS)
      - "gdi" → rasteriza para imagem via GDI (fallback, perde qualidade vetorial)
      - "auto" → tenta pdf_raw → ghostscript → gdi em cascata
    """
    # Config de cor da impressora de destino (perfil .icm, intento). Resolvida
    # UMA vez por trabalho; None quando o recurso esta desligado — e ai tudo
    # se comporta exatamente como antes do gerenciamento de cores existir.
    cor_cfg, aviso_cor = color_profiles.resolver_config(printer_name)
    sufixo_aviso = f" AVISO: {aviso_cor}" if aviso_cor else ""

    if not HAS_WIN32:
        print(f"[print][MOCK] Job: {job_title} | Printer: {printer_name} | PDF: {pdf_path}")
        return True, f"[MOCK] Impressao simulada com sucesso.{sufixo_aviso}"

    # Obter DEVMODE com as opcoes do usuario (duplex, bandeja, papel, etc.)
    devmode = _apply_devmode_options(printer_name, options)

    print_mode = options.get("print_mode", "gdi").lower().strip()
    print(f"[print] Modo de impressao: '{print_mode}' para '{printer_name}'")

    # Modo forçado
    modo_forcado = {"pdf_raw": _send_pdf_raw,
                    "ghostscript": _send_ps_ghostscript,
                    "gdi": _send_gdi_raster}.get(print_mode)
    if modo_forcado:
        ok, msg = modo_forcado(printer_name, pdf_path, devmode, job_title, cor_cfg)
        if ok:
            msg += sufixo_aviso
        return ok, msg

    # Modo automático: PDF RAW → Ghostscript PS → GDI Raster
    errors = []

    # Estratégia 1: PDF RAW (mais rápido, preserva fontes)
    print("[print] Tentando estrategia 1: PDF RAW direto...")
    ok, msg = _send_pdf_raw(printer_name, pdf_path, devmode, job_title, cor_cfg)
    if ok:
        return True, msg + sufixo_aviso
    errors.append(f"PDF-RAW: {msg}")
    print(f"[print] PDF RAW falhou, tentando Ghostscript...")

    # Estratégia 2: Ghostscript PS (vetorial, universal)
    ok, msg = _send_ps_ghostscript(printer_name, pdf_path, devmode, job_title, cor_cfg)
    if ok:
        return True, msg + sufixo_aviso
    errors.append(f"GS-PS: {msg}")
    print(f"[print] Ghostscript falhou, usando GDI raster (fallback)...")

    # Estratégia 3: GDI Raster (fallback seguro)
    ok, msg = _send_gdi_raster(printer_name, pdf_path, devmode, job_title, cor_cfg)
    if ok:
        return True, f"{msg} (AVISO: modo raster - fontes nao vetoriais){sufixo_aviso}"
    errors.append(f"GDI: {msg}")

    all_errors = " | ".join(errors)
    return False, f"Todas as estrategias de impressao falharam: {all_errors}"

