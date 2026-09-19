/** Analise offline de metadados. Nao conecta ao Supabase nem aplica SQL. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SECOES = ['papeis', 'schemas', 'relacoes', 'politicas', 'acessos',
    'acl_tabelas', 'acl_colunas', 'funcoes', 'privilegios_padrao', 'gatilhos',
    'dependencias_views', 'herancas', 'publicacoes', 'publicacao_tabelas', 'colunas', 'constraints', 'indices'];
const PAPEIS = ['anon', 'authenticated', 'service_role'];
const FLAGS_ACESSO = ['schema_usage', 'selecionar', 'selecionar_coluna', 'inserir',
    'inserir_coluna', 'atualizar', 'atualizar_coluna', 'excluir', 'truncar',
    'referenciar', 'criar_trigger', 'ignora_rls'];
const comandos = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
const grants = { r: ['selecionar', 'selecionar_coluna'], a: ['inserir', 'inserir_coluna'],
    w: ['atualizar', 'atualizar_coluna'], d: ['excluir'] };
const chave = (schema, nome) => JSON.stringify([schema, nome]);
const texto = (v) => typeof v === 'string' && v.length > 0;
const literalTrue = (v) => typeof v === 'string' && /^\(*true\)*$/i.test(v.replace(/\s+/g, ''));
const garantir = (ok, motivo) => { if (!ok) throw new Error(motivo); };

export function extrairSnapshot(valor) {
    // SQL Editor / Management API: uma linha, uma coluna JSON.
    if (Array.isArray(valor)) {
        garantir(valor.length === 1, 'Esperada exatamente uma linha de metadados.');
        valor = valor[0];
    }
    if (valor && Object.hasOwn(valor, 'auditoria_rls')) valor = valor.auditoria_rls;
    if (typeof valor === 'string') valor = JSON.parse(valor);
    return valor;
}

export function validarSnapshot(s, projeto, ambiente) {
    garantir(texto(projeto) && texto(ambiente), 'Informe projeto e ambiente esperados.');
    garantir(s?.formato === 'imposition-rls-v1', 'Formato de metadados invalido.');
    garantir(s.contexto?.projeto === projeto && s.contexto?.ambiente === ambiente,
        'Projeto ou ambiente diferente do esperado.');
    garantir(!/PREENCHER/i.test(projeto + ambiente), 'Preencha os rotulos da coleta.');
    garantir(s.contexto.read_only === true, 'Coleta sem comprovacao de transacao read only.');
    garantir(Number.isInteger(s.contexto.server_version_num) && s.contexto.server_version_num >= 140000,
        'Versao PostgreSQL ausente ou fora da faixa revisada (14+).');
    garantir(texto(s.contexto.coletado_em) && Number.isFinite(Date.parse(s.contexto.coletado_em)),
        'Data da coleta ausente ou invalida.');
    for (const nome of SECOES) garantir(Array.isArray(s[nome]), `Secao obrigatoria ausente: ${nome}.`);
    for (const papel of PAPEIS) {
        const rows = s.papeis.filter(p => p.nome === papel);
        garantir(rows.length === 1 && ['superuser', 'bypassrls', 'herda'].every(k => typeof rows[0][k] === 'boolean'),
            `Papel ausente, ambiguo ou incompleto: ${papel}.`);
    }
    garantir(s.relacoes.length > 0, 'Inventario sem relacoes.');
    const relacoes = new Set();
    for (const r of s.relacoes) {
        const k = chave(r.schema, r.nome);
        garantir(texto(r.schema) && texto(r.nome) && texto(r.dono) &&
            ['r', 'p', 'v', 'm', 'f'].includes(r.tipo) &&
            ['rls', 'force_rls', 'security_invoker'].every(f => typeof r[f] === 'boolean') &&
            !relacoes.has(k), 'Relacao invalida ou duplicada.');
        relacoes.add(k);
        for (const papel of PAPEIS) {
            const acessos = s.acessos.filter(a => a.schema === r.schema && a.tabela === r.nome && a.papel === papel);
            garantir(acessos.length === 1 && FLAGS_ACESSO.every(f => typeof acessos[0][f] === 'boolean'),
                'Matriz de privilegios incompleta ou duplicada.');
        }
    }
    for (const a of s.acessos) garantir(relacoes.has(chave(a.schema, a.tabela)) && PAPEIS.includes(a.papel),
        'Acesso referencia relacao ou papel desconhecido.');
    for (const p of s.politicas) garantir(relacoes.has(chave(p.schema, p.tabela)) && texto(p.nome) &&
        ['*', 'r', 'a', 'w', 'd'].includes(p.comando) && typeof p.permissiva === 'boolean' &&
        Array.isArray(p.papeis) && p.papeis.length > 0 && p.papeis.every(texto) &&
        Array.isArray(p.papeis_efetivos) && p.papeis_efetivos.every(r => PAPEIS.includes(r)) &&
        (p.usando === null || typeof p.usando === 'string') &&
        (p.verificando === null || typeof p.verificando === 'string'), 'Policy incompleta ou invalida.');
    for (const f of s.funcoes) {
        garantir(texto(f.schema) && texto(f.nome) && typeof f.argumentos === 'string' &&
            typeof f.security_definer === 'boolean' &&
            (f.search_path === null || typeof f.search_path === 'string') && Array.isArray(f.acessos),
            'Metadados de funcao incompletos.');
        for (const papel of PAPEIS) {
            const a = f.acessos.filter(a => a.papel === papel);
            garantir(a.length === 1 && typeof a[0].executar === 'boolean' && typeof a[0].schema_usage === 'boolean',
                'Privilegios de funcao incompletos.');
        }
    }
}

export function analisarSnapshot(entrada, { projeto, ambiente }) {
    const s = extrairSnapshot(entrada);
    validarSnapshot(s, projeto, ambiente);
    const achados = [];
    const adicionar = (codigo, objeto, papel, detalhe) => achados.push({ codigo, objeto, papel, detalhe });
    for (const r of s.relacoes) {
        const objeto = `${r.schema}.${r.nome}`;
        const policies = s.politicas.filter(p => p.schema === r.schema && p.tabela === r.nome);
        for (const a of s.acessos.filter(a => a.schema === r.schema && a.tabela === r.nome && a.papel !== 'service_role')) {
            if (!a.schema_usage) continue;
            const operacoes = Object.entries(grants).filter(([, campos]) => campos.some(c => a[c]));
            if (a.truncar || a.criar_trigger || a.referenciar) adicionar('PRIVILEGIOS_EXCEDENTES', objeto, a.papel,
                'TRUNCATE/TRIGGER/REFERENCES requer revisao; isto nao afirma alcance via REST.');
            if (!operacoes.length) continue;
            if (['v', 'm', 'f'].includes(r.tipo)) {
                if (r.tipo !== 'v' || !r.security_invoker) adicionar('RELACAO_SEM_RLS_DO_CHAMADOR', objeto, a.papel,
                    'Revisar projecao e dependencias da view/materialized view/foreign table.');
                continue;
            }
            if (!r.rls || a.ignora_rls) {
                adicionar(!r.rls ? 'RLS_DESLIGADA_COM_GRANT' : 'BYPASS_RLS', objeto, a.papel,
                    'Privilegios efetivos sem filtro RLS; conferir exposicao da API e contrato.');
                continue;
            }
            for (const [cmd] of operacoes) {
                const aplicaveis = policies.filter(p => (p.comando === '*' || p.comando === cmd) && p.papeis_efetivos.includes(a.papel));
                const permissivas = aplicaveis.filter(p => p.permissiva);
                if (!permissivas.length) {
                    adicionar('OPERACAO_SEM_POLICY_PERMISSIVA', objeto, a.papel,
                        `${comandos[cmd]} bloqueado por RLS; confirmar consumidores antes de alterar.`);
                    continue;
                }
                // INSERT depende de WITH CHECK; UPDATE depende de ambos.
                const ampla = permissivas.some(p => {
                    const usando = p.usando === null || literalTrue(p.usando);
                    const check = p.verificando === null ? usando : literalTrue(p.verificando);
                    return cmd === 'a' ? check : cmd === 'w' ? usando && check : usando;
                });
                if (ampla) adicionar(aplicaveis.some(p => !p.permissiva) ? 'POLICY_AMPLA_COM_RESTRITIVA' : 'POLICY_AMPLA',
                    objeto, a.papel, `${comandos[cmd]} tem policy permissiva ampla; leitura publica pode ser intencional. Revisar conjunto e colunas.`);
                // UPDATE/DELETE ainda dependem das condicoes de SELECT aplicaveis.
            }
        }
    }
    for (const f of s.funcoes.filter(f => f.security_definer)) {
        for (const a of f.acessos.filter(a => a.papel !== 'service_role' && a.executar && a.schema_usage)) {
            adicionar('DEFINER_EXECUTAVEL', `${f.schema}.${f.nome}(${f.argumentos})`, a.papel,
                f.search_path === null ? 'Funcao privilegiada sem search_path fixo; revisar corpo, dono e contrato.' :
                    'Revisar autorizacao no corpo, dono e schemas gravaveis. Search_path fixo sozinho nao comprova seguranca.');
        }
    }
    // Nao repetir expressoes de policies, ACLs ou corpo do snapshot no relatorio.
    return {
        formato: 'imposition-rls-relatorio-v1', projeto, ambiente,
        coletado_em: s.contexto.coletado_em, pronto_para_revogar: false,
        contagem: { relacoes: s.relacoes.length, politicas: s.politicas.length, funcoes: s.funcoes.length, achados: achados.length },
        pendencias: ['Confirmar identidade da conexao e schemas efetivamente expostos na Data API.',
            'Revisar os achados e as expressoes completas em ambiente restrito; nao ha avaliacao simbolica de SQL.',
            'Conferir buckets, Edge Functions publicadas, contratos e versoes dos consumidores.',
            'Testar acesso permitido/negado e efeitos dos triggers com dados sinteticos antes da restricao.'],
        achados,
    };
}

function main() {
    const args = process.argv.slice(2);
    const opcoes = {};
    garantir(args.length % 2 === 0, 'Use pares --entrada, --projeto, --ambiente, --saida.');
    for (let i = 0; i < args.length; i += 2) {
        garantir(['--entrada', '--projeto', '--ambiente', '--saida'].includes(args[i]) && !Object.hasOwn(opcoes, args[i]),
            'Opcao desconhecida ou duplicada.');
        opcoes[args[i]] = args[i + 1];
    }
    garantir(['--entrada', '--projeto', '--ambiente', '--saida'].every(k => texto(opcoes[k])),
        'Use --entrada snapshot.json --projeto REF --ambiente AMBIENTE --saida relatorio.json.');
    const s = JSON.parse(readFileSync(opcoes['--entrada'], 'utf8').replace(/^\uFEFF/, ''));
    const relatorio = analisarSnapshot(s, { projeto: opcoes['--projeto'], ambiente: opcoes['--ambiente'] });
    // wx impede sobrescrever tanto o snapshot como uma evidencia anterior.
    writeFileSync(opcoes['--saida'], JSON.stringify(relatorio, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(`Relatorio criado: ${relatorio.contagem.achados} pontos para revisao. Nenhuma revogacao autorizada automaticamente.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { main(); } catch (e) {
        // Erros de parse podem incluir trechos privados do arquivo; nao imprimi-los.
        console.error(e instanceof SyntaxError ? 'JSON invalido; confira o arquivo sem publicar seu conteudo.' :
            e?.code ? 'Nao foi possivel ler a entrada ou criar uma saida nova.' : e.message);
        process.exitCode = 1;
    }
}
