import os, sys

sys.stdout.reconfigure(encoding='utf-8')

frontend_dir = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
matches = []

for root, dirs, files in os.walk(frontend_dir):
    for f in files:
        if f.endswith((".js", ".html")):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8", errors="ignore") as file:
                for idx, line in enumerate(file, 1):
                    line_lower = line.lower()
                    if ("num" in line_lower or "canvas" in line_lower or "verso" in line_lower or "modal" in line_lower) and ("preview" in line_lower or "frente" in line_lower or "verso" in line_lower or "numeracao_2" in line_lower or "numeracao2" in line_lower):
                        matches.append((f, idx, line.strip()[:150]))

print(f"Total matches: {len(matches)}")
for filename, line_no, text in matches[:60]:
    print(f"{filename}:{line_no} -> {text}")
