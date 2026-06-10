import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ===== FIX: script.js - adicionar has_raw_file no payload =====
path_js  = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\frontend\script.js'
path_app   = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\app.py'
path_agent = r'C:\Users\Junior\.gemini\antigravity\Projetos Ingresso ideal\ideal-imposition\local_print_agent.py'

# ---- script.js ----
content = open(path_js, encoding='utf-8').read()
lines = content.split('\n')

# Linha 6475 (idx 6474): fim do payload multi_artes - adicionar has_raw_file
# Atual:  numeracao_2: state.numeracoes.find(n => n.id === arte.num2_id) || null
# Novo:   + has_raw_file: !!arte.rawFile
old_num2_line = "                numeracao_2: state.numeracoes.find(n => n.id === arte.num2_id) || null"
new_num2_line = "                numeracao_2: state.numeracoes.find(n => n.id === arte.num2_id) || null,\n\n                has_raw_file: !!arte.rawFile"

if old_num2_line in content:
    content = content.replace(old_num2_line, new_num2_line, 1)
    print('script.js: has_raw_file adicionado ao payload')
else:
    print('AVISO: linha numeracao_2 nao encontrada exatamente!')
    for i in range(6472, 6478):
        print(f'  {i+1}: {repr(lines[i][:100])}')

open(path_js, 'w', encoding='utf-8').write(content)
print('script.js salvo.')

# ---- app.py ----
content_app = open(path_app, encoding='utf-8').read()

# Substituir o bloco de matching por filename pelo matching por indice
old_block = '''        multi_artes_list = data.get("multi_artes", [])
        ma_files_map = {}
        if multi_artes_files:
            for ma_file in multi_artes_files:
                if ma_file and ma_file.filename:
                    ext = os.path.splitext(ma_file.filename)[1].lower() or ".pdf"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
                        shutil.copyfileobj(ma_file.file, tmp_in)
                        ma_files_map[ma_file.filename] = tmp_in.name
        
        for ma in multi_artes_list:
            pdf_name = ma.get("pdf_name")
            if pdf_name and pdf_name in ma_files_map:
                ma["local_path"] = ma_files_map[pdf_name]
        # Diagnóstico multi_artes (Render logs)
        print(f"[multi_artes] Arquivos recebidos ({len(ma_files_map)}): {list(ma_files_map.keys())}")
        for _ma in multi_artes_list:
            _pn = _ma.get("pdf_name"); _lp = _ma.get("local_path")
            print(f"[multi_artes] Arte pdf_name={_pn!r} -> local_path={_lp is not None}")'''

new_block = '''        multi_artes_list = data.get("multi_artes", [])
        ma_files_map = {}
        temp_paths_ma = []

        # Matching por INDICE (mais robusto que por filename no Linux/Render)
        # O frontend envia has_raw_file=True para artes com arquivo; a ordem dos
        # arquivos em multi_artes_files corresponde à ordem das artes com has_raw_file=True
        file_idx = 0
        files_list = list(multi_artes_files) if multi_artes_files else []
        for ma in multi_artes_list:
            if ma.get("has_raw_file") and file_idx < len(files_list):
                ma_file = files_list[file_idx]
                file_idx += 1
                if ma_file:
                    ext = os.path.splitext(ma_file.filename or "")[1].lower() or ".pdf"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
                        shutil.copyfileobj(ma_file.file, tmp_in)
                        ma["local_path"] = tmp_in.name
                        temp_paths_ma.append(tmp_in.name)
                        ma_files_map[ma_file.filename or f"arte_{file_idx}"] = tmp_in.name

        print(f"[multi_artes] {len(files_list)} arquivo(s) recebido(s), {file_idx} mapeado(s)")
        for _ma in multi_artes_list:
            print(f"[multi_artes] pdf_name={_ma.get('pdf_name')!r} has_raw={_ma.get('has_raw_file')} local_path={bool(_ma.get('local_path'))}")'''

if old_block in content_app:
    content_app = content_app.replace(old_block, new_block, 1)
    print('app.py: matching por indice aplicado')
else:
    print('AVISO: bloco nao encontrado em app.py - tentando busca parcial...')
    idx = content_app.find('multi_artes_list = data.get("multi_artes", [])')
    print(f'  Trecho em idx={idx}: {repr(content_app[idx:idx+200])}')

open(path_app, 'w', encoding='utf-8').write(content_app)
print('app.py salvo.')
