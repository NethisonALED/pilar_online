import { supabase, parseCurrency, formatCurrency, fileToBase64, jsonToXLSXDataURL, formatApiDateToBR, formatApiNumberToBR, parseApiNumber } from './utils.js';
import { initializeEventListeners } from './events.js';
import * as ui from './ui.js';
/**
 * @class RelacionamentoApp
 * @description Classe principal que gerencia o estado e a lógica da aplicação de relacionamento com arquitetos.
 * Armazena dados de arquitetos, pagamentos, vendas e logs, além de controlar a renderização da interface.
 */
class RelacionamentoApp {

    /**
     * @constructor
     * @description Inicializa o estado da aplicação, definindo arrays, objetos e flags que serão usados para armazenar os dados.
     */
    constructor() {
        // Estado da aplicação
        this.arquitetos = [];
        this.pontuacoes = {};
        this.pagamentos = {};
        this.resgates = []; // NOVO: Para armazenar resgates separadamente
        this.importedFiles = {};
        this.comissoesManuais = [];
        this.actionLogs = []; // Para armazenar os logs de eventos
        this.tempRTData = [];
        this.tempArquitetoData = [];
        this.eligibleForPayment = [];
        this.currentUserEmail = ''; // Para armazenar o email do usuário logado
        
        // Flags para funcionalidades condicionais baseadas no schema do DB
        this.schemaHasRtAcumulado = false;
        this.schemaHasRtTotalPago = false;
        
        // Dados da API Sysled
        this.sysledData = [];
        this.sysledFilteredData = [];
        this.isSysledImport = false;
        this.pendingImportData = null; // Para armazenar dados de importação pendentes
        
        // Estado de ordenação da tabela de arquitetos
        this.sortColumn = 'nome';
        this.sortDirection = 'asc';

        this.init();
    }

    /**
     * Inicializa a aplicação. Este método é chamado pelo construtor.
     * @async
     * @description Obtém a sessão do usuário, carrega todos os dados iniciais do Supabase,
     * inicializa os event listeners e renderiza todos os componentes da UI.
     */
    async init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.currentUserEmail = session.user.email;
        }
        await this.loadData();
        initializeEventListeners(this);
        ui.renderAll(this);
    
    /**
     * Carrega todos os dados iniciais do Supabase de forma concorrente.
     * @async
     * @description Realiza consultas paralelas às tabelas 'arquitetos', 'pagamentos',
     * 'arquivos_importados', 'comissoes_manuais' e 'action_logs' no Supabase.
     * Popula o estado da aplicação com os dados retornados e trata possíveis erros.
     */
    async loadData() {
        console.log("Carregando dados do Supabase...");
        
        const [arqRes, pagRes, filesRes, comissoesRes, logsRes] = await Promise.all([
            supabase.from('arquitetos').select('*'),
            supabase.from('pagamentos').select('*'),
            supabase.from('arquivos_importados').select('*'),
            supabase.from('comissoes_manuais').select('*').order('created_at', { ascending: false }),
            supabase.from('action_logs').select('*').order('when_did', { ascending: false }) // Carrega os logs
        ]);

        if (arqRes.error) console.error('Erro ao carregar arquitetos:', arqRes.error);
        else {
            this.arquitetos = arqRes.data || [];
            if (this.arquitetos.length > 0) {
                const first = this.arquitetos[0];
                this.schemaHasRtAcumulado = first.hasOwnProperty('rt_acumulado');
                this.schemaHasRtTotalPago = first.hasOwnProperty('rt_total_pago');
            }
            this.pontuacoes = this.arquitetos.reduce((acc, arq) => ({...acc, [arq.id]: arq.pontos || 0}), {});
        }

        if (pagRes.error) console.error('Erro ao carregar pagamentos:', pagRes.error);
        else {
            this.pagamentos = {}; // Reset
            this.resgates = [];   // Reset
            (pagRes.data || []).forEach(p => {
                // A coluna 'form_pagamento' com valor 2 indica um resgate
                if (p.form_pagamento === 2) {
                    this.resgates.push(p);
                } else { // Pagamentos normais (form_pagamento === 1 ou null/undefined)
                    const dateKey = new Date(p.data_geracao + 'T00:00:00Z').toLocaleDateString('pt-BR');
                    if (!this.pagamentos[dateKey]) this.pagamentos[dateKey] = [];
                    this.pagamentos[dateKey].push(p);
                }
            });
        }

        if (filesRes.error) console.error('Erro ao carregar arquivos:', filesRes.error);
        else {
            this.importedFiles = (filesRes.data || []).reduce((acc, f) => {
                const dateKey = new Date(f.data_importacao + 'T00:00:00Z').toLocaleDateString('pt-BR');
                acc[dateKey] = { name: f.name, dataUrl: f.dataUrl, id: f.id };
                return acc;
            }, {});
        }
        
        if (comissoesRes.error) console.error('Erro ao carregar comissões manuais:', comissoesRes.error);
        else this.comissoesManuais = comissoesRes.data || [];

        // Processa os logs de eventos
        if (logsRes.error) console.error('Erro ao carregar logs de eventos:', logsRes.error);
        else this.actionLogs = logsRes.data || [];

        console.log("Dados carregados.");
        ui.renderAll(this);
    }
    
}

export default RelacionamentoApp;
