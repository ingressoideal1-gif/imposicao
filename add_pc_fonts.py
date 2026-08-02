import glob
import os
import shutil
import sys

sys.path.append('.')
import db

windows_fonts = "C:/Windows/Fonts"
frontend_fonts = os.path.join("frontend", "fonts_local")

if not os.path.exists(frontend_fonts):
    os.makedirs(frontend_fonts)

# Pegar todas as fontes ttf
ttf_files = glob.glob(os.path.join(windows_fonts, "*.ttf"))
# Pegar tambem as maiusculas
ttf_files.extend(glob.glob(os.path.join(windows_fonts, "*.TTF")))
ttf_files = list(set(ttf_files))

added = 0
for fpath in ttf_files:
    fname = os.path.basename(fpath)
    base_name = os.path.splitext(fname)[0]
    
    # Copiar arquivo
    dest_path = os.path.join(frontend_fonts, fname)
    if not os.path.exists(dest_path):
        try:
            shutil.copy2(fpath, dest_path)
        except Exception as e:
            print(f"Erro ao copiar {fname}: {e}")
            continue
            
    # Registrar no banco
    font_data = {
        'nome': base_name,
        'font_family': base_name,
        'categoria': 'Sistema',
        'arquivo_url': f"/fonts_local/{fname}",
        'ativo': True
    }
    
    try:
        saved = db.save_catalogo_fonte(font_data)
        if saved:
            added += 1
            if added % 10 == 0:
                print(f"Adicionadas {added} fontes do PC...")
    except Exception as e:
        print(f"Erro ao salvar {base_name}: {e}")

print(f"Concluido! Foram adicionadas {added} fontes do PC ao catalogo web.")
