import sqlite3

def check_db():
    try:
        conn = sqlite3.connect('imposition.db')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables in local DB:", tables)
        for table in tables:
            t = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            count = cursor.fetchone()[0]
            print(f"Table {t} has {count} rows")
    except Exception as e:
        print("Error:", e)

check_db()
