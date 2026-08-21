# Arte vinculada ao Canva — exploração de 21/08/2026

> **Não é decisão nem plano.** O usuário pediu ideias ("apenas especulando, não
> executar, seja criativo") sobre trazer para a camada da arte uma URL de arte
> editada no Canva, que continuasse sendo editada lá e atualizasse a nossa
> janela combinada. Este arquivo guarda o que foi apurado e sugerido, para não
> se perder. Nada disto foi implementado.

## O que já existe do nosso lado

A camada da arte guarda o arquivo como **URL** (`arte_url`, montado em
`frontend/script.js`, lido em ~28 lugares — ver o cabeçalho de
`frontend/arte-de-impressao.js`). A janela combinada (`amostra-modal.js`) e o
motor (`engine.py`, `_colar_arte_pdf`) só consomem isso. Uma arte do Canva não
pede encanamento novo: pede um **resolvedor** que mantenha o `arte_url`
apontando para um PDF do Canva já baixado no bucket `artes`. Do resolvedor para
a frente, nada muda.

## O que o Canva permite (conferido na documentação oficial)

| Caminho | Exige | Custo |
|---|---|---|
| **Connect API na conta da gráfica** (a gráfica desenha no Canva) | criar a integração no Developer Portal + MFA na conta | API **de graça** |
| **Integração pública** (o cliente conecta a conta *dele*) | **revisão do Canva**, justificando cada permissão (scope) | de graça, mas leva tempo e pode ser recusada |
| **Integração privada / app só do time** (sem revisão) | **Canva Enterprise** | mínimo ~25 assentos, ~US$ 25–30 por usuário/mês — fora de cogitação para uma gráfica |

Fontes: canva.dev/docs/connect (creating-integrations, submission-checklist,
exports), canva.dev/docs/apps (managing-team-apps), canva.com/help/canva-api.

Duas descobertas que mexem no desenho:

- **A exportação por API não tem sangria nem marca de corte.** O PDF pela API
  aceita só qualidade (regular/pro), tamanho de papel (A4/A3/Carta/Ofício) e
  páginas. Sangria e marcas só existem no botão de download manual. Isso torna
  **obrigatório** o gabarito: o design precisa nascer no tamanho da célula com a
  sangria embutida, senão o PDF que chega é imprestável para corte.
- **Exportação "pro" falha se o design tiver elemento premium não pago** — a
  conta que exporta precisa ser Pro.

Limites de uso não são problema: 5.000 exportações/dia por integração, 750 por
5 minutos.

## Preços (fontes secundárias de 2026 — confirmar em canva.com/pt_br/precos)

- **Canva Pro** (1 pessoa): ~R$ 34,90/mês ou ~R$ 322,80/ano.
- **Canva Equipes**: fontes divergem (de ~R$ 470/ano para até 5 pessoas, preço
  regional, a US$ 25/pessoa/mês no preço global). Olhar logado.
- **Enterprise**: sob consulta, 25+ assentos.

## Regras que valeriam antes de qualquer linha

1. **Sempre PDF de impressão, nunca PNG.** O PDF do Canva mantém vetor e o
   `show_pdf_page` cola vetor. Puxar PNG seria rasterizar a arte — fora de
   cogitação neste projeto. Avisar que sombra/brilho o Canva já achata em
   imagem dentro do PDF, e que elemento premium não pago sai com marca d'água.
2. **Nunca trocar a arte sozinho.** O sync detecta e oferece; quem troca é o
   operador. Modelo já imposto ou impresso congela a revisão que foi ao papel.
3. **Tudo baixado e regravado no nosso bucket.** As URLs de download do Canva
   expiram em minutos; nunca linkar direto.
4. **Token OAuth em segredo do Supabase**, nunca no navegador.

## As ideias (além do pedido)

1. **Semáforo de importação** — cada revisão medida contra a célula: tamanho,
   sangria, dpi das imagens, fontes embutidas, páginas, marca d'água, RGB×CMYK.
   Vermelho diz o que corrigir *no Canva* (trava com saída).
2. **Gabarito de ida** — botão "Criar no Canva" que cria o design no tamanho da
   célula, com margem de segurança e a **área da numeração marcada**.
3. **Diferença visual entre revisões** — miniatura velha × nova, áreas alteradas
   destacadas (rasterização só de tela; o vetor não é tocado).
4. **Guarda do QR** — revisão que põe fundo escuro debaixo do QR Ideal é
   bloqueada.
5. **Cache no agente, sync no painel** — o PDF resolvido desce à estação por
   hash; a imposição nunca busca rede.
6. **Fechar o ciclo com o cliente** — no link do cliente: editar no Canva →
   enviar para aprovação → cai na Fila de Arte como revisão nova.
7. **Não amarrar ao Canva** — modelar como *Arte Vinculada* com provedor
   (`canva`, `drive`, `url`, `figma`, `arquivo`).
8. **Revisões como pontos de restauração** — "voltar para a revisão impressa
   em 12/08".
9. **Robô do relógio** — Edge Function agendada bate o `updated_at` dos designs
   e acende "arte alterada no Canva" no card do pedido.

## Se fosse para começar

**Canva Pro na conta da gráfica + Connect API de graça** cobre o cenário "a
gráfica desenha e o cliente acompanha". Antes disso, o caminho **C** — guardar
só o link de edição no modelo, com botão "Abrir no Canva" e selo "arte
vinculada" — entrega metade da dor por uma tarde de trabalho, sem depender de
ninguém. Cliente conectando a conta dele é a revisão pública, projeto à parte.

Um teste de R$ 0 e uma hora responde o que a documentação não fecha: criar a
integração no Developer Portal e rodar o OAuth com a conta da gráfica — se
autenticar e exportar um PDF antes de qualquer revisão, o caminho A está
confirmado.

A pergunta em aberto, que decide entre puxar e empurrar: **as artes do Canva
são feitas pela gráfica, na conta dela, ou pelos clientes, nas contas deles?**
