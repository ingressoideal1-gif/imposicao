# NewProd 1.3.27 — data/hora dos status

Base: tag `agente-v1.3.26`, preservando as correcoes ja publicadas do agente.

- Producao: horario do status abaixo da lista e dentro do seletor de cada modelo.
- Acabamento: horario na lista e nos controles dos modelos, usando o retorno confirmado do banco.
- Formato: `22/10 21:30h`, fuso America/Sao_Paulo. Sem inventar horario para historico ausente ou confirmacao local pendente.
- Assets do painel empacotado: 1320. O frontend web v1098 ja havia sido publicado separadamente.
- A migracao `data_hora_status_paineis.sql` foi executada pelo operador e conferida antes desta entrega; nao reaplicar.
- A consulta `piloto_lista.ts` passa a incluir `status_impressao_registrado_em`. A funcao `piloto-local` publicada v18 tinha seus 12 arquivos iguais a esta base; a v19 foi baixada e comparada depois da publicacao, preservando autenticacao e demais fontes.

Validacao: perfis Producao, Piloto e Oficial com 1140 testes Python aprovados por perfil (2 pulados), harnesses do frontend; 856 verificacoes de Acabamento; regressao de status/retorno e confirmacao pendente; 364 testes Deno aprovados com dependencias existentes em cache. O teste de lista confirma que o novo horario altera a revisao sincronizada.

A distribuicao usa o mesmo MSI nos aliases Oficial e Teste. O publicador verifica os dois downloads completos por SHA-256 e tamanho antes de ativar os tres manifestos. Evidencias locais ficam em `dist/status-hora` e `dist/publicacao-unica-1.3.27-*`. Publicacao nao comprova instalacao nas estacoes nem impressao fisica.
