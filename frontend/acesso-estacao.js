// Login local do NewProd: identidade conferida pela API da estacao.
const CHAVE_SESSAO_LOCAL = 'newprod_acesso_local';

async function iniciarAcessoLocal(liberarUICompleta) {
    try {
        const resp = await fetch(`${API_BASE_URL}/api/local/login/estado`);
        const data = await resp.json();
        if (resp.ok && data && data.configurado === false) {
            console.warn('[acesso local] Sincronize os acessos desta estação antes de entrar.');
        }
    } catch (e) {
        // Falha de comunicacao nunca concede permissao de acesso.
        console.warn('[acesso local] A estação não respondeu sobre o código:', e);
    }

    let sessao = null;
    try {
        sessao = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO_LOCAL) || 'null');
    } catch (e) { /* sessão ilegível vale como ausente */ }

    if (!sessao || !sessao.nome || !sessao.token) {
        sessionStorage.removeItem(CHAVE_SESSAO_LOCAL);
        mostrarLoginLocal(liberarUICompleta);
        return;
    }

    const conferida = await reconferirAcessoLocal(sessao.token);
    if (conferida.sessao) {
        aplicarAcessoLocal(conferida.sessao, liberarUICompleta);
        return;
    }
    if (conferida.motivo === 'recusado') {
        // Acesso desativado, excluído, ou código trocado enquanto a aba estava
        // aberta. Sem isto, a sessão antiga valeria até o operador sair por conta
        // própria — ou seja, tirar a permissão de alguém não teria efeito.
        sessionStorage.removeItem(CHAVE_SESSAO_LOCAL);
        mostrarLoginLocal(liberarUICompleta);
        toast('Seu acesso mudou. Entre de novo com o código.', 'warning');
        return;
    }
    // Sem confirmacao do agente, a sessao guardada nao libera a interface.
    mostrarLoginLocal(liberarUICompleta);
    toast('A estação não confirmou sua sessão. Tente novamente.', 'warning');
}

/**
 * Reconfere o token com o agente e devolve a sessão atualizada.
 *
 * É o que faz uma mudança de permissão valer sem precisar que o operador saia:
 * a estação baixa a lista a cada 5 minutos, e um F5 depois disso já traz a grade
 * nova. Também é o que faz um acesso desativado parar de valer.
 *
 * Tanto uma recusa quanto a falta de resposta exigem nova confirmacao.
 */
async function reconferirAcessoLocal(token) {
    try {
        const resp = await fetch(`${API_BASE_URL}/api/local/sessao`, {
            headers: { 'X-NewProd-Sessao': token }
        });
        if (!resp.ok) return { motivo: 'recusado' };
        const data = await resp.json();
        const sessao = sessaoDoLogin(data);
        sessionStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(sessao));
        return { sessao };
    } catch (e) {
        return { motivo: 'sem_resposta' };
    }
}

// O navegador guarda somente o token temporario emitido pela estacao.
function sessaoDoLogin(data) {
    return {
        nome: data.nome,
        role: data.role || '',
        permissoes: data.permissoes || {},
        token: data.token || '',
    };
}

/**
 * Permissões de um operador local.
 *
 * São as mesmas permissões por módulo dos usuários do sistema, cadastradas no
 * Menu Usuários e sincronizadas com a estação. Quem manda é a grade; o `role`
 * decide o rótulo na barra lateral e o que vale para uma chave que a grade
 * NÃO TEM.
 *
 * Chave ausente segue o padrão do perfil (`ROLE_DEFAULTS`), e não um "não"
 * silencioso. A grade de um acesso é um JSON gravado no dia em que o acesso foi
 * criado ou teve o perfil trocado; um módulo que nasce depois — foi o caso do
 * Painel do Acabamento, em 22/08/2026 — não aparece nela, e aplicá-la como
 * estava escondia o menu novo de três operadores por mais que o administrador
 * marcasse caixas na grade dos usuários do SITE, que é outra grade. Chave
 * presente continua mandando, letra por letra, inclusive quando diz "não": a
 * grade é editável caixa a caixa, e é ela a decisão do administrador.
 *
 * Sem grade, segue o perfil conhecido e bloqueia a administracao. Um perfil
 * desconhecido nao recebe permissoes.
 */
function permsDoOperadorLocal(permissoes, role) {
    if (permissoes && Object.keys(permissoes).length) {
        const perms = { ...permissoes };
        const padrao = ROLE_DEFAULTS[String(role || '').trim().toLowerCase()] || {};
        for (const key of chavesDaGrade()) {
            perms[key] = key in perms ? perms[key] === true : padrao[key] === true;
        }
        return perms;
    }

    return { ...(ROLE_DEFAULTS[String(role || '').trim().toLowerCase()] || {}),
        perm_admin_view: false, perm_admin_edit: false };
}

