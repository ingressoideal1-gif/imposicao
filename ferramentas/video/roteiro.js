/**
 * O roteiro do vídeo "Ideal Control — como instalar e usar".
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
 * Regra que vale para todo texto daqui: o vídeo circula por WhatsApp e vai
 * parar na mão de gente que não é cliente. Ele nunca explica COMO o código do
 * ingresso é formado, e nunca mostra dado de cliente de verdade — o evento, os
 * setores e os números são fictícios, montados pelo `gravar.js`.
 */
module.exports = [
    {
        id: '01-abertura',
        narracao: 'Ideal Control é o aplicativo que lê os ingressos na porta do '
            + 'seu evento. Em dois minutos você vê como instalar e como usar.',
    },
    {
        id: '02-qr-chega',
        narracao: 'Tudo começa com um QR que a gráfica envia, quase sempre por '
            + 'WhatsApp. Aponte a câmera do celular para ele.',
    },
    {
        id: '03-setores',
        narracao: 'A tela abre com os setores do seu pedido e a quantidade de '
            + 'cada um. Confira se é isso mesmo antes de seguir.',
    },
    {
        id: '04-entrar',
        narracao: 'Entre com o mesmo e-mail e a mesma senha que você já usa para '
            + 'acompanhar os seus pedidos. Não existe cadastro separado aqui.',
    },
    {
        id: '05-cadastrar',
        narracao: 'Dê um nome ao evento e toque em Cadastrar. Se a pista veio num '
            + 'pedido e o camarote noutro, escolha o evento que já existe: os '
            + 'dois ficam juntos.',
    },
    {
        id: '06-instalar-android',
        narracao: 'Agora instale o aplicativo. Toque em Instalar aplicativo e '
            + 'confirme: o Ideal Control ganha um ícone na tela do celular.',
    },
    {
        id: '07-instalar-iphone',
        narracao: 'No iPhone o caminho é outro. Toque em Compartilhar, e depois '
            + 'em Adicionar à Tela de Início.',
    },
    {
        id: '08-por-que-instalar',
        narracao: 'Vale instalar. Pelo ícone o aplicativo abre sem a barra do '
            + 'navegador, e o celular para de apagar o que ele guardou entre um '
            + 'evento e outro.',
    },
    {
        id: '09-evento-aberto',
        narracao: 'Aberto o aplicativo, o seu evento está aqui: os dados, os '
            + 'setores e os aparelhos da portaria.',
    },
    {
        id: '10-destravar',
        narracao: 'Para alterar qualquer coisa, toque em Digitar a Senha '
            + 'Cadastrada. É a mesma senha com que você entrou.',
    },
    {
        id: '11-setor-configurar',
        narracao: 'Em cada setor, toque em Configurar. Aqui você escolhe o nome '
            + 'que o porteiro vê na tela dele.',
    },
    {
        id: '12-setor-horario',
        narracao: 'Marque o horário em que o setor vale. Deixando em branco, ele '
            + 'já está valendo — é o caso da festa de uma noite só.',
    },
    {
        id: '13-setor-uso',
        narracao: 'Escolha o uso do ingresso: entrada única, ou sair e voltar.',
    },
    {
        id: '14-bloqueio',
        narracao: 'Precisou suspender um lote? Bloqueie a faixa de números e '
            + 'escreva o motivo. É o que o porteiro vai ler na tela.',
    },
    {
        id: '15-aparelho-criar',
        narracao: 'Crie um aparelho para cada portão e toque nos setores que ele '
            + 'valida. Cada aparelho lê só os setores dele.',
    },
    {
        id: '16-codigo',
        narracao: 'O aplicativo mostra um código de seis caracteres. Anote agora: '
            + 'ele não aparece de novo.',
    },
    {
        id: '17-parear',
        narracao: 'No celular do porteiro, abra o Ideal Control, digite esse '
            + 'código e toque em Ligar.',
    },
    {
        id: '18-baixando',
        narracao: 'O aparelho baixa o evento inteiro. Depois disso ele funciona '
            + 'sem internet — espere terminar antes de ir para o portão.',
    },
    {
        id: '19-lendo',
        narracao: 'Na porta, é só apontar a câmera para o ingresso. Se ele '
            + 'estiver rasgado, ou a câmera não pegar o código, toque em Digitar '
            + 'o número: as regras são exatamente as mesmas.',
    },
    {
        id: '20-verde',
        narracao: 'Verde é pode entrar, com o setor e o número do ingresso.',
    },
    {
        id: '21-laranja',
        narracao: 'Laranja é ingresso bom, mas de outro portão. Não é falso: é só '
            + 'a porta errada.',
    },
    {
        id: '22-vermelho',
        narracao: 'Vermelho é recusado. Quando é bloqueio, o motivo aparece em '
            + 'letra grande, para o porteiro ler em voz alta.',
    },
    {
        // A regra que o porteiro precisa ouvir do organizador, e não descobrir
        // na porta: não existe botão de "deixar entrar mesmo assim". Sem esta
        // cena, o vídeo ensina a ler o ingresso e cala sobre o momento em que
        // alguém vai insistir na frente da fila.
        id: '23-recusa',
        narracao: 'E recusa é recusa: não existe deixar entrar mesmo assim. '
            + 'Quem for recusado procura o organizador do evento.',
    },
    {
        id: '24-fecho',
        narracao: 'É isso. Configure com calma antes do evento, e no dia a '
            + 'portaria precisa só do celular. Qualquer dúvida, fale com a gráfica.',
    },
];
