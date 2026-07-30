import fitz
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

pdf_filename = "Manual_do_Usuario_Ideal_Imposition.pdf"

# Definições de Estilos Globais
CSS_BASE = """
    body {
        font-family: 'Helvetica', 'Arial', sans-serif;
        color: #1e293b;
        line-height: 1.5;
        font-size: 10pt;
    }
    .cover-title {
        font-size: 26pt;
        font-weight: bold;
        color: #0284c7;
        margin-top: 30px;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .cover-subtitle {
        font-size: 14pt;
        color: #475569;
        margin-bottom: 24px;
        font-weight: 300;
    }
    .cover-badge {
        background-color: #e0f2fe;
        color: #0369a1;
        padding: 6px 14px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 10pt;
        display: inline-block;
        margin-bottom: 24px;
    }
    .divider {
        border-bottom: 2px solid #0284c7;
        margin: 16px 0;
    }
    .section-title {
        font-size: 15pt;
        font-weight: bold;
        color: #0f172a;
        margin-top: 18px;
        margin-bottom: 10px;
        border-bottom: 1.5px solid #0284c7;
        padding-bottom: 4px;
    }
    .subsection-title {
        font-size: 11.5pt;
        font-weight: bold;
        color: #0284c7;
        margin-top: 12px;
        margin-bottom: 6px;
    }
    p {
        margin-bottom: 8px;
        text-align: justify;
    }
    ul, ol {
        margin-top: 4px;
        margin-bottom: 10px;
        padding-left: 20px;
    }
    li {
        margin-bottom: 5px;
    }
    .box-info {
        background-color: #f0f9ff;
        border-left: 4px solid #0284c7;
        padding: 8px 12px;
        margin: 10px 0;
        border-radius: 0 4px 4px 0;
    }
    .box-warning {
        background-color: #fff7ed;
        border-left: 4px solid #f97316;
        padding: 8px 12px;
        margin: 10px 0;
        border-radius: 0 4px 4px 0;
    }
    .box-success {
        background-color: #f0fdf4;
        border-left: 4px solid #16a34a;
        padding: 8px 12px;
        margin: 10px 0;
        border-radius: 0 4px 4px 0;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
        font-size: 9pt;
    }
    th {
        background-color: #0f172a;
        color: #ffffff;
        text-align: left;
        padding: 6px 8px;
        font-weight: bold;
    }
    td {
        padding: 6px 8px;
        border-bottom: 1px solid #e2e8f0;
    }
    tr:nth-child(even) {
        background-color: #f8fafc;
    }
    .code-span {
        font-family: 'Courier New', monospace;
        background-color: #f1f5f9;
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 8.5pt;
        color: #0f172a;
    }
"""

