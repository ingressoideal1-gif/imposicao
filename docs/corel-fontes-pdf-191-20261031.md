# CorelDRAW: fontes na importação de PDF — entrega 1.9.1

## Estado

Entrega segura autorizada em 31/10/2026. Ponte 1.9.1 publicada no mesmo link, com download autenticado e público conferidos por hash e revisão 1.9.0 preservada. Esta PR entrega o frontend correspondente. Instalação nas estações e prova autenticada pelo botão continuam separadas; nenhum PDF/CDR oficial foi alterado.

## Comportamento

- Ao importar PDF com texto, oferecer **Abrir como texto editável**, **Abrir em curvas**, **Verificar fontes novamente** e **Cancelar**.
- Texto editável exige identidade PostScript da fonte instalada; o adaptador também confere se o Corel reconhece a família antes de importar. Uma fonte incorporada no PDF não comprova que esteja disponível para edição no Windows.
- Curvas permanecem como opção mesmo com todas as fontes presentes. Usam os glifos incorporados em uma cópia temporária do PDF, mantendo imagens e recursos de cor; não usam fontes substitutas do Windows.
- Se alguma fonte não estiver incorporada, não se presume a curva original. A opção fica indisponível com explicação.
- A escolha vale somente para o lote de PDFs conferido. O hash ignora apenas o ID aleatório do PDF montado. Mudanças no conteúdo exigem nova conferência.
- A biblioteca de fontes é consultada somente para informar nomes disponíveis. Não há instalação automática nem seleção de versão apenas pelo nome de uma fonte no PDF.
- A verificação também cobre substituição de faces e gabaritos. CDR salvo sem importação de novo PDF não recebe esse diálogo.
- CDR que já sofreu substituição de fonte não é reconstruído automaticamente. Recuperação pelo PDF original é uma ação separada, preservando edições.

## Evidência

Pedido 22815, modelo 1001579: frente contém fontes incorporadas Calibri-Bold, Arial-BoldMT, MinionPro-BoldCn e Bebas. As duas últimas não estavam disponíveis nesta estação. Verso sem recursos de fonte.

Prova em CorelDRAW 24.3.0.571 usando cópias temporárias: ambas as faces em curvas com 420,94488 × 148,11024 pontos, sem objetos de texto. Teste separado com Arial exportada pelo próprio Corel manteve um objeto de texto editável. Hashes dos PDFs originais permaneceram iguais. Nenhum CDR oficial foi aberto ou substituído pelo teste.

Validação local: 91 testes Python aprovados (um aviso preexistente de depreciação FastAPI/httpx); quatro harnesses JavaScript aprovados, sintaxe e whitespace verificados. Inclui cancelamento, fonte ausente, PDF sem fonte incorporada, integridade de imagens/páginas e assinatura da escolha.

## Fontes e recuperação

- Ponte: `C:\Users\Junior\Projetos Ingresso ideal\imposition-coreldraw-20261030`, preservando arquivos locais preexistentes. Arquivos principais: `corel_pdf_fonts.py`, `corel_service.py`, `corel_adapter.py`, versão em `runtime.py`.
- Frontend isolado: `C:\Users\Junior\Projetos Ingresso ideal\imposition-corel-fontes-pdf-20261031`, branch `fix/corel-fontes-pdf-20261031`, base `2ba9ae97`. Alteração em `frontend/tracedraw-runtime.js`.
- Prova reproduzível: `tests/prova_corel_pdf_fontes.py`; resultados em `dist/diagnostico-fontes-22815/prova-final.log` na fonte da Ponte.
- Build final candidato: `C:\Users\Junior\Projetos Ingresso ideal\ponte-build-corel-fontes-20261031-2`. O diretório terminado em `-1` é intermediário e não deve ser distribuído.
- Executável `dist/Instalar-Ponte-Imposition.exe`, SHA-256 `4df1c03adc2779e92c5566615fceec50dd76bff61651e0bd61bc26baee5baa46`. Runtime e instalador passaram em `--check` isolado, ambos versão 1.9.1 e `ready: true`; runtime confirmou ICC, Node e motor. Esses testes não ativaram a ponte desta estação. Oito arquivos alterados da Ponte foram preservados em `source-review` com hashes.
- Revisão anterior 1.9.0 preservada no Drive. Revisão 1.9.1: `0B5eKrKA9HYFtV0JCZDArZm4vYVVmYnFodmUvd0ZqK2JiQS80PQ`; instalador com 189794393 bytes. Evidências finais do frontend ficam em `dist/entrega` da worktree isolada.

Próxima prova após instalar a Ponte 1.9.1: no Imposition, abrir uma cópia a partir do PDF do pedido 22815, escolher curvas, confirmar a aparência e depois testar uma fonte disponível em texto editável. Não publicar novamente a arte oficial por conveniência de teste.
