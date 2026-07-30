import os
import fitz

pdf_path = r"c:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\Guia_Instalacao_NewProd_Agent.pdf"

html_content = r"""
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {
        size: A4;
        margin: 0;
    }
    body {
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #1e293b;
        background-color: #ffffff;
        margin: 0;
        padding: 30px 35px;
        font-size: 11pt;
        line-height: 1.45;
    }
    .header {
        background-color: #0f172a;
        color: #ffffff;
        padding: 20px 24px;
        border-radius: 10px;
        margin-bottom: 18px;
    }
    .header-badge {
        background-color: #2563eb;
        color: #ffffff;
        font-size: 8.5pt;
        font-weight: bold;
        padding: 3px 10px;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
        margin-bottom: 8px;
    }
    .header h1 {
        margin: 4px 0 2px 0;
        font-size: 19pt;
        font-weight: bold;
        color: #ffffff;
    }
    .header p {
        margin: 0;
        font-size: 11pt;
        color: #93c5fd;
    }

    .section-title {
        color: #0f172a;
        font-size: 13pt;
        font-weight: bold;
        border-bottom: 2px solid #cbd5e1;
        padding-bottom: 4px;
        margin-top: 16px;
        margin-bottom: 10px;
    }

    .card {
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 12px;
    }

    .card-warning {
        background-color: #fffbeb;
        border: 1px solid #fde68a;
        border-left: 5px solid #d97706;
        color: #78350f;
    }

    .card-success {
        background-color: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-left: 5px solid #16a34a;
        color: #14532d;
    }

    .card-info {
        background-color: #eff6ff;
        border: 1px solid #bfdbfe;
        border-left: 5px solid #2563eb;
        color: #1e3a8a;
    }

    .step-box {
        background-color: #f8fafc;
        border: 1px solid #cbd5e1;
        border-left: 4px solid #2563eb;
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 10px;
    }

    .step-title {
        font-weight: bold;
        font-size: 11pt;
        color: #0f172a;
        margin-bottom: 3px;
    }

    .step-desc {
        color: #334155;
        font-size: 10pt;
        margin: 0;
    }

    code {
        background-color: #e2e8f0;
        color: #0f172a;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 9.5pt;
    }

    .footer {
        margin-top: 20px;
        border-top: 1px solid #e2e8f0;
        padding-top: 8px;
        text-align: center;
        font-size: 8.5pt;
        color: #64748b;
    }
</style>
</head>
<body>

<div class="header">
    <div class="header-badge">Ingresso Ideal — Suporte Técnico</div>
    <h1>Guia de Instalação e Uso</h1>
    <p>NewProd Agent — Agente Local de Impressão e Imposição Windows</p>
</div>

<div class="card card-info">
    <strong>💡 Por que utilizar o Instalador Oficial (<code>NewProd_Setup_v1.0.0.exe</code>)?</strong><br>
    Executar o arquivo <code>.exe</code> direto pode causar bloqueios de segurança do Windows (SmartScreen) ou falhas na extração de arquivos temporários. O instalador instala o programa na pasta do usuário sem exigir permissões de Administrador e configura a inicialização automática com segurança.
</div>

<div class="section-title">📦 Passo a Passo para o Operador da Gráfica</div>

<div class="step-box">
    <div class="step-title">1. Executar o Instalador</div>
    <div class="step-desc">Dê dois cliques no arquivo <code>NewProd_Setup_v1.0.0.exe</code> para iniciar a instalação.</div>
</div>

<div class="step-box">
    <div class="step-title">2. Se o Windows SmartScreen Bloquear (Tela Azul)</div>
    <div class="step-desc">
        Se o Windows exibir o aviso <em>"O Windows protegeu o seu computador"</em>:<br>
        • Clique no link <strong>"Mais informações"</strong>.<br>
        • Clique no botão <strong>"Executar assim mesmo"</strong> no canto inferior direito.
    </div>
</div>

<div class="step-box">
    <div class="step-title">3. Confirmar Opções da Tela de Instalação</div>
    <div class="step-desc">
        • Deixe marcada a opção <strong>"Criar atalho na Área de Trabalho"</strong>.<br>
        • Deixe marcada a opção <strong>"Iniciar automaticamente com o Windows"</strong>.<br>
        • Clique em <strong>Avançar ➔ Instalar ➔ Concluir</strong>.
    </div>
</div>

<div class="step-box">
    <div class="step-title">4. Confirmar Funcionamento</div>
    <div class="step-desc">
        Um ícone azul do <strong>NewProd Agent</strong> ficará visível na barra de tarefas (próximo ao relógio do Windows). O sistema Web detectará a impressora local automaticamente em <code>http://127.0.0.1:9000</code>.
    </div>
</div>

<div class="section-title">🔧 Resolução de Problemas e Dicas Rápidas</div>

<div class="card card-warning">
    <strong>⚠️ O Agente não está respondendo ou a impressora não recebe trabalhos?</strong>
    <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 9.5pt;">
        <li>Procure o atalho <strong>NewProd Agent</strong> na Área de Trabalho e dê dois cliques para reiniciar.</li>
        <li>No navegador do computador da impressora, acesse <code>http://127.0.0.1:9000/app/</code> para conferir se o painel local está "Ativo".</li>
        <li>Verifique se o Windows Defender Firewall possui a regra <code>NewProd Agent</code> liberada para a porta 9000.</li>
    </ul>
</div>

<div class="section-title">🛠️ Instruções para a Equipe Técnica / Desenvolvedor</div>

<div class="card card-success">
    <strong>Como compilar novos instaladores (.exe):</strong><br>
    <span style="font-size: 9.5pt;">
    1. Instale o <strong>Inno Setup 6</strong> no computador de desenvolvimento.<br>
    2. No terminal PowerShell da pasta do projeto, execute:<br>
    &nbsp;&nbsp;&nbsp;&nbsp;<code>.\build_agent.ps1</code> &nbsp;&nbsp;&nbsp;<em>(Gera o arquivo dist/NewProd.exe via PyInstaller)</em><br>
    &nbsp;&nbsp;&nbsp;&nbsp;<code>.\compilar_instalador.ps1</code> &nbsp;&nbsp;&nbsp;<em>(Gera o instalador dist/NewProd_Setup_v1.0.0.exe)</em>
    </span>
</div>

<div class="footer">
    Ingresso Ideal © 2026 — Documento de Suporte e Instrução Operacional — NewProd Agent v1.0.0
</div>

</body>
</html>
"""

# Criar documento PDF A4 com PyMuPDF
doc = fitz.open()
page = doc.new_page(width=595.276, height=841.89)  # A4

# Inserir HTML na página
rect = fitz.Rect(0, 0, 595.276, 841.89)
page.insert_htmlbox(rect, html_content)

doc.save(pdf_path)
doc.close()

print(f"PDF recriado com sucesso em: {pdf_path}")