pages_html = [
    # PAGINA 1: Capa + Introdução + Sumário
    f"""<style>{CSS_BASE}</style>
    <div style="text-align: center; padding-top: 15px;">
        <div style="font-size: 12pt; font-weight: bold; color: #64748b; letter-spacing: 2px;">INGRESSO IDEAL — GRAFICA DIGITAL</div>
        <div class="cover-title">Ideal Imposition & NewProd Agent</div>
        <div class="cover-subtitle">Manual do Usuário e Guia Operacional de Imposição e Impressão</div>
        <div class="cover-badge">Versão v416 | Julho de 2026</div>
    </div>
    
    <div class="divider"></div>

    <div class="box-info">
        <strong>📌 Sobre este manual:</strong> Este documento contém todas as instruções operacionais para designers, setor de pré-impressão e operadores de produção sobre o uso do sistema <strong>Ideal Imposition</strong> e da aplicação local <strong>NewProd Agent</strong>.
    </div>

    <div class="section-title">📑 Sumário Executivo</div>
    <ul>
        <li><strong>1. Visão Geral do Sistema</strong> — Arquitetura Web & Agente Local</li>
        <li><strong>2. Fluxo das Filas de Arte e Status das OSs</strong> — Cores e Cartões KPI</li>
        <li><strong>3. Atribuição e Gestão de Designers</strong> — Filtros e Painel de OSs</li>
        <li><strong>4. Modos de Imposição Gráfica e Regras de Corte</strong> — Cut & Stack e Assembly</li>
        <li><strong>5. Fatiamento Físico de PDF em Lotes</strong> — Layer Chunking (Capa, Miolo, Contracapa)</li>
        <li><strong>6. Regras de Numeração Especial</strong> — Formatos de CAMAROTE (Mesa/Cadeira)</li>
        <li><strong>7. Biblioteca Centralizada de Fontes Web</strong> — Catálogo em Nuvem</li>
        <li><strong>8. Agente de Impressão (NewProd Agent) & Instalador .MSI</strong> — Instalação no Servidor</li>
        <li><strong>9. Botão de Cancelamento Imediato</strong> — Interrupção Instantânea de Spool</li>
        <li><strong>10. Resolução de Problemas & Perguntas Frequentes</strong> — Guia Rápido de TI</li>
    </ul>
    """,

    # PAGINA 2: Visão Geral + Filas de Arte + Designers
    f"""<style>{CSS_BASE}</style>
    <div class="section-title">1. Visão Geral do Sistema</div>
    <p>O <strong>Ideal Imposition</strong> é uma plataforma integrada de gestão de Ordens de Serviço (OS), criação de artes, imposição gráfica computadorizada e despacho automatizado para impressoras digitais (Konica Minolta, Xerox, Ricoh, HP, etc.).</p>
    <p>O ecossistema é composto por duas camadas integradas:</p>
    <ol>
        <li><strong>Plataforma Web (Nuvem)</strong>: Acessível via navegador para gestão de pedidos, edição de numerações, aprovação de clientes e visualização do painel de produção.</li>
        <li><strong>NewProd Agent (Agente Local / Servidor de Impressão)</strong>: Executável ou instalador <span class="code-span">.MSI</span> que roda no servidor ou máquina conectada às impressoras para receber os PDFs de imposição e se comunicar diretamente com as gavetas e drivers de impressão do Windows.</li>
    </ol>

    <div class="section-title">2. Fluxo das Filas de Arte e Status das OSs</div>
    <p>O sistema organiza o setor de pré-impressão em cartões KPI e listas de status automatizadas:</p>
    
    <table>
        <thead>
            <tr>
                <th>Status da OS</th>
                <th>Cor / Ícone</th>
                <th>Descrição / Regra de Negócio</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>Em Arte</strong></td>
                <td>Azul (🔵)</td>
                <td>Todo novo pedido entra automaticamente neste status para ser trabalhado pelo designer.</td>
            </tr>
            <tr>
                <td><strong>Enviar Arte</strong></td>
                <td>Amarelo (🟡)</td>
                <td>Definido quando o designer conclui a edição de uma arte ou correção pendente.</td>
            </tr>
            <tr>
                <td><strong>Aguard. Aprovação</strong></td>
                <td>Roxo (⏳)</td>
                <td>Assumido automaticamente assim que o link do cliente é gerado ou reenviado.</td>
            </tr>
            <tr>
                <td><strong>Em Alteração</strong></td>
                <td>Laranja (⚠️)</td>
                <td>Ativado quando qualquer modelo da OS for reprovado pelo cliente ou solicitar alteração.</td>
            </tr>
            <tr>
                <td><strong>Pedidos Aprovados</strong></td>
                <td>Teal (🟢)</td>
                <td>OSs com todas as artes aprovadas E dados de entrega/faturamento confirmados.</td>
            </tr>
        </tbody>
    </table>

    <div class="box-warning">
        <strong>⚠️ Nota de Desacoplamento:</strong> O campo <span class="code-span">entrega_dados</span> trata exclusivamente de informações logísticas/financeiras e <strong>não</strong> altera o status das artes nem desfaz aprovações de desenhos.
    </div>

    <div class="section-title">3. Atribuição e Gestão de Designers</div>
    <p>O sistema permite filtrar e atribuir designers responsáveis por cada Ordem de Serviço:</p>
    <ul>
        <li><strong>Filtro de Designers</strong>: O filtro na Lista de Arte exibe exclusivamente os usuários cadastrados no banco cujo setor contenha a palavra <em>"designer"</em>.</li>
        <li><strong>Painel "Designers Ideal"</strong>: Calcula em tempo real o total de Pedidos (OSs) e Modelos (itens) sob responsabilidade de cada designer.</li>
        <li><strong>Destaque Visual</strong>: O designer responsável pela OS ativa é destacado com borda azul vibrante. Reatribuições exigem confirmação pop-up antes de salvar no Supabase.</li>
    </ul>
    """,

    # PAGINA 3: Imposição Gráfica + Layer Chunking + Numeração CAMAROTE
    f"""<style>{CSS_BASE}</style>
    <div class="section-title">4. Modos de Imposição Gráfica e Regras de Corte</div>
    <p>Ao realizar a imposição de ingressos ou etiquetas, o motor gráfico calcula automaticamente o aproveitamento na folha de impressão:</p>

    <div class="subsection-title">Montagem Estrita (Strict Assembly / Cut & Stack)</div>
    <p>Sempre que o usuário seleciona múltiplos produtos ou modelos combinados (multi-artes), o frontend força obrigatoriamente <span class="code-span">schema='cut_stack'</span> e <span class="code-span">cut_stack_mode='strict_assembly'</span>.</p>

    <div class="box-success">
        <strong>📐 Cálculo da Profundidade do Bloco:</strong><br>
        Ao repartir o montante total de folhas para imposição, a profundidade do corte é calculada como:<br>
        <span class="code-span">depth = total_blocks // poses_per_sheet</span><br>
        A célula 0 da folha empilha verticalmente os blocos sequenciais da profundidade. Qualquer bloco residual entra no final no formato de refugo de sobras.
    </div>

    <div class="section-title">5. Fatiamento Físico de PDF em Lotes (Layer Chunking)</div>
    <p>Em modos de imposição com profundidade superior a 1 (<span class="code-span">strict_assembly</span>), o motor gera arquivos em chunks rigorosamente limitados pela quantidade de folhas por bloco (<span class="code-span">sheets_per_block</span>) configurada pelo operador, permitindo o grampeamento e encadernação imediata após o corte físico.</p>

    <p>Cada camada produz um pacote com 3 arquivos nomeados para enfileiramento automático no RIP:</p>
    <ul>
        <li><span class="code-span">_set1_01_01_capa.pdf</span> — Capa do lote</li>
        <li><span class="code-span">_set1_01_02_miolo.pdf</span> — Miolo contendo exatamente <span class="code-span">sheets_per_block</span> folhas</li>
        <li><span class="code-span">_set1_01_03_contracapa.pdf</span> — Contracapa do lote</li>
    </ul>

    <div class="section-title">6. Regras de Numeração Especial (CAMAROTE)</div>
    <p>A numeração para eventos do tipo <strong>CAMAROTE</strong> organiza os ingressos por locais (ex: Mesas) e pessoas (ex: Cadeiras/Lugares):</p>

    <ul>
        <li><strong>Q_CAM (Quantidade de Locais)</strong>: Total de mesas/camarotes (ex: 10 Mesas).</li>
        <li><strong>L_CAM (Lotação por Local)</strong>: Lugares que cabem em cada local (ex: 5 lugares por mesa).</li>
        <li><strong>C_INI (Início do Local)</strong>: Número inicial do local (ex: Se C_INI=7, inicia na Mesa 7).</li>
    </ul>

    <p><strong>Comportamento Matemático:</strong> O motor gera exatamente <span class="code-span">Q_CAM * L_CAM</span> ingressos. Para <span class="code-span">CAMAROTE_LOCAL</span>, avança 1 unidade a cada <span class="code-span">L_CAM</span> impressões. Para <span class="code-span">CAMAROTE_PESSOA</span>, realiza iteração cíclica de 1 até <span class="code-span">L_CAM</span>.</p>
    """,

    # PAGINA 4: Catálogo Web de Fontes + NewProd Agent .MSI + Cancelamento + FAQ
    f"""<style>{CSS_BASE}</style>
    <div class="section-title">7. Biblioteca Centralizada de Fontes Web</div>
    <p>Para evitar divergências visuais e substituições de fontes durante a impressão, o sistema possui um <strong>Catálogo Centralizado de Fontes Web</strong>:</p>
    <ul>
        <li><strong>Carregamento em Nuvem</strong>: Fontes registradas no Supabase Storage são carregadas no navegador via CSS <span class="code-span">@font-face</span>.</li>
        <li><strong>Download Automático no Agente</strong>: O <span class="code-span">NewProd Agent</span> baixa o arquivo <span class="code-span">.ttf</span> do catálogo para a pasta local <span class="code-span">./fonts</span>.</li>
        <li><strong>Embutimento no PDF</strong>: Os glifos da fonte são embarcados no stream do PDF gerado via PyMuPDF, garantindo fidelidade total na impressão.</li>
    </ul>

    <div class="section-title">8. Agente de Impressão (NewProd Agent) & Instalador .MSI</div>
    <p>O <strong>NewProd Agent</strong> pode ser instalado no Servidor de Impressão da gráfica através de dois formatos:</p>
    <ol>
        <li><strong>Executável Direto</strong>: <span class="code-span">dist/NewProd.exe</span></li>
        <li><strong>Instalador MSI Corporativo</strong>: <span class="code-span">dist/NewProd_Setup_v1.0.msi</span></li>
    </ol>

    <div class="box-info">
        <strong>💡 Recomendação de TI (Servidor Central de Impressão):</strong><br>
        Instale o instalador <span class="code-span">.MSI</span> apenas no Servidor da gráfica. As estações dos usuários utilizam apenas o navegador web e enviam os trabalhos para o Servidor, dispensando a instalação de drivers de impressora nas máquinas clientes!
    </div>

    <div class="section-title">9. Botão de Cancelamento Imediato de Impressão</div>
    <p>No Painel de Produção, ao iniciar uma impressão, o usuário conta com o botão <strong>"🛑 Cancelar Impressão"</strong> no painel lateral e no overlay de progresso.</p>
    <ul>
        <li><strong>Interrupção da Imposição</strong>: Dispara o cancelamento assíncrono da montagem do PDF.</li>
        <li><strong>Interrupção do Spooler</strong>: Cancela imediatamente o loop de envio de arquivos para a impressora local ou nuvem, exibindo o aviso <em>"🛑 Envio para a impressora cancelado!"</em>.</li>
    </ul>

    <div class="section-title">10. Perguntas Frequentes & Solução de Problemas</div>
    <p><strong>1. O painel indica "Agente Local Inativo". Como resolver?</strong><br>
    Certifique-se de que o programa <span class="code-span">NewProd.exe</span> está aberto no computador da impressora (ou no Servidor) e visível na bandeja do Windows.</p>

    <p><strong>2. Como realizar uma instalação silenciosa do agente via rede?</strong><br>
    Execute o instalador <span class="code-span">.MSI</span> via prompt do Windows: <span class="code-span">msiexec /i "NewProd_Setup_v1.0.msi" /qn</span></p>

    <div class="divider"></div>
    <div style="text-align: center; color: #94a3b8; font-size: 8pt; margin-top: 15px;">
        Ideal Imposition System © 2026 — Ingresso Ideal. Todos os direitos reservados.
    </div>
    """
]

