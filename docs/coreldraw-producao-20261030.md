# CorelDRAW em produção — 30/10/2026

Após a aprovação do piloto pelo usuário, a Lista de Arte passa a mostrar
CorelDRAW e Atualizar. As operações enviam explicitamente editor=coreldraw;
uma preferência antiga da estação não seleciona o TraceDraw por engano.
Os arquivos TDRAW e seus backups permanecem preservados. O selo das artes
anteriores mantém o editor que realmente gerou cada revisão.

Ponte distribuída: 1.7.2. Suporte validado no CorelDRAW 24.3.0.571,
registrado na pasta Graphics Suite 2022. Outras versões exigem prova na estação.
O piloto 24548/modelo 1005677 foi aprovado pelo usuário. Não há medição
instrumentada comparativa de velocidade nem prova física de impressão.

PDF oficial, composição, aprovação do cliente e impressão permanecem no
fluxo atual. CDR separado de TDRAW; backup assíncrono no Drive, PDFs no Supabase.
O serviço ponte-drive versão 9 já aceita os destinos Corel. A ampliação do
CHECK da fila preservou as 22 linhas existentes e não alterou pedidos.

Ponte 1.7.1 corrigiu o arredondamento de páginas vazias pelo importador Corel,
preservando 158 x 70 mm. Ponte 1.7.2 ativa uma camada editável após inserir as
referências; numeração/picote continuam bloqueados e não imprimíveis.
Provas COM sintéticas cobriram quatro páginas, exclusão isolada, camadas,
exportação PDF/X-1a e perfil ICC; testes de interface cobrem envio explícito
ao Corel e preparação de todos os modelos antes da publicação.

O instalador é o único arquivo público na pasta de distribuição. O manifesto
ponte-download.json registra versão, tamanho e SHA-256 conferidos por download.
Publicação não instala a ponte automaticamente nos computadores dos designers:
salvar documentos, sair da ponte, baixar e instalar a versão 1.7.2.

Recuperação: retornar os assets web ao commit anterior e usar a opção de
retorno do instalador. Não apagar CDR/TDRAW nem reverter PDFs de pedidos
automaticamente. A constraint ampliada continua compatível com a ponte antiga.
Fontes completas da ponte e evidências locais permanecem no checkout
imposition-coreldraw-20261030; build ponte-build-corel-20261030-04.
