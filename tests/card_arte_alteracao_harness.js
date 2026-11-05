// Entrada sem dependencias para a rotina de entrega segura.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, [path.join(__dirname, 'card_arte_alteracao.mjs'), '--frontend'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
