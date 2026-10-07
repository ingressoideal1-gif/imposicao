(function () {
    'use strict';
    const local = ['localhost', '127.0.0.1'].includes(location.hostname) && ['9000','9001'].includes(location.port);
    const ler = () => window._currentPerms?.perm_admin_view === true || window._currentPerms?.perm_admin_edit === true;
    const editar = () => window._currentPerms?.perm_admin_edit === true;
    const tamanho = n => Number.isFinite(n) ? (n / 1073741824).toLocaleString('pt-BR', {maximumFractionDigits:2}) + ' GiB' : 'não informado';
    const quando = v => v ? new Date(v).toLocaleString('pt-BR') : 'não informado';
    let modal, timer, busy = false, tab = 'frota', ultimaResposta, lista = [], mensagem = '';
    function el(tag, texto, pai) { const e = document.createElement(tag); if (texto != null) e.textContent = String(texto); if (pai) pai.append(e); return e; }
    async function api(path, dados) {
        const headers = {'Content-Type':'application/json'};
        const sessao = JSON.parse(sessionStorage.getItem('newprod_acesso_local') || 'null');
        if (sessao?.token) headers['X-NewProd-Sessao'] = sessao.token;
        const r = await fetch('/api/gestao-estacoes/' + path, {method:dados ? 'POST':'GET', headers, body:dados ? JSON.stringify(dados):undefined, cache:'no-store', signal:AbortSignal.timeout(path === 'backup' ? 120000 : 15000)});
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw Error(d.detail || `Consulta recusada (${r.status})`); }
        return r.json();
    }
    function botao(pai, texto, fn, escrita=false) {
        const b = el('button',texto,pai); b.type='button'; b.disabled=escrita && !editar();
        b.onclick=async () => { b.disabled=true; try { await fn(); } catch(e) { mensagem=e.message; mostrarMensagem(); } finally { b.disabled=escrita && !editar(); } };
        return b;
    }
    function mostrarMensagem() { if (modal) modal.querySelector('[role=status]').textContent=mensagem; }
    function tabela(colunas, rows, pai, acao) {
        const wrap=el('div',null,pai); wrap.style.overflowX='auto';
        const t=el('table',null,wrap), head=el('tr',null,el('thead',null,t));
        colunas.forEach(c=>el('th',c[0],head)); if(acao) el('th','Ações',head);
        const body=el('tbody',null,t);
        rows.forEach(row=>{const tr=el('tr',null,body); colunas.forEach(c=>el('td',typeof c[1]==='function'?c[1](row):row[c[1]],tr)); if(acao) acao(row,el('td',null,tr));});
        if(!rows.length) el('p','Nenhum registro no período consultado.',pai);
    }
    function exportar() {
        if (!ultimaResposta) return;
        const blob=new Blob([JSON.stringify(ultimaResposta,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob);
        const a=el('a'); a.href=url; a.download=`estacoes-${tab}-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function exportarCSV() {
        if(!ultimaResposta)return;
        const rows=tab==='frota'?ultimaResposta.map(r=>({estacao:r.apelido||r.name,ultimo_sinal:r.last_seen,versao:r.printers_json?.version,canal:r.printers_json?.canal,livre_bytes:r.printers_json?.armazenamento?.disco_temp_livre_bytes,erros_24h:r.printers_json?.gestao?.erros_24h})):ultimaResposta.trabalhos||ultimaResposta.eventos||[ultimaResposta];
        const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
        const cell=x=>{let s=typeof x==='object'?JSON.stringify(x):String(x??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
        const csv=[keys.map(cell).join(';'),...rows.map(r=>keys.map(k=>cell(r[k])).join(';'))].join('\r\n');
        const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='estacoes-'+tab+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function frota() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) throw Error('Conexão com o painel central indisponível.');
        let rows=[];
        for(let inicio=0; inicio<10000; inicio+=500) {
            const {data,error}=await supabaseClient.from('print_agents').select('id,name,apelido,last_seen,printers_json').order('id').range(inicio,inicio+499);
            if(error) throw Error('Não foi possível consultar as estações.');
            rows.push(...data); if(data.length<500) return rows;
        }
        throw Error('Inventário excede 10.000 instalações. Refine a consulta.');
    }
    async function atualizar() {
        if (busy || !modal || !ler()) return;
        busy=true;
        const abertura=modal, aba=tab;
        try {
            const dias=Number(modal.querySelector('select').value);
            const d=aba==='frota'?await frota():await api(aba==='historico'?`relatorio?dias=${dias}`:aba==='disco'?'resumo':aba);
            if(modal!==abertura || tab!==aba) return;
            ultimaResposta=d;
            const body=modal.querySelector('[data-corpo]'); body.replaceChildren();
            mensagem='Atualizado às '+new Date().toLocaleTimeString('pt-BR'); mostrarMensagem();
            if(aba==='frota') {
                lista=d;
                el('p','Presença central: atualização a cada 30 segundos. Versões antigas podem não informar gestão. O Piloto não recebe a fila remota.',body);
                tabela([['Estação',r=>r.apelido||r.name],['Canal',r=>r.printers_json?.canal||'não informado'],['Presença',r=>!r.last_seen?'sem sinal':Date.now()-Date.parse(r.last_seen)<120000?'online':'sem sinal recente'],['Painel HTTP',r=>r.printers_json?.gestao?.painel?.estado||'não monitorado'],['Produto oficial',r=>r.printers_json?.produto_oficial===true?'sim':'ainda não migrado'],['Último sinal',r=>quando(r.last_seen)],['Versão',r=>r.printers_json?.version||'não informada'],['Disco livre',r=>tamanho(r.printers_json?.armazenamento?.disco_temp_livre_bytes)],['Fila',r=>JSON.stringify(r.printers_json?.gestao?.fila||'não monitorada')]],d,body);
                d.forEach(r=>{const a=r.printers_json?.armazenamento; if(a?.disco_temp_total_bytes && (a.disco_temp_livre_bytes/a.disco_temp_total_bytes<0.1 || a.disco_temp_livre_bytes<5368709120))el('p','Atenção: pouco espaço em '+(r.apelido||r.name),body);});
                el('h3','Produção informada por estação — até 30 dias',body);
                const corte=new Date(Date.now()-Math.min(dias,30)*86400000).toISOString().slice(0,10);
                tabela([['Estação','estacao'],['Dia (UTC)','dia'],['Estado','estado'],['Quantidade','quantidade']],d.flatMap(r=>(r.printers_json?.gestao?.totais_30d||[]).filter(t=>t.dia>=corte).map(t=>({...t,estacao:r.apelido||r.name}))),body);
                tabela([['Estação',r=>r.apelido||r.name],['Erros em 24h',r=>r.printers_json?.gestao?.erros_24h??'não informado'],['Backup verificado',r=>quando(r.printers_json?.gestao?.backup?.quando)],['Cópia externa',r=>r.printers_json?.gestao?.backup?.copia_externa_confirmada===true?'confirmada':'não confirmada']],d,body);
            } else if(aba==='resumo' || aba==='disco') {
                el('p',`Canal ${d.canal} · versão ${d.versao} · ${d.ocupado?'processamento ativo':'sem processamento ativo'} · atualização por ${d.atualizacao}`,body);
                const a=d.armazenamento||{};
                tabela([['Área','area'],['Ocupação','bytes'],['Cobertura','cobertura']],['gerenciados','temp_usuario','cache_fontes','cache_fotos','versoes','pacotes','gestao'].map(k=>({area:k,bytes:tamanho(a[k]?.bytes),cobertura:a[k]?.parcial?'parcial':a[k]?'medida':'não medida'})),body);
                tabela([['Volume','unidade'],['Total',r=>tamanho(r.total)],['Livre',r=>tamanho(r.livre)]],a.volumes_fixos||[],body);
                el('p','Livre no volume TEMP: '+tamanho(a.disco_temp_livre_bytes)+' · coleta '+quando(a.coletado_em*1000),body);
                el('p','Backup: '+(d.backup?JSON.stringify(d.backup):'nenhuma execução registrada pelo gerenciamento')+'. Logs: '+d.retencao_logs+'. Métricas: '+d.retencao_metricas_dias+' dias.',body);
                el('p','Backup local diário após cinco minutos de ociosidade: configurações e histórico, sem bloquear a impressão. Recuperação exige a chave DPAPI e a mesma conta Windows; cópia externa e backup portátil completo são controles separados.',body);
                botao(body,'Criar e verificar backup local',async()=>{if(!confirm('Criar backup cifrado local das configurações e do histórico, com ensaio de leitura?'))return;mensagem='Backup em andamento; aguarde a confirmação.';mostrarMensagem();const b=await api('backup',{confirmacao:true});mensagem='Backup verificado: '+b.arquivo;mostrarMensagem();},true);
                botao(body,'Ver prévia de limpeza',async()=>{const p=await api('limpeza'); const area=el('section',null,body); el('p',p.descricao+' Candidatos: '+p.candidatos.length+'. Arquivos em uso são preservados.',area); botao(area,'Limpar temporários abandonados',async()=>{if(!confirm('Limpar somente temporários próprios abandonados há pelo menos 24 horas, com trava livre?'))return; await api('limpeza',{confirmacao:true}); await atualizar();},true);});
            } else if(aba==='fila') {
                el('p','Atualização a cada 5 segundos. Páginas informadas pelo driver não comprovam saída física. Pausar/retomar não reenvia o arquivo.',body);
                if(!d.disponivel) throw Error('Consulta da fila indisponível; nenhum trabalho foi considerado concluído.');
                tabela([['Impressora','impressora'],['ID Windows','spool_id'],['Estado','estado'],['Páginas informadas',r=>(r.paginas_enviadas??'?')+'/'+(r.paginas_total??'?')],['Criado','criado']],d.trabalhos,body,(j,td)=>{
                    for(const acao of ['pausar','retomar']) botao(td,acao,async()=>{if(!confirm(`${acao} o trabalho ${j.spool_id} em ${j.impressora}?`))return; await api('fila',{...j,acao,confirmacao:true}); await atualizar();},true);
                });
            } else if(aba==='historico') {
                el('p',`Últimos ${dias} dias; até ${d.limite_trabalhos} trabalhos e 288 amostras nesta visualização. Estados incertos permanecem disponíveis.`,body);
                tabela([['Dia','dia'],['Estado','estado'],['Quantidade','quantidade']],d.totais,body);
                tabela([['Coleta',r=>quando(r.quando)],['Disco livre',r=>tamanho(r.dados.disco_temp_livre_bytes)],['TEMP',r=>tamanho(r.dados.temp_usuario?.bytes)]],d.amostras,body);
                tabela([['Trabalho','id'],['Impressora','impressora'],['Estado','estado'],['ID Windows','spool_id'],['Atualização',r=>quando(r.atualizado)]],d.trabalhos,body,(j,td)=>{
                    if(['incerto','enviado','erro_fila','pausado'].includes(j.estado)) for(const resultado of ['conferido','cancelado']) botao(td,resultado==='conferido'?'Confirmar papel':'Registrar cancelamento',async()=>{if(!confirm('Registrar '+resultado+' pelo operador? Isso não altera a fila do Windows.'))return;await api('conferir',{trabalho:j.id,resultado,confirmacao:true});await atualizar();},true);
                });
                tabela([['Quando',r=>quando(r.quando)],['Nível','nivel'],['Evento','codigo'],['Trabalho','trabalho']],d.eventos,body);
                if(d.proximo_evento)botao(body,'Carregar eventos anteriores',async()=>{const p=await api(`relatorio?dias=${dias}&antes=${d.proximo_evento}`); tabela([['Quando','quando'],['Evento','codigo'],['Trabalho','trabalho']],p.eventos,body);d.proximo_evento=p.proximo_evento;});
            } else if(aba==='logs') { el('p','Últimas 300 linhas / 64 KiB. Histórico completo está nos arquivos rotativos da estação.',body); el('pre',d.linhas.join('\n'),body); }
        } catch(e) { if(modal===abertura) {mensagem='Falha na atualização: '+e.message+'. Dados anteriores podem estar desatualizados.';mostrarMensagem();} }
        finally {busy=false;}
    }
    function abrir() {
        if(!ler() || modal) return;
        modal=el('dialog',null,document.body); modal.className='gestao-estacoes';
        const header=el('header',null,modal);el('h2','Gerenciamento das estações',header);
        botao(header,'Fechar',()=>modal.close());
        const nav=el('nav',null,modal);
        const abas=local?['frota','resumo','fila','historico','disco','logs']:['frota'];
        abas.forEach(a=>botao(nav,({frota:'Todas as estações',resumo:'Esta estação',fila:'Fila ao vivo',historico:'Histórico e relatórios',disco:'Disco e manutenção',logs:'Logs'})[a],()=>{tab=a;ultimaResposta=null;modal.querySelector('[data-corpo]').replaceChildren();return atualizar();}));
        const select=el('select',null,nav); select.setAttribute('aria-label','Período do relatório');[1,7,30,90].forEach(n=>{const o=el('option',n+' dias',select);o.value=n;o.selected=n===7;});select.onchange=atualizar;
        botao(nav,'Atualizar',atualizar);botao(nav,'Exportar JSON',exportar);botao(nav,'Exportar CSV',exportarCSV);
        const status=el('p',null,modal);status.setAttribute('role','status');
        const body=el('div',null,modal);body.dataset.corpo='';
        modal.addEventListener('close',()=>{clearInterval(timer);modal.remove();modal=null;ultimaResposta=null;});
        let ciclos=0;
        modal.showModal();atualizar();timer=setInterval(()=>{ciclos++;if(!document.hidden && (tab!=='frota'||ciclos%6===0))atualizar();},5000);
    }
    const style=el('style',`.gestao-estacoes{width:94vw;max-width:1400px;height:88vh;background:#142132;color:#eef4fb;border:1px solid #688096;border-radius:12px;padding:20px}.gestao-estacoes::backdrop{background:#000a}.gestao-estacoes header,.gestao-estacoes nav{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.gestao-estacoes header{justify-content:space-between}.gestao-estacoes button,.gestao-estacoes select{padding:8px 12px;border:1px solid #688096;border-radius:6px;background:#243c56;color:white;cursor:pointer}.gestao-estacoes button:disabled{opacity:.4}.gestao-estacoes table{width:100%;border-collapse:collapse;margin:18px 0}.gestao-estacoes td,.gestao-estacoes th{text-align:left;padding:9px;border-bottom:1px solid #38516b}.gestao-estacoes pre{white-space:pre-wrap;overflow-wrap:anywhere}.gestao-estacoes [role=status]{color:#ffd37d}`,document.head);
    let entrada;
    setInterval(()=>{const nav=document.querySelector('.sidebar');if(!nav)return;if(!entrada){entrada=botao(nav,'Gerenciar estações',abrir);entrada.id='gestao-estacoes-abrir';entrada.className='nav-btn';}entrada.hidden=!ler();if(modal&&!ler())modal.close();},1500);
    window.abrirGestaoEstacoes=abrir;
})();
