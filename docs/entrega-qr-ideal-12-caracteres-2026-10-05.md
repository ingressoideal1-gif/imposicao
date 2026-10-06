# QR Ideal: protocolo de 12 caracteres e compatibilidade da portaria

## Contrato e revisão

Nova emissão v2: `inverter(ultimos4(modelo).padStart(4,'0')) + codigo_privado_de_8_caracteres`.
São 12 **caracteres alfanuméricos**, sendo quatro algarismos no prefixo. Zeros são
preservados. O pedido continua identificando o contrato e seu sal no banco.

Apenas trocar o prefixo deixaria o mesmo sufixo secreto em modelos diferentes.
A implementação usa uma base privada distinta (`ideal-qr12-d1`), sem nenhum
código da base legada, e uma reserva global exclusiva por emissão. Não há
reutilização de posição, inclusive entre pedidos/eventos e modelos com os mesmos
quatro últimos algarismos. Esgotamento dos 3 milhões de códigos bloqueia novas
emissões; exige outra revisão da base, nunca truncamento ou volta por módulo.

A base v2 é reproduzível nas estações a partir da base privada completa existente.
A chave deriva de SHA-256(domínio || bytes privados); o hash público de integridade
não permite reproduzi-la. Candidatos HMAC-SHA256 com contador, primeiros cinco
bytes em Base32, são deduplicados e comparados com todos os códigos antigos.
O código usa [hmac da biblioteca padrão Python](https://docs.python.org/3/library/hmac.html).
Não há biblioteca criptográfica nova, segredo no frontend/MSI nem endpoint para
baixar a base usando a credencial compartilhada de publicação.

SHA-256 da base de 24.000.000 bytes:
`931cc39738a68b9eb814e3d9908962bd04e3782893234f881222a0526a6e6d51`.
Python e nuvem verificam este mesmo arquivo. A nuvem lê exclusivamente o bucket
privado `ideal-control-master`; estações guardam a base na pasta protegida.

## Preservação e limites operacionais

- Emissões existentes permanecem v1, com prefixo do pedido invertido. Hashes,
  sais, credenciais, entradas e filas existentes não são convertidos.
- Contrato ausente em pedido antigo não comprova ausência de papel. Pedidos
  antigos só entram na v2 por autorização registrada de ausência de impressão,
  sem credenciais/preparação existente. O pedido 23063 depende dessa confirmação.
- Para novos modelos, a ativação usa uma data de corte persistida. Instalar o
  executável novo não muda sozinho a regra de um ingresso.
- Primeira reserva requer conexão. Reimpressão pode usar contrato local já
  confirmado se a rede cair. Recusa HTTP do servidor nunca é ignorada pelo cache.
- Quantidade, início, passo e posição ficam vinculados ao contrato. Mudança após
  reserva exige conferência; não se gera outra identidade para o mesmo ingresso.
- TICKET mantém quantidade como células físicas e valor `início + i*N + pos-1`.
  V2 admite numeração sequencial e uma posição de QR consistente por TICKET.
  Configurações de banco, valor fixo, CAMAROTE ou posições QR distintas são
  recusadas antes do PDF, sem inventar uma regra de acesso. QR comum foi preservado.
- Regras antigas que colidem continuam bloqueadas, inclusive na emissão de um
  modelo isolado. A estação obtém o contrato de todo o pedido antes de imprimir.
- O publicador QR usa o início/passo/posição contratados e mantém `numero` como
  ordinal da credencial. Folha com pedidos distintos publica cada pedido separado.
- Índice único e trigger impedem uma segunda credencial para o mesmo
  pedido/modelo/ordinal com outro hash. Colisões intencionais de QR comum entre
  modelos diferentes permanecem representáveis.

## PWA

O leitor tenta todos os sais distintos do evento: 12 caracteres também podem ser
um código v1 de pedido de quatro algarismos, portanto comprimento/prefixo não
selecionam a versão. Ambiguidades, setores e bloqueio de entrada repetida mantêm
suas regras. O backend informa leitor mínimo e recusa download v2 por leitor antigo.

Service worker guarda as URLs efetivamente referenciadas no HTML, inclusive
dependências compartilhadas com versão diferente. HTMLs do PWA recebem a mesma
versão de release. Atualização não aciona limpeza automática; IndexedDB, tokens,
fila, entradas e totais permanecem. Troca da carga continua recusada com fila
pendente. Um telefone offline não pode ser atualizado remotamente: antes do uso
da v2 deve abrir online, atualizar/recarregar e concluir o download do evento.

## Plano de entrega e recuperação

Destino: produção e-deal, projeto `vwbtitjlpelrcnsytzqw`, frontend Cloudflare e
NewProd. Checkout isolado `ideal-imposition-qr12-20261005`; checkout operacional
preservado. Release entregue web v1023 / NewProd 1.2.357.

1. Backup e ensaio, testes sintéticos, revisão do diff e dos pacotes.
2. Aplicar `sql/ideal_control_qr12.sql` em uma transação. Cria quatro tabelas
   privadas, funções, índice e trigger; inventaria posições legadas em tabela
   nova. Não altera códigos/credenciais existentes. Ativação inicial é falsa.
3. Enviar a base v2 ao bucket privado, conferir tamanho/hash e acesso anônimo
   negado. Publicar os consumidores Edge após o SQL.
4. Integrar por PR com verificações obrigatórias; conferir assets públicos e
   atualizar NewProd/Piloto com verificação do pacote e do serviço local.
5. Ativar novas emissões somente após esses passos. Não converter o pedido 23063
   sem a confirmação solicitada sobre impressão/entrega.

Para suspender novas emissões: `UPDATE public.producao_acesso_qr_controle SET ativo=false WHERE id=true;`.
Manter contratos, bases e leitor novo para reimpressões e ingressos já emitidos.
Depois de emitir v2, voltar ao gerador antigo não é rollback válido. Não apagar
credenciais, trocar sais, reconstruir IDs nem limpar celulares.

## Evidências até a revisão local

- Consulta administrativa: 539 modelos QR Ideal; 353.259 unidades cadastradas.
  Pedido 23063: zero credenciais, nenhuma publicação/preparação; isso não prova
  ausência de impressão offline. Nenhuma duplicidade lógica encontrada.
- Backup código/estação: `backup-20261005-204409-810ebf34`, AES-256-GCM,
  139 worktrees, 29 alteradas, 180 arquivos não rastreados e seis arquivos de
  runtime conferidos no ensaio. Cópia cifrada no Drive Desktop conferida.
- Banco: `banco-20261005-204716`, dump consistente e decifragem conferida;
  SHA do pacote `f61bdb61e3a5a128eba20cd9968f47d5cf5e34da3b796798d476b138061f5415`.
  A captura de roles foi concluída com credencial temporária renovada após a
  primeira expirar. Este snapshot não recebeu restauração completa em PostgreSQL.
- Base v2 cifrada separadamente e conferida por decifragem/cópia no Drive.
- PostgreSQL local descartável: oito testes de reserva, concorrência, repetição,
  legado, alteração, capacidade, identidade e permissões.
- Python/JS focalizado: 187 aprovações na rodada ampla; uma falha de codificação
  de mensagem SQL foi corrigida, e os oito testes SQL passaram na reexecução.
- PDF real sintético comparado por pixels com os QRs esperados; prévia e
  publicação usam o mesmo conteúdo. Nenhum ingresso real foi impresso nos testes.
- Deno: 326 regressões existentes e quatro testes de preparação/protocolo.
  Checagem de tipos dos dois endpoints alterados passou. Usado
  `--node-modules-dir=none` para resolver tipos pelo cache existente.
- Navegador: 19 verificações do PWA, incluindo v1/v2, pedido homônimo, tentativa
  de trocar prefixo, ambiguidade, repetição, fila pendente e reabertura offline.
  Duas verificações adicionais confirmaram download completo e falha de download.
- Dois canais: 389 testes passaram em cada canal, com dois skips por canal,
  além dos harnesses de compatibilidade e dos navegadores.

Testes de navegador desktop não comprovam câmera/iPhone ou impressão física.

## Publicação e instalação confirmadas

- [PR 94](https://github.com/ingressoideal1-gif/imposicao/pull/94) integrado pelo
  GitHub após os quatro checks obrigatórios. Commit de fonte
  `249f789c8e6973d6b04e10a9a8aa869f6d164198`; integração
  `0cac10147683e483a57b95eb288f443e4ae543d6`. Tags `v1023` e `agente-v1.2.357`.
- A entrega envolve frontend, Python, SQL e Edge. O comando de entrega de escopo
  único recusa esse conjunto misto; a publicação foi feita em etapas coordenadas,
  mantendo revisão de segredos, testes, PR protegido e conferência pública.
- SQL aplicado em transação: 539 reservas legadas inventariadas; nenhum contrato
  criado na migração, nenhum hash/sal/registro de entrada convertido.
- Base v2 privada enviada; download autenticado de 24.000.000 bytes e SHA-256
  conferidos. Acesso anônimo recusado. O instalador não contém essa base.
- Edge ativas: `acesso-estacao` 258, `portaria` 262 e `acesso-interno` 262.
  O terceiro consumidor usa o módulo compartilhado de preparação. As opções de
  verificação JWT foram preservadas. Consulta autenticada de status do pedido
  23063 respondeu com zero contratos.
- Cloudflare confirmou a implantação `1b61630c-96b5-4e27-a29b-ab27ab441684`.
  Após a propagação, 34 comparações de arquivos com cache-buster passaram nos
  domínios `imposition.ai-ideal.com.br` e `imposicao.pages.dev`.
- PWA publicado: Chrome 150 isolado, service worker `sw.js?v=1023`, 44 recursos
  em cache, abertura offline da interface e HTML/validador da portaria presentes.
  Sem carga, a portaria direciona corretamente para configurar o evento.
  Chamadas de negócio foram bloqueadas nesse navegador de conferência.
- [MSI 1.2.357](https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProd_Setup_v1.2.357.msi):
  157.282.304 bytes; SHA-256
  `c01622798960516460684f7a6d0be1104fa3b8b435678e84cd81f659b0e7d96b`.
  Download público conferido antes de ativar `latest.json`; manifesto público
  relido e confirmado na versão 1.2.357.
- PC-JR-HOME, produção na porta 9000: 1.2.357 instalada pelo item **Atualizar agora**
  da bandeja, preservando as travas do atualizador contra produção em andamento.
  SHA do executável instalado corresponde ao pacote:
  `6f787b762e619de92ef8e4543d84d323b1cbbdd40360139e72c89ff499d9e4c6`.
- Piloto na porta 9001: 1.2.357-piloto-local.27, instalado em pasta versionada
  independente, SHA
  `928d6835b66ed8880517077543df5d549ecad206f3b5d713a673d484677aad7b`.
  Fila ociosa confirmada e coleta pausada antes da troca; estado anterior retomado.
  Versão anterior e manifesto de recuperação preservados.
- Ambas as APIs anunciam `qr_ideal_contrato_v2`. Os 22 arquivos locais conferidos
  correspondem à fonte, incluindo a transformação esperada de identificação do
  Piloto em seus dois HTMLs. O campo de heartbeat `painel_versao` captura o primeiro
  `?v=` do HTML (CSS v1021), portanto sozinho não representa a versão v1023 dos JS.

## Ativação e pendências operacionais

A confirmação sobre impressão/entrega anterior do pedido 23063 continua pendente.
Zero credenciais e zero preparação na nuvem foram confirmados administrativamente;
essa ausência não comprova que nunca houve impressão offline. A autorização ampla
para executar a entrega não substitui esse fato. O pedido permanece sem autorização
de migração e com bloqueio de colisão no gerador novo.

Antes de usar v2 em um telefone, abrir o aplicativo online, aceitar/recarregar a
atualização e concluir o download do evento. Não usar **Apagar eventos** para
atualizar. Aparelhos e estações offline não receberam atualização comprovada.

O estado final de ativação e das estações online será registrado após a conferência
da propagação do instalador. Não houve impressão física nem alteração dos ingressos
já emitidos nesta entrega.
