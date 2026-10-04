// Congela a entrada já conferida online. Não transforma aprovação observada
// em autorização offline nem declara recursos adicionais do motor preparados.
(function (raiz) {
    'use strict';
    function canonico(valor) {
        if (Array.isArray(valor)) return valor.map(canonico);
        if (valor && typeof valor === 'object') return Object.fromEntries(
            Object.keys(valor).sort().map(k => [k, canonico(valor[k])]));
        return valor;
    }
    async function digest(bytes) {
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
            v => v.toString(16).padStart(2, '0')).join('');
    }
    function agendamento(modelos, estado) {
        const setores = new Set(), prazos = [];
        for (const modelo of modelos) {
            const local = Object.values(estado.osItens || {}).flat().find(m => String(m.id) === String(modelo.id));
            const produtoId = local?._vibe_id_produto ?? modelo.id_produto ?? modelo.produto_id ?? local?.id_produto ?? local?.produto_id;
            const produto = (estado.produtosGlobais || []).find(p => produtoId != null && String(p.id_produto) === String(produtoId));
            if (produto?.setor_pcp) setores.add(String(produto.setor_pcp));
            const ordem = (estado.ordens || []).find(o => String(o.numero || o.id_int) === String(modelo.id_int));
            const bruto = ordem?.prazo_entrega || ordem?.prazo;
            if (typeof bruto === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(bruto)) {
                // Data sem hora: início desse dia no fuso da estação, conservador
                // para prioridade. Não altera o prazo comercial do pedido.
                const data = new Date(bruto.length === 10 ? bruto + 'T00:00:00' : bruto);
                if (Number.isFinite(data.getTime())) prazos.push(data.toISOString());
            }
        }
        return { setores: [...setores].sort(), prazo: prazos.sort()[0] || null };
    }
    async function criar(fd, contexto, empresa) {
        const camposRecebidos = [...fd.keys()];
        if (new Set(camposRecebidos).size !== camposRecebidos.length) throw new Error('Campos duplicados na captura.');
        const dados = JSON.parse(fd.get('payload'));
        const integridade = dados.integridade;
        if (!integridade || integridade.version !== 1 || !integridade.arquivos
            || typeof empresa !== 'string' || !empresa.trim()) throw new Error('Entrada não conferida.');
        const ids = [...new Set((integridade.modelos || []).map(String))].sort();
        if (!ids.length || ids.some(id => !/^\d+$/.test(id))) throw new Error('Modelos não identificados.');
        const modelos = contexto.modelos || [];
        if (modelos.length !== ids.length || ids.some(id => !modelos.some(m => String(m.id) === id))) {
            throw new Error('Modelos conferidos incompletos.');
        }
        const aprovados = ['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'];
        if (modelos.some(m => !aprovados.includes(String(m.status_arte || '').trim().toUpperCase()))) {
            throw new Error('A preparação antecipada exige modelos aprovados.');
        }
        const arquivos = { frente: null, verso: null }, blobs = {};
        const nomes = {};
        for (const [campo, info] of Object.entries(integridade.arquivos)) {
            if (!/^(file|file_verso|csv_file|ma_file_\d+|ma_verso_\d+)$/.test(campo)) {
                throw new Error('Recurso de entrada desconhecido.');
            }
            const blob = fd.get(campo);
            if (!(blob instanceof Blob) || blob.size !== info.size
                || await digest(await blob.arrayBuffer()) !== info.sha256) {
                throw new Error('Arquivo mudou depois da conferência online.');
            }
            const nome = campo === 'file' ? 'frente' : campo === 'file_verso' ? 'verso' : campo;
            arquivos[nome] = { sha256: info.sha256, bytes: info.size };
            blobs[nome] = blob; nomes[nome] = campo;
        }
        // Mesmo um arquivo excedente não pode desaparecer silenciosamente do pacote.
        for (const [campo, valor] of fd.entries()) {
            if (valor instanceof Blob && !Object.hasOwn(integridade.arquivos, campo)) {
                throw new Error('Arquivo não coberto pela conferência online.');
            }
        }
        delete dados.integridade; // job_id muda por tentativa, não por conteúdo.
        const configuracao = {
            tipo: 'entrada_online', preparacao_completa: false, modelos: ids,
            dados, contexto: structuredClone(contexto), campos: nomes,
            agendamento: contexto.agendamento || {},
            pendencias: ['dependencias_do_motor', 'aprovacao_versionada']
        };
        const revisao = await digest(new TextEncoder().encode(JSON.stringify(canonico({ configuracao, arquivos }))));
        const manifesto = { schema: 1, empresa,
            modelo: ids.length === 1 ? ids[0] : 'combinacao:' + ids.join(','), revisao, configuracao, arquivos };
        const envio = new FormData();
        envio.set('manifesto', JSON.stringify(manifesto));
        for (const [nome, blob] of Object.entries(blobs)) envio.set('arquivo_' + nome, blob, nome + '.bin');
        return { manifesto, envio };
    }
    raiz.PacoteEntrada = { criar, agendamento };
})(typeof window !== 'undefined' ? window : globalThis);
