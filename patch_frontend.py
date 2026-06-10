import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path_js = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\frontend\script.js'
path_app = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\app.py'

# ===== FIX 1: script.js =====
content = open(path_js, encoding='utf-8').read()
lines = content.split('\n')

# Fix 1a: Botão de upload (linha 5727, índice 5726)
# Antes: ${a.pdf_url ? 'btn-outline' : 'btn-primary'}
# Depois: indicar vermelho se pdf_url=local_file mas sem rawFile
old_btn = "class=\"btn btn-sm ${a.pdf_url ? \\'btn-outline\\' : \\'btn-primary\\'}\""
new_btn = "class=\"btn btn-sm ${(a.pdf_url && (a.pdf_url !== \\'local_file\\' || a.rawFile)) ? \\'btn-outline\\' : \\'btn-primary\\'}\""

print(f"Botão encontrado: {old_btn in lines[5726]}")
lines[5726] = lines[5726].replace(
    "class=\"btn btn-sm ${a.pdf_url ? 'btn-outline' : 'btn-primary'}\"",
    "class=\"btn btn-sm ${(a.pdf_url && (a.pdf_url !== 'local_file' || a.rawFile)) ? 'btn-outline' : 'btn-primary'}\""
)
print(f"Botão depois: {lines[5726][:120]}")

# Adicionar aviso visual logo após o botão (linha 5728 é vazia - inserir após ela)
# Achar a linha com btn-upload-multi para referência
btn_line = 5726
# Achar o fechamento do <div style="display:flex; gap:5px> para inserir o aviso
# Linha 5727 = '' (vazia), 5728 vai ter o ícone do arquivo
# Inserir uma nova linha com o aviso depois do </div> do botão
# Vamos inserir antes do fechamento do div externo
# Encontrar onde inserir o aviso
for i in range(btn_line + 1, btn_line + 15):
    print(f"  {i+1}: {repr(lines[i][:80])}")

print("---")

# Fix 1b: Validação (linhas 6371-6375, índice 6370-6374)
print(f"Validação encontrada: {lines[6370][:80]}")
lines[6370] = "            if (!state.impMultiArtes[i].pdf_url || (state.impMultiArtes[i].pdf_url === 'local_file' && !state.impMultiArtes[i].rawFile)) {"
lines[6372] = "                return toast(`Arte ${i + 1}: faça o upload do PDF da arte (necessário a cada sessão).`, 'error');"
print(f"Validação nova: {lines[6370][:120]}")

# Salvar script.js
open(path_js, 'w', encoding='utf-8').write('\n'.join(lines))
print("script.js atualizado!")

# ===== FIX 2: app.py - adicionar logs de diagnóstico =====
content_app = open(path_app, encoding='utf-8').read()
lines_app = content_app.split('\n')

# Achar linha 319 (após o loop que seta local_path) 
# Linha 320: "        for ma in multi_artes_list:"
# Achar o índice
for i, line in enumerate(lines_app):
    if 'for ma in multi_artes_list:' in line:
        start_ma = i
        break

print(f"Linha 'for ma in multi_artes_list' em {start_ma+1}")
# Após a linha "ma['local_path'] = ma_files_map[pdf_name]" (índice +3 aprox)
# Achar a linha após o loop for ma
for i in range(start_ma, start_ma + 8):
    print(f"  {i+1}: {repr(lines_app[i][:80])}")

# Inserir prints de diagnóstico após o loop (após "ma["local_path"]...")
# O loop é: for ma in: / pdf_name = / if pdf_name and pdf_name in: / ma["local_path"] = 
# Inserir após o bloco do for ma (aproximadamente start_ma + 4)
insert_after = start_ma + 4  # logo após o final do for ma

diag_lines = [
    '        # Diagnóstico multi_artes (Render logs)',
    '        print(f"[multi_artes] Arquivos recebidos ({len(ma_files_map)}): {list(ma_files_map.keys())}")',
    '        for _ma in multi_artes_list:',
    '            _pn = _ma.get("pdf_name"); _lp = _ma.get("local_path")',
    '            print(f"[multi_artes] Arte pdf_name={_pn!r} -> local_path={_lp is not None}")',
]

# Verificar o ponto de inserção
print(f"Inserindo diag após linha {insert_after+1}: {repr(lines_app[insert_after][:60])}")
lines_app = lines_app[:insert_after] + diag_lines + lines_app[insert_after:]

open(path_app, 'w', encoding='utf-8').write('\n'.join(lines_app))
print("app.py atualizado!")
