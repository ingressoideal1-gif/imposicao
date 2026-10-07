# verso_tipo ausente ou desconhecido: Só frente

Pedido: não bloquear por `verso_tipo` nulo ou fora dos valores reconhecidos;
considerar esses casos como Só frente.

Implementação local na branch `fix/verso-tipo-fallback-20261007`, em worktree
isolada baseada em `541014513fc303071a754df93b8742b6f5abf74e`. O checkout
operacional e suas alterações preexistentes foram preservados.

## Comportamento

`VersoDoModelo.normalizar` passa a devolver `SÓ FRENTE` para null, undefined,
vazio, espaços e valores não reconhecidos. As grafias legadas já reconhecidas
continuam sendo convertidas para as categorias correspondentes.

O seletor deixa de desabilitar todas as opções nesses casos: permite front,
com validade de formulário normal. A conferência do modelo no Vibe e a
conferência dos vínculos da numeração aceitam front para esse valor padrão.
A validação dos campos obrigatórios não exige mais Frente/verso, pois há
um padrão definido mesmo quando a numeração legada não possui print_mode.

Sem numeração técnica disponível, o modo assume front, inclusive quando
booleanos auxiliares antigos dizem que há verso. Quando existe print_mode
válido na numeração vinculada, ele continua determinando o modo técnico.
A compatibilidade comercial segue a mesma regra de SÓ FRENTE: front é aceito;
uma numeração com verso continua apontando incompatibilidade. Modo técnico
desconhecido, mudança real de categoria/vínculo, falha de rede e modelo
incompleto continuam sendo recusados pelos respectivos controles.

O campo original do pedido não é modificado nem regravado por essa conversão.
Nos avisos, o texto passa a mostrar a categoria normalizada, evitando exibir
null ou um texto desconhecido como se fosse uma categoria reconhecida.

## Alterações

- `frontend/cor-numeracao-do-modelo.js`: padrão de normalização e remoção da
  exigência de preencher o tipo comercial ausente.
- `frontend/script.js`: ausência de verso_tipo não é campo obrigatório;
  aviso de incompatibilidade mostra a categoria normalizada.
- Harnesses de compatibilidade, campo obrigatório e cartão de arte cobrem
  o padrão novo e preservação do valor original.

## Validação funcional

Antes da correção, a nova regressão falhou porque null era normalizado para
null em vez de SÓ FRENTE. Depois da correção passaram:

- `modo_compativel_vibe_harness.js`: modos conhecidos e valores sem tipo,
  formulário em navegador real, conferências de trabalho e numeração,
  mudanças concorrentes, falha de rede e vínculos paginados simulados.
- `faixa_modelo_ausente_harness.js`: null/desconhecido não bloqueiam como
  campo obrigatório; demais campos, faixas, TICKET e validações permanecem.
- `aviso_arte_vibe_harness.js`: cartão real não avisa incompatibilidade para
  valor padrão com front; não altera o dado e rotula corretamente conflitos.
- `verso_tipo_canonico_harness.js`: cinco modos, compatibilidade legada e
  persistência simulada sem reescrever a categoria do pedido.
- `cliente_verso_atual_harness.js`: portal e resolução de verso preservados.
- `node --check` dos dois arquivos de produção e revisão de whitespace.

Todos os dados desses testes são sintéticos e os acessos comerciais são
simulados. Nenhuma atualização de banco, impressão física, publicação ou
instalação de estação integra esta correção local.

## Conferência dos canais e pacote local

`ferramentas/conferir_duas_versoes.py` concluiu com código de saída zero.
Em cada canal, Produção e Piloto, passaram 451 testes Python, dois subtestes
e os 15 harnesses JavaScript previstos pelo conferidor. Houve dois testes
ignorados pela ausência de `qr_ideal_pool.bin` e um aviso de depreciação
do httpx usado pelo TestClient, em cada canal.

O pacote local foi regenerado por `ferramentas/compilar-piloto.ps1` e passou
na inspeção pública, sem arquivos privados ou módulo de segredo.
Artefato: `dist/piloto-verso-fallback/NewProdPiloto.exe`, 142727745 bytes.
SHA-256: `a5ec01c1925dec768dc59b144eb8ee94ba97ad30ba22633ae318ce2b1b6b88ed`.

Os dois arquivos frontend alterados foram extraídos do executável para
comparação em memória e são idênticos às fontes corrigidas deste worktree.
O manifesto registra o commit base; a correção está no diff local ainda
não commitado. As evidências dessa comparação estão em
`dist/validacao-verso-fallback/pacote-conferido.json`; os logs do conferidor
e da compilação estão no mesmo diretório.

O pacote não foi instalado nem publicado. O checkout operacional e as
alterações preexistentes foram preservados.
