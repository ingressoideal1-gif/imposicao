import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path_js = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\frontend\script.js'
path_agent = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\local_print_agent.py'

# ===== FIX 3: script.js - ícone de aviso no texto do botão =====
content = open(path_js, encoding='utf-8').read()
lines = content.split('\n')

# Linha 5729 (índice 5728) tem o texto do botão
print(f"Linha 5729: {repr(lines[5728][:120])}")

# Trocar o texto interno do botão para indicar quando precisa reenviar
old_text = "${a.pdf_name ? '📄 ' + a.pdf_name : '📁 Escolher PDF'}"
new_text = "${a.rawFile ? '📄 ' + a.pdf_name : (a.pdf_url === 'local_file' ? '⚠️ Reenviar: ' + a.pdf_name : '📁 Escolher PDF')}"

found = old_text in lines[5728]
print(f"Texto botão encontrado: {found}")
if found:
    lines[5728] = lines[5728].replace(old_text, new_text)
    print(f"Novo texto: {repr(lines[5728][:140])}")

# Inserir linha de aviso abaixo do botão (após </button> que é linha 5731, índice 5730)
# Procurar </button> próximo à linha 5730
for i in range(5728, 5736):
    print(f"  {i+1}: {repr(lines[i][:80])}")

# Inserir após </button> (índice 5730)
warning_line = "                    ${a.pdf_url === 'local_file' && !a.rawFile ? `<span style=\"color:#f59e0b;font-size:0.7rem;\">⚠️ Faça o upload novamente</span>` : ''}"
lines.insert(5732, warning_line)  # Após </button> e linha vazia
lines.insert(5732, '')  # Linha em branco para organização

print(f"Aviso inserido na linha 5733")

open(path_js, 'w', encoding='utf-8').write('\n'.join(lines))
print("script.js (ícone) atualizado!")

# ===== FIX 4: local_print_agent.py - adicionar logs de diagnóstico =====
content_agent = open(path_agent, encoding='utf-8').read()
lines_agent = content_agent.split('\n')

for i, line in enumerate(lines_agent):
    if 'for ma in multi_artes_list:' in line:
        start_ma = i
        break

print(f"\nlocal_print_agent: 'for ma in multi_artes_list' em linha {start_ma+1}")
for i in range(start_ma, start_ma + 6):
    print(f"  {i+1}: {repr(lines_agent[i][:80])}")

# Inserir logs após o loop
insert_after = start_ma + 4
diag_lines = [
    '        # Diagnóstico multi_artes',
    '        print(f"[multi_artes:agent] Arquivos recebidos ({len(ma_files_map)}): {list(ma_files_map.keys())}")',
    '        for _ma in multi_artes_list:',
    '            _pn = _ma.get("pdf_name"); _lp = _ma.get("local_path")',
    '            print(f"[multi_artes:agent] Arte pdf_name={_pn!r} -> local_path={_lp is not None}")',
]
lines_agent = lines_agent[:insert_after] + diag_lines + lines_agent[insert_after:]
open(path_agent, 'w', encoding='utf-8').write('\n'.join(lines_agent))
print("local_print_agent.py atualizado!")
