import os
import base64
import json
import fitz  # PyMuPDF
from ppd_parser import PPDParser

try:
    import win32print
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

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

def send_print_job(printer_name, pdf_path, selected_options_codes, job_title="Imposição Job"):
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



def send_print_job_windows(printer_name, pdf_path, options, job_title="Ideal Imposition Job"):
    """
    Envia PDF via GDI/PIL para o driver Windows.
    O driver PS da KONICA converte a imagem para PostScript e envia via TCP/IP.
    """
    import subprocess

    if not HAS_WIN32:
        print(f"[print][MOCK] Job: {job_title} | Printer: {printer_name} | PDF: {pdf_path}")
        return True, "[MOCK] Impressao simulada com sucesso."

    # Obter DEVMODE com as opcoes do usuario (duplex, bandeja, papel, etc.)
    devmode = _apply_devmode_options(printer_name, options)

    try:
        import win32gui, win32ui, win32con
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

                doc = fitz.open(pdf_path)
                total_pages = len(doc)
                print(f"[print] GDI: {total_pages} pagina(s) @ {render_dpi} DPI para '{printer_name}'")

                for page_num in range(total_pages):
                    page = doc[page_num]
                    dc.StartPage()

                    pix = page.get_pixmap(dpi=render_dpi)
                    img = Image.open(_io.BytesIO(pix.tobytes("png")))
                    img_w, img_h = img.size

                    ratio_img   = img_w / img_h
                    ratio_print = print_w / print_h
                    if ratio_img > ratio_print:
                        draw_w = print_w
                        draw_h = int(print_w / ratio_img)
                        dx, dy = 0, (print_h - draw_h) // 2
                    else:
                        draw_h = print_h
                        draw_w = int(print_h * ratio_img)
                        dx, dy = (print_w - draw_w) // 2, 0

                    dib = ImageWin.Dib(img)
                    dib.draw(hdc, (dx, dy, dx + draw_w, dy + draw_h))
                    dc.EndPage()
                    print(f"[print] GDI: pagina {page_num + 1}/{total_pages} enviada")

                dc.EndDoc()
                doc.close()
                print(f"[print] GDI: job concluido com sucesso")
            finally:
                dc.DeleteDC()
        finally:
            win32print.ClosePrinter(hPrinter)

        return True, f"PDF enviado via GDI para '{printer_name}'."
    except Exception as e:
        import traceback
        err = f"Erro na impressao GDI: {e}\n{traceback.format_exc()}"
        print(err)
        return False, err
