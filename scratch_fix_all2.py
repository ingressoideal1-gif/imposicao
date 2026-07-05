import os

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
files_to_check = ['script.js', 'pedido.js', 'cliente.js', 'producao.html', 'index.html', 'mapas.js']

# Exact corrupted strings commonly found when UTF-8 is read as Windows-1252
reps = {
    "PÃ¡g": "Pág",
    "pÃ¡g": "pág",
    "tÃ­tulo": "título",
    "cabeÃ§alho": "cabeçalho",
    "botÃ£o": "botão",
    "diÃ¡logo": "diálogo",
    "jÃ¡": "já",
    "nÃ£o": "não",
    "padrÃ£o": "padrão",
    "sÃ£o": "são",
    "sessÃ£o": "sessão",
    "usuÃ¡rio": "usuário",
    "cÃ³digo": "código",
    "saÃ­da": "saída",
    "seleÃ§Ã£o": "seleção",
    "opÃ§Ã£o": "opção",
    "validaÃ§Ã£o": "validação",
    "atualizaÃ§Ã£o": "atualização",
    "inÃ­cio": "início",
    "vÃ¡lido": "válido",
    "possÃ­vel": "possível",
    "referÃªncia": "referência",
    "exclusÃ£o": "exclusão",
    "configuraÃ§Ã£o": "configuração",
    "configuraÃ§Ãµes": "configurações",
    "ediÃ§Ã£o": "edição",
    "impressÃ£o": "impressão",
    "produÃ§Ã£o": "produção",
    "seÃ§Ã£o": "seção",
    "direÃ§Ã£o": "direção",
    "posiÃ§Ã£o": "posição",
    "informaÃ§Ã£o": "informação",
    "resoluÃ§Ã£o": "resolução",
    "paginaÃ§Ã£o": "paginação",
    "relaÃ§Ã£o": "relação",
    "aplicaÃ§Ã£o": "aplicação",
    "funÃ§Ã£o": "função",
    "alteraÃ§Ã£o": "alteração",
    "aprovaÃ§Ã£o": "aprovação",
    "geraÃ§Ã£o": "geração",
    "renderizaÃ§Ã£o": "renderização",
    "numeraÃ§Ã£o": "numeração",
    "aÃ§Ã£o": "ação",
    "aÃ§Ãµes": "ações",
    "coleÃ§Ã£o": "coleção",
    "opÃ§Ãµes": "opções",
    "conexÃ£o": "conexão",
    "versÃ£o": "versão",
    "cartÃ£o": "cartão",
    "pÃ¡gina": "página",
    "prÃ©": "pré",
    "fÃ­sica": "física",
    "invÃ¡lido": "inválido",
    "dimensÃ£o": "dimensão",
    "dimensÃµes": "dimensões",
    "estÃ¡": "está",
    "atravÃ©s": "através",
    "alÃ©m": "além",
    "porÃ©m": "porém",
    "mÃ¡xima": "máxima",
    "mÃ­nima": "mínima",
    "necessÃ¡rio": "necessário",
    "obrigatÃ³rio": "obrigatório",
    "especÃ­fico": "específico",
    "automÃ¡tico": "automático",
    "conteÃºdo": "conteúdo",
    "Ãºnico": "único",
    "Ãºltimo": "último",
    "Ã­ndice": "índice",
    "Ã­cone": "ícone",
    "Ã¡rea": "área",
    "Ã¢ngulo": "ângulo",
    "ImposiÃ§Ã£o": "Imposição",
    "GrÃ¡fica": "Gráfica",
    "variÃ¡veis": "variáveis",
    "â€”": "—",
    "ðŸ“„": "📄",
    "ðŸ–¨ï¸": "🖨️",
    "SÃ“ FRENTE": "SÓ FRENTE",
    "VERSO VARIÃ VEL": "VERSO VARIÁVEL",
    "NÃºm": "Núm",
    "MÃºltiplas": "Múltiplas"
}

for filename in files_to_check:
    filepath = os.path.join(folder, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        
        # We need to run the replacements case-sensitively based on the dictionary,
        # but also uppercase versions if they exist
        for k, v in reps.items():
            new_content = new_content.replace(k, v)
            new_content = new_content.replace(k.upper(), v.upper())
            new_content = new_content.replace(k.capitalize(), v.capitalize())

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {filename}")
        else:
            print(f"No changes for {filename}")
            
    except Exception as e:
        print(f"Error reading {filename}: {e}")
