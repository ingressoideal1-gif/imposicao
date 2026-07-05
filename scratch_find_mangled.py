import os
import re

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
files_to_check = ['script.js', 'pedido.js', 'cliente.js', 'producao.html', 'index.html']

found = set()
for filename in files_to_check:
    filepath = os.path.join(folder, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Only match words that contain characters between 0xC0 and 0xFF
            matches = re.findall(r'[a-zA-Z]*[\xC0-\xFF][a-zA-Z0-9\xC0-\xFF]*', content)
            for m in matches:
                found.add(m)
    except Exception as e:
        print(f"Error reading {filename}: {e}")

with open('mangled.txt', 'w', encoding='utf-8') as f:
    for w in sorted(found):
        f.write(w + "\n")
