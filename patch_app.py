import re
with open("app.py", "r", encoding="utf-8") as f:
    content = f.read()

header = r'''import os, json, tempfile, shutil, asyncio'''
new_header = r'''import os, json, tempfile, shutil, asyncio

DIAG_LOGS = []
def log_diag(msg):
    global DIAG_LOGS
    print(msg)
    DIAG_LOGS.append(msg)
    if len(DIAG_LOGS) > 100:
        DIAG_LOGS.pop(0)
'''

if header in content:
    content = content.replace(header, new_header)

diag_route = r'''
@app.get("/api/diag")
def get_diag():
    return {"logs": DIAG_LOGS}
'''

if "def get_diag():" not in content:
    content = content + diag_route

search_block = r'''        print(f"[multi_artes] {len(files_list)} arquivo(s) recebido(s), {file_idx} mapeado(s)")
        for _ma in multi_artes_list:
            print(f"[multi_artes] pdf_name={_ma.get('pdf_name')!r} has_raw={_ma.get('has_raw_file')} local_path={bool(_ma.get('local_path'))}")'''

replace_block = r'''        log_diag(f"[multi_artes] form_data keys: {list(form_data.keys())}")
        log_diag(f"[multi_artes] {len(files_list)} arquivo(s) resolvidos via ma_file_i, multi_artes_list size: {len(multi_artes_list)}")
        log_diag(f"[multi_artes] mapeados: {file_idx}")
        for _ma in multi_artes_list:
            log_diag(f"[multi_artes] pdf_name={_ma.get('pdf_name')!r} has_raw={_ma.get('has_raw_file')} local_path={bool(_ma.get('local_path'))}")'''

if search_block in content:
    content = content.replace(search_block, replace_block)
else:
    # If not found, just replace print with log_diag broadly
    content = content.replace('print(f"[multi_artes]', 'log_diag(f"[multi_artes]')
    
# also replace the early print
content = content.replace('print(f"[Imposition] Endpoint hit', 'log_diag(f"[Imposition] Endpoint hit')

with open("app.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Patch app.py success")
