# Recorte do conteudo na borda da celula

## Pedido e regra aprovada

Relato do pedido 21417: a Visualizacao do painel de producao limita as artes
corretamente, mas o PDF gerado e a impressao permitem sobreposicao entre poses.
O usuario confirmou o limite **exatamente na borda da celula**, igual a
Visualizacao, sem sangria externa, mesmo quando existe vao entre celulas.

## Correcao local

- `engine.py`: recorte PDF do grupo completo de cada celula, incluindo arte,
  elementos da numeracao e identificacao do modelo. O estado grafico do recorte
  termina antes da proxima celula. Vetores, texto, cores e transparencia sao
  preservados; o recorte nao rasteriza a folha.
- O limite e fixo na folha: nao cresce com a escala, tamanho original, vao ou
  deslocamentos da arte. As transformacoes e calculos de numeracao permanecem.
- Aplicado na frente, verso, caminhos de modelos individuais/combinados,
  montagem estrita e capas. Contracapas continuam vazias, como antes.
- `frontend/pedido.js`: somente comentario atualizado para refletir a regra
  do motor; a Visualizacao ja fazia o recorte.
- Os testes anteriores de sangria foram atualizados para a regra aprovada.

## Validacao

O teste novo reproduziu tinta fora da celula antes da correcao. Depois dela,
**106 testes passaram**, incluindo 46 cenarios novos de recorte. Foram usados
somente dados sinteticos e arquivos temporarios, sem impressao ou banco remoto.

Comando executado, a partir da raiz:

```powershell
.\venv\Scripts\python.exe -m pytest -n 0 -q tests/test_engine_recorte_celula.py tests/test_engine_sangria.py tests/test_escala_da_arte.py tests/test_engine_opacidade_arte.py tests/test_engine_refazer_strict_assembly.py tests/test_engine_output_intent.py tests/test_engine_capa_montagem.py
```

Verificados pixels fora das celulas e cores junto as bordas internas, frente e
verso, escalas, deslocamentos, giros de 0/90/180/270 graus, transparencia de
elementos PDF/SVG, poses vazias, capas e folha girada. As suites existentes
conferiram tambem fontes/CMYK, numeracao, selecao de folhas e blocos de montagem.
`node --check frontend/pedido.js` e `git diff --check` passaram.

## Preparacao da publicacao 1.2.325

Publicacao solicitada pelo usuario apos a validacao local. Base: `origin/main`
em `c5333580`, no worktree `../newprod-recorte-1325`, branch
`release/recorte-celulas-1.2.325`. As alteracoes locais de outros assuntos na
pasta original foram preservadas e nao entram neste pacote.

- Versao 1.2.325 nos tres arquivos de versao do agente; MSI ProductVersion
  confirmado como 1.2.325.0. A 1.2.324 estava reservada para a instalacao local
  anterior; o manifesto consultado antes desta entrega oferecia 1.2.323.
- PyInstaller e WiX existentes usados diretamente no worktree: os scripts
  gerais possuem caminhos fixos para a pasta original e efeitos mais amplos.
- MSI: `dist/NewProd_Setup_v1.2.325.msi`, 74.579.968 bytes.
- SHA-256: `d143dbd49303e1c2480b770a5973568da08f8a6739c42e31003ddb36c6f92246`.
- Codigo embutido de `engine`, `app`, `db`, `security_config` e `agent_version`
  comparado com a fonte da publicacao. Recorte, versao, modulo restrito do
  agente e DLLs de impressao confirmados no executavel.
- Pool e credencial do agente reutilizados pelo processo de empacotamento,
  sem exibir conteudo ou incluir no Git. Nenhum `.env` foi copiado ao worktree.
- 106 testes passaram novamente na copia limpa; 68 arquivos JavaScript tiveram
  sintaxe validada. Tres testes antigos de opacidade dependiam de
  `base_ticket.pdf`, ignorado pelo Git; agora geram a propria base sintetica
  em pasta temporaria. As assercoes de transparencia foram preservadas.

O envio usa o bucket de distribuicao existente `agent-releases`: MSI com nome
novo, download pela URL publica e conferencia de tamanho/SHA-256, seguidos do
manifesto `latest.json`. O pacote nao deve ser anexado a repositorios GitHub.

Os arquivos reais do pedido 21417 nao foram acessados. A verificacao fisica
desse pedido e a confirmacao de instalacao nas estacoes permanecem pendentes.

## Publicacao confirmada

- Correcao enviada a `main` em `c25ac31f`; check Cloudflare Pages concluido com
  `success` para esse commit.
- MSI 1.2.325 enviado ao bucket existente, sem sobrescrever outro instalador.
  A primeira tentativa de envio falhou na conexao; a seguinte foi concluida.
- Arquivo baixado novamente pela URL publica sem query: tamanho e SHA-256
  identicos aos do pacote local registrados acima.
- Somente depois dessa conferencia, `latest.json` foi atualizado. A leitura
  publica usando o mesmo mecanismo sem cache do agente confirmou versao,
  URL, SHA-256, tamanho e notas do NewProd 1.2.325.
- Nao houve deploy manual de Edge Functions, migracao de banco ou impressao.
  A instalacao em cada estacao segue o atualizador existente; publicar o
  manifesto nao comprova que todas as estacoes ja instalaram o pacote.

Para recuperar o comportamento anterior, usar o codigo anterior com uma
versao superior, conforme `GUIA_AGENTE.md`. Reapontar para 1.2.323 nao provoca
downgrade automatico nas estacoes que ja receberam 1.2.325.
