# Publicação e recuperação operacional

A hospedagem operacional é **Cloudflare Pages**, no domínio
https://imposition.ai-ideal.com.br. A entrega deve confirmar também a origem
Pages configurada. Vercel é uma referência histórica; `publicar.ps1` e
`voltar.ps1` estão bloqueados antes de qualquer efeito para evitar uma entrega
no ambiente errado. O código legado permanece para consulta.

## Preparar e verificar

Preserve a pasta operacional e suas alterações. Parta de `origin/main` em uma
worktree isolada. Faça commits com arquivos explicitamente selecionados; não
use `git add -A` numa pasta compartilhada. Revise `git status`, `git diff
--check`, segredos e os testes pertinentes antes de integrar.

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend -Mensagem "fix(painel): descreva a alteração" -Simular
```

Leia [ENTREGA_SEGURA.md](ENTREGA_SEGURA.md) e os parâmetros do script para o
escopo real. `-Simular` prepara a avaliação sem envio remoto. O escopo NewProd
exige build próprio; o script de frontend não distribui o agente. Não use
importação de `app.py` como teste genérico: sua inicialização pode iniciar
serviços ou acessar o banco remoto.

## Entregar

Depois dos testes e da revisão, uma entrega web explicitamente autorizada usa:

```powershell
.\entrega-segura.ps1 publicar -Escopo Frontend -Mensagem "fix(painel): descreva a alteração"
```

O sucesso do push não comprova a publicação. Espere o check Cloudflare Pages,
consulte os domínios com parâmetro único para evitar cache e compare conteúdo
ou hashes normalizados dos assets com a fonte entregue. Registre commit,
versão, horário, arquivos, resultados e limitações. Edge Functions saem apenas
quando alteradas e autorizadas, no projeto identificado por `security_config.py`;
SQL remoto é uma operação separada, com prévia e recuperação.

## Voltar a uma versão

Para emergência somente no site, escolha no painel Cloudflare Pages o projeto
operacional, a implantação de **produção** comprovadamente boa e a opção de
rollback. Registre o deployment e commit escolhidos, execute somente com
alvo autorizado e confira os mesmos domínios e assets após a propagação.
Isso não restaura banco, Storage, Edge Functions nem agente instalado.

Para recuperação permanente do código, prepare um **novo commit** que reverta
apenas a mudança problemática em uma worktree da base atual. Revise migrações,
contratos entre tela e agente, e alterações posteriores antes de integrar.
Não substitua todo o frontend por uma tag antiga; não reescreva o histórico.

Para NewProd, uma versão anterior precisa ser recompilada com número **maior**
que o instalado, validada, distribuída e instalada. Download público e hash
não comprovam instalação ou impressão física. Banco e Storage exigem procedimentos próprios de backup e restauração,
com alvo autorizado e validação dos dados recuperados.

Referência do fornecedor: [rollback no Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).
