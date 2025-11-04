/**
 * Inicializa todos os event listeners da aplicação.
 * Utiliza delegação de eventos no container principal para otimizar o desempenho.
 * @param {RelacionamentoApp} app - A instância principal da classe da aplicação.
 */
import * as handlers from './handlers.js';
import * as ui from './ui.js';

/**
 * @function initializeEventListeners
 * @description Inicializa todos os event listeners da aplicação, utilizando delegação de eventos para otimizar o desempenho.
 * @param {RelacionamentoApp} app - A instância principal da classe da aplicação.
 */
export function initializeEventListeners(app) {
    const mainContainer = document.getElementById('app-container');
    if (!mainContainer) {
        console.error("Container principal #app-container não encontrado.");
        return;
    }

    /**
     * @description Navegação por abas: alterna a visibilidade das abas da aplicação.
     */
    const menuLinks = document.querySelectorAll('.menu-link');
    const tabViews = document.querySelectorAll('.tab-view');
    menuLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            if (link.id === 'logout-button') return; // O logout é tratado em auth.js
            const targetTab = link.dataset.tab;
            menuLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            tabViews.forEach(view => view.classList.toggle('active', view.id === `${targetTab}-view`));
        });
    });

    /**
     * @description Delegação de eventos de clique: gerencia todas as ações de clique na aplicação.
     */
    mainContainer.addEventListener('click', (e) => {
        const target = e.target;

        // Ações gerais
        if (target.closest('#sidebar-toggle-btn')) document.getElementById('app-sidebar').classList.toggle('collapsed');
        if (target.closest('#calculate-results-btn')) ui.renderResultados(app);

        // Ações da aba Arquitetos e Modais relacionados
        if (target.closest('.edit-btn')) handlers.handleArquitetosTableClick(app, e);
        if (target.closest('.delete-btn')) handlers.handleArquitetosTableClick(app, e);
        if (target.closest('.add-value-btn')) handlers.handleArquitetosTableClick(app, e);
        if (target.closest('.id-link')) { e.preventDefault(); handlers.handleArquitetosTableClick(app, e); }
        if (target.closest('.sortable-header')) handlers.handleSort(app, e);
        if (target.closest('#export-csv-btn')) handlers.exportArquitetosCSV(app);
        if (target.closest('#delete-all-arquitetos-btn')) handlers.deleteAllArquitetos(app);
        if (target.closest('#gerar-pagamentos-rt-btn')) handlers.handleGerarPagamentosClick(app);
        if (target.closest('#close-edit-modal-x-btn')) ui.closeEditModal();
        if (target.closest('#gerar-pagamento-ficha-btn')) handlers.handleGerarPagamentoFicha(app);
        if (target.closest('#gerar-resgate-ficha-btn')) handlers.handleGerarResgateFicha(app);
        if (target.closest('#consultar-vendas-btn')) handlers.handleConsultarVendasClick(app, e);
        if (target.closest('#cancel-add-value-btn')) ui.closeAddValueModal();
        if (target.closest('#cancel-arquiteto-mapping-btn')) ui.closeArquitetoMappingModal();
        if (target.closest('#confirm-arquiteto-mapping-btn')) handlers.handleArquitetoMapping(app);
        
        // Ações de importação de vendas (RT)
        if (target.closest('#cancel-rt-mapping-btn')) ui.closeRtMappingModal();
        if (target.closest('#confirm-rt-mapping-btn')) handlers.handleRtMapping(app);

        // Ações das abas Comprovantes/Resgates e Modais relacionados
        if (target.closest('.view-comprovante-btn')) handlers.handlePagamentosClick(app, e);
        if (target.closest('.delete-pagamentos-btn')) handlers.handlePagamentosClick(app, e);
        if (target.closest('.download-xlsx-btn')) handlers.handlePagamentosClick(app, e);
        if (target.closest('.gerar-relatorio-btn')) handlers.handlePagamentosClick(app, e);
        if (target.closest('.edit-rt-btn')) handlers.handlePagamentosClick(app, e);
        if (target.closest('#close-comprovante-modal-btn')) ui.closeComprovanteModal();
        if (target.closest('#cancel-edit-rt-btn')) ui.closeEditRtModal();
        if (target.closest('#cancel-gerar-pagamentos-btn')) ui.closeGerarPagamentosModal();
        if (target.closest('#confirmar-geracao-comprovantes-btn')) handlers.confirmarGeracaoComprovantes(app);

        // Ações da aba Arquivos Importados
        if (target.closest('.download-arquivo-btn')) handlers.handleArquivosImportadosClick(app, e);

        // Ações da aba Consulta Sysled e Modais relacionados
        if (target.closest('#sysled-refresh-btn')) handlers.fetchSysledData(app);
        if (target.closest('#sysled-filter-btn')) ui.renderSysledTable(app);
        if (target.closest('#sysled-clear-filter-btn')) handlers.clearSysledFilters(app);
        if (target.closest('#copy-to-rt-btn')) handlers.handleCopyToRTClick(app);
        if (target.closest('.view-sale-details-btn')) { e.preventDefault(); handlers.handleSalesHistoryTableClick(app, e); }
        if (target.closest('#close-sales-history-btn')) ui.closeSalesHistoryModal();
        if (target.closest('#import-single-sale-btn')) handlers.handleImportSingleSale(app, e);
        if (target.closest('#close-sale-details-btn')) ui.closeSaleDetailsModal();
        
        // Ações da aba Inclusão Manual e Modais relacionados
        if (target.closest('.view-comissao-details-btn')) { e.preventDefault(); handlers.handleHistoricoManualClick(app, e); }
        if (target.closest('#close-comissao-manual-details-btn')) ui.closeComissaoManualDetailsModal();
        if (target.closest('#aprovar-inclusao-manual-btn')) handlers.handleAprovarInclusaoManual(app, e);
        
        // Ações do Modal de Novo Arquiteto
        if (target.closest('#cancel-novo-arquiteto-btn')) ui.cancelNovoArquiteto(app);

        // Ações da aba Eventos
        if (target.closest('#clear-events-log-btn')) handlers.clearEventsLog(app);
    });

    /**
     * @description Delegação de eventos de submissão: gerencia todos os envios de formulários.
     */
    mainContainer.addEventListener('submit', (e) => {
        e.preventDefault();
        switch (e.target.id) {
            case 'add-comissao-manual-form': handlers.handleAddComissaoManual(app, e); break;
            case 'add-arquiteto-form': handlers.handleAddArquiteto(app, e); break;
            case 'edit-arquiteto-form': handlers.handleEditArquiteto(app, e); break;
            case 'add-value-form': handlers.handleAddValue(app, e); break;
            case 'add-pontos-form': handlers.handleAddPontos(app, e); break;
            case 'edit-rt-form': handlers.handleUpdateRtValue(app, e); break;
            case 'novo-arquiteto-form': handlers.handleNovoArquitetoSubmit(app, e); break;
        }
    });
    
    mainContainer.addEventListener('input', (e) => {
        switch (e.target.id) {
            case 'arquiteto-search-input': ui.renderArquitetosTable(app); break;
            case 'pagamento-search-input': ui.renderPagamentos(app, e.target.value.trim()); break;
            case 'resgate-search-input': ui.renderResgates(app, e.target.value.trim()); break;
        }
        if (e.target.classList.contains('sysled-column-filter')) ui.renderSysledTable(app);
    });
    
    mainContainer.addEventListener('change', (e) => {
        switch (e.target.id) {
            case 'rt-file-input': handlers.handleRTFileSelect(app, e); break;
            case 'arquiteto-file-input': handlers.handleArquitetoFileUpload(app, e); break;
            case 'rt-percentual': handlers.calculateRT(app); break;
        }
        if (e.target.matches('.pagamento-status, .comprovante-input')) {
            handlers.handlePagamentosChange(app, e);
        }
    });

    console.log("Event listeners configurados.");
}
