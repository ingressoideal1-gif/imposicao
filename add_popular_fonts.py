import urllib.request
import re
import json
import time

# We need to run inside the context of the app to use db.py
import sys
sys.path.append('.')
import db

FONTS = [
    ('Roboto', 'Sans Serif'),
    ('Open Sans', 'Sans Serif'),
    ('Lato', 'Sans Serif'),
    ('Montserrat', 'Sans Serif'),
    ('Poppins', 'Sans Serif'),
    ('Inter', 'Sans Serif'),
    ('Oswald', 'Sans Serif'),
    ('Raleway', 'Sans Serif'),
    ('Noto Sans', 'Sans Serif'),
    ('Ubuntu', 'Sans Serif'),
    ('Playfair Display', 'Serif'),
    ('Merriweather', 'Serif'),
    ('Roboto Mono', 'Monospace'),
    ('PT Sans', 'Sans Serif'),
    ('Rubik', 'Sans Serif'),
    ('Lora', 'Serif'),
    ('Work Sans', 'Sans Serif'),
    ('Fira Sans', 'Sans Serif'),
    ('Mulish', 'Sans Serif'),
    ('Quicksand', 'Sans Serif'),
    ('Inconsolata', 'Monospace'),
    ('Barlow', 'Sans Serif'),
    ('Nunito', 'Sans Serif'),
    ('Titillium Web', 'Sans Serif'),
    ('Heebo', 'Sans Serif'),
    ('Josefin Sans', 'Sans Serif'),
    ('Cabin', 'Sans Serif'),
    ('Libre Baskerville', 'Serif'),
    ('Anton', 'Sans Serif'),
    ('Bitter', 'Serif'),
    ('Pacifico', 'Handwriting'),
    ('Dancing Script', 'Handwriting'),
    ('Dosis', 'Sans Serif'),
    ('Varela Round', 'Sans Serif'),
    ('Arimo', 'Sans Serif'),
    ('Asap', 'Sans Serif'),
    ('Oxygen', 'Sans Serif'),
    ('Mukta', 'Sans Serif'),
    ('Fjalla One', 'Sans Serif'),
    ('Bebas Neue', 'Display'),
    ('Exo 2', 'Sans Serif'),
    ('Righteous', 'Display'),
    ('Comfortaa', 'Display'),
    ('Lobster', 'Display'),
    ('Abril Fatface', 'Display'),
    ('Bungee', 'Display'),
    ('Alfa Slab One', 'Display')
]

def get_font_url(family_name, weight='400'):
    css_url = f'https://fonts.googleapis.com/css?family={family_name.replace(" ", "+")}:{weight}&display=swap'
    req = urllib.request.Request(css_url, headers={'User-Agent': 'curl/7.68.0'})
    try:
        with urllib.request.urlopen(req) as res:
            css = res.read().decode('utf-8')
            match = re.search(r'url\((https://[^)]+\.ttf)\)', css)
            if match:
                return match.group(1)
    except Exception as e:
        print(f"Error fetching {family_name}: {e}")
    return None

added = 0
for name, category in FONTS:
    print(f"Buscando {name}...")
    ttf_url = get_font_url(name)
    if not ttf_url:
        print(f"  -> Nao foi possivel obter URL TTF para {name}")
        continue
        
    font_data = {
        'nome': name,
        'font_family': name,
        'categoria': category,
        'arquivo_url': ttf_url,
        'ativo': True
    }
    try:
        saved = db.save_catalogo_fonte(font_data)
        if saved:
            print(f"  -> Salvo: {name} ({ttf_url})")
            added += 1
    except Exception as e:
        print(f"  -> Erro ao salvar {name}: {e}")
        
    time.sleep(0.2)

print(f"Concluido! Foram adicionadas {added} fontes.")
