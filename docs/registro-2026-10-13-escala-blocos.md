# Escala da arte em PDF de modelo único em blocos

Relato: modelo 1001087/pedido 13020 com arte_escala_h=104 e arte_escala_v=104,
prévia ampliada e PDF sem ampliação. A geração de um único modelo em
cut_stack/strict_assembly cria internamente uma entrada de arte. Essa entrada
não recebia a escala do trabalho. Ao preencher multi_map, o padrão 100 por
cento substituía a escala configurada.

Correção localizada em engine.py: transmitir cfg.arte_sx/arte_sy como percentuais
na entrada sintética do modelo. Não muda a escala própria dos modelos combinados,
elementos de numeração, quantidades, posição das células ou recorte.

Regressão medida no PDF: arte sintética de 40 x 20 mm em célula maior, bloco de
duas folhas. Antes, 104% produzia largura aproximada de 40,13 mm em vez de
41,6 mm; caso 100% passava. Depois, 100% e 104% passam. Validação específica:
96 testes aprovados e 2 ignorados, incluindo recorte, escala, entrega por bloco
e modelos somados. Testes não enviam trabalhos a impressoras.

Entrega no canal teste 1.2.396. As quatro falhas preexistentes da suíte geral
estão documentadas em registro-2026-10-13-catalogos-pedido.md. A preparação do
MSI, publicação, instalação e confirmação do PDF do operador são evidências
separadas. Não altera registros do ERP ou cadastros de formato/numeração.

Bateria ampla nos dois canais: 544 aprovados, 2 ignorados e as mesmas quatro
falhas preexistentes em cada execução; 16 harnesses aprovados por canal.
MSI: 196657152 bytes; SHA256:
1973eb6761e35ac05a0352051dfd1b5487a7c3a0f741eaa312824b229f52ee2f.
Versão MSI/Python e bytecode do motor embutido conferidos com a fonte local;
auditoria de ausência de dados privados aprovada.
