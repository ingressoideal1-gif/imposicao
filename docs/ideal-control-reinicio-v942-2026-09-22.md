# Reiniciar o celular — Ideal Control v942

## Pedido e autorização

O usuário informou PWA v834, solicitou não preservar eventos, autorizou perder leituras pendentes e determinou cadastrar novamente a senha pelo novo fluxo. Informou também que nenhum evento real ocorreu e que o aplicativo está em desenvolvimento. A autorização de concluir e publicar permanece no contexto desta entrega.

## Resultado

- A atualização normal permanece não destrutiva. No rodapé da casa, a ação separada **Apagar eventos e cadastrar nova senha** abre `reiniciar.html` dentro do mesmo PWA.
- A página exige contexto instalado e seleção explícita da opção de limpeza. Abrir o link em Safari/Chrome comuns apenas orienta usar o ícone; não limpa outro armazenamento por engano.
- Antes de apagar, busca a página atual com `cache: no-store` e confere o botão de QR. Falha de rede ou versão sem QR interrompe a operação.
- Alvo local: as lojas `carga`, `fila`, `entradas` e `totais` do IndexedDB `ideal-portaria`, limpas numa única transação. Em seguida remove as chaves `ideal_control_*`, `ideal_portaria_*`, `ideal_qr_*`, `acesso_navegador_id` e a sessão local do projeto Supabase usado pelo app. Inclui identificação da instalação e configuração do PIN.
- Remove apenas registros de service worker do escopo `/ic/` da mesma origem e caches `ideal-control-*`/`portaria-*`. Outros caches/chaves permanecem.
- Navega para a casa atual, onde a ausência da instalação exige cadastrar a nova senha de seis números. Não há escrita nem exclusão no servidor. Os aparelhos antigos do servidor não são apagados por esta operação local.
- Arquivos registrados também na lista do painel para futuras distribuições do agente; não houve build ou publicação de agente Windows.

## Validação e limites

`tests/reiniciar_celular_harness.cjs`: quatro cenários em Chrome/IndexedDB reais com rede sintética: cancelamento, indisponibilidade de rede, limpeza completa (incluindo PIN/sessão) e bloqueio no navegador não instalado. Todos aprovados. A limpeza preservou chaves e caches fora do escopo. 85 testes adicionais de QR/PIN, sintaxe e atualização comum aprovados antes da publicação.

A fase de IndexedDB é atômica. Falha nas etapas seguintes é mostrada e permite repetir; os dados já apagados não são recuperáveis. Outras telas do aplicativo devem estar fechadas. Teste automatizado não comprova execução no iPhone do usuário.

Para sair da v834: no ícone instalado, usar **Atualizar o aplicativo** com internet; na versão nova, tocar na ação de apagar eventos e cadastrar nova senha. Não é possível limpar remotamente o armazenamento privado do iPhone a partir do computador.

Publicado pelo commit `39a07f45`, tag `v942`. Cloudflare Pages confirmou sucesso no deployment `8ecd2697-eb69-429c-a55e-829c2c287f56`. Após propagação, 12/12 hashes normalizados conferiram nos dois domínios operacionais, incluindo a casa, a portaria, a página e o script de reinicialização, PIN e QR. Evidências em `evidencias/ideal-control-v942-public-verification.json`. Recuperação de código: reverter os arquivos desta entrega; dados locais que o usuário apagar não têm recuperação por esse processo.
