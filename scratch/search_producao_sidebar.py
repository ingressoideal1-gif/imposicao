import os, sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\producao.html"
matches = []

with open(path, "r", encoding="utf-8", errors="ignore") as file:
    for idx, line in enumerate(file, 1):
        if any(kw in line.lower() for kw in ["estágio de produção", "estagio de producao", "métricas do dia", "metricas do dia"]):
            matches.append((idx, line.strip()[:140]))

print(f"Total matches in producao.html: {len(matches)}")
for line_no, text in matches:
    print(f"producao.html:{line_no} -> {text}")
