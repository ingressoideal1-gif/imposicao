import os

files_to_fix = [
    'frontend/index.html',
    'frontend/script.js',
    'frontend/style.css'
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
    
    # Tentativa de ler com utf-8 primeiro para ver se já está ok
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Se leu tudo com utf-8, então já está utf-8
            print(f"{file_path} is already valid utf-8.")
            continue
    except UnicodeDecodeError:
        pass # Cai no bloco abaixo se falhar

    print(f"Fixing encoding for {file_path}...")
    # Lê usando windows-1252 (Latin-1)
    with open(file_path, 'r', encoding='windows-1252') as f:
        content = f.read()

    # Salva usando utf-8
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fixed {file_path}")

