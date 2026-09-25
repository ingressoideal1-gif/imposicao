# Publicação web — Cor e Formato

Autorização: pedido humano `publicar`, após validação visual local e informação
de execução do SQL no e-deal. Candidato em
`C:\ProjetosLocais\ideal-imposition-cores-publicacao`, branch
`release/cores-formatos-20260925`, criado de `origin/main` em `fc9689ab` (v963).

Escopo: frontend, testes e documentação. Preserva as entregas v960–v963,
incluindo duplicação do verso, uploads combinados e variações do portal.
Conflitos de inclusão do helper nos HTMLs resolvidos mantendo as referências
atuais. `cor-margens.js` também carregado por `producao.html`.

Comportamento: quatro margens visuais da Cor; peça e PDFs de arte/gabarito no
Formato base para os novos cadastros; exportação Somente Arte sem substituição
por amostra; falha de original impede download parcial. Inclui as correções
anteriores de duplicação, confirmação de salvamento e seleção de Formato.

Validação: testes de pixels painel/portal, cadastro, PDFs reais, dimensões,
seleção de Formato, fila, controles PDF, escala, navegação e carregamento da Cor.
Regressões adicionais da base atual: duplicar verso sem Modo PDF, uploads
combinados, verso do portal e integridade de impressão. O orquestrador verifica
escopo, segredos, sintaxe, diff, testes e versiona referências antes do push.

Limites: a consulta REST das quatro colunas foi aceita; INSERT/UPDATE autenticados
com RLS reais continuam sem comprovação. O usuário aprovou a visualização.
Não houve escrita de teste real, nova execução SQL ou alteração de permissões.
Os ajustes de `app.py` e `db.py`, o SQL e os demonstradores locais permanecem
no worktree de desenvolvimento; não são distribuídos nesta publicação web.
Nenhum novo MSI, alteração no motor ou teste físico de impressão faz parte dela.

Após o push: aguardar Cloudflare e comparar hashes normalizados com cache-bust
nos dois domínios, incluindo o novo helper. Rollback web deve preservar as
entregas anteriores e as colunas; não apagar dados nem reduzir a versão do agente.

## Comprovação concluída

Publicado como **v964**, commit `134620ff7ebcfbd10b916fa9a6849345a5d1a67c`.
Cloudflare confirmou sucesso no deployment
`ed79c2a9-04b4-44dc-a397-b1d19c363228`. A primeira comparação do orquestrador
ocorreu durante a propagação e ainda encontrou conteúdo anterior; não houve
republicação. A comparação posterior confirmou **18/18 hashes normalizados**
nos domínios `imposition.ai-ideal.com.br` e `imposicao.pages.dev`.

Evidência: [comparação pública](evidencias/cores-formatos-v964-public-verification.json).
Gravação autenticada e aceite físico continuam com os limites descritos acima.
