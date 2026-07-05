import os

replacements = {
    "NÃºm.": "Núm.",
    "SÃ“ FRENTE": "SÓ FRENTE",
    "VERSO VARIÃ VEL": "VERSO VARIÁVEL"
}

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for k, v in replacements.items():
            new_content = new_content.replace(k, v)
            
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {filepath}")
        else:
            print(f"No changes for {filepath}")
    except Exception as e:
        print(f"Error on {filepath}: {e}")

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
for file in os.listdir(folder):
    if file.endswith('.js') or file.endswith('.html'):
        fix_file(os.path.join(folder, file))
