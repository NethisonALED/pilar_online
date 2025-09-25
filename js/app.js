class RelacionamentoApp {
    constructor() {
        this.arquitetos = [];
        this.pontuacoes = {};
        this.pagamentos = {};
        this.importedFiles = {};
        this.comissoesManuais = []; // NOVA PROPRIEDADE
        this.tempRTData = [];
        this.tempArquitetoData = [];
        this.eligibleForPayment = [];
        this.schemaHasRtAcumulado = false;
        this.schemaHasRtTotalPago = false; // Flag para a nova coluna
        
        this.sysledData = [];
        this.sysledFilteredData = [];
        this.isSysledImport = false;
        
        // Estado de Ordenação da Tabela de Arquitetos
        this.sortColumn = 'nome';
        this.sortDirection = 'asc';

        this.init();
    }

    async init() {
        await this.loadData();
        this.initEventListeners();
        this.renderAll();
    }
    
    async loadData() {
        // Carregar Arquitetos
        const { data: arquitetosData, error: arqError } = await supabase.from('arquitetos').select('*');
        if (arqError) {
            console.error('Erro ao carregar arquitetos:', arqError);
        } else {
            this.arquitetos = arquitetosData || [];
            if (this.arquitetos.length > 0) {
                const firstArquiteto = this.arquitetos[0];
                this.schemaHasRtAcumulado = firstArquiteto.hasOwnProperty('rt_acumulado');
                this.schemaHasRtTotalPago = firstArquiteto.hasOwnProperty('rt_total_pago');
            }

            if (!this.schemaHasRtAcumulado) {
                console.warn(`
                    ATENÇÃO: A coluna 'rt_acumulado' não foi encontrada. 
                    Execute: ALTER TABLE public.arquitetos ADD COLUMN rt_acumulado NUMERIC DEFAULT 0;
                `);
            }
            if (!this.schemaHasRtTotalPago) {
                console.warn(`
                    ATENÇÃO: A coluna 'rt_total_pago' não foi encontrada.
                    Execute: ALTER TABLE public.arquitetos ADD COLUMN rt_total_pago NUMERIC DEFAULT 0;
                `);
            }

            this.pontuacoes = this.arquitetos.reduce((acc, arq) => {
                acc[arq.id] = arq.pontos || 0;
                return acc;
            }, {});
        }

        // Carregar Pagamentos
        const { data: pagamentosData, error: pagError } = await supabase.from('pagamentos').select('*');
        if(pagError) {
            console.error('Erro ao carregar pagamentos:', pagError);
        } else {
            this.pagamentos = (pagamentosData || []).reduce((acc, p) => {
                const dateKey = new Date(p.data_geracao + 'T00:00:00Z').toLocaleDateString('pt-BR');
                if(!acc[dateKey]) acc[dateKey] = [];
                acc[dateKey].push(p);
                return acc;
            }, {});
        }

        // Carregar Arquivos Importados
        const { data: filesData, error: filesError } = await supabase.from('arquivos_importados').select('*');
        if(filesError) {
            console.error('Erro ao carregar arquivos:', filesError);
        } else {
            this.importedFiles = (filesData || []).reduce((acc, f) => {
                const dateKey = new Date(f.data_importacao + 'T00:00:00Z').toLocaleDateString('pt-BR');
                acc[dateKey] = { name: f.name, dataUrl: f.dataUrl, id: f.id };
                return acc;
            }, {});
        }
        
        // Carregar Comissões Manuais
        const { data: comissoesData, error: comissoesError } = await supabase
            .from('comissoes_manuais')
            .select('*')
            .order('created_at', { ascending: false });

        if (comissoesError) {
            console.error('Erro ao carregar comissões manuais:', comissoesError);
             alert('A tabela "comissoes_manuais" não foi encontrada. Crie-a no Supabase para usar esta funcionalidade.');
        } else {
            this.comissoesManuais = comissoesData || [];
        }
    }
    
    initEventListeners() {
        // --- Navegação ---
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

        // --- Aba Importar Vendas ---
        document.getElementById('rt-file-input').addEventListener('change', this.handleRTFileSelect.bind(this));
        document.getElementById('confirm-rt-mapping-btn').addEventListener('click', this.handleRtMapping.bind(this));
        document.getElementById('cancel-rt-mapping-btn').addEventListener('click', this.closeRtMappingModal.bind(this));
        
        // --- NOVA: Aba Inclusão Manual ---
        document.getElementById('add-comissao-manual-form').addEventListener('submit', this.handleAddComissaoManual.bind(this));
        document.getElementById('historico-manual-container').addEventListener('click', this.handleHistoricoManualClick.bind(this));
        document.getElementById('close-comissao-manual-details-btn').addEventListener('click', this.closeComissaoManualDetailsModal.bind(this));

        // --- Aba Arquitetos ---
        document.getElementById('add-arquiteto-form').addEventListener('submit', this.handleAddArquiteto.bind(this));
        document.getElementById('arquiteto-file-input').addEventListener('change', this.handleArquitetoFileUpload.bind(this));
        document.getElementById('arquitetos-table-container').addEventListener('click', this.handleArquitetosTableClick.bind(this));
        // --- Ficha do Arquiteto (Edit Modal) ---
        document.getElementById('edit-arquiteto-form').addEventListener('submit', this.handleEditArquiteto.bind(this));
        document.getElementById('close-edit-modal-x-btn').addEventListener('click', this.closeEditModal.bind(this));
        document.getElementById('gerar-pagamento-ficha-btn').addEventListener('click', this.handleGerarPagamentoFicha.bind(this));
        document.getElementById('consultar-vendas-btn').addEventListener('click', this.handleConsultarVendasClick.bind(this));
        document.getElementById('consultar-vendas-sysled-btn').addEventListener('click', this.handleConsultarVendasSysledClick.bind(this));
        
        document.getElementById('add-value-form').addEventListener('submit', this.handleAddValue.bind(this));
        document.getElementById('cancel-add-value-btn').addEventListener('click', this.closeAddValueModal.bind(this));
        document.getElementById('export-csv-btn').addEventListener('click', this.exportArquitetosCSV.bind(this));
        document.getElementById('delete-all-arquitetos-btn').addEventListener('click', this.deleteAllArquitetos.bind(this));
        document.getElementById('rt-percentual').addEventListener('change', this.calculateRT.bind(this));
        document.getElementById('confirm-arquiteto-mapping-btn').addEventListener('click', this.handleArquitetoMapping.bind(this));
        document.getElementById('cancel-arquiteto-mapping-btn').addEventListener('click', this.closeArquitetoMappingModal.bind(this));
        document.getElementById('arquiteto-search-input').addEventListener('input', (e) => this.renderArquitetosTable());
        document.getElementById('gerar-pagamentos-rt-btn').addEventListener('click', this.handleGerarPagamentosClick.bind(this));
         // Adiciona listener para ordenação
        document.getElementById('arquitetos-table-container').addEventListener('click', this.handleSort.bind(this));

        // --- Modal de Geração de Pagamentos ---
        document.getElementById('cancel-gerar-pagamentos-btn').addEventListener('click', () => document.getElementById('gerar-pagamentos-modal').classList.remove('flex'));
        document.getElementById('confirmar-geracao-comprovantes-btn').addEventListener('click', this.confirmarGeracaoComprovantes.bind(this));

        // --- Aba Pontuação ---
        document.getElementById('add-pontos-form').addEventListener('submit', this.handleAddPontos.bind(this));

        // --- Aba Comprovantes ---
        const pagamentosContainer = document.getElementById('pagamentos-container');
        pagamentosContainer.addEventListener('change', this.handlePagamentosChange.bind(this));
        pagamentosContainer.addEventListener('click', this.handlePagamentosClick.bind(this));
        document.getElementById('close-comprovante-modal-btn').addEventListener('click', this.closeComprovanteModal.bind(this));
        document.getElementById('pagamento-search-input').addEventListener('input', (e) => this.renderPagamentos(e.target.value.trim()));
        document.getElementById('edit-rt-form').addEventListener('submit', this.handleUpdateRtValue.bind(this));
        document.getElementById('cancel-edit-rt-btn').addEventListener('click', this.closeEditRtModal.bind(this));

        // --- Modal Histórico de Vendas ---
        document.getElementById('sales-history-table-container').addEventListener('click', this.handleSalesHistoryTableClick.bind(this));
        document.getElementById('close-sales-history-btn').addEventListener('click', this.closeSalesHistoryModal.bind(this)); 
        
        // --- Modal Detalhes da Venda ---
        document.getElementById('close-sale-details-btn').addEventListener('click', this.closeSaleDetailsModal.bind(this));
        document.getElementById('import-single-sale-btn').addEventListener('click', this.handleImportSingleSale.bind(this));

        // --- Aba Arquivos Importados ---
        document.getElementById('arquivos-importados-container').addEventListener('click', this.handleArquivosImportadosClick.bind(this));
        
        // --- Aba Consulta Sysled ---
        document.getElementById('sysled-refresh-btn').addEventListener('click', this.fetchSysledData.bind(this));
        document.getElementById('sysled-filter-btn').addEventListener('click', this.renderSysledTable.bind(this));
        document.getElementById('sysled-clear-filter-btn').addEventListener('click', () => {
            document.getElementById('sysled-filter-data-inicio').value = '';
            document.getElementById('sysled-filter-data-fim').value = '';
            document.getElementById('sysled-filter-parceiro').value = '';
            document.getElementById('sysled-filter-excluir-parceiro').value = '';
            this.renderSysledTable();
        });
        document.getElementById('copy-to-rt-btn').addEventListener('click', this.handleCopyToRTClick.bind(this));
        document.getElementById('sysled-table-container').addEventListener('input', (e) => {
            if (e.target.classList.contains('sysled-column-filter')) {
                this.renderSysledTable();
            }
        });

        // --- Sidebar Toggle ---
        const sidebar = document.getElementById('app-sidebar');
        const toggleButton = document.getElementById('sidebar-toggle-btn');
        if (toggleButton && sidebar) {
            toggleButton.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });
        }

        // --- Aba Resultados ---
        document.getElementById('calculate-results-btn').addEventListener('click', this.renderResultados.bind(this));
    }

    renderAll() {
        this.renderArquitetosTable();
        this.renderRankingTable();
        this.populateArquitetoSelect();
        this.renderPagamentos();
        this.renderArquivosImportados();
        this.renderSysledTable();
        this.renderResultados();
        this.renderHistoricoManual(); // NOVA CHAMADA
        
        const gerarPagamentosBtn = document.getElementById('gerar-pagamentos-rt-btn');
        const isFeatureEnabled = this.schemaHasRtAcumulado && this.schemaHasRtTotalPago;
        
        if (!isFeatureEnabled) {
            gerarPagamentosBtn.disabled = true;
            gerarPagamentosBtn.title = "Funcionalidade desabilitada. Crie as colunas 'rt_acumulado' e 'rt_total_pago' no banco de dados.";
            gerarPagamentosBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
             gerarPagamentosBtn.disabled = false;
             gerarPagamentosBtn.title = "";
             gerarPagamentosBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
    
    // --- NOVA LÓGICA DE INCLUSÃO MANUAL ---

    async handleAddComissaoManual(e) {
        e.preventDefault();
        const form = e.target;
        const idParceiro = document.getElementById('manual-id-parceiro').value.trim();
        const idVenda = document.getElementById('manual-id-venda').value.trim();
        const valorVenda = parseFloat(document.getElementById('manual-valor-venda').value);

        if (!idParceiro || isNaN(valorVenda) || valorVenda <= 0) {
            alert('Por favor, preencha o ID do Parceiro e um Valor de Venda válido.');
            return;
        }

        // Validação para verificar se o id_venda já existe na tabela sysled_imports
        if (idVenda) {
            const { data: existingImport, error: checkError } = await supabase
                .from('sysled_imports')
                .select('id_pedido')
                .eq('id_pedido', idVenda)
                .maybeSingle();

            if (checkError) {
                console.error("Erro ao verificar sysled_imports:", checkError);
                alert('Erro ao verificar a existência da venda: ' + checkError.message);
                return;
            }

            if (existingImport) {
                alert(`Venda já importada: ${idVenda}`);
                return;
            }
        }

        const arquiteto = this.arquitetos.find(a => a.id === idParceiro);
        if (!arquiteto) {
            alert(`Arquiteto com ID ${idParceiro} não encontrado. Verifique o ID ou cadastre o arquiteto primeiro.`);
            return;
        }

        // 1. Salvar o registro da comissão manual
        const newComissao = {
            id_parceiro: idParceiro,
            id_venda: document.getElementById('manual-id-venda').value,
            valor_venda: valorVenda,
            data_venda: document.getElementById('manual-data-venda').value,
            consultor: document.getElementById('manual-consultor').value,
            justificativa: document.getElementById('manual-justificativa').value,
        };

        const { data: comissaoData, error: comissaoError } = await supabase
            .from('comissoes_manuais')
            .insert(newComissao)
            .select()
            .single();

        if (comissaoError) {
            console.error("Erro ao salvar comissão manual:", comissaoError);
            alert("Ocorreu um erro ao salvar a comissão. Verifique o console.");
            return;
        }

        // 2. Atualizar os dados do arquiteto
        const updatePayload = {
            valorVendasTotal: (arquiteto.valorVendasTotal || 0) + valorVenda,
            pontos: (this.pontuacoes[idParceiro] || 0) + Math.floor(valorVenda / 1000),
            salesCount: (arquiteto.salesCount || 0) + 1
        };

        if (this.schemaHasRtAcumulado) {
            const rtDaVenda = valorVenda * (arquiteto.rtPercentual || 0.05);
            updatePayload.rt_acumulado = parseFloat(arquiteto.rt_acumulado || 0) + rtDaVenda;
        }
        
        const { data: updatedArquiteto, error: updateError } = await supabase
            .from('arquitetos')
            .update(updatePayload)
            .eq('id', idParceiro)
            .select()
            .single();

        if (updateError) {
            console.error("Erro ao atualizar arquiteto:", updateError);
            alert("A comissão foi salva, mas ocorreu um erro ao atualizar os totais do arquiteto. Verifique o console.");
            // Aqui, poderíamos adicionar uma lógica para reverter a inserção da comissão, se necessário.
        } else {
             alert('Comissão manual adicionada com sucesso!');
        }

        // 3. (NOVO) Se houver ID da Venda, registrar em sysled_imports para evitar duplicatas
        if (idVenda) {
            const sysledImportPayload = {
                id_parceiro: idParceiro,
                valor_nota: valorVenda,
                data_finalizacao_prevenda: document.getElementById('manual-data-venda').value,
                id_pedido: idVenda
            };

            const { error: sysledError } = await supabase
                .from('sysled_imports')
                .insert(sysledImportPayload);

            if (sysledError) {
                console.error("Erro ao registrar na tabela sysled_imports:", sysledError);
                alert("A comissão foi processada, mas houve um erro ao registrar na tabela de controle de duplicatas (sysled_imports).");
            }
        }
        
        // 4. Atualizar UI
        form.reset();
        await this.loadData();
        this.renderAll();
    }

    renderHistoricoManual() {
        const container = document.getElementById('historico-manual-container');
        if (this.comissoesManuais.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhuma comissão manual adicionada ainda.</p>`;
            return;
        }

        const rowsHtml = this.comissoesManuais.map(c => `
            <tr class="border-b text-sm">
                <td class="p-2">${c.id_parceiro}</td>
                <td class="p-2">
                    <a href="#" class="view-comissao-details-btn text-blue-600 hover:underline" data-comissao-id="${c.id}">
                        ${c.id_venda || 'N/A'}
                    </a>
                </td>
                <td class="p-2">${this.formatApiDateToBR(c.data_venda)}</td>
                <td class="p-2 text-right">${this.formatCurrency(c.valor_venda)}</td>
                <td class="p-2" title="${c.justificativa}">${c.justificativa.substring(0, 30)}${c.justificativa.length > 30 ? '...' : ''}</td>
                <td class="p-2">${c.consultor || ''}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-100 text-xs uppercase">
                        <th class="p-2 text-left">ID Parceiro</th>
                        <th class="p-2 text-left">ID Venda</th>
                        <th class="p-2 text-left">Data</th>
                        <th class="p-2 text-right">Valor</th>
                        <th class="p-2 text-left">Justificativa</th>
                        <th class="p-2 text-left">Consultor</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }
    
    handleHistoricoManualClick(e) {
        const detailsBtn = e.target.closest('.view-comissao-details-btn');
        if (detailsBtn) {
            e.preventDefault();
            const comissaoId = detailsBtn.dataset.comissaoId;
            this.openComissaoManualDetailsModal(parseInt(comissaoId, 10));
        }
    }

    openComissaoManualDetailsModal(comissaoId) {
        const comissao = this.comissoesManuais.find(c => c.id === comissaoId);
        if (!comissao) {
            alert('Detalhes da comissão não encontrados.');
            return;
        }
        const arquiteto = this.arquitetos.find(a => a.id === comissao.id_parceiro);
        const nomeParceiro = arquiteto ? arquiteto.nome : 'Parceiro não encontrado';

        const contentContainer = document.getElementById('comissao-manual-details-content');
        contentContainer.innerHTML = `
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">ID Parceiro:</p>
                <p class="col-span-2">${comissao.id_parceiro}</p>
            </div>
             <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">Nome Parceiro:</p>
                <p class="col-span-2">${nomeParceiro}</p>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">ID Venda:</p>
                <p class="col-span-2">${comissao.id_venda || 'N/A'}</p>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">Valor Venda:</p>
                <p class="col-span-2">${this.formatCurrency(comissao.valor_venda)}</p>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">Data Venda:</p>
                <p class="col-span-2">${this.formatApiDateToBR(comissao.data_venda)}</p>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">Consultor:</p>
                <p class="col-span-2">${comissao.consultor || 'N/A'}</p>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <p class="font-semibold text-gray-600 col-span-1">Justificativa:</p>
                <p class="col-span-2 whitespace-pre-wrap">${comissao.justificativa}</p>
            </div>
        `;

        document.getElementById('comissao-manual-details-modal').classList.add('flex');
    }

    closeComissaoManualDetailsModal() {
        document.getElementById('comissao-manual-details-modal').classList.remove('flex');
    }

    async handleConsultarVendasClick(e) {
        e.preventDefault();
        const arquitetoId = document.getElementById('edit-arquiteto-original-id').value;
        if (!arquitetoId) {
            alert('ID do arquiteto não encontrado.');
            return;
        }

        const arquiteto = this.arquitetos.find(a => a.id === arquitetoId);
        const modalTitle = document.getElementById('sales-history-modal-title');
        const container = document.getElementById('sales-history-table-container');

        modalTitle.textContent = `Histórico de Vendas para ${arquiteto ? arquiteto.nome : arquitetoId}`;
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Consultando vendas... <i class="fas fa-spinner fa-spin"></i></p>`;
        document.getElementById('sales-history-modal').classList.add('flex');

        try {
            const { data, error } = await supabase
                .from('sysled_imports')
                .select('id_pedido, valor_nota, data_finalizacao_prevenda')
                .eq('id_parceiro', arquitetoId)
                .order('data_finalizacao_prevenda', { ascending: false });

            if (error) {
                throw error;
            }
            
            this.renderSalesHistoryModal(data, false); // Not from API

        } catch (error) {
            console.error('Erro ao consultar vendas:', error);
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao consultar vendas. Verifique o console.</p>`;
        }
    }

    async handleConsultarVendasSysledClick(e) {
        e.preventDefault();
        const arquitetoId = document.getElementById('edit-arquiteto-original-id').value;
        if (!arquitetoId) {
            alert('ID do arquiteto não encontrado.');
            return;
        }

        const arquiteto = this.arquitetos.find(a => a.id === arquitetoId);
        const modalTitle = document.getElementById('sales-history-modal-title');
        const container = document.getElementById('sales-history-table-container');

        modalTitle.textContent = `Vendas da API Sysled para ${arquiteto ? arquiteto.nome : arquitetoId}`;
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Consultando API Sysled... <i class="fas fa-spinner fa-spin"></i></p>`;
        document.getElementById('sales-history-modal').classList.add('flex');

        try {
            if (this.sysledData.length === 0) {
                await this.fetchSysledData();
            }

            if (this.sysledData.length === 0) {
                 container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum dado da API Sysled foi carregado. Tente atualizar na aba 'Consulta Sysled'.</p>`;
                 return;
            }
            
            const salesData = this.sysledData.filter(row => 
                row.idParceiro && 
                String(row.idParceiro) === arquitetoId &&
                row.statusPagamento == 1
            );
            
            const mappedSalesData = salesData.map(sale => ({
                id_pedido: sale.idPedido || 'N/A',
                valor_nota: this.parseApiNumber(sale.valorNota),
                data_finalizacao_prevenda: sale.dataFinalizacaoPrevenda
            }));

            this.renderSalesHistoryModal(mappedSalesData, true); // From API

        } catch (error) {
            console.error('Erro ao consultar vendas na Sysled:', error);
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao consultar vendas na API Sysled. Verifique o console.</p>`;
        }
    }

    renderSalesHistoryModal(salesData, isApiData) {
        const container = document.getElementById('sales-history-table-container');

        if (!salesData || salesData.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhuma venda encontrada para este parceiro.</p>`;
            return;
        }

        const rowsHtml = salesData.map(sale => {
            const idCellContent = isApiData 
                ? `<a href="#" class="view-sale-details-btn text-blue-600 hover:underline" data-pedido-id="${sale.id_pedido}">${sale.id_pedido}</a>`
                : sale.id_pedido;
            return `
                <tr class="border-b text-sm">
                    <td class="p-2">${idCellContent}</td>
                    <td class="p-2 text-right">${this.formatCurrency(sale.valor_nota)}</td>
                    <td class="p-2 text-center">${this.formatApiDateToBR(sale.data_finalizacao_prevenda)}</td>
                </tr>
            `
        }).join('');

        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-100 text-xs uppercase">
                        <th class="p-2 text-left">ID Pedido</th>
                        <th class="p-2 text-right">Valor da Nota</th>
                        <th class="p-2 text-center">Data da Venda</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    closeSalesHistoryModal() {
        document.getElementById('sales-history-modal').classList.remove('flex');
    }

    handleSalesHistoryTableClick(e) {
        const detailsBtn = e.target.closest('.view-sale-details-btn');
        if (detailsBtn) {
            e.preventDefault();
            const pedidoId = detailsBtn.dataset.pedidoId;
            this.openSaleDetailsModal(pedidoId);
        }
    }

    openSaleDetailsModal(pedidoId) {
        if (!pedidoId || pedidoId === 'N/A') {
            alert("ID do Pedido inválido.");
            return;
        }
        const saleData = this.sysledData.find(row => String(row.idPedido) === String(pedidoId));

        if (!saleData) {
            alert(`Detalhes para o pedido ${pedidoId} não foram encontrados nos dados da API.`);
            return;
        }

        const modalTitle = document.getElementById('sale-details-modal-title');
        const contentContainer = document.getElementById('sale-details-content');
        
        modalTitle.textContent = `Detalhes da Venda - Pedido ${pedidoId}`;
        document.getElementById('import-single-sale-btn').dataset.pedidoId = pedidoId;

        const detailsHtml = Object.entries(saleData).map(([key, value]) => {
            return `
                <tr class="border-b">
                    <td class="p-2 font-semibold text-gray-600 align-top">${key}</td>
                    <td class="p-2 text-gray-800">${value !== null && value !== undefined ? value : ''}</td>
                </tr>
            `;
        }).join('');

        contentContainer.innerHTML = `
            <table class="w-full text-sm">
                <tbody>
                    ${detailsHtml}
                </tbody>
            </table>
        `;

        document.getElementById('sale-details-modal').classList.add('flex');
    }

    closeSaleDetailsModal() {
        document.getElementById('sale-details-modal').classList.remove('flex');
    }

    async handleImportSingleSale(e) {
        const pedidoId = e.target.dataset.pedidoId;
        if (!pedidoId || pedidoId === 'N/A') {
            alert('ID do pedido inválido.');
            return;
        }

        // 1. Check if already imported
        const { data: existingImport, error: checkError } = await supabase
            .from('sysled_imports')
            .select('id_pedido')
            .eq('id_pedido', pedidoId)
            .maybeSingle();

        if (checkError) {
            alert('Erro ao verificar a venda: ' + checkError.message);
            return;
        }

        if (existingImport) {
            alert(`Venda ${pedidoId} já foi importada anteriormente.`);
            return;
        }

        // 2. Find sale data
        const saleData = this.sysledData.find(row => String(row.idPedido) === String(pedidoId));
        if (!saleData) {
            alert('Não foi possível encontrar os dados completos da venda. Tente atualizar a consulta Sysled.');
            return;
        }
        
        // 3. Map to the format processRTData expects
        const dataToProcess = [{
            id_parceiro: saleData.idParceiro,
            valor_venda: this.parseApiNumber(saleData.valorNota),
            parceiro: saleData.parceiro
        }];

        // 4. Process the data
        this.isSysledImport = false; // Ensure it's treated as a manual/single import, avoiding file save logic
        await this.processRTData(dataToProcess);

        // 5. Log the import
        const sysledImportPayload = {
            id_parceiro: saleData.idParceiro,
            valor_nota: this.parseApiNumber(saleData.valorNota),
            data_finalizacao_prevenda: saleData.dataFinalizacaoPrevenda,
            id_pedido: saleData.idPedido
        };
        const { error: insertError } = await supabase.from('sysled_imports').insert([sysledImportPayload]);
        if (insertError) {
            console.error("Erro ao registrar na tabela sysled_imports:", insertError);
            alert("A venda foi processada, mas houve um erro ao salvar o histórico de importação. Verifique o console.");
        }

        // 6. Close modals. The renderAll() is already called by processRTData.
        this.closeSaleDetailsModal();
        this.closeSalesHistoryModal();
    }


    // --- LÓGICA DE PAGAMENTO ---

    async handleGerarPagamentosClick() {
        if (!this.schemaHasRtAcumulado || !this.schemaHasRtTotalPago) {
            alert("Funcionalidade desabilitada. Verifique o console para instruções sobre como criar as colunas necessárias no banco de dados.");
            return;
        }

        // Garante que os dados de arquitetos estão sincronizados com o banco de dados antes de filtrar
        const { data: arquitetosData, error } = await supabase.from('arquitetos').select('*');
        if (error) {
            console.error("Erro ao buscar arquitetos atualizados:", error);
            alert("Não foi possível buscar os dados mais recentes. Tente novamente.");
            return;
        }
        this.arquitetos = arquitetosData || [];

        this.eligibleForPayment = this.arquitetos.filter(a => parseFloat(a.rt_acumulado || 0) >= 300);
        
        if (this.eligibleForPayment.length === 0) {
            alert('Nenhum arquiteto atingiu o valor mínimo de R$ 300,00 para pagamento.');
            return;
        }
        this.openGerarPagamentosModal();
    }

    openGerarPagamentosModal() {
        const container = document.getElementById('gerar-pagamentos-table-container');
        const modal = document.getElementById('gerar-pagamentos-modal');

        const rowsHtml = this.eligibleForPayment.map(a => `
            <tr class="border-b text-sm">
                <td class="p-2">${a.id}</td>
                <td class="p-2">${a.nome}</td>
                <td class="p-2 text-right font-semibold text-green-600">${this.formatCurrency(a.rt_acumulado || 0)}</td>
                <td class="p-2">${a.pix || 'Não cadastrado'}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-100 text-xs uppercase">
                        <th class="p-2 text-left">ID</th>
                        <th class="p-2 text-left">Nome</th>
                        <th class="p-2 text-right">Valor a Pagar</th>
                        <th class="p-2 text-left">Chave PIX</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>`;
        
        modal.classList.add('flex');
    }

    async confirmarGeracaoComprovantes() {
         if (!this.schemaHasRtAcumulado || !this.schemaHasRtTotalPago) {
            alert("Não é possível gerar comprovantes. Colunas necessárias estão faltando no banco de dados.");
            return;
        }
        if (this.eligibleForPayment.length === 0) {
            alert('Não há arquitetos elegíveis para gerar comprovantes.');
            return;
        }

        const todayDB = new Date().toISOString().slice(0, 10);
        
        const pagamentosParaInserir = this.eligibleForPayment.map(arquiteto => ({
            id_parceiro: arquiteto.id,
            parceiro: arquiteto.nome,
            rt_valor: arquiteto.rt_acumulado,
            pago: false,
            data_geracao: todayDB,
            comprovante: null
        }));

        // 1. Inserir os novos registros de pagamento
        const { error: insertError } = await supabase.from('pagamentos').insert(pagamentosParaInserir);

        if (insertError) {
            console.error("Erro ao gerar comprovantes:", insertError);
            alert("Ocorreu um erro ao gerar os comprovantes. Verifique o console.");
            return;
        }

        // 2. Atualizar os totais dos arquitetos
        const updatePromises = this.eligibleForPayment.map(arquiteto => {
            const valorPago = parseFloat(arquiteto.rt_acumulado || 0);
            const totalPagoAnterior = parseFloat(arquiteto.rt_total_pago || 0);
            
            const updatePayload = {
                rt_acumulado: 0,
                rt_total_pago: totalPagoAnterior + valorPago
            };
            return supabase.from('arquitetos').update(updatePayload).eq('id', arquiteto.id);
        });

        await Promise.all(updatePromises);

        alert(`${this.eligibleForPayment.length} comprovantes de pagamento gerados com sucesso!`);
        
        document.getElementById('gerar-pagamentos-modal').classList.remove('flex');
        this.eligibleForPayment = [];

        // 3. Recarregar dados e ir para a aba de comprovantes
        await this.loadData();
        this.renderAll();
        document.querySelector('.menu-link[data-tab="comprovantes"]').click();
    }

    async handleGerarPagamentoFicha() {
        const arquitetoId = document.getElementById('edit-arquiteto-original-id').value;
        if (!arquitetoId) return;

        const arquiteto = this.arquitetos.find(a => a.id === arquitetoId);
        if (!arquiteto) {
            alert('Arquiteto não encontrado.');
            return;
        }

        const valorAPagar = parseFloat(arquiteto.rt_acumulado || 0);
        if (valorAPagar <= 0) {
            alert('O arquiteto não possui saldo de RT acumulado para gerar pagamento.');
            return;
        }

        if (confirm(`Tem certeza que deseja gerar um pagamento de ${this.formatCurrency(valorAPagar)} para ${arquiteto.nome}? O saldo de RT acumulado será zerado.`)) {
            // 1. Criar o registro de pagamento
            const todayDB = new Date().toISOString().slice(0, 10);
            const pagamentoParaInserir = {
                id_parceiro: arquiteto.id,
                parceiro: arquiteto.nome,
                rt_valor: valorAPagar,
                pago: false,
                data_geracao: todayDB,
                comprovante: null
            };

            const { error: insertError } = await supabase.from('pagamentos').insert([pagamentoParaInserir]);

            if (insertError) {
                console.error("Erro ao gerar comprovante individual:", insertError);
                alert("Ocorreu um erro ao gerar o comprovante. Verifique o console.");
                return;
            }

            // 2. Atualizar o arquiteto
            const totalPagoAnterior = parseFloat(arquiteto.rt_total_pago || 0);
            const updatePayload = {
                rt_acumulado: 0,
                rt_total_pago: totalPagoAnterior + valorAPagar
            };

            const { error: updateError } = await supabase.from('arquitetos').update(updatePayload).eq('id', arquiteto.id);

            if (updateError) {
                 console.error("Erro ao zerar RT do arquiteto:", updateError);
                alert("O comprovante foi gerado, mas ocorreu um erro ao atualizar o saldo do arquiteto. Verifique o console.");
            } else {
                 alert(`Comprovante de pagamento gerado com sucesso para ${arquiteto.nome}!`);
            }


            // 3. Fechar modal, recarregar dados e ir para a aba de comprovantes
            this.closeEditModal();
            await this.loadData();
            this.renderAll();
            document.querySelector('.menu-link[data-tab="comprovantes"]').click();
        }
    }

    // --- LÓGICA DE PROCESSAMENTO DE VENDAS (ATUALIZADA) ---

    async processRTData(data) {
        const todayKey = new Date().toLocaleDateString('pt-BR');
        const todayDB = new Date().toISOString().slice(0, 10);

        let fileToSave = { name: '', dataUrl: '' };

        if (this.isSysledImport) {
            fileToSave.name = `importacao_sysled_${todayKey.replace(/\//g, '-')}.xlsx`;
            fileToSave.dataUrl = this.jsonToXLSXDataURL(this.tempRTData); // Usa tempRTData que tem todos os dados originais
        } else {
            const fileInput = document.getElementById('rt-file-input');
            const file = fileInput.files[0];
            if (file) {
                fileToSave.name = file.name;
                fileToSave.dataUrl = await this.fileToBase64(file);
            }
        }

        if (fileToSave.name && fileToSave.dataUrl) {
            const { data: fileData, error: fileError } = await supabase.from('arquivos_importados').insert({
                data_importacao: todayDB,
                name: fileToSave.name,
                dataUrl: fileToSave.dataUrl
            }).select().single();

            if (fileError) {
                console.error("Erro ao salvar arquivo importado:", fileError);
            } else {
                // Adiciona ao início do objeto para aparecer primeiro na lista
                this.importedFiles = { [todayKey]: { name: fileData.name, dataUrl: fileData.dataUrl, id: fileData.id }, ...this.importedFiles };
            }
        }


        const architectUpdates = {};

        for (const record of data) {
            if (!record.id_parceiro) continue;
            const partnerId = String(record.id_parceiro);
            const valorVenda = this.parseCurrency(record.valor_venda);

            let arquiteto = this.arquitetos.find(a => a.id === partnerId);
            
            if (!arquiteto) {
                const newArquitetoData = {
                    id: partnerId, nome: record.parceiro || 'Novo Parceiro',
                    salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05,
                    ...(this.schemaHasRtAcumulado && { rt_acumulado: 0 }),
                    ...(this.schemaHasRtTotalPago && { rt_total_pago: 0 })
                };

                const { data: createdArquiteto, error } = await supabase.from('arquitetos').insert(newArquitetoData).select().single();
                if (error) {
                    console.error(`Erro ao criar arquiteto ${partnerId}:`, error);
                    continue;
                }
                this.arquitetos.push(createdArquiteto);
                arquiteto = createdArquiteto;
            }

            if (!architectUpdates[partnerId]) {
                architectUpdates[partnerId] = {
                    valorVendasTotal: arquiteto.valorVendasTotal || 0,
                    salesCount: arquiteto.salesCount || 0,
                    pontos: arquiteto.pontos || 0,
                    ...(this.schemaHasRtAcumulado && { rt_acumulado: parseFloat(arquiteto.rt_acumulado || 0) })
                };
            }
            
            architectUpdates[partnerId].valorVendasTotal += valorVenda;
            architectUpdates[partnerId].salesCount += 1;
            const newPoints = Math.floor(valorVenda / 1000);
            if (newPoints > 0) architectUpdates[partnerId].pontos += newPoints;

            if (this.schemaHasRtAcumulado) {
                const percentualRT = arquiteto.rtPercentual || 0.05;
                const rtDaVenda = valorVenda * percentualRT;
                architectUpdates[partnerId].rt_acumulado += rtDaVenda;
            }
        }

        const updatePromises = Object.keys(architectUpdates).map(id => {
            const payload = architectUpdates[id];
            return supabase.from('arquitetos').update(payload).eq('id', id)
        });

        await Promise.all(updatePromises);

        alert('Dados de vendas processados! Os valores foram acumulados para os arquitetos.');
        
        await this.loadData();
        this.renderAll();
        this.isSysledImport = false;
    }

    renderPagamentos(filter = '') {
        const container = document.getElementById('pagamentos-container');
        container.innerHTML = '';
        const dates = Object.keys(this.pagamentos).sort((a,b) => new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-')));

        if (dates.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum pagamento foi gerado ainda.</p>`; return;
        }

        let hasResults = false;
        dates.forEach(date => {
            let pagamentosDoDia = this.pagamentos[date];
            if (filter) {
                pagamentosDoDia = pagamentosDoDia.filter(p => p.id_parceiro && p.id_parceiro.toString().includes(filter));
            }

            if (pagamentosDoDia.length > 0) {
                hasResults = true;
                const rowsHtml = pagamentosDoDia.map(p => {
                    const hasComprovante = p.comprovante && p.comprovante.url;
                    const statusText = hasComprovante ? 'Comprovante anexado' : 'Nenhum arquivo escolhido';
                    const statusColor = hasComprovante ? 'text-green-600 font-semibold' : 'text-gray-500';

                    return `
                        <tr class="border-b text-sm">
                            <td class="p-2">${p.id_parceiro}</td>
                            <td class="p-2">${p.parceiro}</td>
                            <td class="p-2 text-right font-semibold">
                                ${this.formatCurrency(p.rt_valor)}
                                <button class="edit-rt-btn text-blue-500 hover:text-blue-700 ml-2" title="Editar Valor RT" data-date="${date}" data-id="${p.id}"><i class="fas fa-edit fa-xs"></i></button>
                            </td>
                            <td class="p-2 text-center">
                                <input type="checkbox" class="pagamento-status h-5 w-5" data-date="${date}" data-id="${p.id}" ${p.pago ? 'checked' : ''}>
                            </td>
                            <td class="p-2">
                                <div class="flex items-center gap-2">
                                    <label for="comprovante-input-${p.id}" class="cursor-pointer bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs py-1 px-3 rounded-md whitespace-nowrap">Anexar</label>
                                    <input type="file" id="comprovante-input-${p.id}" class="comprovante-input file-input" data-date="${date}" data-id="${p.id}">
                                    <span class="file-status-text text-xs ${statusColor}">${statusText}</span>
                                </div>
                            </td>
                            <td class="p-2 text-center">
                                <button class="view-comprovante-btn text-blue-600 hover:underline" data-date="${date}" data-id="${p.id}" ${!hasComprovante ? 'disabled' : ''} style="${!hasComprovante ? 'opacity: 0.5; cursor: not-allowed;' : ''}">Ver</button>
                            </td>
                        </tr>`;
                }).join('');

                container.innerHTML += `
                    <div class="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-semibold">Pagamentos Gerados em ${date}</h2>
                            <div class="flex items-center gap-2">
                                <button class="gerar-relatorio-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Gerar Relatório</button>
                                <button class="download-xlsx-btn bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Baixar XLSX</button>
                                <button class="delete-pagamentos-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Excluir Lote</button>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID Parceiro</th><th class="p-2 text-left">Parceiro</th><th class="p-2 text-right">Valor RT</th><th class="p-2 text-center">Pago</th><th class="p-2 text-left">Anexar Comprovante</th><th class="p-2 text-center">Ver</th></tr></thead>
                                <tbody>${rowsHtml}</tbody>
                            </table>
                        </div>
                    </div>`;
            }
        });
        if (!hasResults) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum pagamento encontrado para o ID informado.</p>`;
        }
    }
    
    handleSort(e) {
        const header = e.target.closest('.sortable-header');
        if (!header) return;

        const column = header.dataset.sort;
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.renderArquitetosTable(); // Re-render with new sorting
    }

    renderArquitetosTable() {
        const container = document.getElementById('arquitetos-table-container');
        const filter = document.getElementById('arquiteto-search-input').value;
        let filteredArquitetos = [...this.arquitetos];

        if (filter) {
            const lowerCaseFilter = filter.toLowerCase();
            filteredArquitetos = this.arquitetos.filter(a => 
                (a.id || '').toString().toLowerCase().includes(lowerCaseFilter) || 
                (a.nome || '').toLowerCase().includes(lowerCaseFilter)
            );
        }

        // Lógica de ordenação
        filteredArquitetos.sort((a, b) => {
            const key = this.sortColumn;
            const dir = this.sortDirection === 'asc' ? 1 : -1;

            let valA = a[key] === null || a[key] === undefined ? '' : a[key];
            let valB = b[key] === null || b[key] === undefined ? '' : b[key];

            if (['valorVendasTotal', 'salesCount', 'rt_acumulado', 'rt_total_pago', 'pontos'].includes(key)) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }

            if (typeof valA === 'string') {
                return valA.localeCompare(valB) * dir;
            }
            
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        if (filteredArquitetos.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum arquiteto encontrado.</p>`;
            return;
        }

        const getSortIcon = (column) => {
            if (this.sortColumn !== column) return '<i class="fas fa-sort text-gray-300 ml-1"></i>';
            if (this.sortDirection === 'asc') return '<i class="fas fa-sort-up text-emerald-600 ml-1"></i>';
            return '<i class="fas fa-sort-down text-emerald-600 ml-1"></i>';
        };

        const headerRtAcumulado = this.schemaHasRtAcumulado ? `<th class="p-2 text-right sortable-header cursor-pointer" data-sort="rt_acumulado">RT Acumulado ${getSortIcon('rt_acumulado')}</th>` : '';
        const headerRtTotal = this.schemaHasRtTotalPago ? `<th class="p-2 text-right sortable-header cursor-pointer" data-sort="rt_total_pago">Total Pago ${getSortIcon('rt_total_pago')}</th>` : '';
        const headerRow = `<tr class="bg-gray-100 text-xs uppercase">
                            <th class="p-2 text-left sortable-header cursor-pointer" data-sort="id">ID ${getSortIcon('id')}</th>
                            <th class="p-2 text-left sortable-header cursor-pointer" data-sort="nome">Nome ${getSortIcon('nome')}</th>
                            <th class="p-2 text-center sortable-header cursor-pointer" data-sort="salesCount">Vendas ${getSortIcon('salesCount')}</th>
                            <th class="p-2 text-right sortable-header cursor-pointer" data-sort="valorVendasTotal">Valor Vendas ${getSortIcon('valorVendasTotal')}</th>
                            ${headerRtAcumulado}${headerRtTotal}
                            <th class="p-2 text-center">Ações</th></tr>`;

        const rows = filteredArquitetos.map(a => {
            let cellRtAcumulado = '';
            if (this.schemaHasRtAcumulado) {
                const rtAcumulado = a.rt_acumulado || 0;
                const isEligible = rtAcumulado >= 300;
                cellRtAcumulado = `<td class="p-2 text-right font-bold ${isEligible ? 'text-green-600' : ''}">${this.formatCurrency(rtAcumulado)}</td>`;
            }

            let cellRtTotal = '';
            if(this.schemaHasRtTotalPago) {
                cellRtTotal = `<td class="p-2 text-right">${this.formatCurrency(a.rt_total_pago || 0)}</td>`;
            }

            return `
            <tr class="border-b text-sm hover:bg-gray-50">
                <td class="p-2"><a href="#" class="id-link text-blue-600 hover:underline" data-id="${a.id}">${a.id}</a></td>
                <td class="p-2">${a.nome}</td>
                <td class="p-2 text-center">${a.salesCount || 0}</td>
                <td class="p-2 text-right">${this.formatCurrency(a.valorVendasTotal || 0)}</td>
                ${cellRtAcumulado}
                ${cellRtTotal}
                <td class="p-2 text-center">
                    <button class="add-value-btn text-green-500 hover:text-green-700" title="Adicionar Valor Manual" data-id="${a.id}"><i class="fas fa-dollar-sign"></i></button>
                    <button class="edit-btn text-blue-500 hover:text-blue-700 ml-4" title="Editar" data-id="${a.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn text-red-500 hover:text-red-700 ml-4" title="Apagar" data-id="${a.id}"><i class="fas fa-trash"></i></button>
                </td></tr>`;
        }).join('');
        
        container.innerHTML = `<div class="max-h-[65vh] overflow-y-auto"><table class="w-full"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div>`;
    }
    
    async handleAddArquiteto(e) {
        e.preventDefault();
        const id = document.getElementById('arquiteto-id').value;
        if (this.arquitetos.some(a => a.id === id)) { alert('ID já existe.'); return; }
        
        const newArquiteto = {
            id, nome: document.getElementById('arquiteto-nome').value, email: document.getElementById('arquiteto-email').value,
            telefone: document.getElementById('arquiteto-telefone').value, pix: document.getElementById('arquiteto-pix').value,
            salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05
        };
        if (this.schemaHasRtAcumulado) newArquiteto.rt_acumulado = 0;
        if (this.schemaHasRtTotalPago) newArquiteto.rt_total_pago = 0;
        
        const { data, error } = await supabase.from('arquitetos').insert(newArquiteto).select().single();
        if (error) { alert('Erro: ' + error.message); }
        else {
            this.arquitetos.push(data);
            this.pontuacoes[data.id] = data.pontos;
            this.renderAll();
            e.target.reset();
        }
    }

    async handleArquitetoMapping() {
        const mapping = {};
        document.getElementById('arquiteto-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });
        const novosArquitetos = this.tempArquitetoData.filter(row => {
            const id = row[mapping.id];
            return id && !this.arquitetos.some(a => a.id === id.toString());
        }).map(row => {
            const newRow = {
                id: String(row[mapping.id]), nome: row[mapping.nome] || '', email: row[mapping.email] || '',
                telefone: row[mapping.telefone] || '', pix: row[mapping.chave_pix] || '',
                salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05
            };
            if (this.schemaHasRtAcumulado) newRow.rt_acumulado = 0;
            if (this.schemaHasRtTotalPago) newRow.rt_total_pago = 0;
            return newRow;
        });
        
        if (novosArquitetos.length > 0) {
            const { error } = await supabase.from('arquitetos').insert(novosArquitetos);
            if (error) { alert("Erro ao importar: " + error.message); }
            else {
                alert(`${novosArquitetos.length} novos arquitetos importados.`);
                await this.loadData();
                this.renderAll();
            }
        } else {
            alert('Nenhum arquiteto novo para importar.');
        }
        this.closeArquitetoMappingModal();
    }
    
    async handleAddValue(e) {
        e.preventDefault();
        const id = document.getElementById('add-value-arquiteto-id').value;
        const valueToAdd = parseFloat(document.getElementById('add-value-input').value);
        const arquiteto = this.arquitetos.find(a => a.id === id);
        if (arquiteto && !isNaN(valueToAdd)) {
            
            const updatePayload = {
                valorVendasTotal: (arquiteto.valorVendasTotal || 0) + valueToAdd,
                pontos: (this.pontuacoes[id] || 0) + Math.floor(valueToAdd / 1000),
                salesCount: (arquiteto.salesCount || 0) + 1
            };

            if (this.schemaHasRtAcumulado) {
                const rtDaVenda = valueToAdd * (arquiteto.rtPercentual || 0.05);
                updatePayload.rt_acumulado = parseFloat(arquiteto.rt_acumulado || 0) + rtDaVenda;
            }

            const { data: updatedArquiteto, error } = await supabase.from('arquitetos').update(updatePayload).eq('id', id).select().single();
            
            if(error) { alert("Erro ao adicionar valor: " + error.message); }
            else {
                const index = this.arquitetos.findIndex(a => a.id === id);
                this.arquitetos[index] = updatedArquiteto;
                this.pontuacoes[id] = updatedArquiteto.pontos;
                this.renderAll();
                this.closeAddValueModal();
            }
        }
    }
    
    handlePagamentosChange(e) {
        if (e.target.matches('.pagamento-status')) {
            const { date, id } = e.target.dataset;
            this.updatePagamentoStatus(date, id, e.target.checked);
        }
        if (e.target.matches('.comprovante-input')) {
            const statusSpan = e.target.parentElement.querySelector('.file-status-text');
            if (e.target.files.length > 0 && statusSpan) {
                statusSpan.textContent = 'Comprovante anexado';
                statusSpan.className = 'file-status-text text-xs ml-2 text-green-600 font-semibold';
            }
            const { date, id } = e.target.dataset;
            this.handleComprovanteUpload(date, id, e.target.files[0]);
        }
    }

    handlePagamentosClick(e) {
        const viewBtn = e.target.closest('.view-comprovante-btn');
        const deleteBtn = e.target.closest('.delete-pagamentos-btn');
        const downloadBtn = e.target.closest('.download-xlsx-btn');
        const relatorioBtn = e.target.closest('.gerar-relatorio-btn');
        const editRtBtn = e.target.closest('.edit-rt-btn');

        if (viewBtn && !viewBtn.disabled) {
            e.preventDefault();
            this.openComprovanteModal(viewBtn.dataset.date, viewBtn.dataset.id);
        }
        if (deleteBtn) {
            this.deletePagamentosGroup(deleteBtn.dataset.date);
        }
        if (downloadBtn) {
            this.exportPagamentosXLSX(downloadBtn.dataset.date);
        }
        if (relatorioBtn) {
            this.generatePagamentoPrint(relatorioBtn.dataset.date);
        }
        if (editRtBtn) {
            this.openEditRtModal(editRtBtn.dataset.date, editRtBtn.dataset.id);
        }
    }

    async updatePagamentoStatus(date, pagamentoId, isChecked) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (pagamento) {
            const { error } = await supabase.from('pagamentos').update({ pago: isChecked }).eq('id', pagamento.id);
            if (error) alert("Erro ao atualizar status: " + error.message);
            else {
                pagamento.pago = isChecked;
                this.renderResultados(); // Recalcula os totais quando um pagamento é marcado/desmarcado
            }
        }
    }

    async handleComprovanteUpload(date, pagamentoId, file) {
        if (!file) return;
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if(pagamento){
            const dataUrl = await this.fileToBase64(file);
            pagamento.comprovante = { name: file.name, url: dataUrl };
            const { error } = await supabase.from('pagamentos').update({ comprovante: pagamento.comprovante }).eq('id', pagamento.id);
            if(error) alert("Erro ao salvar comprovante: " + error.message);
            else this.renderPagamentos();
        }
    }
    
    async deletePagamentosGroup(date) {
        if (confirm(`Tem certeza que deseja apagar os pagamentos gerados em ${date}?`)) {
            const idsToDelete = this.pagamentos[date].map(p => p.id);
            const { error } = await supabase.from('pagamentos').delete().in('id', idsToDelete);
            if (error) { alert("Erro ao apagar pagamentos: " + error.message); }
            else {
                delete this.pagamentos[date];
                this.renderPagamentos();
            }
        }
    }

    openComprovanteModal(date, pagamentoId) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (!pagamento) return;
        document.getElementById('comprovante-modal-title').textContent = `Detalhes de Pagamento para ${pagamento.parceiro}`;
        document.getElementById('comprovante-valor-rt').textContent = this.formatCurrency(pagamento.rt_valor || 0);
        
        const imgContainer = document.getElementById('comprovante-img-container');
        if (pagamento.comprovante && pagamento.comprovante.url) {
            imgContainer.innerHTML = `<img src="${pagamento.comprovante.url}" alt="${pagamento.comprovante.name}" class="max-w-full max-h-96 object-contain">`;
        } else {
            imgContainer.innerHTML = `<p class="text-gray-500">Nenhum comprovante anexado.</p>`;
        }
        document.getElementById('comprovante-modal').classList.add('flex');
    }
    
    openEditRtModal(date, pagamentoId) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (!pagamento) return;
        
        document.getElementById('edit-rt-pagamento-id').value = pagamento.id;
        document.getElementById('edit-rt-pagamento-date').value = date;
        document.getElementById('edit-rt-input').value = this.parseCurrency(pagamento.rt_valor);
        
        document.getElementById('edit-rt-modal').classList.add('flex');
    }

    closeEditRtModal() {
        document.getElementById('edit-rt-modal').classList.remove('flex');
        document.getElementById('edit-rt-form').reset();
    }

    async handleUpdateRtValue(e) {
        e.preventDefault();
        const pagamentoId = document.getElementById('edit-rt-pagamento-id').value;
        const date = document.getElementById('edit-rt-pagamento-date').value;
        const newValue = parseFloat(document.getElementById('edit-rt-input').value);

        if (isNaN(newValue) || newValue < 0) {
            alert('Por favor, insira um valor válido.');
            return;
        }

        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (pagamento) {
            const { error } = await supabase
                .from('pagamentos')
                .update({ rt_valor: newValue })
                .eq('id', pagamento.id);

            if (error) {
                alert("Erro ao atualizar o valor: " + error.message);
            } else {
                pagamento.rt_valor = newValue;
                this.renderPagamentos();
                this.renderResultados(); // Recalcula os totais
                this.closeEditRtModal();
                alert('Valor do RT atualizado com sucesso!');
            }
        }
    }


    exportPagamentosXLSX(date) {
        const data = this.pagamentos[date];
        if (!data || data.length === 0) { alert("Não há dados para exportar."); return; }
        const reportData = data.map(p => ({
            'ID Parceiro': p.id_parceiro,
            'Parceiro': p.parceiro,
            'Valor RT': this.parseCurrency(p.rt_valor),
            'Pago': p.pago ? 'Sim' : 'Não',
            'Data Geração': p.data_geracao,
        }));
        const worksheet = XLSX.utils.json_to_sheet(reportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Pagamentos");
        XLSX.writeFile(workbook, `Pagamentos_${date.replace(/\//g, '-')}.xlsx`);
    }
    
    renderResultados() {
        const pagamentosPagos = Object.values(this.pagamentos).flat().filter(p => p.pago);
        const totalRTs = pagamentosPagos.reduce((sum, p) => sum + this.parseCurrency(p.rt_valor || 0), 0);
        const quantidadeRTsPagas = pagamentosPagos.length;
        const rtMedia = quantidadeRTsPagas > 0 ? totalRTs / quantidadeRTsPagas : 0;

        document.getElementById('total-rt').textContent = this.formatCurrency(totalRTs);
        document.getElementById('total-rt-quantidade').textContent = quantidadeRTsPagas;
        document.getElementById('rt-media').textContent = this.formatCurrency(rtMedia);
    }

    async fetchSysledData() {
        const container = document.getElementById('sysled-table-container');
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Buscando dados na API Sysled... <i class="fas fa-spinner fa-spin"></i></p>`;
        
        try {
            const apiUrl = 'https://integration.sysled.com.br/n8n/api/?v_crm_oportunidades_propostas_up180dd=null';
            const apiKey = 'e4b6f9082f1b8a1f37ad5b56e637f3ec719ec8f0b6acdd093972f9c5bb29b9ed';
            const response = await fetch(apiUrl, { headers: { 'Authorization': apiKey } });
            if (!response.ok) throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
            const data = await response.json();
            this.sysledData = data;
            console.log("Dados da API Sysled carregados:", this.sysledData);
        } catch (error) {
            console.error("Erro ao buscar dados da API Sysled:", error);
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao carregar dados da API. Verifique o console.</p>`;
        } finally {
            this.renderSysledTable();
        }
    }
    
    renderSysledTable() {
        const container = document.getElementById('sysled-table-container');
        if (this.sysledData.length === 0) {
             container.innerHTML = `<div class="text-center text-gray-500 py-8"><p>Clique em "Atualizar Dados" para carregar as informações da API Sysled.</p></div>`
             return;
        }
        const dataInicio = document.getElementById('sysled-filter-data-inicio').value;
        const dataFim = document.getElementById('sysled-filter-data-fim').value;
        const parceiro = document.getElementById('sysled-filter-parceiro').value.toLowerCase();
        const excluirParceiroInput = document.getElementById('sysled-filter-excluir-parceiro').value;
        const columnFilters = {};
        container.querySelectorAll('.sysled-column-filter').forEach(input => {
            if (input.value) columnFilters[input.dataset.column] = input.value.toLowerCase();
        });
        let dataToRender = [...this.sysledData];
        if (excluirParceiroInput) {
            const excludedIds = excluirParceiroInput.split(/[\s,]+/).map(id => id.trim()).filter(id => id);
            if (excludedIds.length > 0) {
                const partnerIdField = Object.keys(dataToRender[0]).find(k => k.toLowerCase().includes('parceirocodigo'));
                if (partnerIdField) dataToRender = dataToRender.filter(row => !excludedIds.includes(String(row[partnerIdField])));
            }
        }
        const dateField = Object.keys(dataToRender[0]).find(k => k.toLowerCase().includes('data'));
        if (dataInicio && dateField) dataToRender = dataToRender.filter(row => row[dateField] && row[dateField].split('T')[0] >= dataInicio);
        if (dataFim && dateField) dataToRender = dataToRender.filter(row => row[dateField] && row[dateField].split('T')[0] <= dataFim);
        if (parceiro) {
            const partnerNameField = Object.keys(dataToRender[0]).find(k => k.toLowerCase().includes('parceiro') || k.toLowerCase().includes('arquiteto'));
            const partnerIdField = Object.keys(dataToRender[0]).find(k => k.toLowerCase().includes('parceirocodigo'));
            dataToRender = dataToRender.filter(row => 
                (partnerNameField && row[partnerNameField] && row[partnerNameField].toLowerCase().includes(parceiro)) ||
                (partnerIdField && row[partnerIdField] && String(row[partnerIdField]).toLowerCase().includes(parceiro))
            );
        }
        Object.keys(columnFilters).forEach(column => {
            const filterValue = columnFilters[column];
            dataToRender = dataToRender.filter(row => 
                row[column] !== null && row[column] !== undefined && String(row[column]).toLowerCase().includes(filterValue)
            );
        });
        this.sysledFilteredData = dataToRender;
        const headers = Object.keys(this.sysledData[0]);
        const headerHtml = headers.map(h => `<th class="p-2 text-left text-xs uppercase bg-gray-100 sticky top-0 z-10">${h.replace(/_/g, ' ')}</th>`).join('');
        const filterHtml = headers.map(h => `
            <th class="p-1 bg-gray-100 sticky top-8 z-10">
                <input type="text" class="sysled-column-filter w-full p-1 border rounded-md text-sm" placeholder="Filtrar..."
                       data-column="${h}" value="${columnFilters[h] ? columnFilters[h].replace(/"/g, '&quot;') : ''}">
            </th>`).join('');
        let rowsHtml = '';
        if (this.sysledFilteredData.length === 0) {
            rowsHtml = `<tr><td colspan="${headers.length}" class="text-center text-gray-500 py-8">Nenhum resultado encontrado.</td></tr>`;
        } else {
            rowsHtml = this.sysledFilteredData.map(row => {
                const cells = headers.map(h => {
                    let cellValue = row[h];
                    const lowerCaseHeader = h.toLowerCase();
                    if (lowerCaseHeader.includes('data')) cellValue = this.formatApiDateToBR(cellValue);
                    else if (lowerCaseHeader.includes('valor') || lowerCaseHeader.includes('total') || lowerCaseHeader.includes('valornota')) {
                        if (cellValue !== null && !isNaN(Number(String(cellValue)))) cellValue = this.formatApiNumberToBR(cellValue);
                    }
                    return `<td class="p-2">${cellValue === null || cellValue === undefined ? '' : cellValue}</td>`;
                }).join('');
                return `<tr class="border-b text-sm hover:bg-gray-50">${cells}</tr>`;
            }).join('');
        }
        container.innerHTML = `<div class="max-h-[65vh] overflow-auto"><table class="w-full min-w-max"><thead><tr>${headerHtml}</tr><tr>${filterHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    }
    
    async handleCopyToRTClick() {
        if (this.sysledFilteredData.length === 0) {
            alert('Não há dados filtrados para copiar. Por favor, filtre os dados primeiro ou atualize a consulta.');
            return;
        }
        this.isSysledImport = true;
        this.tempRTData = this.sysledFilteredData;
        alert(`${this.tempRTData.length} linha(s) selecionada(s). Agora, confirme o mapeamento para importar as vendas.`);
        const headers = this.tempRTData.length > 0 ? Object.keys(this.tempRTData[0]) : [];
        this.openRtMappingModal(headers);
    }

    handleRTFileSelect(event) {
        this.isSysledImport = false;
        const file = event.target.files[0];
        if (!file) return;
        document.getElementById('rt-file-name').textContent = `Arquivo: ${file.name}`;
        const readerProcess = new FileReader();
        readerProcess.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            this.tempRTData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
            const headers = this.tempRTData.length > 0 ? Object.keys(this.tempRTData[0]) : [];
            this.openRtMappingModal(headers);
        };
        readerProcess.readAsArrayBuffer(file);
    }

    openRtMappingModal(headers) {
        const form = document.getElementById('rt-mapping-form');
        const modal = document.getElementById('rt-mapping-modal');
        form.innerHTML = '';
        const requiredFields = { id_prevenda: 'ID Prevenda', data_venda: 'Data Venda', nome_cliente: 'Nome Cliente', valor_venda: 'Valor Venda', executivo: 'Executivo', id_parceiro: 'ID Parceiro', parceiro: 'Parceiro', loja: 'Loja' };
        const autoMapping = { id_prevenda: 'idPedido', data_venda: 'dataFinalizacaoPrevenda', nome_cliente: 'clienteFantasia', valor_venda: 'valorNota', executivo: 'consultor', id_parceiro: 'idParceiro', parceiro: 'parceiro', loja: 'idEmpresa' };
        for (const key in requiredFields) {
            const label = requiredFields[key];
            const selectOptions = headers.map(h => `<option value="${h}">${h}</option>`).join('');
            form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label for="map-${key}" class="font-medium text-gray-700">${label}</label><select id="map-${key}" name="${key}" class="w-full p-2 bg-gray-50 border rounded-lg"><option value="">Selecione...</option>${selectOptions}</select></div>`;
        }
        if(this.isSysledImport){
            for (const key in autoMapping) {
                if (requiredFields[key]) {
                    const selectElement = form.querySelector(`#map-${key}`);
                    if (selectElement && headers.includes(autoMapping[key])) {
                        selectElement.value = autoMapping[key];
                    }
                }
            }
        }
        modal.classList.add('flex');
    }

    closeRtMappingModal() {
        document.getElementById('rt-mapping-modal').classList.remove('flex');
        document.getElementById('rt-file-input').value = '';
        document.getElementById('rt-file-name').textContent = '';
    }

    async handleRtMapping() {
        const mapping = {};
        document.getElementById('rt-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });
    
        if (!mapping.id_parceiro || !mapping.valor_venda) {
            alert("Os campos 'ID Parceiro' e 'Valor Venda' são obrigatórios para o mapeamento.");
            return;
        }
    
        // Validação específica para importação Sysled
        if (this.isSysledImport && !mapping.id_prevenda) {
            alert("O campo 'ID Prevenda' (usado como ID do Pedido) é obrigatório para importações da Sysled para evitar duplicatas.");
            return;
        }
    
        let processedData = this.tempRTData.map(row => {
            const newRow = {};
            for (const key in mapping) { if (mapping[key]) newRow[key] = row[mapping[key]]; }
            return newRow;
        });
    
        if (this.isSysledImport) {
            processedData.forEach(item => {
                item.valor_venda = this.parseApiNumber(item.valor_venda);
            });
        }
    
        let dataToProcess = processedData;
        
        // Lógica de verificação de duplicatas para Sysled
        if (this.isSysledImport) {
            const pedidoIds = processedData.map(row => row.id_prevenda).filter(id => id);
            if (pedidoIds.length > 0) {
                const { data: existingImports, error } = await supabase
                    .from('sysled_imports')
                    .select('id_pedido')
                    .in('id_pedido', pedidoIds);

                if (error) {
                    alert('Erro ao verificar vendas existentes na tabela sysled_imports. Verifique se a tabela foi criada corretamente. ' + error.message);
                    this.closeRtMappingModal();
                    return;
                }

                const existingIdsSet = new Set(existingImports.map(item => String(item.id_pedido)));
                const alreadyImported = processedData.filter(row => existingIdsSet.has(String(row.id_prevenda)));
                dataToProcess = processedData.filter(row => !existingIdsSet.has(String(row.id_prevenda)));

                if (alreadyImported.length > 0) {
                    const importedIdsStr = alreadyImported.map(row => row.id_prevenda).join(', ');
                    alert(`Venda(s) já importada(s) e ignorada(s): ${importedIdsStr}`);
                }
            }
        }
    
        if (dataToProcess.length > 0) {
            // Processa apenas os novos dados para atualizar arquitetos
            await this.processRTData(dataToProcess);

            // Se for importação Sysled, salva o log na nova tabela
            if (this.isSysledImport) {
                const sysledImportsPayload = dataToProcess.map(row => ({
                    id_parceiro: row.id_parceiro,
                    valor_nota: row.valor_venda, // Já foi parseado para número
                    data_finalizacao_prevenda: row.data_venda, // Supabase lida com a conversão de string ISO para timestamp
                    id_pedido: row.id_prevenda
                }));

                const { error: insertError } = await supabase.from('sysled_imports').insert(sysledImportsPayload);

                if (insertError) {
                    console.error("Erro ao salvar na tabela sysled_imports:", insertError);
                    alert("Os dados foram processados, mas houve um erro ao salvar o histórico de importação Sysled. Verifique o console.");
                }
            }
        } else {
            alert("Nenhuma venda nova para importar.");
        }
        
        this.closeRtMappingModal();
    }

    handleArquitetosTableClick(e) {
        const idLink = e.target.closest('.id-link');
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const addValueBtn = e.target.closest('.add-value-btn');
        if (idLink) { e.preventDefault(); this.openEditModal(idLink.dataset.id); }
        if (editBtn) this.openEditModal(editBtn.dataset.id);
        if (deleteBtn) this.deleteArquiteto(deleteBtn.dataset.id);
        if (addValueBtn) this.openAddValueModal(addValueBtn.dataset.id);
    }

    handleArquitetoFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        document.getElementById('file-name-arquitetos').textContent = `Arquivo: ${file.name}`;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            this.tempArquitetoData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
            const headers = this.tempArquitetoData.length > 0 ? Object.keys(this.tempArquitetoData[0]) : [];
            this.openArquitetoMappingModal(headers);
        };
        reader.readAsArrayBuffer(file);
    }

    openArquitetoMappingModal(headers) {
        const form = document.getElementById('arquiteto-mapping-form');
        form.innerHTML = '';
        const requiredFields = { id: 'ID', nome: 'Nome', email: 'Email', telefone: 'Telefone', chave_pix: 'Chave PIX' };
        for (const key in requiredFields) {
            const label = requiredFields[key];
            const selectOptions = headers.map(h => `<option value="${h}">${h}</option>`).join('');
            form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label class="font-medium text-gray-700">${label}</label><select name="${key}" class="w-full p-2 bg-gray-50 border rounded-lg"><option value="">Selecione...</option>${selectOptions}</select></div>`;
        }
        document.getElementById('arquiteto-mapping-modal').classList.add('flex');
    }

    closeArquitetoMappingModal() {
        document.getElementById('arquiteto-mapping-modal').classList.remove('flex');
        document.getElementById('arquiteto-file-input').value = '';
        document.getElementById('file-name-arquitetos').textContent = '';
    }

    openEditModal(id) {
        const arquiteto = this.arquitetos.find(a => a.id === id);
        if (!arquiteto) return;
        document.getElementById('edit-arquiteto-original-id').value = arquiteto.id;
        document.getElementById('edit-arquiteto-id').textContent = arquiteto.id;
        document.getElementById('edit-arquiteto-nome').value = arquiteto.nome;
        document.getElementById('edit-arquiteto-email').value = arquiteto.email;
        document.getElementById('edit-arquiteto-telefone').value = arquiteto.telefone;
        document.getElementById('edit-arquiteto-pix').value = arquiteto.pix;
        document.getElementById('edit-arquiteto-vendas').value = arquiteto.salesCount || 0;
        document.getElementById('rt-valor-vendas').textContent = this.formatCurrency(arquiteto.valorVendasTotal || 0);
        document.getElementById('rt-percentual').value = arquiteto.rtPercentual || 0.05;

        if(this.schemaHasRtAcumulado) {
            document.getElementById('edit-arquiteto-rt-acumulado').textContent = this.formatCurrency(arquiteto.rt_acumulado || 0);
        }
         if(this.schemaHasRtTotalPago) {
            document.getElementById('edit-arquiteto-rt-total-pago').textContent = this.formatCurrency(arquiteto.rt_total_pago || 0);
        }

        document.getElementById('edit-arquiteto-modal').classList.add('flex');
        this.calculateRT();
    }

    closeEditModal() { document.getElementById('edit-arquiteto-modal').classList.remove('flex'); }
    
    calculateRT() {
        const valorTotal = this.parseCurrency(document.getElementById('rt-valor-vendas').textContent);
        const percentual = parseFloat(document.getElementById('rt-percentual').value);
        document.getElementById('rt-valor-calculado').textContent = this.formatCurrency(valorTotal * percentual);
    }

    async handleEditArquiteto(e) {
        e.preventDefault();
        const originalId = document.getElementById('edit-arquiteto-original-id').value;
        const arquiteto = this.arquitetos.find(a => a.id === originalId);
        if (!arquiteto) {
            alert('Arquiteto não encontrado!');
            return;
        }

        const updatedData = {
            nome: document.getElementById('edit-arquiteto-nome').value, 
            email: document.getElementById('edit-arquiteto-email').value,
            telefone: document.getElementById('edit-arquiteto-telefone').value, 
            pix: document.getElementById('edit-arquiteto-pix').value,
            salesCount: parseInt(document.getElementById('edit-arquiteto-vendas').value, 10) || 0,
            rtPercentual: parseFloat(document.getElementById('rt-percentual').value)
        };

        // Se a porcentagem de RT mudou, recalcula o valor acumulado.
        if (this.schemaHasRtAcumulado && updatedData.rtPercentual !== arquiteto.rtPercentual) {
            const valorVendasTotal = arquiteto.valorVendasTotal || 0;
            const rtTotalPago = arquiteto.rt_total_pago || 0;
            const totalComissaoCalculada = valorVendasTotal * updatedData.rtPercentual;
            
            // O novo valor acumulado é o total de comissão recalculado menos o que já foi pago.
            updatedData.rt_acumulado = totalComissaoCalculada - rtTotalPago;
        }
        
        const { data, error } = await supabase.from('arquitetos').update(updatedData).eq('id', originalId).select().single();
        if (error) { 
            alert("Erro ao salvar: " + error.message); 
        } else {
            const index = this.arquitetos.findIndex(a => a.id === originalId);
            this.arquitetos[index] = { ...this.arquitetos[index], ...data };
            this.renderAll();
            this.closeEditModal();
        }
    }

    async deleteArquiteto(id) {
        if (confirm(`Tem certeza que deseja apagar o arquiteto com ID ${id}?`)) {
            const { error } = await supabase.from('arquitetos').delete().eq('id', id);
            if (error) { alert("Erro ao apagar: " + error.message); }
            else {
                this.arquitetos = this.arquitetos.filter(a => a.id !== id);
                delete this.pontuacoes[id];
                this.renderAll();
            }
        }
    }

    async deleteAllArquitetos() {
        if (confirm('TEM CERTEZA? Esta ação apagará TODOS os cadastros de arquitetos, pagamentos e arquivos importados de forma irreversível.')) {
            
            const [arqResponse, pagResponse, fileResponse] = await Promise.all([
                supabase.from('arquitetos').delete().like('id', '%'), // IDs de arquiteto são strings
                supabase.from('pagamentos').delete().gt('id', 0),     // IDs de pagamento são números
                supabase.from('arquivos_importados').delete().gt('id', 0) // IDs de arquivo são números
            ]);

            let hasError = false;
            if (arqResponse.error) {
                console.error("Erro ao apagar arquitetos:", arqResponse.error);
                hasError = true;
            }
            if (pagResponse.error) {
                console.error("Erro ao apagar pagamentos:", pagResponse.error);
                hasError = true;
            }
            if (fileResponse.error) {
                console.error("Erro ao apagar arquivos importados:", fileResponse.error);
                hasError = true;
            }

            if (hasError) {
                alert("Ocorreu um ou mais erros ao apagar os dados. Verifique o console para mais detalhes.");
            } else {
                alert('Todos os dados de arquitetos, pagamentos e arquivos foram apagados com sucesso.');
            }
            
            this.arquitetos = [];
            this.pontuacoes = {};
            this.pagamentos = {};
            this.importedFiles = {};
            this.renderAll();
        }
    }

    openAddValueModal(id) {
        const arquiteto = this.arquitetos.find(a => a.id === id);
        if (!arquiteto) return;
        document.getElementById('add-value-modal-title').textContent = `Adicionar Venda Manual para ${arquiteto.nome}`;
        document.getElementById('add-value-arquiteto-id').value = id;
        document.getElementById('add-value-modal').classList.add('flex');
    }

    closeAddValueModal() {
        document.getElementById('add-value-modal').classList.remove('flex');
        document.getElementById('add-value-form').reset();
    }

    exportArquitetosCSV() {
        if (this.arquitetos.length === 0) { alert("Não há dados para exportar."); return; }
        const data = this.arquitetos.map(a => {
            const row = {
                id: a.id, nome: a.nome, email: a.email, telefone: a.telefone, pix: a.pix,
                quantidade_vendas: a.salesCount || 0, valor_total_vendas: a.valorVendasTotal || 0,
                pontos: this.pontuacoes[a.id] || 0
            };
            if (this.schemaHasRtAcumulado) row.rt_acumulado = a.rt_acumulado || 0;
            if (this.schemaHasRtTotalPago) row.rt_total_pago = a.rt_total_pago || 0;
            return row;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Arquitetos");
        XLSX.writeFile(wb, "cadastro_arquitetos.xlsx");
    }

    async handleAddPontos(e) {
        e.preventDefault();
        const arquitetoId = document.getElementById('arquiteto-select').value;
        const pontos = parseInt(document.getElementById('pontos-valor').value, 10);
        const arquiteto = this.arquitetos.find(a => a.id === arquitetoId);
        if (arquiteto && !isNaN(pontos)) {
            const newPoints = (this.pontuacoes[arquitetoId] || 0) + pontos;
            const { error } = await supabase.from('arquitetos').update({ pontos: newPoints }).eq('id', arquitetoId);
            if (error) { alert("Erro ao atualizar pontos: " + error.message); }
            else {
                this.pontuacoes[arquitetoId] = newPoints;
                arquiteto.pontos = newPoints;
                this.renderRankingTable();
                e.target.reset();
            }
        }
    }
    
    closeComprovanteModal() {
        document.getElementById('comprovante-modal').classList.remove('flex');
    }
    
    handleArquivosImportadosClick(e) {
        const downloadBtn = e.target.closest('.download-arquivo-btn');
        if (downloadBtn) {
            e.preventDefault();
            this.downloadImportedFile(downloadBtn.dataset.date);
        }
    }

    downloadImportedFile(date) {
        const fileInfo = this.importedFiles[date];
        if (fileInfo) {
            const link = document.createElement('a');
            link.href = fileInfo.dataUrl;
            link.download = fileInfo.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    renderRankingTable() {
        const container = document.getElementById('ranking-table-container');
        const ranking = this.arquitetos.map(a => ({ ...a, pontos: this.pontuacoes[a.id] || 0 })).sort((a, b) => b.pontos - a.pontos);
        if (ranking.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum arquiteto para exibir.</p>`; return;
        }
        const rows = ranking.map(a => `<tr class="border-b text-sm"><td class="p-2">${a.id}</td><td class="p-2">${a.nome}</td><td class="p-2 font-bold">${a.pontos}</td></tr>`).join('');
        container.innerHTML = `<table class="w-full"><thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID</th><th class="p-2 text-left">Nome</th><th class="p-2 text-left">Pontos</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    
    populateArquitetoSelect() {
        const select = document.getElementById('arquiteto-select');
        select.innerHTML = '<option value="">Selecione um arquiteto</option>';
        this.arquitetos.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(a => {
            select.innerHTML += `<option value="${a.id}">${a.nome}</option>`;
        });
    }
    
    renderArquivosImportados() {
        const container = document.getElementById('arquivos-importados-container');
        container.innerHTML = '';
        const dates = Object.keys(this.importedFiles).sort((a,b) => new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-')));
        if (dates.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum arquivo foi importado.</p>`; return;
        }
        dates.forEach(date => {
            const fileInfo = this.importedFiles[date];
            container.innerHTML += `
                <div class="bg-white rounded-2xl shadow-lg p-6">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold text-lg">Importação de ${date}</h3>
                            <p class="text-sm text-gray-500 mt-1">${fileInfo.name}</p>
                        </div>
                        <button class="download-arquivo-btn bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2" data-date="${date}">
                            <i class="fas fa-download"></i> Baixar
                        </button>
                    </div>
                </div>`;
        });
    }
    
    generatePagamentoPrint(date) {
        const data = this.pagamentos[date];
        if (!data || data.length === 0) {
            alert('Não há dados de pagamento para gerar relatório para esta data.');
            return;
        }

        const grandTotalRt = data.reduce((sum, p) => sum + this.parseCurrency(p.rt_valor || 0), 0);

        const tableRowsHtml = data.sort((a, b) => a.parceiro.localeCompare(b.parceiro)).map(p => `
            <tr class="border-b text-sm">
                <td class="p-2">${p.id_parceiro}</td>
                <td class="p-2">${p.parceiro}</td>
                <td class="p-2 text-right">${this.formatCurrency(p.rt_valor)}</td>
            </tr>
        `).join('');

        const reportTableHtml = `
            <div class="report-section">
                <h2 class="text-xl font-bold mb-4">Relatório de Pagamento - ${date}</h2>
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-100 text-xs uppercase">
                            <th class="p-2 text-left">ID Parceiro</th>
                            <th class="p-2 text-left">Parceiro</th>
                            <th class="p-2 text-right">Valor do RT</th>
                        </tr>
                    </thead>
                    <tbody>${tableRowsHtml}</tbody>
                </table>
            </div>`;

        const printTemplate = `
            <html>
                <head>
                    <title>Relatório de Pagamento - ${date}</title>
                    <script src="https://cdn.tailwindcss.com"><\/script>
                    <style>
                        body { font-family: 'Inter', sans-serif; }
                        @media print { .no-print { display: none; } }
                    </style>
                </head>
                <body class="p-8 bg-gray-100">
                    <div class="no-print text-center mb-8">
                        <button onclick="window.print()" class="bg-blue-600 text-white py-2 px-6 rounded">Imprimir</button>
                    </div>
                    <div class="max-w-5xl mx-auto bg-white p-8 rounded shadow">
                        ${reportTableHtml}
                        <div class="mt-8 text-right">
                            <h3 class="text-xl font-bold">Soma Total (RT) a Pagar</h3>
                            <p class="text-3xl font-bold mt-1 text-emerald-600">${this.formatCurrency(grandTotalRt)}</p>
                        </div>
                    </div>
                </body>
            </html>`;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printTemplate);
        printWindow.document.close();
    }

    // --- MÉTODOS UTILITÁRIOS ---
    fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    jsonToXLSXDataURL(jsonData) {
        const ws = XLSX.utils.json_to_sheet(jsonData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sysled Import");
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
    }

    parseApiNumber(value) {
        if (value === null || value === undefined) return 0;
        return Number(String(value).replace(',', '.')) || 0;
    }

    parseCurrency(value) {
        if (typeof value === 'number') return value;
        if (typeof value !== 'string' || value === null) return 0;
        return parseFloat(String(value).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) || 0;
    }

    formatCurrency(value) {
        const number = this.parseCurrency(value);
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    formatApiDateToBR(dateString) {
         if (!dateString || typeof dateString !== 'string') return '';
         const datePart = dateString.split('T')[0];
         const parts = datePart.split('-');
         if (parts.length !== 3) return dateString; 
         const [year, month, day] = parts;
         return `${day}/${month}/${year}`;
    }
    formatApiNumberToBR(value) {
        if (value === null || value === undefined || value === '') return '';
        const number = this.parseApiNumber(value);
        if (isNaN(number)) return value;
        return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}
