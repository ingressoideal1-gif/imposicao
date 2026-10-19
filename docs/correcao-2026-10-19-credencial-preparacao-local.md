# Credencial com PDF no gabarito: preparação local

O pedido 23588, modelo 1003374, tem arte aprovada e PDFs HTTPS nos elementos
do gabarito, mas não possui `arte_url` no modelo. A preparação exigia
`fontes.frente`, excluía o modelo e o painel mostrava o aviso genérico para
reabrir o pedido. A consulta aos dados reais foi somente leitura.

## Correção local

- `supabase/functions/_compartilhado/piloto_local.ts`: na ausência da URL
  explícita do modelo, reconhece um elemento PDF HTTPS da frente ou de ambas
  as faces como fonte de frente do pacote. Todos os outros recursos continuam
  incluídos. Não modifica modelo, gabarito, composição, dados variáveis ou faces.
- `revisao_pedido_piloto.py` e `selecao_piloto.py`: marca a nova classificação
  das fontes no cache. Um cache anterior precisa de nova conferência completa
  na nuvem mesmo quando a revisão comercial permanece igual. Não apaga arquivos.
- Fotos, fontes, PDFs somente do verso e conteúdo inline não recebem essa
  classificação. Aprovação, empresa, digest, versão de Storage e validação
  dos arquivos continuam obrigatórios.

Os testes sintéticos reproduziram a ausência de `fontes.frente` antes da
correção e passaram depois. Cobrem também múltiplos PDFs, prioridade da URL
explícita, arte sem aprovação e renovação do cache sem alteração comercial.

## Bases e entrega

Implementação revisável em `imposition-arte-gabarito-23588`, branch
`fix/arte-gabarito-preparacao-23588`, base `origin/main` (`bb182029`).
Aplicação localizada também preparada em `imposition-arte-gabarito-23588-agente`,
base `agente-v1.3.16` (`fcaf7838`), preservando as diferenças do agente publicado,
incluindo abertura offline e classificação de URLs dos bancos.

A entrega requer publicar a Edge Function `piloto-local` com o módulo
compartilhado corrigido antes de distribuir o agente com renovação do cache.
Não reaplicar SQL nem alterar os dados comerciais para forçar uma revisão.
Após instalar a versão corrigida, a primeira abertura precisa de conexão para
renovar a conferência antiga; depois se aplicam as regras offline já existentes.

Nenhum commit, publicação de função, MSI, instalação ou impressão real foi
executado nesta correção local. A geração e a impressão na estação permanecem
como validações operacionais posteriores à entrega.

## Validação local

- Branch principal: 362 testes Deno; 28 testes Python de preparação/revisão;
  833 testes Python por perfil Produção e Piloto, além dos harnesses previstos.
- Base 1.3.16: 356 testes Deno; 65 testes Python incluindo abertura offline;
  1.112 testes Python no perfil Oficial e todos os harnesses previstos,
  incluindo navegador.
- Cada suíte completa Python apresentou dois testes pulados e o aviso já
  existente de depreciação `Starlette/httpx`; nenhum teste foi desabilitado.
- Deno executado com `--node-modules-dir=none --cached-only`, reutilizando
  dependências já disponíveis, sem instalação ou alteração dos lockfiles.
- Revisão de whitespace sem erros. Testes usam serviços simulados e arquivos
  temporários; não comprovam geração ou impressão física do pedido real.
