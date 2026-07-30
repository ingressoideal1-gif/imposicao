import sys

sys.stdout.reconfigure(encoding='utf-8')

path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend\pedido.js"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

depth = 0
for i, line in enumerate(lines, 1):
    if i < 3280 or i > 4200:
        stripped = line.strip()
        if stripped.startswith('//'):
            continue
        opens = line.count('{')
        closes = line.count('}')
        depth += opens - closes
        continue
    
    stripped = line.strip()
    if stripped.startswith('//'):
        continue
    opens = line.count('{')
    closes = line.count('}')
    prev_depth = depth
    depth += opens - closes
    if opens > 0 or closes > 0:
        print(f"L{i}: depth {prev_depth}->{depth} [{'+' if opens>0 else ''}{opens}o,{closes}c]: {stripped[:120]}")

print(f"\nFinal depth at L4200: {depth}")
