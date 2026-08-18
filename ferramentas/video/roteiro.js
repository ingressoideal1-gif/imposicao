/**
 * O roteiro do vídeo "Ideal Control — como usar".
 *
 * Só as PALAVRAS moram aqui. Quem dirige as telas é o `gravar.js`, e os dois se
 * encontram pelo `id` de cada cena: mudar uma frase não exige tocar em código de
 * navegador, e mudar o que a tela faz não exige reescrever o texto.
 *
 * `narracao` é o que a voz do Windows fala. `legenda` é o que aparece escrito.
 * São o mesmo texto por padrão — a legenda existe porque no WhatsApp o vídeo
 * toca MUDO, e quem assiste no ônibus lê em vez de ouvir.
 *
 * ## Como se escreve para ser FALADO, e não lido
 *
 * O usuário ouviu o primeiro corte e disse duas coisas: encurtar, e que a
 * narração soava artificial. Metade disso era a voz, trocada no `montar.ps1`
 * pela moderna do Windows. A outra metade é o texto, e as regras que ficaram:
 *
 *   frase curta, uma ideia por frase — a voz sintética se perde em oração
 *   subordinada, e quem está aprendendo a mexer no aplicativo também;
 *   nada de travessão, parêntese ou reticência, que viram pausa torta;
 *   ordem direta: quem faz, o que faz, o que acontece;
 *   o verbo na frente, no que é instrução: "toque", "entre", "aponte";
 *   nenhuma palavra que ninguém diria em voz alta num balcão.
 *
 * A duração de cada cena é a da NARRAÇÃO ou a da imagem, o que for maior.
 * Cortar texto aqui só encurta o vídeo se a cena gravada encolher junto — as
 * esperas moram no `gravar.js`, e as duas coisas andam de mãos dadas.
 *
 * Regra que vale para todo texto daqui: o vídeo circula por WhatsApp e vai
 * parar na mão de gente que não é cliente. Ele nunca explica COMO o código do
 * ingresso é formado, e nunca mostra dado de cliente de verdade — o evento, os
 * setores e os números são fictícios, montados pelo `gravar.js`.
 */
module.exports = [
    {
        id: '01-abertura',
        narracao: 'Ideal Control confere os ingressos na porta do seu evento.',
    },
    {
        id: '02-instalar',
        narracao: 'A gráfica manda um endereço. Abra no celular e toque em '
            + 'Instalar agora.',
    },
    {
        id: '03-icone',
        narracao: 'O aplicativo ganha um ícone na tela inicial. É por ele que '
            + 'você entra. No iPhone, use Compartilhar, e Adicionar à Tela de Início.',
    },
    {
        id: '04-entrar',
        narracao: 'Entre com o seu e-mail e a senha que a gráfica passou.',
    },
    {
        id: '05-pedidos',
        narracao: 'Estes são os seus pedidos, já impressos.',
    },
    {
        id: '06-carregar',
        narracao: 'Toque em Carregar e dê um nome ao evento. Pronto. O evento '
            + 'está criado.',
    },
    {
        id: '07-configurar',
        narracao: 'Na engrenagem ficam os setores. Aqui você escolhe o nome que '
            + 'o porteiro vê na tela.',
    },
    {
        id: '08-aparelho',
        narracao: 'Agora o celular da porta. Toque na barra do evento, digite a '
            + 'sua senha e dê um nome ao aparelho.',
    },
    {
        id: '09-baixando',
        narracao: 'Ele baixa o evento. A partir daqui, funciona sem internet.',
    },
    {
        id: '10-lendo',
        narracao: 'Na porta, aponte a câmera para o ingresso.',
    },
    {
        id: '11-verde',
        narracao: 'Verde é pode entrar.',
    },
    {
        id: '12-ja-entrou',
        narracao: 'Se o mesmo ingresso voltar, ele é recusado. A tela mostra a '
            + 'hora em que ele passou.',
    },
    {
        // A regra que o porteiro precisa ouvir do organizador, e não descobrir
        // na porta: não existe botão de "deixar entrar mesmo assim". Ela tinha
        // uma cena só dela e agora fecha esta, para o vídeo caber em dois
        // minutos sem perder o recado.
        id: '13-vermelho',
        narracao: 'Vermelho é recusado, sempre com o motivo escrito. E recusa é '
            + 'recusa. Não existe liberar mesmo assim.',
    },
    {
        id: '14-fecho',
        narracao: 'Configure antes. No dia, a portaria precisa só do celular.',
    },
];
