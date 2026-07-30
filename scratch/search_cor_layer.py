import os, sys

sys.stdout.reconfigure(encoding='utf-8')

dir_path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"
matches = []

for filename in ["frontend/pedido.js", "frontend/script.js"]:
    p = os.path.join(dir_path, filename)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8", errors="ignore") as file:
            for idx, line in enumerate(file, 1):
                if any(kw in line.lower() for kw in ["amostra_cor_id", "state.cores", "corobj", "pdf_verso_url"]):
                    matches.append((filename, idx, line.strip()[:140]))

print(f"Total matches: {len(matches)}")
for filename, line_no, text in matches:
    print(f"{filename}:{line_no} -> {text}")
