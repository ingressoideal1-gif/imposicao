import os

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
files_to_check = ['script.js', 'pedido.js', 'cliente.js', 'mapas.js', 'producao.html', 'index.html', 'cliente.html']

for filename in files_to_check:
    filepath = os.path.join(folder, filename)
    try:
        with open(filepath, 'rb') as f:
            content = f.read()
        
        # Check if already has BOM
        if not content.startswith(b'\xef\xbb\xbf'):
            with open(filepath, 'wb') as f:
                f.write(b'\xef\xbb\xbf' + content)
            print(f"Added BOM to {filename}")
        else:
            print(f"{filename} already has BOM")
            
    except Exception as e:
        print(f"Error on {filename}: {e}")
