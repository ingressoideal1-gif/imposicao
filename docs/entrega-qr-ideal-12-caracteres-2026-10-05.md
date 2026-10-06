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
preservado. Release planejado web v1023 / NewProd 1.2.357.

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

Publicação, ativação e instalação serão registradas abaixo com a confirmação de
execução. Testes de navegador desktop não comprovam câmera/iPhone ou impressão física.
