# NewProd 1.4.0 — 24/10/2026

Fonte baseada no agente publicado 1.3.35 (5c94024e), preservando as correcoes
anteriores. O painel web usa uma mudanca minima separada sobre origin/main,
no PR 201, sem substituir o frontend atual pelo frontend do agente.

## Mudancas

- Reutiliza MSI existente quando tamanho e SHA-256 conferem.
- Espera seis horas depois de falhas transitorias da mesma versao; preserva
  o bloqueio de erros fatais do instalador e a repeticao explicita do operador.
- Publicador exige canal: teste altera somente seu manifesto; producao altera
  oficial/latest. Confere o download publico antes de ativar os manifestos.
- Clientes enviam a versao ao piloto-local. A politica NEWPROD_VERSAO_MINIMA
  impede iniciar novos trabalhos com clientes antigos quando ativada.
- Painel verifica a versao antes de novas operacoes locais. Atualizacao,
  diagnostico e conclusao permanecem disponiveis. Usa acesso-estacao.js,
  arquivo que os agentes antigos ja sincronizam.

O bloqueio nao revoga um executavel antigo totalmente offline que ainda nao
recebeu o painel atualizado. Nao interrompe requisicoes ja em andamento.

## Validacao

1187 testes Python, dois subtestes e dois testes ignorados em cada um dos tres
perfis (producao, piloto e oficial), incluindo os harnesses de navegador.
373 testes Deno aprovados. Harness especifico da barreira e entrega-segura
verificar do painel aprovados. Auditoria do executavel e MSI sem arquivos
privados ou modulo de segredo aprovada.

MSI: NewProdPiloto_Oficial_v1.4.0.msi; ProductVersion 1.4.0;
196796416 bytes; SHA-256
1c70b2824e34a6d316e38e642da2a87cdc07dee87109eae511469daa3024b7ce.

Evidencia automatizada: newprod-1400-validacao.json. Instalacao local,
disponibilidade publica, ativacao da politica e adocao pelas estacoes devem
ser registradas separadamente. Nenhuma impressao fisica integra esta prova.
