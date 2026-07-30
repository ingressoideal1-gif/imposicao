import os, sys

sys.stdout.reconfigure(encoding='utf-8')

frontend_dir = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
matches = []

for root, dirs, files in os.walk(frontend_dir):
    for f in files:
        if f.endswith(".js"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as file:
                for idx, line in enumerate(file, 1):
                    if "amostra_num" in line.lower() or "amostra-item-canvas" in line.lower() or "renderamostraitemcanvas" in line.lower() or "loadnumeracao" in line.lower() or "drawcanvas" in line.lower():
                        matches.append((f, idx, line.strip()[:150]))

print(f"Total matches: {len(matches)}")
for filename, line_no, text in matches:
    print(f"{filename}:{line_no} -> {text}")