doc = fitz.open()

for idx, page_html in enumerate(pages_html, 1):
    page = doc.new_page(width=595, height=842) # A4
    rect = fitz.Rect(35, 35, 560, 805)
    page.insert_htmlbox(rect, page_html)
    
    # Adicionar cabeçalho e rodapé (a partir da página 2)
    if idx > 1:
        page.insert_text(fitz.Point(35, 24), "IDEAL IMPOSITION - MANUAL DO USUARIO E GUIA OPERACIONAL", fontsize=7.5, fontname="hebo", color=(0.4, 0.4, 0.4))
        page.draw_line(fitz.Point(35, 28), fitz.Point(560, 28), color=(0.85, 0.85, 0.85), width=0.5)
        
        page.draw_line(fitz.Point(35, 815), fitz.Point(560, 815), color=(0.85, 0.85, 0.85), width=0.5)
        page.insert_text(fitz.Point(35, 828), "Ingresso Ideal (C) 2026", fontsize=7.5, fontname="helv", color=(0.5, 0.5, 0.5))
        page.insert_text(fitz.Point(500, 828), f"Pagina {idx} de {len(pages_html)}", fontsize=7.5, fontname="hebo", color=(0.02, 0.51, 0.78))

doc.save(pdf_filename)
print(f"SUCESSO! Documento PDF gerado: {pdf_filename} ({len(doc)} páginas)")
