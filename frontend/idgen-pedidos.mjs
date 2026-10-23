// Estado próprio: não usa state.ordens nem grava modelos/catálogos do ERP.
export class PedidosIdGen {
    constructor(enviar) { this.enviar = enviar; this.pedido = null; this.fila = Promise.resolve(); }
    abrir(id) {
        const trabalho = this.fila.then(async () => {
            const pedido = await this.enviar('abrir', { id });
            if (pedido?.id !== id || !Number.isInteger(pedido.revisao) || !Array.isArray(pedido.documento?.modelos)) {
                throw new Error('O servidor não confirmou o pedido IdGen.');
            }
            this.pedido = structuredClone(pedido);
            return structuredClone(pedido);
        });
        this.fila = trabalho.catch(() => {});
        return trabalho;
    }
    alterar(mudar) {
        const id = this.pedido?.id;
        if (!id) return Promise.reject(new Error('Abra um pedido IdGen.'));
        const executar = async () => {
            if (this.pedido?.id !== id) throw new Error('O pedido aberto mudou.');
            const rascunho = structuredClone(this.pedido.documento);
            mudar(rascunho);
            const documento = JSON.parse(JSON.stringify(rascunho));
            const revisao = this.pedido.revisao;
            const salvo = await this.enviar('salvar', { id, revisao, documento });
            if (salvo?.id !== id || salvo.revisao !== revisao + 1
                || canonico(salvo.documento) !== canonico(documento)) {
                throw new Error('O servidor não confirmou todos os dados. Reabra o pedido.');
            }
            this.pedido = structuredClone(salvo);
            return structuredClone(salvo);
        };
        const trabalho = this.fila.then(executar);
        this.fila = trabalho.catch(() => {});
        return trabalho;
    }
    salvarModelo(id, patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Campos inválidos.');
        const proibidos = ['id', 'id_int', '_source', '_pedidoModeloId', 'id_produto_proposta_origem', '__proto__', 'constructor', 'prototype'];
        if (Object.keys(patch).some(k => proibidos.includes(k))) throw new Error('A identidade do modelo não pode ser alterada.');
        return this.alterar(doc => {
            const modelo = doc.modelos.find(m => m.id === id);
            if (!modelo) throw new Error('Modelo não pertence ao pedido IdGen.');
            Object.assign(modelo, structuredClone(patch));
        });
    }
    adicionarModelo({ nome, formato, cor, numeracao }) {
        if (!nome?.trim() || nome.length > 120 || /[<>"']/.test(nome) || !formato?.id || !cor?.id || !numeracao?.id) {
            return Promise.reject(new Error('Informe nome, formato, cor e numeração.'));
        }
        return this.alterar(doc => {
            if (doc.modelos.length >= 500) throw new Error('Limite de 500 modelos por pedido.');
            // Mesmo a numeração compartilhada é copiada: editar no IdGen nunca muda o catálogo original.
            const fmt = { ...structuredClone(formato), id: crypto.randomUUID() };
            const c = { ...structuredClone(cor), id: crypto.randomUUID(), formato_id: fmt.id };
            const modeloId = crypto.randomUUID();
            const n = { ...structuredClone(numeracao), id: crypto.randomUUID(), formato_id: fmt.id,
                formato_ids: [fmt.id], os_item_id: modeloId, Cli_Num: this.pedido.cliente_id, is_custom: true, bg_url: numeracao.bg_url || null };
            doc.formatos.push(fmt); doc.cores.push(c); doc.numeracoes.push(n);
            doc.modelos.push({ id: modeloId, nome_modelo: nome.trim(), produto: nome.trim(),
                formato_id: fmt.id, amostra_cor_id: c.id, amostra_num_id: n.id,
                cor: c.name, numeracao: n.name, quantidade: 1, qtd: 1, amostra_status: 'PENDENTE' });
        });
    }
}
function canonico(value) {
    if (Array.isArray(value)) return '[' + value.map(canonico).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonico(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
