import os, json
from supabase import create_client
import dotenv

dotenv.load_dotenv()
url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_KEY')

client = create_client(url, key)
res = client.table('producao_mapas_teatro').select('*').limit(1).execute()

if res.data:
    mapa = res.data[0]
    print("Mapa encontrado:", mapa.get("name"))
    config = mapa.get("config", {})
    if "setores" in config:
        print("Num setores:", len(config["setores"]))
        if len(config["setores"]) > 0:
            assentos = config["setores"][0].get("assentos", [])
            print("Assentos do setor 0:", len(assentos))
            if len(assentos) > 0:
                print("Primeiro assento:", json.dumps(assentos[0]))
else:
    print("Nenhum mapa encontrado")
