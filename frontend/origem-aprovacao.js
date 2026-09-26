// Indicador aproximado por rede. Nunca usar o rótulo como permissão ou status.
(function (root) {
    const rotulos = new Set(['Cliente', 'Atendente']);
    let versao = 0;
    let cache = new Map();
    let chave = null;
    const numerosValidos = pedidos => [...new Set(pedidos.map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].sort((a,b) => a-b);
    function precisa(pedidos) { return chave !== numerosValidos(pedidos).join(','); }
    function invalidar() { ++versao; chave = null; cache = new Map(); }
    async function carregar(client, pedidos) {
        if (!precisa(pedidos)) return;
        const atual = ++versao;
        const numeros = numerosValidos(pedidos);
        chave = numeros.join(',');
        const proximo = new Map();
        // Limpa antes da consulta: erro/saída da sessão não preserva rótulo antigo.
        cache = new Map();
        if (!client || !numeros.length) return;
        try {
            const { data: sessao } = await client.auth.getSession();
            if (!sessao?.session?.user || atual !== versao) return;
            // Home office: presença autenticada renova a referência por sete dias.
            // O servidor valida a permissão; o navegador não informa IP nem rótulo.
            await client.rpc('registrar_rede_atendimento');
            if (atual !== versao) return;
            for (let i = 0; i < numeros.length; i += 200) {
                const bloco = numeros.slice(i, i + 200);
                const { data, error } = await client.rpc('origens_aprovacao_lista', { p_pedidos: bloco });
                if (error || !Array.isArray(data)) throw new Error('Indicadores indisponíveis');
                for (const linha of data) {
                    const pedido = Number(linha.pedido);
                    if (bloco.includes(pedido)) proximo.set(pedido, {
                        arte: rotulos.has(linha.arte) ? linha.arte : null,
                        dados: rotulos.has(linha.dados) ? linha.dados : null
                    });
                }
            }
            if (atual === versao) cache = proximo;
        } catch (_) {
            if (atual === versao) cache = new Map();
        }
    }
    function html(numero, etapa, status) {
        const s = String(status || '').trim().toUpperCase();
        const permite = etapa === 'dados' ? s === 'APROVADO'
            : ['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA',
                'ARTE APROVADA', 'DADOS PENDENTES', 'APR PARCIAL', 'CORRIGIR DADOS'].includes(s);
        const rotulo = cache.get(Number(numero))?.[etapa];
        if (!permite || !rotulos.has(rotulo)) return '';
        return '<span class="origem-aprovacao" title="Origem estimada pela conexão de internet"'
            + ' style="display:block;font-size:0.7rem;margin-top:3px;color:var(--text-dim)">'
            + rotulo + '</span>';
    }
    root.OrigemAprovacao = { carregar, html, precisa, invalidar };
    if (typeof module !== 'undefined') module.exports = root.OrigemAprovacao;
})(typeof window !== 'undefined' ? window : globalThis);