function aplicarAcessoLocal(sessao, liberarUICompleta) {
    window._acessoLocal = sessao;
    liberarUICompleta();

    const perms = permsDoOperadorLocal(sessao.permissoes, sessao.role);
    window._currentPerms = perms;
    applyPermissions(perms);

    const profileBar = document.getElementById('user-profile-bar');
    const emailDisplay = document.getElementById('user-email-display');
    if (profileBar) profileBar.style.display = 'block';
    if (emailDisplay) {
        const rl = ROLE_LABELS[sessao.role] || {};
        const selo = rl.label
            ? `<span style="font-size:0.65rem;background:${rl.color}22;color:${rl.color};padding:1px 6px;border-radius:10px;margin-left:4px;">${rl.label.toUpperCase()}</span>`
            : '';
        emailDisplay.innerHTML = `🖥️ ${escapeHtml(sessao.nome)}${selo}`;
    }
    atualizarIdentidadeNoPainel(sessao.nome, sessao.role);

    abrirTelaInicial(sessao.role);
    loadAll();
}

function mostrarLoginLocal(liberarUICompleta) {
    window.NavegacaoPainel?.suspender();
    let overlay = document.getElementById('auth-overlay-local');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'auth-overlay-local';
        overlay.className = 'auth-overlay active';
        overlay.innerHTML = `
            <div class="auth-card">
                <div class="auth-header">
                    <h2>🖥️ NewProd — Acesso local</h2>
                    <p>Digite o código de 6 caracteres que o administrador entregou</p>
                </div>
                <form onsubmit="handleLoginLocal(event)">
                    <div class="form-group" style="margin-bottom:14px;">
                        <input type="text" id="auth-codigo-local" class="form-control" maxlength="6"
                               autocomplete="off" autocapitalize="characters" spellcheck="false" required
                               placeholder="A2B4C6"
                               style="text-align:center;font-family:ui-monospace,Consolas,monospace;font-size:1.7rem;letter-spacing:10px;text-transform:uppercase;height:56px;">
                    </div>
                    <div id="auth-erro-local" style="display:none;color:var(--red);font-size:0.82rem;text-align:center;margin-bottom:12px;"></div>
                    <div class="auth-actions">
                        <button type="submit" id="btn-auth-local" class="btn btn-primary btn-full" style="height:42px;font-size:0.95rem;">🚀 Entrar</button>
                    </div>
                </form>
                <div style="text-align:center;margin-top:14px;color:var(--text-dim);font-size:0.76rem;">
                    Este código vale só nesta estação. Não é a senha do site.
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.classList.add('active');
    }
    document.body.classList.add('not-logged-in');
    window._liberarUIAposLoginLocal = liberarUICompleta;
    setTimeout(() => document.getElementById('auth-codigo-local')?.focus(), 50);
}

window.handleLoginLocal = async function(e) {
    e.preventDefault();
    const campo = document.getElementById('auth-codigo-local');
    const erro = document.getElementById('auth-erro-local');
    const btn = document.getElementById('btn-auth-local');
    const codigo = (campo?.value || '').trim().toUpperCase();

    btn.disabled = true;
    btn.textContent = 'Conferindo...';
    if (erro) erro.style.display = 'none';

    try {
        const resp = await fetch(`${API_BASE_URL}/api/local/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo })
        });
        if (!resp.ok) throw new Error('Código inválido');
        const data = await resp.json();

        const sessao = sessaoDoLogin(data);
        if (!sessao.token) throw new Error('Atualize o NewProd para confirmar sua sessão.');
        if (campo) campo.value = '';
        // sessionStorage e não localStorage: fechou o navegador, pede de novo. Numa
        // estação compartilhada, a sessão não pode sobreviver ao turno.
        window.NavegacaoPainel?.encerrarSessao();
        sessionStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(sessao));

        document.getElementById('auth-overlay-local')?.classList.remove('active');
        document.body.classList.remove('not-logged-in');
        toast(`Bem-vindo, ${sessao.nome}!`, 'success');
        aplicarAcessoLocal(sessao, window._liberarUIAposLoginLocal || (() => {}));
    } catch (err) {
        if (erro) {
            erro.textContent = 'Código inválido. Confira com o administrador.';
            erro.style.display = 'block';
        }
        if (campo) { campo.value = ''; campo.focus(); }
    } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Entrar';
    }
};

window.addEventListener('newprod-sessao-expirada', () => {
    sessionStorage.removeItem(CHAVE_SESSAO_LOCAL);
    window._acessoLocal = null;
    mostrarLoginLocal(window._liberarUIAposLoginLocal || (() => {}));
});
