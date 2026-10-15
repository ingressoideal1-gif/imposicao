# NewProd 1.3.9 — Montagem e Dashboard de Produção

Base: fonte oficial 1.3.8 (`b465be36`). Preserva o funcionamento offline,
nomes dos PDFs, destinos de impressão, migração e identidade da estação.

A Montagem carrega pedidos e modelos ao abrir. O seletor de formatos permite
escolher o catálogo enquanto a leitura está pendente e permanece disponível
se a consulta falhar. Após a carga, lista os formatos dos modelos aguardando
nos pedidos em produção. Cor, numeração e produto resolvem o formato usando
a mesma regra da tela Pedido. A folha montada é preservada.

O menu Produção contém Dashboard de Produção em página própria. Abre em Hoje,
permite escolher período pela data prevista de produção/entrega e soma por
produto total e impresso. Inclui todos os status, inclusive expedidos e entregues,
dentro do período escolhido. A base do dashboard é separada da fila operacional.

## Entrega

Distribuição oficial com pacote único e aliases históricos de atualização.
Os três manifestos devem conservar as estações já autorizadas e só podem ser
ativados após conferir tamanho e SHA-256 dos dois downloads públicos.
A versão e os arquivos embutidos serão conferidos no MSI e no executável.

Nenhuma instalação, reinício ou impressão física é parte desta publicação.
O site hospedado permanece na versão já aprovada pelo usuário.
A correção de Montagem foi confirmada pelo usuário no painel local antes da
incorporação; isso não comprova adoção da nova distribuição nas demais estações.

Recuperação: fonte anterior na tag `agente-v1.3.8`; após adoção do MSI,
publicar uma versão superior com a correção necessária, sem downgrade forçado.

## Auditoria do pacote

MSI 1.3.9: 196.681.728 bytes. SHA-256:
`332280c2718d77d282a59df10ae9cb5eec00b87ef8f6896d83c60cfd89dd4815`.
ProductVersion e versão do módulo Python conferidos. Os 375 arquivos do painel
embutidos no executável correspondem byte a byte às fontes desta distribuição.
Auditoria de ausência de credenciais e preservação da estação aprovada.
Evidência: `evidencias/release-139-oficial-auditoria.json`.

Testes focados: 3.586 verificações do núcleo, 254 da tela, catálogo local por
pedido, abertura com carga pendente/falha, seletor interativo no navegador,
dashboard com todos os status e navegação em desktop/celular aprovados.

Bateria completa aprovada nos três perfis: 1.048 testes Python, dois pulados,
dois subtestes e 19 harnesses JavaScript por perfil. Evidência: `evidencias/newprod-139-testes.json`.
