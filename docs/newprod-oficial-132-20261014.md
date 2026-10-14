# NewProd 1.3.2 oficial

O usuário autorizou a 1.3.2 sem sufixo para substituir automaticamente a
1.3.1-teste.1. Simplesmente anunciar 1.3.1 não atualizaria esse runtime:
o comparador instalado considera a quarta parcela numérica do sufixo.

Fonte: `fff20793`. Runtime `1.3.2`, produto e atalhos Windows `NewProd`.
O box agora se chama `Forma de envio`. Os nomes técnicos internos de funções,
campos e endpoints permanecem para compatibilidade. Nenhuma alteração nas
regras de impressão, confirmação comercial, Hot Folder ou configurações salvas.

O novo runtime e o preservador MSI consultam `newprod-piloto-oficial.json`.
`latest.json` atende os agentes legados. `newprod-piloto-teste.json` será
somente ponte de migração dos agentes que ainda exigem o contrato antigo.
O alias `NewProdPiloto_Teste_v1.3.2.msi` tem exatamente os mesmos bytes do
MSI oficial e instala `NewProd 1.3.2`, sem sufixo. Não é uma versão de teste.

O instalador mantém UpgradeCode e diretório de instalação. A atualização
automática existente conserva o preflight de atividade e a preservação dos
dados. Não forçar instalação nem encerrar trabalhos para acelerar a adoção.

Auditoria: 375 arquivos do painel idênticos à fonte, identidade MSI e ausência
de arquivos privados conferidas. MSI oficial: 196677632 bytes, SHA-256
`9794b786f367bc2f9546b8d6860f07c2c97212247e94d36ae5cd74d80709eadd`.
Evidência: `evidencias/release-132-oficial-auditoria.json`.

O processo de entrega exige download integral conferido dos dois nomes de
pacote, conclusão dos testes dos três perfis e releitura dos manifestos antes
da ativação. Ativar oficial/legado antes da ponte antiga, pois o novo
preservador já consulta o manifesto oficial.

Binários anteriores em `dist/compatibilidade/base-131-binarios`; manifestos
anteriores em `dist/compatibilidade/manifestos-antes-release-132.json`.
MSIs anteriores preservados. Recuperação de máquinas já atualizadas exige
uma versão maior com a fonte recuperada; não há downgrade automático.

## Validação

As 60 etapas dos três perfis passaram: 940 testes Python e dois subtestes por
perfil, mais 19 harnesses JavaScript por perfil. Permanecem duas exclusões
por falta do pool QR real e um aviso preexistente Starlette/httpx por perfil.
O harness adicional das formas de envio passou em Chromium, incluindo salvar
e restaurar os três modos, GDI padrão e Hot Folder sem fallback para impressora.
Uma asserção inicial ainda esperava a versão antiga do cache do script; ela
foi atualizada e acrescentada a conferência do título `Forma de envio`.
O teste do comparador confirma que a versão oficial supera `1.3.1-teste.1`.

Relatórios em `dist/compatibilidade/release-132-regressoes.json` e
`dist/compatibilidade/release-132-oficial.json`.

## Publicação concluída

Os dois downloads foram conferidos integralmente e os três manifestos foram
ativados e relidos em 1.3.2, com o mesmo hash e as mesmas 12 estações.
Evidência: `evidencias/release-132-oficial-publicacao.json`.
Não houve instalação forçada, reinício manual ou impressão nesta entrega.
A versão instalada e a geração real continuam exigindo confirmação por estação.
