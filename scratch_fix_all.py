import os
import re

folder = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
files_to_check = ['script.js', 'pedido.js', 'cliente.js', 'producao.html', 'index.html']

def fix_mangled(match):
    mangled = match.group(0)
    try:
        # Tenta reverter o encoding
        # Se for um UTF-8 lido como CP1252 e salvo como UTF-8
        # precisamos codificá-lo de volta para latin1 ou cp1252 e decodificar como utf-8
        fixed = mangled.encode('latin1').decode('utf-8')
        return fixed
    except Exception:
        # Se falhar (ex: contém caracteres que não cabem), tenta com cp1252
        try:
            fixed = mangled.encode('cp1252').decode('utf-8')
            return fixed
        except Exception:
            return mangled

for filename in files_to_check:
    filepath = os.path.join(folder, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Encontra todas as ocorrências de palavras com Ã
        # E aplica a função de fixação
        new_content = re.sub(r'\b\w*Ã[\w\x80-\xFF]*\b', fix_mangled, content)
        # Substituições avulsas para símbolos que ficaram sozinhos ou colados:
        # Ex: "Ã¡" = "á", "Ã£" = "ã", "Ã§" = "ç", "Ã³" = "ó", "Ã©" = "é", "Ã­" = "í", "Ãª" = "ê", "Ã¢" = "â", "Ãµ" = "õ"
        new_content = re.sub(r'Ã[¡£§³©­ª¢µ]', fix_mangled, new_content)
        # Mais caracteres específicos que eu vejo (ex: "PÃ¡g" -> "Pág")
        
        # Outras substituições conhecidas em pt-br se sobrarem
        reps = {
            "PÃ¡g": "Pág",
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
            "Aguardando visualizaÃ§Ã£o": "Aguardando visualização",
            "Selecione Cor/NumeraÃ§Ã£o": "Selecione Cor/Numeração",
            "A visualizaÃ§Ã£o do cliente": "A visualização do cliente",
            "Em criaÃ§Ã£o": "Em criação",
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
            "Ã¢ngulo": "ângulo"
        }

        for k, v in reps.items():
            new_content = new_content.replace(k, v)
            new_content = new_content.replace(k.upper(), v.upper())
            new_content = new_content.replace(k.capitalize(), v.capitalize())

        # Forçar substituições que podem ter quebrado no terminal
        new_content = new_content.replace("PÃ¡g", "Pág")
        new_content = new_content.replace("Carregando PÃ¡g", "Carregando Pág")

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {filename}")
        else:
            print(f"No changes for {filename}")
            
    except Exception as e:
        print(f"Error reading {filename}: {e}")
