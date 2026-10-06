# QR Ideal: protocolo de 12 caracteres e compatibilidade da portaria

## Contrato e revisão

Nova emissão v2: `inverter(ultimos4(modelo).padStart(4,'0')) + codigo_privado_de_8_caracteres`.
São 12 **caracteres alfanuméricos**, sendo quatro algarismos no prefixo. Zeros são
preservados. O pedido continua identificando o contrato e seu sal no banco.

Apenas trocar o prefixo deixaria o mesmo sufixo secreto em modelos diferentes.
A implementação final usa uma base privada independente (`ideal-qr12-1`), sem nenhum
código da base legada, e uma reserva global exclusiva por emissão. Não há
reutilização de posição, inclusive entre pedidos/eventos e modelos com os mesmos
quatro últimos algarismos. Esgotamento dos 3 milhões de códigos bloqueia novas
emissões; exige outra revisão da base, nunca truncamento ou volta por módulo.

A base final foi gerada com `secrets.token_bytes(5)`, Base32 e deduplicação,
comparando cada candidato com todos os códigos antigos. Não deriva de material
distribuído nos instaladores históricos. Três milhões de códigos únicos foram
conferidos, sem interseção com a base legada.

A revisão final identificou que a base antiga havia sido distribuída em MSIs.
Mesmo retirando esses arquivos do ar, não é possível revogar cópias anteriores.
Por isso a derivação `ideal-qr12-d1`, incluída na etapa intermediária 1.2.357,
foi retirada antes de qualquer emissão v2. A 1.2.358 exige a base independente;
ausência ou hash incorreto bloqueiam o QR12, sem derivar ou baixar outra base.

O administrador provisiona cada estação por canal privado, usando
`ferramentas/provisionar_qr12.py --origem <arquivo-privado> --canal producao|piloto`.
O comando confere tamanho/hash, protege a pasta e não sobrescreve uma base
divergente. Não há biblioteca criptográfica nova, segredo no frontend/MSI nem
endpoint para baixar a base usando a credencial compartilhada de publicação.

SHA-256 da base de 24.000.000 bytes:
`6e968837c7f16a9acd0b0a46adfa84bbb1137dae75010f64512ca7f01351e1dc`.
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
preservado. Release final web v1023 / NewProd 1.2.358.

1. Backup e ensaio, testes sintéticos, revisão do diff e dos pacotes.
2. Aplicar `sql/ideal_control_qr12.sql` em uma transação. Cria quatro tabelas
   privadas, funções, índice e trigger; inventaria posições legadas em tabela
   nova. Não altera códigos/credenciais existentes. Ativação inicial é falsa.
3. Enviar a base v2 ao bucket privado, conferir tamanho/hash e acesso anônimo
   negado. Publicar os consumidores Edge após o SQL.
4. Integrar por PR com verificações obrigatórias; conferir assets públicos e
   atualizar NewProd/Piloto com verificação do pacote e do serviço local.
5. Provisionar a base independente nas estações do evento controlado. Após
   confirmar ausência de emissão anterior, autorizar somente esse pedido e manter
   `corte=infinity`, sem ampliar para outros modelos. Validar papel, aparelho,
   download, leitura, repetição e sincronização antes do corte geral.
   Não converter o pedido 23063 sem a confirmação solicitada sobre impressão/entrega.

Para suspender novas reservas v2: `UPDATE public.producao_acesso_qr_controle SET ativo=false WHERE id=true;`.
Manter contratos, bases e leitor novo para reimpressões e ingressos já emitidos.
As migrações complementares `ideal_control_qr12_suspensao.sql` e
`ideal_control_qr12_suspensao_piloto.sql` impedem que a suspensão crie contratos
legados para modelos elegíveis, tanto no piloto restrito como após o corte geral.
`ideal_control_qr12_base_independente.sql` troca a revisão somente com emissão
desativada e nenhum contrato v2 existente. Aplicar nessa ordem após a migração
original; arquivos de migrações já aplicadas não foram reescritos.
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

## Etapa intermediária publicada: v1023 / 1.2.357, emissão v2 desligada

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

A entrega técnica compatível não habilita emissão geral antes da validação do
evento controlado prevista na análise. A emissão v2 permanece desligada; falta a
confirmação sobre o pedido piloto e a validação operacional em papel/aparelho.
Não houve impressão física nem alteração dos ingressos já emitidos nesta entrega.

## Revisão final 1.2.358

A base independente foi provisionada nas duas instalações locais, em pastas
protegidas separadas. Outras estações precisam recebê-la por canal privado antes
de emitir QR12. Atualizar o MSI sozinho não realiza esse provisionamento.
O script de backup versionado inclui a base nova e os contratos de ambos os
canais; o ensaio desta entrega executou essa versão a partir do checkout isolado.
Os resultados finais de publicação, instalação e testes são registrados abaixo.

