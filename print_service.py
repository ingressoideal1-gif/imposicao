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
