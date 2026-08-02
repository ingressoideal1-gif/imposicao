import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('frontend/script.js', 'r', encoding='utf-8') as f:
    js = f.read()

for m in re.finditer(r'carregarModelosGlobais', js):
    start = max(0, m.start() - 100)
    end = min(len(js), m.end() + 200)
    print("Match:", js[start:end].replace('\n', ' '))

