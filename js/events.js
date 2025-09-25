function initEventListeners(app) {
    // --- Navegação ---
    const menuLinks = document.querySelectorAll('.menu-link');
    // Este seletor precisa ser ajustado para pegar os containers das views
    const mainContainer = document.querySelector('main'); 

    menuLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            if (link.id === 'logout-button') return;

            const targetTab = link.dataset.tab;
            
            // Lógica para carregar o HTML da view
            try {
                const response = await fetch(`views/${targetTab}.html`);
                if (!response.ok) throw new Error('View não encontrada.');
                const viewHtml = await response.text();
                mainContainer.innerHTML = viewHtml;

                // Ativa o link do menu e remove a classe de outros
                menuLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                // Re-inicializa os event listeners específicos da view
                app.reinitializeViewEventListeners(targetTab);
                
            } catch (error) {
                console.error('Erro ao carregar a view:', error);
                mainContainer.innerHTML = `<p class="text-red-500 text-center">Erro ao carregar conteúdo.</p>`;
            }
        });
    });

    // Dispara o clique no primeiro link para carregar a view inicial
    document.querySelector('.menu-link[data-tab="relatorio-rt"]').click();

    // --- Sidebar Toggle ---
    const sidebar = document.getElementById('app-sidebar');
    const toggleButton = document.getElementById('sidebar-toggle-btn');
    if (toggleButton && sidebar) {
        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Função para (re)adicionar listeners específicos de cada view
function reinitializeViewEventListeners(viewName, app) {
    // Listeners Globais para Modais (eles existem fora das views)
    document.getElementById('confirm-rt-mapping-btn')?.addEventListener('click', app.handleRtMapping.bind(app));
    document.getElementById('cancel-rt-mapping-btn')?.addEventListener('click', app.closeRtMappingModal.bind(app));
    document.getElementById('edit-arquiteto-form')?.addEventListener('submit', app.handleEditArquiteto.bind(app));
    document.getElementById('close-edit-modal-x-btn')?.addEventListener('click', app.closeEditModal.bind(app));
    document.getElementById('gerar-pagamento-ficha-btn')?.addEventListener('click', app.handleGerarPagamentoFicha.bind(app));
    document.getElementById('consultar-vendas-btn')?.addEventListener('click', app.handleConsultarVendasClick.bind(app));
    document.getElementById('consultar-vendas-sysled-btn')?.addEventListener('click', app.handleConsultarVendasSysledClick.bind(app));
    document.getElementById('add-value-form')?.addEventListener('submit', app.handleAddValue.bind(app));
    document.getElementById('cancel-add-value-btn')?.addEventListener('click', app.closeAddValueModal.bind(app));
    document.getElementById('confirm-arquiteto-mapping-btn')?.addEventListener('click', app.handleArquitetoMapping.bind(app));
    document.getElementById('cancel-arquiteto-mapping-btn')?.addEventListener('click', app.closeArquitetoMappingModal.bind(app));
    document.getElementById('cancel-gerar-pagamentos-btn')?.addEventListener('click', () => document.getElementById('gerar-pagamentos-modal').classList.remove('flex'));
    document.getElementById('confirmar-geracao-comprovantes-btn')?.addEventListener('click', app.confirmarGeracaoComprovantes.bind(app));
    document.getElementById('close-comprovante-modal-btn')?.addEventListener('click', app.closeComprovanteModal.bind(app));
    document.getElementById('edit-rt-form')?.addEventListener('submit', app.handleUpdateRtValue.bind(app));
    document.getElementById('cancel-edit-rt-btn')?.addEventListener('click', app.closeEditRtModal.bind(app));
    document.getElementById('sales-history-table-container')?.addEventListener('click', app.handleSalesHistoryTableClick.bind(app));
    document.getElementById('close-sales-history-btn')?.addEventListener('click', app.closeSalesHistoryModal.bind(app));
    document.getElementById('close-sale-details-btn')?.addEventListener('click', app.closeSaleDetailsModal.bind(app));
    document.getElementById('import-single-sale-btn')?.addEventListener('click', app.handleImportSingleSale.bind(app));
    document.getElementById('close-comissao-manual-details-btn')?.addEventListener('click', app.closeComissaoManualDetailsModal.bind(app));


    // Listeners Específicos por View
    switch (viewName) {
        case 'relatorio-rt':
            document.getElementById('rt-file-input')?.addEventListener('change', app.handleRTFileSelect.bind(app));
            break;
        case 'consulta-sysled':
            document.getElementById('sysled-refresh-btn')?.addEventListener('click', app.fetchSysledData.bind(app));
            document.getElementById('sysled-filter-btn')?.addEventListener('click', app.renderSysledTable.bind(app));
            document.getElementById('sysled-clear-filter-btn')?.addEventListener('click', () => {
                document.getElementById('sysled-filter-data-inicio').value = '';
                document.getElementById('sysled-filter-data-fim').value = '';
                document.getElementById('sysled-filter-parceiro').value = '';
                document.getElementById('sysled-filter-excluir-parceiro').value = '';
                app.renderSysledTable();
            });
            document.getElementById('copy-to-rt-btn')?.addEventListener('click', app.handleCopyToRTClick.bind(app));
            document.getElementById('sysled-table-container')?.addEventListener('input', (e) => {
                if (e.target.classList.contains('sysled-column-filter')) {
                    app.renderSysledTable();
                }
            });
            app.renderSysledTable(); // Renderiza a tabela caso já existam dados
            break;
        case 'inclusao-manual':
            document.getElementById('add-comissao-manual-form')?.addEventListener('submit', app.handleAddComissaoManual.bind(app));
            document.getElementById('historico-manual-container')?.addEventListener('click', app.handleHistoricoManualClick.bind(app));
            app.renderHistoricoManual();
            break;
        case 'arquitetos':
            document.getElementById('add-arquiteto-form')?.addEventListener('submit', app.handleAddArquiteto.bind(app));
            document.getElementById('arquiteto-file-input')?.addEventListener('change', app.handleArquitetoFileUpload.bind(app));
            document.getElementById('arquitetos-table-container')?.addEventListener('click', app.handleArquitetosTableClick.bind(app));
            document.getElementById('export-csv-btn')?.addEventListener('click', app.exportArquitetosCSV.bind(app));
            document.getElementById('delete-all-arquitetos-btn')?.addEventListener('click', app.deleteAllArquitetos.bind(app));
            document.getElementById('arquiteto-search-input')?.addEventListener('input', () => app.renderArquitetosTable());
            document.getElementById('gerar-pagamentos-rt-btn')?.addEventListener('click', app.handleGerarPagamentosClick.bind(app));
            document.getElementById('arquitetos-table-container')?.addEventListener('click', app.handleSort.bind(app));
            app.renderArquitetosTable();
            break;
        case 'pontuacao':
            document.getElementById('add-pontos-form')?.addEventListener('submit', app.handleAddPontos.bind(app));
            app.renderRankingTable();
            app.populateArquitetoSelect();
            break;
        case 'comprovantes':
            const pagamentosContainer = document.getElementById('pagamentos-container');
            pagamentosContainer?.addEventListener('change', app.handlePagamentosChange.bind(app));
            pagamentosContainer?.addEventListener('click', app.handlePagamentosClick.bind(app));
            document.getElementById('pagamento-search-input')?.addEventListener('input', (e) => app.renderPagamentos(e.target.value.trim()));
            app.renderPagamentos();
            break;
        case 'arquivos-importados':
            document.getElementById('arquivos-importados-container')?.addEventListener('click', app.handleArquivosImportadosClick.bind(app));
            app.renderArquivosImportados();
            break;
        case 'resultados':
            document.getElementById('calculate-results-btn')?.addEventListener('click', app.renderResultados.bind(app));
            app.renderResultados();
            break;
    }
}
