# Entrega segura — Criar colunas nos bancos do pedido

## Estado

**VALIDADA**, por `entrega-segura.ps1 publicar -Simular`, em 29/09/2026.
Sem commit, push, publicação, SQL remoto ou distribuição de NewProd nesta etapa.
A versão calculada na revalidação foi **v982**, ainda não reservada: o publicador a recalcula
quando a publicação for executada.

Pacote atualizado em `C:\ProjetosLocais\ideal-imposition-pedido-colunas-entrega-atual-20260929`,
branch `fix/pedido-colunas-entrega-atual-20260929`, sobre
`origin/main @ 88b03346ddf3589c81416e5527156f5e6e0cee19`.

## Integração e revisão

Na segunda solicitação de entrega segura, a base havia avançado mais quatro
commits. O pacote anterior foi preservado e a entrega reaplicada na worktree acima.
O patch inicial foi recusado porque o contexto do carregamento de `style.css`
mudou de v968 para v981 nas duas páginas. A reaplicação preservou v981 e acrescentou
somente os módulos do editor. Os sete arquivos novos tiveram hashes conferidos,
e a simulação completa passou novamente, incluindo o navegador com o CSS atual.

A base avançou sete commits depois da implementação. Foi criada uma nova
worktree com o preparador e aplicado, sem conflitos, somente o diff de
`frontend/script.js` e `frontend/index.html`. Os sete arquivos novos foram
copiados com comparação de SHA-256 (7/7 iguais antes dos ajustes de entrega).
A worktree de implementação e os quatro arquivos não rastreados do checkout
operacional foram preservados.

Na revisão das entradas da Lista de Arte, foi constatado que `producao.html`
carrega `script.js`, mas não tinha as dependências necessárias ao novo editor.
A entrega inclui `banco-do-modelo.js`, `csv-editor.js`, `pedido-colunas.js` e o
estilo do editor nessa página. O novo cenário de teste verifica o carregamento
e a ordem dos módulos em `index.html` e `producao.html`.

O verificador tratou a imagem PNG como texto e recusou whitespace binário.
A imagem ficou como evidência externa em
`C:\ProjectBackups\pedido-colunas-entrega-20260929\pedido-colunas-previa.png`,
sem alterar as regras do verificador. SHA-256:
`ba83e8e053f7e7964edec0b3a49a1e8863e6ec4129380ba4c34c742f5375f630`.
A imagem original também permanece na worktree da implementação.

## Validações

```powershell
$env:NODE_PATH = 'C:\ProjetosLocais\ideal-imposition\node_modules'
.\entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Simular `
  -Mensagem 'Permite criar e editar colunas nos bancos do pedido' `
  -Teste @('tests/banco_do_modelo_harness.js',
           'tests/banco_do_pedido_etapa2_harness.js',
           'tests/banco_do_pedido_regressao_harness.js',
           'tests/banco_do_pedido_na_impressao_harness.js')
```

- Escopo Frontend, base atual, revisão de segredos, links e whitespace aprovados.
- Sintaxe dos JS alterados e dos novos harnesses aprovada.
- 12 cenários específicos e 206 verificações existentes aprovados.
- Chromium: criação, edição junto ao CSV, colagem, limpeza, renomeação, salvamento
  pendente, erro/repetição, reabertura, cancelamento, paginação, tela estreita e
  disponibilização das colunas no seletor real do modelo aprovados.
- API inteiramente simulada, sem requisições externas nos testes de navegador.
- Cache planejado em `index.html` e `producao.html` para os assets alterados.

Hashes normalizados dos oito arquivos funcionais/de teste e estado da validação:
`C:\ProjectBackups\pedido-colunas-entrega-20260929\validacao-atual.json`.
O arquivo `validacao.json` preserva a evidência do pacote anterior.

## Limites e publicação

O salvamento de renomeações usa etapas recuperáveis na API existente, não uma
transação única. Fechar/recarregar durante uma tentativa interrompida pode deixar
temporariamente ambos os nomes no banco. A comparação prévia não é um lock de
concorrência no servidor. Os detalhes estão no
[registro da implementação](registro-2026-09-29-pedido-criar-colunas.md).

Próxima ação é publicar este pacote quando solicitado. Reconsultar `origin/main`
e repetir a validação se a base ou o código mudar. Após a publicação, aguardar
Cloudflare Pages e comparar os hashes públicos nos dois domínios, incluindo
`/`, `/producao.html`, `/script.js`, `/pedido-colunas.js` e `/pedido-colunas.css`.

Antes da publicação não há efeito remoto a reverter. Depois dela, eventual
recuperação do código deve ser feita por revert do commit da entrega, preservando
os bancos e vínculos criados pelos usuários. A funcionalidade usa o formato de
banco já existente; não requer migração nem versão nova do agente.
