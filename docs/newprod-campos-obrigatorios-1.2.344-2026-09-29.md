# NewProd 1.2.344 — campos obrigatórios dos modelos

Atualização autorizada em 29/09/2026. Base: `e9271c15`, que contém o frontend v971 já publicado e verificado. Worktree isolado: `C:\ProjetosLocais\ideal-imposition-faixa-22770`; checkout operacional e piloto preservados.

## Conteúdo e validação

O novo instalador incorpora o painel v971: bloqueia PDF e impressão quando faltam campos aplicáveis à produção, identifica os modelos/campos pendentes e não preenche automaticamente início, fim ou quantidade. A faixa de outro modelo não é reutilizada. Nenhuma alteração de banco ou do motor foi incluída.

- 87 testes passaram: campos obrigatórios, PDF real com cinco peças após correção, impressão combinada e sintaxe do frontend.
- PyInstaller e WiX concluídos com ferramentas já instaladas; nenhuma dependência instalada.
- Os seis assets verificados dentro do executável são idênticos aos arquivos locais; presentes a versão 1.2.344, o módulo de publicação e as três DLLs de impressão.
- MSI: `NewProd_Setup_v1.2.344.msi`; ProductVersion `1.2.344.0`.
- Tamanho: 156200960 bytes, abaixo do limite consultado de 209715200 bytes.
- SHA-256 local: `f60d37c05bbc102934c29559abf32323518fd813e54b5d9f665f8ff2742cf50e`.
- Preflight: manifesto público 1.2.343 e nome 1.2.344 ausente no bucket.

Logs, manifesto anterior, instalador baixado para conferência e provas ficam em `C:\ProjectBackups\newprod-campos-1.2.344-1790689633`.

## Ativação e limites

A ativação está condicionada ao upload sob nome novo e à igualdade de tamanho/SHA-256 do download público. O resultado será registrado abaixo depois da execução.

Publicação do MSI não comprova instalação em estação nem impressão física. O operador pode usar **Atualizar agora** no NewProd quando a produção estiver ociosa. Não reiniciar automaticamente a instalação local nem substituir o piloto como parte desta publicação.

Rollback exige reconstruir a versão anterior com número superior a 1.2.344; o atualizador não faz downgrade automático.