- [PR 95](https://github.com/ingressoideal1-gif/imposicao/pull/95), fonte
  `051b83241c66c2aed065f6319c74b7c110b062f3`, integrado em
  `af9873aebfabdb1a9b4e88b4e26dfc72b3a83184` após os quatro checks obrigatórios.
- 76 testes Python/SQL afetados passaram, incluindo dez cenários PostgreSQL de
  reserva, concorrência, permissões, suspensão e piloto restrito. Quatro testes
  Deno de protocolo/preparação e 326 regressões Deno passaram. A conferência dos
  dois canais repetiu 389 aprovações e dois skips em cada um.
- Base independente no bucket privado: download autenticado e hash conferidos,
  acesso anônimo recusado. Edge finais: `acesso-estacao` 259, `portaria` 263 e
  `acesso-interno` 263. Controle relido com `ativo=false`, `corte=infinity`,
  revisão `ideal-qr12-1`, zero contratos e zero credenciais do pedido 23063.
- Cloudflare confirmou a implantação `f297cc27-5c13-4918-90fe-84e9fcdebbc4`;
  os mesmos 34 arquivos públicos foram novamente conferidos nos dois domínios.
- Novo backup e ensaio: `backup-20261005-215124-be624240`, AES-256-GCM,
  190.686.215 bytes, SHA-256
  `e358fd2473fecc987bae87f79d55c61468331338c9102bca6778baf8c0497413`.
  Restauração conferiu Git, 1.218 referências, 28 worktrees alteradas, 173 arquivos
  não rastreados e dez arquivos de runtime, incluindo as bases independentes das
  duas instalações. Cópia cifrada no Drive Desktop conferida; isso não comprova
  a conclusão da sincronização remota do Drive.
- A base independente tem também backup cifrado separado, com decifragem
  conferida e cópia no Drive Desktop. SHA do pacote:
  `20f921b6b4cdee3bb174be27079ae8301f7442819b553ec84ffce3288781e8f7`.
- Os executáveis finais foram inspecionados: módulo de derivação ausente,
  revisão/hash da base corretos, frontend correspondente e nenhum arquivo
  privado incorporado. O servidor PostgreSQL de testes sintéticos foi encerrado.
- [MSI final 1.2.358](https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProd_Setup_v1.2.358.msi):
  157.282.304 bytes, SHA-256
  `220880d8a2ef2124fd49d47806c4db8a8003d5ce74ebfb06785cac179ea52142`.
  Download público conferido antes de promover `latest.json`; manifesto relido
  com a versão 1.2.358 e esse hash. Tag `agente-v1.2.358` no commit integrado do PR 95.
- Produção local: API 9000 em 1.2.358 e executável instalado SHA-256
  `7794290651f08afd4e8266ea6a1d2bff5a866a00d7a87a8c976a02692e31d67c`.
  Piloto: API 9001 em 1.2.358-piloto-local.27, executável SHA-256
  `342f8b3144e3f06fcf4d680cb1d15f3113f4c3df5598b2c85695f3a8c583b0e3`.
  Ambos com capacidade QR12, base independente provisionada e 22/22 arquivos
  servidos conferidos. Fila do Piloto ociosa, coleta no estado anterior e sem erro
  de catálogo; não foi executada impressão offline.

## Ponto de retomada

Conferência de 05/10/2026, 22h00 (Brasília): emissão v2 **desativada**, corte
`infinity`, revisão `ideal-qr12-1`, nenhum contrato criado. Pedido 23063 permanece
bloqueado. PC-JR-HOME e Piloto estão em 1.2.358; quatro outras estações online
ainda anunciavam 1.2.357 e recebem a atualização pelo fluxo normal. FLEXO teve
último sinal às 21h28; não se presume instalação nem causa da interrupção.

Para a liberação operacional:

1. Confirmar se o pedido 23063 teve qualquer impressão/entrega, inclusive offline.
   Se houve ou a informação continuar desconhecida, preservar o bloqueio e tratar
   eventual reemissão em escopo próprio, com cancelamento/auditoria.
2. Conferir NewProd 1.2.358 e provisionar a base independente nas estações que
   participarão do evento controlado. O pacote público não transporta a base.
3. Com um pedido confirmado sem emissão anterior, registrar essa confirmação,
   habilitar somente o piloto (`corte=infinity` com autorização daquele pedido)
   e conferir os contratos/intervalos retornados. Não alterar sal nem credenciais.
4. Atualizar os aparelhos online, baixar o evento completamente e validar papel,
   leitura, repetição, modo offline e sincronização. Somente então ampliar o corte
   para novas emissões gerais.

Não foi necessária nova permissão para executar código, SQL ou publicação. Os
itens pendentes são fatos e verificações operacionais indisponíveis nesta sessão.
Evidências sanitizadas: [registro JSON](evidencia-entrega-qr12-2026-10-05.json).
