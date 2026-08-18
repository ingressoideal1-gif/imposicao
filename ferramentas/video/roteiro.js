/**
 * O roteiro do vídeo "Ideal Control — como usar".
 *
 * Só as PALAVRAS moram aqui. Quem dirige as telas é o `gravar.js`, e os dois se
 * encontram pelo `id` de cada cena: mudar uma frase não exige tocar em código de
 * navegador, e mudar o que a tela faz não exige reescrever o texto.
 *
 * `narracao` é o que a voz do Windows fala. `legenda` é o que aparece escrito.
 * São o mesmo texto por padrão — a legenda existe porque no WhatsApp o vídeo
 * toca MUDO, e quem assiste no ônibus lê em vez de ouvir. Quando os dois
 * precisam diferir (uma sigla que a voz erra, um texto longo demais para a
 * faixa), declare `legenda` à parte.
 *
 * ## O tom, decidido pelo usuário em 18/08/2026
 *
 * "Uma apresentação mais simples, sem tantos dados técnicos." Então: frases
 * curtas, nada de minuto, versão, formato ou nome de tela interna. O que o
 * cliente precisa é saber onde tocar e o que vai acontecer. O manual em slides
 * (`manual-ideal-control.html`) é que cobre o detalhe.
 *
 * Regra que vale para todo texto daqui: o vídeo circula por WhatsApp e vai
 * parar na mão de gente que não é cliente. Ele nunca explica COMO o código do
 * ingresso é formado, e nunca mostra dado de cliente de verdade — o evento, os
 * setores e os números são fictícios, montados pelo `gravar.js`.
 */
module.exports = [
    {
        id: '01-abertura',
        narracao: 'Ideal Control é o aplicativo que confere os ingressos na porta '
            + 'do seu evento. Em dois minutos, você vê como usar.',
    },
    {
        id: '02-instalar',
        narracao: 'A gráfica te manda um endereço. Abra no celular e toque em '
            + 'Instalar agora. O aplicativo ganha um ícone, como qualquer outro.',
    },
    {
        id: '03-entrar',
        narracao: 'Entre com o seu e-mail e a senha que a gráfica te passou. Na '
            + 'primeira vez, você escolhe a sua própria senha.',
    },
    {
        id: '04-pedidos',
        narracao: 'Aqui estão os seus pedidos, já impressos. Cada tipo de '
            + 'ingresso aparece com a quantidade.',
    },
    {
        id: '05-carregar',
        narracao: 'Toque em Carregar. Dê um nome ao evento, confira a data e o '
            + 'local, e pronto: o evento está criado.',
    },
    {
        id: '06-casa',
        narracao: 'O evento aparece na sua lista. É por aqui que você entra em '
            + 'tudo o que vem a seguir.',
    },
    {
        id: '07-configurar',
        narracao: 'Na engrenagem fica a configuração. Em Setores, você escolhe o '
            + 'nome que o porteiro vê na tela dele.',
    },
    {
        id: '08-uso',
        narracao: 'E escolhe se o ingresso vale uma entrada só, ou se a pessoa '
            + 'pode sair e voltar.',
    },
    {
        id: '09-aparelho',
        narracao: 'Agora, no celular da porta. Toque na barra do evento, digite a '
            + 'sua senha e dê um nome ao aparelho. Ele vira o leitor daquele portão.',
    },
    {
        id: '10-baixando',
        narracao: 'Ele baixa o evento inteiro. Depois disso funciona sem '
            + 'internet — espere terminar antes de ir para a porta.',
    },
    {
        id: '11-lendo',
        narracao: 'Na porta, é só apontar a câmera para o ingresso. Se o papel '
            + 'estiver ruim, dá para digitar o número.',
    },
    {
        id: '12-verde',
        narracao: 'Verde é pode entrar, com o setor e o número na tela.',
    },
    {
        // Era a tela laranja de "outra porta", e ela saiu: um portão nasce lendo
        // TODOS os setores do evento, então, no caminho que este vídeo grava,
        // ela só apareceria depois de o dono restringir os setores daquele
        // aparelho — três telas a mais, num vídeo que pediram simples. A recusa
        // que ficou é a que o cliente mais teme, e a mais fácil de mostrar: o
        // mesmo ingresso passando duas vezes.
        id: '13-ja-entrou',
        narracao: 'Se o mesmo ingresso tentar entrar de novo, ele é recusado — '
            + 'com a hora em que passou da primeira vez.',
    },
    {
        id: '14-vermelho',
        narracao: 'Vermelho é recusado, e sempre com o motivo escrito. Aqui, um '
            + 'lote que você mesmo bloqueou.',
    },
    {
        // A regra que o porteiro precisa ouvir do organizador, e não descobrir
        // na porta: não existe botão de "deixar entrar mesmo assim". Sem esta
        // cena, o vídeo ensina a ler o ingresso e cala sobre o momento em que
        // alguém vai insistir na frente da fila.
        id: '15-recusa',
        narracao: 'E recusa é recusa: não existe deixar entrar mesmo assim. Quem '
            + 'for recusado procura você.',
    },
    {
        id: '16-fecho',
        narracao: 'É isso. Configure com calma antes, e no dia a portaria precisa '
            + 'só do celular. Qualquer dúvida, fale com a gráfica.',
    },
];
