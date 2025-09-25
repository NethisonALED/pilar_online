import { supabase } from './app.js';
import { logAction } from './logger.js';

class RelacionamentoApp {
    constructor() {
        this.currentUser = null;
        this.arquitetos = [];
        this.pontuacoes = {};
        this.pagamentos = {};
        this.importedFiles = {};
        this.comissoesManuais = [];
        this.actionLogs = [];
        this.tempRTData = [];
        this.tempArquitetoData = [];
        this.eligibleForPayment = [];
        this.schemaHasRtAcumulado = false;
        this.schemaHasRtTotalPago = false;
        
        this.sysledData = [];
        this.sysledFilteredData = [];
        this.isSysledImport = false;
        
        this.sortColumn = 'nome';
        this.sortDirection = 'asc';

        this.initAuthListener();
    }

    // --- INICIALIZAÇÃO E AUTENTICAÇÃO ---

    initAuthListener() {
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.currentUser = session.user;
                authContainer.style.display = 'none';
                appContainer.style.display = 'block';
                await logAction(`Usuário ${this.currentUser.email} fez login.`);
                this.initApp();
            } else {
                this.currentUser = null;
                authContainer.style.display = 'flex';
                appContainer.style.display = 'none';
            }
        });

        document.getElementById('login-form').addEventListener('submit', this.handleLogin.bind(this));
        document.getElementById('logout-button').addEventListener('click', this.handleLogout.bind(this));
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const authError = document.getElementById('auth-error');
        authError.textContent = '';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            authError.textContent = 'Erro: ' + error.message;
        }
    }

    async handleLogout(e) {
        e.preventDefault();
        const userEmail = this.currentUser.email;
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair: ' + error.message);
        } else {
             await logAction(`Usuário ${userEmail} fez logout.`);
        }
    }
    
    async initApp() {
        await this.loadAllData();
        this.initEventListeners();
        this.renderAll();
    }

    // --- CARREGAMENTO DE DADOS (loadAllData e métodos relacionados) ---
    async loadAllData() {
        // Implemente aqui os métodos de carregamento de dados (arquitetos, pagamentos, etc.)
        // Exemplo: await this.loadArquitetos();
        // ...
        console.log("App inicializado e dados carregados.");
    }

    // --- RENDERIZAÇÃO (renderAll e métodos de renderização de UI) ---
    renderAll() {
        // Implemente aqui os métodos para renderizar as tabelas e outros componentes
        // Exemplo: this.renderArquitetosTable();
        // ...
    }

    // --- MANIPULADORES DE EVENTOS (initEventListeners e handles) ---
    initEventListeners() {
        // Adicione aqui todos os event listeners da aplicação
        // Exemplo: document.getElementById('add-arquiteto-form').addEventListener(...)
        // ...

        // Listener para a nova aba de logs
        document.getElementById('refresh-logs-btn').addEventListener('click', this.renderActionLogs.bind(this));
        document.querySelector('.menu-link[data-tab="registro-acoes"]').addEventListener('click', this.renderActionLogs.bind(this));

        // Navegação principal
        const menuLinks = document.querySelectorAll('.menu-link');
        const tabViews = document.querySelectorAll('.tab-view');
        menuLinks.forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                if (link.id === 'logout-button') return;
                const targetTab = link.dataset.tab;
                menuLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                tabViews.forEach(view => view.classList.toggle('active', view.id === `${targetTab}-view`));
            });
        });
    }

    async renderActionLogs() {
        const container = document.getElementById('action-logs-container');
        container.innerHTML = `<p class="text-center text-gray-500">Carregando logs...</p>`;

        const { data, error } = await supabase
            .from('action_logs')
            .select('*')
            .order('when_did', { ascending: false })
            .limit(200);

        if (error) {
            console.error('Erro ao buscar logs:', error);
            container.innerHTML = `<p class="text-center text-red-500">Erro ao carregar os logs.</p>`;
            return;
        }

        this.actionLogs = data;

        if (this.actionLogs.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhuma ação registrada ainda.</p>`;
            return;
        }

        const rowsHtml = this.actionLogs.map(log => `
            <tr class="border-b text-sm">
                <td class="p-2">${log.who_did}</td>
                <td class="p-2">${log.what_did}</td>
                <td class="p-2 whitespace-nowrap">${new Date(log.when_did).toLocaleString('pt-BR')}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-100 text-xs uppercase">
                        <th class="p-2 text-left">Quem Fez</th>
                        <th class="p-2 text-left">O que Fez</th>
                        <th class="p-2 text-left">Data e Hora</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    // --- RESTANTE DA LÓGICA DA APLICAÇÃO ---
    // Mova o restante dos métodos da sua classe original para cá, organizando-os.
    // Ex: handleAddArquiteto, processRTData, formatCurrency, etc.
}

// Inicia a aplicação
new RelacionamentoApp();
