import os

def fix_encoding(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Use latin1 instead of cp1252
        fixed = content.encode('latin1').decode('utf-8')
        
        with open(filepath + ".fixed", 'w', encoding='utf-8') as f:
            f.write(fixed)
            
        print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error on {filepath}: {e}")

fix_encoding(r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\pedido.js")
