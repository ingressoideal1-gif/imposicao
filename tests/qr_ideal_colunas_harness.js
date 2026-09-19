// Ponte entre o Pester e a regra de coluna do QR Ideal, que e JavaScript de
// navegador. Recebe o comando e os argumentos pela linha de comando e imprime
// o resultado, para o teste comparar.
//
//   node qr_ideal_colunas_harness.js coluna 20272 1000022      -> 50
//   node qr_ideal_colunas_harness.js conferir 20272 1000022,1000122 -> [{...}]

const path = require('path');
const modulo = require(path.join(__dirname, '..', 'frontend', 'qr-ideal-colunas.js'));

const comando = process.argv[2];
const pedido = process.argv[3];
const arg = process.argv[4];

// O entrega-segura executa harnesses JS alterados diretamente para detectar
// falhas de carga. Sem comando, carregar o modulo com sucesso ja e o teste.
if (!comando) {
    process.exitCode = 0;
} else if (comando === 'coluna') {
    process.stdout.write(String(modulo.colunaQrIdeal(pedido, arg)));
} else {
    if (comando === 'classificar') {
        // Base64 evita que o cmd.exe/PowerShell remova as aspas do JSON no
        // Windows antes de o argumento chegar ao Node.
        const entrada = JSON.parse(Buffer.from(process.argv[3], 'base64').toString('utf8'));
        process.stdout.write(JSON.stringify(modulo.classificarModelosQrIdeal(
            entrada.modelos, entrada.numeracoes
        )));
    } else {
        process.stdout.write(JSON.stringify(modulo.conferirColunasQrIdeal(pedido, arg.split(','))));
    }
}
