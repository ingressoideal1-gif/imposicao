import sqlite3
import os

db_paths = ["imposition.db", "local_db.sqlite"]

for db_path in db_paths:
    if os.path.exists(db_path):
        print(f"=== BANCO LOCAL: {db_path} ===")
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Listar tabelas
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [t[0] for t in cursor.fetchall()]
            print("Tabelas:", tables)
            
            if 'pedidos_modelos' in tables:
                cursor.execute("PRAGMA table_info(pedidos_modelos);")
                columns = [c[1] for c in cursor.fetchall()]
                print("Colunas de pedidos_modelos:", columns)
                
                cursor.execute("SELECT * FROM pedidos_modelos WHERE id_int = 18636;")
                rows = cursor.fetchall()
                print(f"Pedidos modelos para 18636 (Total: {len(rows)}):")
                for r in rows:
                    row_dict = dict(zip(columns, r))
                    print(f"  ID: {row_dict.get('id')} - Nome: {row_dict.get('nome_modelo')} - Qtd: {row_dict.get('quantidade')} - Qtd_fallback: {row_dict.get('qtd')} - Status Imp: {row_dict.get('status_impressao')} - Setor: {row_dict.get('setor')}")
                    
                cursor.execute("SELECT * FROM pedidos_modelos WHERE id_int = 18570;")
                rows_18570 = cursor.fetchall()
                print(f"Pedidos modelos para 18570 (Total: {len(rows_18570)}):")
                for r in rows_18570:
                    row_dict = dict(zip(columns, r))
                    print(f"  ID: {row_dict.get('id')} - Nome: {row_dict.get('nome_modelo')} - Qtd: {row_dict.get('quantidade')} - Qtd_fallback: {row_dict.get('qtd')} - Status Imp: {row_dict.get('status_impressao')} - Setor: {row_dict.get('setor')}")
            else:
                print("Tabela pedidos_modelos nao encontrada neste banco.")
                
            conn.close()
        except Exception as e:
            print("Erro no banco:", e)
        print()
