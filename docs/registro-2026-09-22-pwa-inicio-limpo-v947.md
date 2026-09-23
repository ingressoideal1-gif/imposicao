# Ideal Control v947 — início limpo e histórico

Pedidos do usuário: remover resíduos/pedidos antigos da tela inicial; Meus Pedidos
passa a listar eventos encerrados/inativados; entrada de novos eventos somente
pelo QR. Preservada a autorização anterior de descartar dados de desenvolvimento,
recadastrar senha, executar e publicar.

## Causas e correções

- A lista inicial juntava automaticamente eventos da conta com vínculos locais
  e ainda executava migração do token antigo. Agora inclui somente eventos ativos
  carregados neste aparelho. A migração antiga deixou de ser chamada.
- `reiniciar.js` executa antes do arranque em `/ic/`, redirecionando para uma
  página isolada de limpeza se não houver a marca `qr-nuvem-947`.
- Limpeza única: stores carga/fila/entradas/totais do IndexedDB ideal-portaria;
  chaves locais/de sessão do PWA, PIN/instalação/vínculos e sessão Supabase salva;
  cache do PWA e fundo. Nenhuma escrita no servidor. Outras chaves e caches não
  pertencentes ao aplicativo permanecem.
- Confere disponibilidade da página antes de apagar; marca a geração só depois
  de concluir. Sem rede, informa a falha e permite tentar novamente. A geração
  é fixa e não deve ser incrementada nas próximas publicações.
- Meus Pedidos foi convertido em histórico, sem chamada a `/meus-pedidos`, sem
  exigir login e sem botão Conferir pedidos da gráfica. Reutiliza a lista de
  eventos encerrados/inativados, inclusive metadados locais disponíveis offline.
- Texto inicial orienta QR, cadastro da senha do celular e download dos ingressos.

## Validação

- Harness de reinício, 5 cenários: cancelar, offline sem perda, limpeza explícita,
  bloqueio manual no navegador, limpeza automática e preservação de novo evento
  ao reabrir. Todos aprovados.
- Lista, atualização e histórico: 60 testes cobertos; 57 aprovados na execução
  conjunta e 3 expectativas de texto antigo adaptadas e aprovadas em seguida.
- 19 testes direcionados de controle/menu/olho/campos aprovados durante o trabalho.
- Expectativas anteriores sobre exibir pedidos impressos/login em Meus Pedidos
  substituídas pelos testes do novo contrato solicitado, incluindo navegação,
  ausência de consulta à gráfica, histórico offline e fechamento da engrenagem.
- Sintaxe JS e diff check aprovados. Sem teste físico no iPhone.

## Publicação e recuperação

Publicar v947 e conferir hashes dos arquivos nos dois domínios. A limpeza ocorre
na instalação que abrir a nova versão; o navegador separado do PWA possui seus
próprios dados. Os dados locais apagados não são recuperáveis. Eventos e ingressos
no servidor permanecem disponíveis para carregar pelo QR. Voltar o frontend não
restaura os dados locais; não reaplicar a limpeza em releases futuros.
