# Entrega CorelDRAW / Ponte 1.9.0 — 31/10/2026

Esta entrega consolida as notas anteriores de observações, exclusão e abertura de origem. As pendências de empacotamento dessas notas foram atendidas pela Ponte 1.9.0; adoção nas estações continua separada da publicação.

## Conteúdo

- Alterações acima das observações do produto, título vermelho e texto azul em negrito, fora da página e sem impressão.
- Limpeza da arte nas páginas correspondentes do CDR, preservando outras páginas, referências e backup; envio ao Drive com retomada de falhas.
- Abertura automática pelo disco, nuvem ou PDF atual conforme disponibilidade; escolha de fonte apenas com versões diferentes. Documento aberto mantém edições não salvas.
- Biblioteca privada de fontes TTF/OTF, confirmação de licença, identificação por hash e manifesto do documento. A Ponte prepara fontes aprovadas na pasta do Corel Font Manager, sem instalação global no Windows.

## Evidências

- 79 testes Python da Ponte; 389 testes Deno; harnesses de fontes, integração, transporte e documento aprovados.
- Regressão completa dos canais Produção/Piloto concluída; painel Piloto preparado sem instalação. Verificação protegida do frontend aprovada.
- CorelDRAW real com documento sintético: troca da primeira página, limpeza da segunda e preservação da terceira, com referências e backup.
- Backend PR #237, commit 4f8843af: checks obrigatórios aprovados; função painel versão 267 ativa. Rota de fontes sem autenticação retorna 401.
- Migração criou biblioteca vazia e bucket privado, RLS ativo, sem leitura direta anônima/autenticada. Catálogo web anterior permaneceu com 311 registros.
- Instalador 1.9.0: 189309516 bytes, SHA-256 `578fdcc9eb3aca39d263a18a17fdce5daff339790d02730a0eb075c62d38f04d`. Autotestes do runtime/instalador e download autenticado/público conferidos. Revisão anterior 1.8.0 preservada no Drive.
- Fonte operacional completa preservada em `imposition-coreldraw-20261030`; snapshot e hashes em `ponte-build-corel-20261031-1/source-review`.

## Recuperação e limites

O instalador mantém a opção Voltar à versão anterior. O frontend pode retornar à implantação anterior do Cloudflare; o backend à fonte anterior à PR #237, mantendo tabela e bucket privados sem exclusão de dados. Backups de documentos não foram removidos.

Nenhuma estação de designer foi instalada nesta entrega. Após atualizar a Ponte, validar um documento entre duas estações e uma exclusão de face com outras páginas preservadas. A biblioteca inicia vazia: fontes precisam ser carregadas com licença autorizada; Corel Font Manager deve acompanhar a pasta preparada. Reconhecimento real na segunda estação permanece pendente.

Dois testes legados de `test_painel_sync_origem.py` falham igualmente na base inalterada por `NameError: PILOTO`, no recorte AST do teste. Não foram modificados nem desabilitados; a regressão obrigatória e CI passaram.

Limites de origem: troca manual é identificada pela URL da arte; sobrescrita externa na mesma URL não é inferida. A limpeza depende da comunicação com a Ponte; backups e cópias de outras estações não são apagados.
