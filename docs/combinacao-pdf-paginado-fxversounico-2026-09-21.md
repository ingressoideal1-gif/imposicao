# Combinação de PDF Paginado com FxVersoUnico — 21/09/2026

## Estado e escopo

Implementação local na branch `fix/combinada-pdf-paginado`, worktree `C:\ProjetosLocais\ideal-imposition-combinada-pdf-paginado`, baseada em `origin/main` / v924 (`849f21eb`). Entrega publicada e verificada: **frontend v925** e **NewProd 1.2.337**. O checkout principal e a documentação pendente da entrega anterior foram preservados.

Pedido motivador: combinar os modelos 1001082, 1001083 e 1001084 do pedido 22234. O usuário informou que corrigirá a tiragem. Esta implementação não altera quantidades, artes, status ou qualquer dado do pedido. Os testes usam exclusivamente dados sintéticos.

## Comportamento

Na janela do Pedido do Painel de Produção, modelos com **PDF Paginado + FxVersoUnico** podem ser selecionados juntos. Todos precisam usar esse mesmo modo. Permanecem as regras de mesmo pedido, material/cor, formato, saída, modo sequencial/blocado e folhas por bloco. Não se misturam modelos paginados e convencionais.

Cada página da frente representa uma peça; o verso é a primeira página do arquivo separado daquele modelo. A contagem das páginas define a quantidade gerada, conforme o comportamento individual existente. Divergências em relação à quantidade pedida são exibidas por modelo na prévia; a edição da tiragem permanece fora deste trabalho.

A frente avança pelo índice local de cada modelo, inclusive quando a folha mistura modelos. Versos, escalas e numeração continuam associados à arte correspondente. O fluxo funciona nos esquemas sequencial, aproveitamento multiartes e montagem estrita de blocos, incluindo Refazer.

Os outros modos de PDF paginado (`front`, `duplex`, `pdf_odd_even`, `pdf_duplicate_back`) continuam individuais. A Montagem manual e a aba Imposição não recebem esta combinação: orientam a usar a janela do Pedido, evitando enviar dados paginados por um caminho sem suporte.

## Implementação

- `frontend/script.js`: compatibilidade permite a combinação somente em FxVersoUnico; recusa mistura de modos e direciona o fluxo para Pedido.
- `frontend/pedido.js`: carrega os PDFs necessários antes de gerar, conta páginas por modelo, apresenta divergências de quantidade, seleciona a página correta na prévia e envia `modo_pdf`, `print_mode` e a quantidade de páginas por arte. Revalida a seleção após o carregamento.
- `engine.py`: valida que todas as artes paginadas usam FxVersoUnico, preserva o índice local da frente nos dois caminhos de renderização e mantém o verso fixo por arte. Verifica todos os arquivos e quantidades antes de entregar qualquer lote; arquivo indisponível ou contagem alterada interrompe a geração.
- `app.py`: `/api/version` anuncia a capacidade `multi_artes_pdf_duplex_unico`.
- `frontend/montagem.js`: recusa PDF paginado no fluxo manual que não implementa a paginação por arte.

O frontend consulta a capacidade do motor efetivamente escolhido antes de enviar a imposição. Agente antigo não recebe esse trabalho e apresenta orientação para atualizar. Isso impede que uma versão antiga ignore o campo novo e repita silenciosamente a primeira página.

## Validação

- 12 harnesses JavaScript passaram: impressao_combinada, impressao_combinada_fluxo, modelos_somados, esquema_da_previa, previa_banco_modelos_combinados, previa_verso_separado, producao_por_cor_fluxo, fxversounico, escala_da_arte, aproveitamento, montagem_faces_pdf e csv_fatia_do_modelo.
- `py tests/test_impressao_combinada.py`: 8 testes passaram, comparando prévia e PDFs reais do motor com fontes sintéticas; casos sequenciais, sobras, blocos, Refazer, frente compartilhada com versos diferentes, posições espelhadas, falta de arquivo, contagem divergente, modos incompatíveis e modos individuais anteriores.
- A simulação de fluxo cobre Gerar PDF e Imprimir, agente antigo, arte ausente, erro de download e mudança de seleção durante o carregamento. Impressora, rede e confirmação de status são simuladas.
- Sintaxe JavaScript e Python e revisão de whitespace verificadas. Na entrega segura, foi localizado e reutilizado o ambiente virtual existente de compilação. A seleção ampliada do pytest passou: 83 testes, 23 subtestes e 2 skips (casos dependentes do pool real de QR Ideal na raiz, não disponibilizado aos testes); a suíte completa não foi executada. Os testes antigos inicialmente falharam por ausência do arquivo ignorado `base_ticket.pdf`; fornecer uma base sintética permitiu executá-los. Nenhuma dependência foi instalada.

## Entrega operacional e recuperação

Esta mudança envolve frontend e motor/API local. O motor foi integrado no commit `9168d3ed` e o frontend no commit `89dfdd87e62bf2fe4b0408913073cddc3eee8fd7`, tag `v925`. A tag `agente-v1.2.337` aponta para o mesmo commit do frontend, que contém ambos os componentes. Os arquivos empacotados no executável foram comparados com essa fonte.

O Cloudflare Pages confirmou a implantação `d59737a7-a6ea-4a9c-9531-3662d8a33272`. A primeira comparação do entrega-segura recebeu conteúdo anterior durante a propagação; sem repetir a publicação, a leitura independente seguinte confirmou **14/14 hashes** nos domínios `imposition.ai-ideal.com.br` e `imposicao.pages.dev`: index.html, producao.html, cliente.html, controle.html, pedido.js, script.js e montagem.js.

O instalador `NewProd_Setup_v1.2.337.msi` tem **156057600 bytes**, ProductVersion `1.2.337.0` e SHA-256 `0b356ce85645ede269cfa5ce9067120a6ce4ebb99ac892a11b289a3bf3188bf2`. O download público conferiu antes da ativação de `latest.json`. O manifesto foi conferido com e sem parâmetro para evitar cache. O executável inclui o motor/capacidade novos, os sete assets de frontend e as DLLs da impressão GDI.

[Comprovante de publicação e hashes](evidencias-paginado-v925-newprod-1.2.337.json).

A consulta após ativação encontrou nove estações com sinal nas últimas 24 horas: oito declaravam 1.2.336 e uma não informava versão na coluna. **Nenhuma instalação 1.2.337 foi confirmada nessa consulta.** O operador pode usar NewProd → Atualizar agora. Após atualizar, conferir a versão e repetir a validação de impressão física. O frontend impede esta combinação enquanto o motor da estação não anunciar a capacidade necessária.

Antes de usar 22234 operacionalmente, conferir a tiragem corrigida, o PDF combinado, a seleção de folhas e a impressão física frente/verso. Nenhuma dessas validações com dados reais foi realizada nesta implementação.

Em eventual regressão, preparar a reversão dos commits específicos em nova branch e publicar nova versão de cache. Para reverter o motor em estações já atualizadas, compilar o código anterior com um número de versão maior que 1.2.337: o auto-update não faz downgrade. Não sobrescrever o MSI publicado, reescrever histórico ou descartar checkouts existentes. A capacidade impede a combinação no frontend novo quando a estação não possui o motor compatível. Nenhuma recuperação foi executada.
