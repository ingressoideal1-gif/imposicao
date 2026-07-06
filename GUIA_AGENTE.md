# ⚡ Guia Rápido: Agente Local Windows (Ideal Imposition)

O **Ideal Imposition Agent** é o software de apoio executado diretamente no computador da gráfica (Windows). Ele é responsável por processar as imposições pesadas de PDF localmente (poupando largura de banda e tempo na nuvem) e enviar os arquivos gerados diretamente para as filas de impressão física configuradas no sistema.

---

## 🚀 Como Executar o Agente em Modo de Desenvolvimento

Caso queira rodar o agente diretamente a partir do código-fonte Python:

1. Abra o prompt do PowerShell no diretório do projeto:
   ```powershell
   venv\Scripts\Activate.ps1
   ```
2. Inicialize o agente de impressão na porta 9000:
   ```powershell
   python local_print_agent.py
   ```
3. O frontend na nuvem (Vercel) detectará automaticamente a presença do agente local (`http://127.0.0.1:9000`) e direcionará os trabalhos de processamento e impressão para o seu computador de forma transparente.

---

## 🛠️ Como Compilar e Criar o Instalador (.exe)

Para gerar uma versão compilada independente do Python, facilitando a distribuição para os computadores da gráfica:

### Passo 1: Compilar o Executável (PyInstaller)
No PowerShell, execute o script de build automatizado:
```powershell
.\build_agent.ps1
```
Isso gerará o executável consolidado em `dist/IdealImpositionAgent.exe`.

### Passo 2: Gerar o Instalador do Windows (Inno Setup)
1. Certifique-se de ter o **Inno Setup 6** instalado no computador ([Download Inno Setup](https://jrsoftware.org/isdl.php)).
2. No PowerShell, execute:
   ```powershell
   .\compilar_instalador.ps1
   ```
3. O instalador automático será gerado em `dist/IdealImpositionAgent_Setup_v1.0.0.exe`.

---

## 🔄 Funcionamento do Auto-Update (Sincronização Online)

- **Atualizações de Layout/Frontend:** Como o sistema é acessado diretamente pelo site online (Vercel), **qualquer mudança de interface estará sempre atualizada**, sem precisar mexer no agente local.
- **Atualização do Motor de Imposição:** Se houver atualizações na lógica do Python, o site online alertará o operador na tela principal através de um banner de aviso: `⚡ Uma nova versão do Agente Local está disponível`.
- Ao clicar em **"Atualizar Agora"**, o agente local baixa a nova versão de forma silenciosa e roda o script `update.bat` para se auto-substituir e reiniciar em poucos segundos.
