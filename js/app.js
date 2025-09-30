import { supabase, parseCurrency, formatCurrency, fileToBase64, jsonToXLSXDataURL, formatApiDateToBR, formatApiNumberToBR, parseApiNumber } from './utils.js';
import { initializeEventListeners } from './events.js';

class RelacionamentoApp {
    constructor() {
        // Estado da aplicação
        this.arquitetos = [];
        this.pontuacoes = {};
        this.pagamentos = {};
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
        
        // Estado de ordenação da tabela de arquitetos
        this.sortColumn = 'nome';
        this.sortDirection = 'asc';

        this.init();
    }

    /**
     * Inicializa a aplicação, carregando dados e configurando os event listeners.
     */
    async init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.currentUserEmail = session.user.email;
        }
        await this.loadData();
        initializeEventListeners(this);
        this.renderAll();
    }
    
    /**
     * Carrega todos os dados iniciais do Supabase.
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
            this.pagamentos = (pagRes.data || []).reduce((acc, p) => {
                const dateKey = new Date(p.data_geracao + 'T00:00:00Z').toLocaleDateString('pt-BR');
                if (!acc[dateKey]) acc[dateKey] = [];
                acc[dateKey].push(p);
                return acc;
            }, {});
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
    }
        
    /**
     * Renderiza ou atualiza todos os componentes visuais da aplicação.
     */
    renderAll() {
        this.renderArquitetosTable();
        this.renderRankingTable();
        this.populateArquitetoSelect();
        this.renderPagamentos();
        this.renderArquivosImportados();
        this.renderHistoricoManual();
        this.renderResultados();
        this.renderEventosLog(); // Renderiza a tabela de logs
        this.checkPaymentFeature();
        console.log("Todos os componentes foram renderizados.");
    }
    
    // --- MÉTODOS DE RENDERIZAÇÃO E UI ---
    
    renderArquitetosTable() {
        const container = document.getElementById('arquitetos-table-container');
        if (!container) return;
        const filter = document.getElementById('arquiteto-search-input').value.toLowerCase();
        let filteredArquitetos = this.arquitetos.filter(a => 
            (a.id || '').toString().toLowerCase().includes(filter) || 
            (a.nome || '').toLowerCase().includes(filter)
        );

        filteredArquitetos.sort((a, b) => {
            const key = this.sortColumn;
            const dir = this.sortDirection === 'asc' ? 1 : -1;
            let valA = a[key] ?? '';
            let valB = b[key] ?? '';
            if (['valorVendasTotal', 'salesCount', 'rt_acumulado', 'rt_total_pago', 'pontos'].includes(key)) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            }
            if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        if (filteredArquitetos.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-4">Nenhum arquiteto encontrado.</p>`;
            return;
        }

        const getSortIcon = (column) => {
            if (this.sortColumn !== column) return '<i class="fas fa-sort text-gray-300 ml-1"></i>';
            return this.sortDirection === 'asc' ? '<i class="fas fa-sort-up text-emerald-600 ml-1"></i>' : '<i class="fas fa-sort-down text-emerald-600 ml-1"></i>';
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
                cellRtAcumulado = `<td class="p-2 text-right font-bold ${rtAcumulado >= 300 ? 'text-green-600' : ''}">${formatCurrency(rtAcumulado)}</td>`;
            }
            const cellRtTotal = this.schemaHasRtTotalPago ? `<td class="p-2 text-right">${formatCurrency(a.rt_total_pago || 0)}</td>` : '';
            return `<tr class="border-b text-sm hover:bg-gray-50">
                <td class="p-2"><a href="#" class="id-link text-blue-600 hover:underline" data-id="${a.id}">${a.id}</a></td>
                <td class="p-2">${a.nome}</td>
                <td class="p-2 text-center">${a.salesCount || 0}</td>
                <td class="p-2 text-right">${formatCurrency(a.valorVendasTotal || 0)}</td>
                ${cellRtAcumulado}${cellRtTotal}
                <td class="p-2 text-center">
                    <button class="add-value-btn text-green-500 hover:text-green-700" title="Adicionar Valor Manual" data-id="${a.id}"><i class="fas fa-dollar-sign"></i></button>
                    <button class="edit-btn text-blue-500 hover:text-blue-700 ml-4" title="Editar" data-id="${a.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn text-red-500 hover:text-red-700 ml-4" title="Apagar" data-id="${a.id}"><i class="fas fa-trash"></i></button>
                </td></tr>`;
        }).join('');
        
        container.innerHTML = `<div class="max-h-[65vh] overflow-y-auto"><table class="w-full"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div>`;
    }

    renderPagamentos(filter = '') {
        const container = document.getElementById('pagamentos-container');
        if (!container) return;
        container.innerHTML = '';
        const dates = Object.keys(this.pagamentos).sort((a,b) => new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-')));
        if (dates.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500">Nenhum pagamento foi gerado ainda.</p>`; return;
        }

        let hasResults = false;
        dates.forEach(date => {
            let pagamentosDoDia = this.pagamentos[date].filter(p => !filter || (p.id_parceiro && p.id_parceiro.toString().includes(filter)));
            if (pagamentosDoDia.length > 0) {
                hasResults = true;
                const rowsHtml = pagamentosDoDia.map(p => {
                    const hasComprovante = p.comprovante && p.comprovante.url;
                    return `<tr class="border-b text-sm">
                                <td class="p-2">${p.id_parceiro}</td><td class="p-2">${p.parceiro}</td>
                                <td class="p-2 text-right font-semibold">${formatCurrency(p.rt_valor)}<button class="edit-rt-btn text-blue-500 hover:text-blue-700 ml-2" title="Editar Valor RT" data-date="${date}" data-id="${p.id}"><i class="fas fa-edit fa-xs"></i></button></td>
                                <td class="p-2 text-center"><input type="checkbox" class="pagamento-status h-5 w-5" data-date="${date}" data-id="${p.id}" ${p.pago ? 'checked' : ''}></td>
                                <td class="p-2"><div class="flex items-center gap-2"><label for="comprovante-input-${p.id}" class="cursor-pointer bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs py-1 px-3 rounded-md whitespace-nowrap">Anexar</label><input type="file" id="comprovante-input-${p.id}" class="comprovante-input file-input" data-date="${date}" data-id="${p.id}"><span class="file-status-text text-xs ${hasComprovante ? 'text-green-600 font-semibold' : 'text-gray-500'}">${hasComprovante ? 'Comprovante anexado' : 'Nenhum arquivo'}</span></div></td>
                                <td class="p-2 text-center"><button class="view-comprovante-btn text-blue-600 hover:underline" data-date="${date}" data-id="${p.id}" ${!hasComprovante ? 'disabled' : ''} style="${!hasComprovante ? 'opacity: 0.5; cursor: not-allowed;' : ''}">Ver</button></td>
                            </tr>`;
                }).join('');
                container.innerHTML += `<div class="bg-white rounded-2xl shadow-lg p-6 sm:p-8"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-semibold">Pagamentos Gerados em ${date}</h2><div class="flex items-center gap-2"><button class="gerar-relatorio-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Gerar Relatório</button><button class="download-xlsx-btn bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Baixar XLSX</button><button class="delete-pagamentos-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-xs" data-date="${date}">Excluir Lote</button></div></div><div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID Parceiro</th><th class="p-2 text-left">Parceiro</th><th class="p-2 text-right">Valor RT</th><th class="p-2 text-center">Pago</th><th class="p-2 text-left">Anexar Comprovante</th><th class="p-2 text-center">Ver</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
            }
        });
        if (!hasResults && filter) container.innerHTML = `<p class="text-center text-gray-500">Nenhum pagamento encontrado para o ID informado.</p>`;
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
            container.innerHTML += `<div class="bg-white rounded-2xl shadow-lg p-6"><div class="flex justify-between items-center"><div><h3 class="font-semibold text-lg">Importação de ${date}</h3><p class="text-sm text-gray-500 mt-1">${fileInfo.name}</p></div><button class="download-arquivo-btn bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2" data-date="${date}"><i class="fas fa-download"></i> Baixar</button></div></div>`;
        });
    }

    renderHistoricoManual() {
        const container = document.getElementById('historico-manual-container');
        if (!container) return;
    
        let rowsHtml = '';
        if (this.comissoesManuais.length === 0) {
            rowsHtml = `<tr><td colspan="7" class="text-center text-gray-500 py-4">Nenhuma comissão manual adicionada ainda.</td></tr>`;
        } else {
            rowsHtml = this.comissoesManuais.map(c => {
                const status = c.status || 'pendente';
                let statusColor;
                if (status === 'aprovada') {
                    statusColor = 'bg-green-100 text-green-800';
                } else if (status === 'Recusada Gestão') {
                    statusColor = 'bg-red-100 text-red-800';
                } else {
                    statusColor = 'bg-yellow-100 text-yellow-800';
                }
                return `
                <tr class="border-b text-sm hover:bg-gray-50">
                    <td class="p-2">${c.id_parceiro}</td>
                    <td class="p-2"><a href="#" class="view-comissao-details-btn text-blue-600 hover:underline" data-comissao-id="${c.id}">${c.id_venda || 'N/A'}</a></td>
                    <td class="p-2">${formatApiDateToBR(c.data_venda)}</td>
                    <td class="p-2 text-right">${formatCurrency(c.valor_venda)}</td>
                    <td class="p-2" title="${c.justificativa}">${(c.justificativa || '').substring(0, 30)}${c.justificativa && c.justificativa.length > 30 ? '...' : ''}</td>
                    <td class="p-2">${c.consultor || ''}</td>
                    <td class="p-2 text-center"><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">${status}</span></td>
                </tr>`;
            }).join('');
        }
    
        container.innerHTML = `
            <div class="max-h-[65vh] overflow-y-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-100 text-xs uppercase">
                            <th class="p-2 text-left">ID Parceiro</th>
                            <th class="p-2 text-left">ID Venda</th>
                            <th class="p-2 text-left">Data</th>
                            <th class="p-2 text-right">Valor</th>
                            <th class="p-2 text-left">Justificativa</th>
                            <th class="p-2 text-left">Consultor</th>
                            <th class="p-2 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>`;
    }
    
    renderResultados() {
        const todosPagamentos = Object.values(this.pagamentos).flat();

        // Cálculos de RTs Pagas
        const pagamentosPagos = todosPagamentos.filter(p => p.pago);
        const totalRTsPagas = pagamentosPagos.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
        const quantidadeRTsPagas = pagamentosPagos.length;
        const rtMedia = quantidadeRTsPagas > 0 ? totalRTsPagas / quantidadeRTsPagas : 0;

        // Cálculos de RTs a Pagar
        const pagamentosNaoPagos = todosPagamentos.filter(p => !p.pago);
        const valorEmPagamentosNaoPagos = pagamentosNaoPagos.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
        const valorAcumuladoNaoGerado = this.arquitetos.reduce((sum, arq) => sum + (parseFloat(arq.rt_acumulado) || 0), 0);
        const totalRtAPagar = valorEmPagamentosNaoPagos + valorAcumuladoNaoGerado;
        const quantidadeRTsNaoPagas = pagamentosNaoPagos.length;


        // Atualização do DOM
        document.getElementById('total-rt').textContent = formatCurrency(totalRTsPagas);
        document.getElementById('total-rt-quantidade').textContent = quantidadeRTsPagas;
        document.getElementById('rt-media').textContent = formatCurrency(rtMedia);
        document.getElementById('total-rt-a-pagar').textContent = formatCurrency(totalRtAPagar);
        document.getElementById('total-rt-nao-pagas').textContent = quantidadeRTsNaoPagas;
    }
    
    renderSysledTable() {
        const container = document.getElementById('sysled-table-container');
        if (!container) return;
        if (this.sysledData.length === 0) {
             container.innerHTML = `<div class="text-center text-gray-500 py-8"><p>Clique em "Atualizar Dados" para carregar as informações da API Sysled.</p></div>`; return;
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
            dataToRender = dataToRender.filter(row => row[column] != null && String(row[column]).toLowerCase().includes(filterValue));
        });
        this.sysledFilteredData = dataToRender;
        const headers = Object.keys(this.sysledData[0]);
        const headerHtml = headers.map(h => `<th class="p-2 text-left text-xs uppercase bg-gray-100 sticky top-0 z-10">${h.replace(/_/g, ' ')}</th>`).join('');
        const filterHtml = headers.map(h => `<th class="p-1 bg-gray-100 sticky top-8 z-10"><input type="text" class="sysled-column-filter w-full p-1 border rounded-md text-sm" placeholder="Filtrar..." data-column="${h}" value="${columnFilters[h] ? columnFilters[h].replace(/"/g, '&quot;') : ''}"></th>`).join('');
        const rowsHtml = this.sysledFilteredData.length === 0
            ? `<tr><td colspan="${headers.length}" class="text-center text-gray-500 py-8">Nenhum resultado encontrado.</td></tr>`
            : this.sysledFilteredData.map(row => `<tr class="border-b text-sm hover:bg-gray-50">${headers.map(h => {
                let cellValue = row[h];
                const lowerCaseHeader = h.toLowerCase();
                if (lowerCaseHeader.includes('data')) cellValue = formatApiDateToBR(cellValue);
                else if (lowerCaseHeader.includes('valor') || lowerCaseHeader.includes('total') || lowerCaseHeader.includes('valornota')) {
                    if (cellValue !== null && !isNaN(Number(String(cellValue)))) cellValue = formatApiNumberToBR(cellValue);
                }
                return `<td class="p-2">${cellValue ?? ''}</td>`;
            }).join('')}</tr>`).join('');
        container.innerHTML = `<div class="max-h-[65vh] overflow-auto"><table class="w-full min-w-max"><thead><tr>${headerHtml}</tr><tr>${filterHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    }

    renderSalesHistoryModal(salesData, isApiData) {
        const container = document.getElementById('sales-history-table-container');
        if (!salesData || salesData.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhuma venda encontrada para este parceiro.</p>`; return;
        }
        const rowsHtml = salesData.map(sale => {
            const idCellContent = isApiData 
                ? `<a href="#" class="view-sale-details-btn text-blue-600 hover:underline" data-pedido-id="${sale.id_pedido}">${sale.id_pedido}</a>`
                : sale.id_pedido;
            return `<tr class="border-b text-sm"><td class="p-2">${idCellContent}</td><td class="p-2 text-right">${formatCurrency(sale.valor_nota)}</td><td class="p-2 text-center">${formatApiDateToBR(sale.data_finalizacao_prevenda)}</td></tr>`
        }).join('');
        container.innerHTML = `<table class="w-full"><thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID Pedido</th><th class="p-2 text-right">Valor da Nota</th><th class="p-2 text-center">Data da Venda</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    }
    
    // NOVO: Renderiza a tabela de logs de eventos
    renderEventosLog() {
        const container = document.getElementById('eventos-log-container');
        if (!container) return;

        if (this.actionLogs.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum evento registrado.</p>`;
            return;
        }

        const rowsHtml = this.actionLogs.map(log => {
            const timestamp = new Date(log.when_did).toLocaleString('pt-BR');
            return `
                <tr class="border-b text-sm">
                    <td class="p-2">${log.who_did}</td>
                    <td class="p-2">${log.what_did}</td>
                    <td class="p-2">${timestamp}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-100 text-xs uppercase">
                        <th class="p-2 text-left">Usuário</th>
                        <th class="p-2 text-left">Ação</th>
                        <th class="p-2 text-left">Quando</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    checkPaymentFeature() {
        const btn = document.getElementById('gerar-pagamentos-rt-btn');
        if (!btn) return;
        const isEnabled = this.schemaHasRtAcumulado && this.schemaHasRtTotalPago;
        btn.disabled = !isEnabled;
        btn.title = isEnabled ? "" : "Funcionalidade desabilitada. Crie as colunas 'rt_acumulado' e 'rt_total_pago' no banco de dados.";
        btn.classList.toggle('opacity-50', !isEnabled);
        btn.classList.toggle('cursor-not-allowed', !isEnabled);
    }
    
    // --- MÉTODOS DE MANIPULAÇÃO DE MODAIS ---
    
    openRtMappingModal(headers) {
        const form = document.getElementById('rt-mapping-form');
        const modal = document.getElementById('rt-mapping-modal');
        form.innerHTML = '';
        const fields = { id_prevenda: 'ID Prevenda', data_venda: 'Data Venda', nome_cliente: 'Nome Cliente', valor_venda: 'Valor Venda', executivo: 'Executivo', id_parceiro: 'ID Parceiro', parceiro: 'Parceiro', loja: 'Loja' };
        const autoMap = { id_prevenda: 'idPedido', data_venda: 'dataFinalizacaoPrevenda', nome_cliente: 'clienteFantasia', valor_venda: 'valorNota', executivo: 'consultor', id_parceiro: 'idParceiro', parceiro: 'parceiro', loja: 'idEmpresa' };
        for (const key in fields) {
            const options = headers.map(h => `<option value="${h}">${h}</option>`).join('');
            form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label for="map-${key}" class="font-medium text-gray-700">${fields[key]}</label><select id="map-${key}" name="${key}" class="w-full p-2 bg-gray-50 border rounded-lg"><option value="">Selecione...</option>${options}</select></div>`;
            if (this.isSysledImport) {
                const select = form.querySelector(`#map-${key}`);
                if (select && headers.includes(autoMap[key])) select.value = autoMap[key];
            }
        }
        modal.classList.add('flex');
    }

    closeRtMappingModal() {
        document.getElementById('rt-mapping-modal').classList.remove('flex');
        const fileInput = document.getElementById('rt-file-input');
        if (fileInput) fileInput.value = '';
        const fileName = document.getElementById('rt-file-name');
        if (fileName) fileName.textContent = '';
    }

    openArquitetoMappingModal(headers) {
        const form = document.getElementById('arquiteto-mapping-form');
        form.innerHTML = '';
        const fields = { id: 'ID', nome: 'Nome', email: 'Email', telefone: 'Telefone', chave_pix: 'Chave PIX' };
        for (const key in fields) {
            const options = headers.map(h => `<option value="${h}">${h}</option>`).join('');
            form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label class="font-medium text-gray-700">${fields[key]}</label><select name="${key}" class="w-full p-2 bg-gray-50 border rounded-lg"><option value="">Selecione...</option>${options}</select></div>`;
        }
        document.getElementById('arquiteto-mapping-modal').classList.add('flex');
    }

    closeArquitetoMappingModal() {
        document.getElementById('arquiteto-mapping-modal').classList.remove('flex');
        const fileInput = document.getElementById('arquiteto-file-input');
        if (fileInput) fileInput.value = '';
        const fileName = document.getElementById('file-name-arquitetos');
        if (fileName) fileName.textContent = '';
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
        document.getElementById('rt-valor-vendas').textContent = formatCurrency(arquiteto.valorVendasTotal || 0);
        document.getElementById('rt-percentual').value = arquiteto.rtPercentual || 0.05;
        if(this.schemaHasRtAcumulado) document.getElementById('edit-arquiteto-rt-acumulado').textContent = formatCurrency(arquiteto.rt_acumulado || 0);
        if(this.schemaHasRtTotalPago) document.getElementById('edit-arquiteto-rt-total-pago').textContent = formatCurrency(arquiteto.rt_total_pago || 0);
        document.getElementById('edit-arquiteto-modal').classList.add('flex');
        this.calculateRT();
    }

    closeEditModal() { document.getElementById('edit-arquiteto-modal').classList.remove('flex'); }
    
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
    
    openComprovanteModal(date, pagamentoId) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (!pagamento) return;
        document.getElementById('comprovante-modal-title').textContent = `Detalhes de Pagamento para ${pagamento.parceiro}`;
        document.getElementById('comprovante-valor-rt').textContent = formatCurrency(pagamento.rt_valor || 0);
        const imgContainer = document.getElementById('comprovante-img-container');
        imgContainer.innerHTML = (pagamento.comprovante && pagamento.comprovante.url)
            ? `<img src="${pagamento.comprovante.url}" alt="${pagamento.comprovante.name}" class="max-w-full max-h-96 object-contain">`
            : `<p class="text-gray-500">Nenhum comprovante anexado.</p>`;
        document.getElementById('comprovante-modal').classList.add('flex');
    }
    
    closeComprovanteModal() { document.getElementById('comprovante-modal').classList.remove('flex'); }

    openGerarPagamentosModal() {
        const container = document.getElementById('gerar-pagamentos-table-container');
        const rowsHtml = this.eligibleForPayment.map(a => `
            <tr class="border-b text-sm"><td class="p-2">${a.id}</td><td class="p-2">${a.nome}</td><td class="p-2 text-right font-semibold text-green-600">${formatCurrency(a.rt_acumulado || 0)}</td><td class="p-2">${a.pix || 'Não cadastrado'}</td></tr>`).join('');
        container.innerHTML = `<table class="w-full"><thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID</th><th class="p-2 text-left">Nome</th><th class="p-2 text-right">Valor a Pagar</th><th class="p-2 text-left">Chave PIX</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
        document.getElementById('gerar-pagamentos-modal').classList.add('flex');
    }

    openSaleDetailsModal(pedidoId) {
        if (!pedidoId || pedidoId === 'N/A') { alert("ID do Pedido inválido."); return; }
        const saleData = this.sysledData.find(row => String(row.idPedido) === String(pedidoId));
        if (!saleData) { alert(`Detalhes para o pedido ${pedidoId} não foram encontrados.`); return; }
        document.getElementById('sale-details-modal-title').textContent = `Detalhes da Venda - Pedido ${pedidoId}`;
        document.getElementById('import-single-sale-btn').dataset.pedidoId = pedidoId;
        const detailsHtml = Object.entries(saleData).map(([key, value]) => `<tr class="border-b"><td class="p-2 font-semibold text-gray-600 align-top">${key}</td><td class="p-2 text-gray-800">${value ?? ''}</td></tr>`).join('');
        document.getElementById('sale-details-content').innerHTML = `<table class="w-full text-sm"><tbody>${detailsHtml}</tbody></table>`;
        document.getElementById('sale-details-modal').classList.add('flex');
    }

    closeSaleDetailsModal() { document.getElementById('sale-details-modal').classList.remove('flex'); }
    closeSalesHistoryModal() { document.getElementById('sales-history-modal').classList.remove('flex'); }

    openComissaoManualDetailsModal(comissaoId) {
        const comissao = this.comissoesManuais.find(c => c.id === comissaoId);
        if (!comissao) { alert('Detalhes da comissão não encontrados.'); return; }
        const arquiteto = this.arquitetos.find(a => a.id === comissao.id_parceiro);
        const status = comissao.status || 'pendente';

        let statusColor;
        if (status === 'aprovada') {
            statusColor = 'bg-green-100 text-green-800';
        } else if (status === 'Recusada Gestão') {
            statusColor = 'bg-red-100 text-red-800';
        } else {
            statusColor = 'bg-yellow-100 text-yellow-800';
        }

        const content = [
            { label: 'ID Parceiro', value: comissao.id_parceiro },
            { label: 'Nome Parceiro', value: arquiteto ? arquiteto.nome : 'Não encontrado' },
            { label: 'ID Venda', value: comissao.id_venda || 'N/A' },
            { label: 'Valor Venda', value: formatCurrency(comissao.valor_venda) },
            { label: 'Data Venda', value: formatApiDateToBR(comissao.data_venda) },
            { label: 'Consultor', value: comissao.consultor || 'N/A' },
            { label: 'Justificativa', value: comissao.justificativa, pre: true },
            { label: 'Status', value: `<span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">${status}</span>` }
        ].map(item => `<div class="grid grid-cols-3 gap-2"><p class="font-semibold text-gray-600 col-span-1">${item.label}:</p><div class="col-span-2 ${item.pre ? 'whitespace-pre-wrap' : ''}">${item.value}</div></div>`).join('');
        document.getElementById('comissao-manual-details-content').innerHTML = content;
        
        const approveBtn = document.getElementById('aprovar-inclusao-manual-btn');
        approveBtn.dataset.comissaoId = comissaoId;
        approveBtn.style.display = status === 'aprovada' ? 'none' : 'inline-block';

        document.getElementById('comissao-manual-details-modal').classList.add('flex');
    }

    closeComissaoManualDetailsModal() { document.getElementById('comissao-manual-details-modal').classList.remove('flex'); }

    openEditRtModal(date, pagamentoId) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (!pagamento) return;
        document.getElementById('edit-rt-pagamento-id').value = pagamento.id;
        document.getElementById('edit-rt-pagamento-date').value = date;
        document.getElementById('edit-rt-input').value = parseCurrency(pagamento.rt_valor);
        document.getElementById('edit-rt-modal').classList.add('flex');
    }

    closeEditRtModal() {
        document.getElementById('edit-rt-modal').classList.remove('flex');
        document.getElementById('edit-rt-form').reset();
    }
    
    // --- MÉTODOS DE LÓGICA DE NEGÓCIO E MANIPULAÇÃO DE DADOS ---

    // NOVO: Função para registrar uma ação no log de eventos
    async logAction(actionDescription) {
        const { error } = await supabase.from('action_logs').insert({
            who_did: this.currentUserEmail,
            what_did: actionDescription
        });
        if (error) {
            console.error('Erro ao registrar ação no log:', error);
        }
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
    
    handleRTFileSelect(event) {
        this.isSysledImport = false;
        const file = event.target.files[0];
        if (!file) return;
        document.getElementById('rt-file-name').textContent = `Arquivo: ${file.name}`;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            this.tempRTData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
            const headers = this.tempRTData.length > 0 ? Object.keys(this.tempRTData[0]) : [];
            this.openRtMappingModal(headers);
        };
        reader.readAsArrayBuffer(file);
    }

    async handleRtMapping() {
        const mapping = {};
        document.getElementById('rt-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });
        if (!mapping.id_parceiro || !mapping.valor_venda) {
            alert("Os campos 'ID Parceiro' e 'Valor Venda' são obrigatórios."); return;
        }
        if (this.isSysledImport && !mapping.id_prevenda) {
            alert("O 'ID Prevenda' é obrigatório para importações Sysled para evitar duplicatas."); return;
        }
        let processedData = this.tempRTData.map(row => {
            const newRow = {};
            for (const key in mapping) { if (mapping[key]) newRow[key] = row[mapping[key]]; }
            if (this.isSysledImport) newRow.valor_venda = parseApiNumber(newRow.valor_venda);
            return newRow;
        });
        
        if (this.isSysledImport) {
            const pedidoIds = processedData.map(row => row.id_prevenda).filter(id => id);
            if (pedidoIds.length > 0) {
                const { data: existing, error } = await supabase.from('sysled_imports').select('id_pedido').in('id_pedido', pedidoIds);
                if (error) { alert('Erro ao verificar vendas existentes: ' + error.message); this.closeRtMappingModal(); return; }
                const existingIds = new Set(existing.map(item => String(item.id_pedido)));
                const alreadyImported = processedData.filter(row => existingIds.has(String(row.id_prevenda)));
                processedData = processedData.filter(row => !existingIds.has(String(row.id_prevenda)));
                if (alreadyImported.length > 0) alert(`Venda(s) já importada(s) e ignorada(s): ${alreadyImported.map(r => r.id_prevenda).join(', ')}`);
            }
        }
        if (processedData.length > 0) {
            await this.processRTData(processedData);
        } else {
            alert("Nenhuma venda nova para importar.");
        }
        this.closeRtMappingModal();
    }

    async processRTData(data) {
        const todayKey = new Date().toLocaleDateString('pt-BR');
        const todayDB = new Date().toISOString().slice(0, 10);
        let fileToSave = null;

        if (this.isSysledImport) {
            fileToSave = { name: `importacao_sysled_${todayKey.replace(/\//g, '-')}.xlsx`, dataUrl: jsonToXLSXDataURL(this.tempRTData) };
        } else {
            const file = document.getElementById('rt-file-input').files[0];
            if (file) fileToSave = { name: file.name, dataUrl: await fileToBase64(file) };
        }

        if (fileToSave) {
            const { data: fileData, error } = await supabase.from('arquivos_importados').insert({ data_importacao: todayDB, name: fileToSave.name, dataUrl: fileToSave.dataUrl }).select().single();
            if (error) console.error("Erro ao salvar arquivo:", error);
            else {
                this.importedFiles[todayKey] = { name: fileData.name, dataUrl: fileData.dataUrl, id: fileData.id };
                await this.logAction(`Importou o arquivo: ${fileToSave.name}`);
            }
        }

        const architectUpdates = {};
        for (const record of data) {
            const partnerId = String(record.id_parceiro);
            if (!partnerId) continue;
            const valorVenda = parseCurrency(record.valor_venda);
            let arquiteto = this.arquitetos.find(a => a.id === partnerId);
            if (!arquiteto) {
                const newArquitetoData = { id: partnerId, nome: record.parceiro || 'Novo Parceiro', salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05, rt_acumulado: 0, rt_total_pago: 0 };
                const { data: created, error } = await supabase.from('arquitetos').insert(newArquitetoData).select().single();
                if (error) { console.error(`Erro ao criar arquiteto ${partnerId}:`, error); continue; }
                this.arquitetos.push(created);
                arquiteto = created;
                await this.logAction(`Criou novo arquiteto (ID: ${partnerId}) via importação.`);
            }
            if (!architectUpdates[partnerId]) architectUpdates[partnerId] = { valorVendasTotal: arquiteto.valorVendasTotal || 0, salesCount: arquiteto.salesCount || 0, pontos: arquiteto.pontos || 0, rt_acumulado: parseFloat(arquiteto.rt_acumulado || 0) };
            architectUpdates[partnerId].valorVendasTotal += valorVenda;
            architectUpdates[partnerId].salesCount += 1;
            architectUpdates[partnerId].pontos += Math.floor(valorVenda / 1000);
            if (this.schemaHasRtAcumulado) architectUpdates[partnerId].rt_acumulado += valorVenda * (arquiteto.rtPercentual || 0.05);
        }
        await Promise.all(Object.keys(architectUpdates).map(id => supabase.from('arquitetos').update(architectUpdates[id]).eq('id', id)));
        
        if (this.isSysledImport) {
            const payload = data.map(row => ({
                id_parceiro: row.id_parceiro,
                valor_nota: row.valor_venda,
                data_finalizacao_prevenda: row.data_venda,
                id_pedido: row.id_prevenda
            }));
            const { error } = await supabase.from('sysled_imports').insert(payload);
            if (error) {
                alert("AVISO: Os dados dos arquitetos foram atualizados, mas ocorreu um erro ao salvar o histórico de importação para evitar duplicatas. Vendas podem ser importadas novamente no futuro. Erro: " + error.message);
                console.error("Erro ao salvar na tabela sysled_imports:", error);
            }
        }
        
        alert('Dados de vendas processados com sucesso!');
        await this.loadData();
        this.renderAll();
        this.isSysledImport = false;
    }
    
    async handleAddArquiteto(e) {
        e.preventDefault();
        const id = document.getElementById('arquiteto-id').value;
        const nome = document.getElementById('arquiteto-nome').value;
        if (this.arquitetos.some(a => a.id === id)) { alert('ID já existe.'); return; }
        const newArquiteto = { id, nome, email: document.getElementById('arquiteto-email').value, telefone: document.getElementById('arquiteto-telefone').value, pix: document.getElementById('arquiteto-pix').value, salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05, rt_acumulado: 0, rt_total_pago: 0 };
        const { data, error } = await supabase.from('arquitetos').insert(newArquiteto).select().single();
        if (error) { alert('Erro: ' + error.message); }
        else {
            this.arquitetos.push(data);
            this.pontuacoes[data.id] = data.pontos;
            await this.logAction(`Adicionou o arquiteto: ${nome} (ID: ${id})`);
            this.renderAll();
            e.target.reset();
        }
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
    
    async handleArquitetoMapping() {
        const mapping = {};
        document.getElementById('arquiteto-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });
        const novosArquitetos = this.tempArquitetoData.filter(row => {
            const id = row[mapping.id];
            return id && !this.arquitetos.some(a => a.id === id.toString());
        }).map(row => ({ id: String(row[mapping.id]), nome: row[mapping.nome] || '', email: row[mapping.email] || '', telefone: row[mapping.telefone] || '', pix: row[mapping.chave_pix] || '', salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05, rt_acumulado: 0, rt_total_pago: 0 }));
        if (novosArquitetos.length > 0) {
            const { error } = await supabase.from('arquitetos').insert(novosArquitetos);
            if (error) { alert("Erro ao importar: " + error.message); }
            else {
                alert(`${novosArquitetos.length} novos arquitetos importados.`);
                await this.logAction(`Importou ${novosArquitetos.length} novos arquitetos via planilha.`);
                await this.loadData();
                this.renderAll();
            }
        } else {
            alert('Nenhum arquiteto novo para importar.');
        }
        this.closeArquitetoMappingModal();
    }

    async handleEditArquiteto(e) {
        e.preventDefault();
        const originalId = document.getElementById('edit-arquiteto-original-id').value;
        const arquiteto = this.arquitetos.find(a => a.id === originalId);
        if (!arquiteto) return;
        const updatedData = {
            nome: document.getElementById('edit-arquiteto-nome').value, email: document.getElementById('edit-arquiteto-email').value,
            telefone: document.getElementById('edit-arquiteto-telefone').value, pix: document.getElementById('edit-arquiteto-pix').value,
            salesCount: parseInt(document.getElementById('edit-arquiteto-vendas').value, 10) || 0,
            rtPercentual: parseFloat(document.getElementById('rt-percentual').value)
        };
        if (this.schemaHasRtAcumulado && updatedData.rtPercentual !== arquiteto.rtPercentual) {
            updatedData.rt_acumulado = (arquiteto.valorVendasTotal || 0) * updatedData.rtPercentual - (arquiteto.rt_total_pago || 0);
        }
        const { data, error } = await supabase.from('arquitetos').update(updatedData).eq('id', originalId).select().single();
        if (error) { alert("Erro ao salvar: " + error.message); }
        else {
            const index = this.arquitetos.findIndex(a => a.id === originalId);
            this.arquitetos[index] = { ...this.arquitetos[index], ...data };
            await this.logAction(`Editou o arquiteto: ${updatedData.nome} (ID: ${originalId})`);
            this.renderAll();
            this.closeEditModal();
        }
    }

    async deleteArquiteto(id) {
        const arq = this.arquitetos.find(a => a.id === id);
        if (!arq) return;
        if (confirm(`Tem certeza que deseja apagar o arquiteto ${arq.nome} (ID: ${id})?`)) {
            const { error } = await supabase.from('arquitetos').delete().eq('id', id);
            if (error) { alert("Erro ao apagar: " + error.message); }
            else {
                this.arquitetos = this.arquitetos.filter(a => a.id !== id);
                delete this.pontuacoes[id];
                await this.logAction(`Apagou o arquiteto: ${arq.nome} (ID: ${id})`);
                this.renderAll();
            }
        }
    }

    async deleteAllArquitetos() {
        if (confirm('TEM CERTEZA? Esta ação apagará TODOS os dados de forma irreversível.')) {
            const [arq, pag, file, comiss] = await Promise.all([
                supabase.from('arquitetos').delete().neq('id', '0'),
                supabase.from('pagamentos').delete().neq('id', 0),
                supabase.from('arquivos_importados').delete().neq('id', 0),
                supabase.from('comissoes_manuais').delete().neq('id', 0)
            ]);
            const errors = [arq.error, pag.error, file.error, comiss.error].filter(Boolean);
            if (errors.length > 0) alert("Ocorreram erros: " + errors.map(e => e.message).join('\n'));
            else {
                alert('Todos os dados foram apagados com sucesso.');
                await this.logAction(`APAGOU TODOS OS DADOS DO SISTEMA.`);
            }
            await this.loadData();
            this.renderAll();
        }
    }

    exportArquitetosCSV() {
        if (this.arquitetos.length === 0) { alert("Não há dados para exportar."); return; }
        const data = this.arquitetos.map(a => {
            const row = { id: a.id, nome: a.nome, email: a.email, telefone: a.telefone, pix: a.pix, quantidade_vendas: a.salesCount || 0, valor_total_vendas: a.valorVendasTotal || 0, pontos: this.pontuacoes[a.id] || 0 };
            if (this.schemaHasRtAcumulado) row.rt_acumulado = a.rt_acumulado || 0;
            if (this.schemaHasRtTotalPago) row.rt_total_pago = a.rt_total_pago || 0;
            return row;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Arquitetos");
        XLSX.writeFile(wb, "cadastro_arquitetos.xlsx");
        this.logAction("Exportou a lista de arquitetos para CSV.");
    }

    async handleAddValue(e) {
        e.preventDefault();
        const id = document.getElementById('add-value-arquiteto-id').value;
        const value = parseFloat(document.getElementById('add-value-input').value);
        const arq = this.arquitetos.find(a => a.id === id);
        if (arq && !isNaN(value)) {
            const payload = {
                valorVendasTotal: (arq.valorVendasTotal || 0) + value,
                pontos: (this.pontuacoes[id] || 0) + Math.floor(value / 1000),
                salesCount: (arq.salesCount || 0) + 1,
                ...(this.schemaHasRtAcumulado && { rt_acumulado: parseFloat(arq.rt_acumulado || 0) + (value * (arq.rtPercentual || 0.05)) })
            };
            const { data, error } = await supabase.from('arquitetos').update(payload).eq('id', id).select().single();
            if(error) { alert("Erro: " + error.message); }
            else {
                const index = this.arquitetos.findIndex(a => a.id === id);
                this.arquitetos[index] = data;
                this.pontuacoes[id] = data.pontos;
                await this.logAction(`Adicionou venda manual de ${formatCurrency(value)} para ${arq.nome} (ID: ${id})`);
                this.renderAll();
                this.closeAddValueModal();
            }
        }
    }
    
    async handleAddPontos(e) {
        e.preventDefault();
        const id = document.getElementById('arquiteto-select').value;
        const pontos = parseInt(document.getElementById('pontos-valor').value, 10);
        const arq = this.arquitetos.find(a => a.id === id);
        if (arq && !isNaN(pontos)) {
            const newPoints = (this.pontuacoes[id] || 0) + pontos;
            const { error } = await supabase.from('arquitetos').update({ pontos: newPoints }).eq('id', id);
            if (error) { alert("Erro: " + error.message); }
            else {
                this.pontuacoes[id] = newPoints;
                arq.pontos = newPoints;
                await this.logAction(`Ajustou ${pontos} pontos para ${arq.nome} (ID: ${id})`);
                this.renderRankingTable();
                e.target.reset();
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
                statusSpan.className = 'file-status-text text-xs text-green-600 font-semibold';
            }
            const { date, id } = e.target.dataset;
            this.handleComprovanteUpload(date, id, e.target.files[0]);
        }
    }

    handlePagamentosClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const { date, id } = btn.dataset;
        if (btn.matches('.view-comprovante-btn') && !btn.disabled) { e.preventDefault(); this.openComprovanteModal(date, id); }
        if (btn.matches('.delete-pagamentos-btn')) this.deletePagamentosGroup(date);
        if (btn.matches('.download-xlsx-btn')) this.exportPagamentosXLSX(date);
        if (btn.matches('.gerar-relatorio-btn')) this.generatePagamentoPrint(date);
        if (btn.matches('.edit-rt-btn')) this.openEditRtModal(date, id);
    }

    async updatePagamentoStatus(date, pagamentoId, isChecked) {
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if (pagamento) {
            const { error } = await supabase.from('pagamentos').update({ pago: isChecked }).eq('id', pagamento.id);
            if (error) alert("Erro: " + error.message);
            else {
                pagamento.pago = isChecked;
                await this.logAction(`Marcou pagamento (ID: ${pagamentoId}) para ${pagamento.parceiro} como ${isChecked ? 'PAGO' : 'NÃO PAGO'}.`);
                this.renderResultados();
            }
        }
    }

    async handleComprovanteUpload(date, pagamentoId, file) {
        if (!file) return;
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === pagamentoId);
        if(pagamento){
            const dataUrl = await fileToBase64(file);
            pagamento.comprovante = { name: file.name, url: dataUrl };
            const { error } = await supabase.from('pagamentos').update({ comprovante: pagamento.comprovante }).eq('id', pagamento.id);
            if(error) alert("Erro: " + error.message);
            else {
                await this.logAction(`Anexou comprovante para o pagamento (ID: ${pagamentoId}) de ${pagamento.parceiro}.`);
                this.renderPagamentos();
            }
        }
    }
    
    async deletePagamentosGroup(date) {
        if (confirm(`Tem certeza que deseja apagar os pagamentos de ${date}?`)) {
            const ids = this.pagamentos[date].map(p => p.id);
            const { error } = await supabase.from('pagamentos').delete().in('id', ids);
            if (error) { alert("Erro: " + error.message); }
            else {
                delete this.pagamentos[date];
                await this.logAction(`Apagou o lote de pagamentos gerado em ${date}.`);
                this.renderPagamentos();
            }
        }
    }

    async handleUpdateRtValue(e) {
        e.preventDefault();
        const id = document.getElementById('edit-rt-pagamento-id').value;
        const date = document.getElementById('edit-rt-pagamento-date').value;
        const newValue = parseFloat(document.getElementById('edit-rt-input').value);
        if (isNaN(newValue) || newValue < 0) { alert('Valor inválido.'); return; }
        const pagamento = this.pagamentos[date]?.find(p => p.id.toString() === id);
        if (pagamento) {
            const oldValue = pagamento.rt_valor;
            const { error } = await supabase.from('pagamentos').update({ rt_valor: newValue }).eq('id', pagamento.id);
            if (error) { alert("Erro: " + error.message); }
            else {
                pagamento.rt_valor = newValue;
                await this.logAction(`Alterou valor do RT (ID: ${id}) de ${formatCurrency(oldValue)} para ${formatCurrency(newValue)}.`);
                this.renderPagamentos();
                this.renderResultados();
                this.closeEditRtModal();
                alert('Valor atualizado!');
            }
        }
    }

    exportPagamentosXLSX(date) {
        const data = this.pagamentos[date];
        if (!data || data.length === 0) { alert("Sem dados para exportar."); return; }
        const reportData = data.map(p => ({ 'ID Parceiro': p.id_parceiro, 'Parceiro': p.parceiro, 'Valor RT': parseCurrency(p.rt_valor), 'Pago': p.pago ? 'Sim' : 'Não', 'Data Geração': p.data_geracao }));
        const ws = XLSX.utils.json_to_sheet(reportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Pagamentos");
        XLSX.writeFile(wb, `Pagamentos_${date.replace(/\//g, '-')}.xlsx`);
        this.logAction(`Exportou o relatório de pagamentos de ${date}.`);
    }

    generatePagamentoPrint(date) {
        const data = this.pagamentos[date];
        if (!data || data.length === 0) { alert('Sem dados para gerar relatório.'); return; }
        const total = data.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
        const rows = data.sort((a, b) => a.parceiro.localeCompare(b.parceiro)).map(p => `
            <tr class="border-b text-sm"><td class="p-2">${p.id_parceiro}</td><td class="p-2">${p.parceiro}</td><td class="p-2 text-right">${formatCurrency(p.rt_valor)}</td></tr>`).join('');
        const content = `<div class="report-section"><h2 class="text-xl font-bold mb-4">Relatório de Pagamento - ${date}</h2><table class="w-full"><thead><tr class="bg-gray-100 text-xs uppercase"><th class="p-2 text-left">ID</th><th class="p-2 text-left">Parceiro</th><th class="p-2 text-right">Valor RT</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        const template = `<html><head><title>Relatório - ${date}</title><script src="https://cdn.tailwindcss.com"><\/script><style>@media print{.no-print{display: none;}}</style></head><body class="p-8 bg-gray-100"><div class="no-print text-center mb-8"><button onclick="window.print()" class="bg-blue-600 text-white py-2 px-6 rounded">Imprimir</button></div><div class="max-w-5xl mx-auto bg-white p-8 rounded shadow">${content}<div class="mt-8 text-right"><h3 class="text-xl font-bold">Soma Total (RT) a Pagar</h3><p class="text-3xl font-bold mt-1 text-emerald-600">${formatCurrency(total)}</p></div></div></body></html>`;
        const win = window.open('', '_blank');
        win.document.write(template);
        win.document.close();
    }

    async handleGerarPagamentosClick() {
        if (!this.schemaHasRtAcumulado || !this.schemaHasRtTotalPago) { alert("Funcionalidade desabilitada. Verifique o console."); return; }
        const { data, error } = await supabase.from('arquitetos').select('*');
        if (error) { alert("Não foi possível buscar dados atualizados."); return; }
        this.arquitetos = data || [];
        this.eligibleForPayment = this.arquitetos.filter(a => parseFloat(a.rt_acumulado || 0) >= 300);
        if (this.eligibleForPayment.length === 0) { alert('Nenhum arquiteto atingiu o valor mínimo para pagamento.'); return; }
        this.openGerarPagamentosModal();
    }

    async confirmarGeracaoComprovantes() {
        if (this.eligibleForPayment.length === 0) return;
        const todayDB = new Date().toISOString().slice(0, 10);
        const pagamentos = this.eligibleForPayment.map(a => ({ id_parceiro: a.id, parceiro: a.nome, rt_valor: a.rt_acumulado, pago: false, data_geracao: todayDB }));
        const { error: insertError } = await supabase.from('pagamentos').insert(pagamentos);
        if (insertError) { alert("Erro ao gerar comprovantes: " + insertError.message); return; }
        const updates = this.eligibleForPayment.map(a => supabase.from('arquitetos').update({ rt_acumulado: 0, rt_total_pago: (parseFloat(a.rt_total_pago) || 0) + (parseFloat(a.rt_acumulado) || 0) }).eq('id', a.id));
        await Promise.all(updates);
        alert(`${this.eligibleForPayment.length} comprovantes gerados!`);
        await this.logAction(`Gerou ${this.eligibleForPayment.length} pagamentos em lote.`);
        document.getElementById('gerar-pagamentos-modal').classList.remove('flex');
        this.eligibleForPayment = [];
        await this.loadData();
        this.renderAll();
        document.querySelector('.menu-link[data-tab="comprovantes"]').click();
    }

    async handleGerarPagamentoFicha() {
        const id = document.getElementById('edit-arquiteto-original-id').value;
        const arq = this.arquitetos.find(a => a.id === id);
        if (!arq) return;
        const valor = parseFloat(arq.rt_acumulado || 0);
        if (valor <= 0) { alert('Arquiteto sem saldo de RT acumulado.'); return; }
        if (confirm(`Gerar pagamento de ${formatCurrency(valor)} para ${arq.nome}? O saldo será zerado.`)) {
            const todayDB = new Date().toISOString().slice(0, 10);
            const { error: insertError } = await supabase.from('pagamentos').insert([{ id_parceiro: arq.id, parceiro: arq.nome, rt_valor: valor, pago: false, data_geracao: todayDB }]);
            if (insertError) { alert("Erro ao gerar comprovante: " + insertError.message); return; }
            const { error: updateError } = await supabase.from('arquitetos').update({ rt_acumulado: 0, rt_total_pago: (parseFloat(arq.rt_total_pago) || 0) + valor }).eq('id', arq.id);
            if (updateError) alert("Comprovante gerado, mas erro ao atualizar saldo: " + updateError.message);
            else {
                alert(`Comprovante gerado com sucesso para ${arq.nome}!`);
                await this.logAction(`Gerou pagamento individual de ${formatCurrency(valor)} para ${arq.nome} (ID: ${id}).`);
            }
            this.closeEditModal();
            await this.loadData();
            this.renderAll();
            document.querySelector('.menu-link[data-tab="comprovantes"]').click();
        }
    }
    
    async fetchSysledData() {
        const container = document.getElementById('sysled-table-container');
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Buscando dados... <i class="fas fa-spinner fa-spin"></i></p>`;
        try {
            const response = await fetch('https://integration.sysled.com.br/n8n/api/?v_crm_oportunidades_propostas_up180dd=null', { headers: { 'Authorization': 'e4b6f9082f1b8a1f37ad5b56e637f3ec719ec8f0b6acdd093972f9c5bb29b9ed' } });
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            this.sysledData = await response.json();
            await this.logAction("Atualizou os dados da consulta Sysled.");
        } catch (error) {
            console.error("Erro na API Sysled:", error);
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao carregar dados da API.</p>`;
        } finally {
            this.renderSysledTable();
        }
    }

    clearSysledFilters() {
        document.getElementById('sysled-filter-data-inicio').value = '';
        document.getElementById('sysled-filter-data-fim').value = '';
        document.getElementById('sysled-filter-parceiro').value = '';
        document.getElementById('sysled-filter-excluir-parceiro').value = '';
        this.renderSysledTable();
    }

    async handleCopyToRTClick() {
        if (this.sysledFilteredData.length === 0) {
            alert('Não há dados filtrados para copiar. Por favor, filtre os dados primeiro ou atualize a consulta.');
            return;
        }
    
        if (!confirm(`Você está prestes a importar ${this.sysledFilteredData.length} venda(s) da Sysled. Deseja continuar?`)) {
            return;
        }
    
        this.isSysledImport = true;
        this.tempRTData = this.sysledFilteredData;
    
        const mapping = {
            id_prevenda: 'idPedido', data_venda: 'dataFinalizacaoPrevenda', nome_cliente: 'clienteFantasia',
            valor_venda: 'valorNota', executivo: 'consultor', id_parceiro: 'idParceiro',
            parceiro: 'parceiro', loja: 'idEmpresa'
        };
    
        const firstRow = this.tempRTData[0];
        if (!firstRow.hasOwnProperty(mapping.id_parceiro) || !firstRow.hasOwnProperty(mapping.valor_venda) || !firstRow.hasOwnProperty(mapping.id_prevenda)) {
            alert("Os dados da Sysled parecem estar incompletos. Colunas essenciais como 'idParceiro', 'valorNota' ou 'idPedido' não foram encontradas. Importação cancelada.");
            this.isSysledImport = false;
            return;
        }
    
        let processedData = this.tempRTData.map(row => {
            const newRow = {};
            for (const key in mapping) {
                if (row.hasOwnProperty(mapping[key])) {
                    if (key === 'valor_venda') {
                        newRow[key] = parseApiNumber(row[mapping[key]]);
                    } else {
                        newRow[key] = row[mapping[key]];
                    }
                }
            }
            return newRow;
        });
    
        let dataToProcess = processedData;
    
        const pedidoIds = processedData.map(row => row.id_prevenda).filter(id => id);
        if (pedidoIds.length > 0) {
            const { data: existing, error } = await supabase.from('sysled_imports').select('id_pedido').in('id_pedido', pedidoIds);
    
            if (error) {
                alert('Erro ao verificar vendas existentes: ' + error.message);
                this.isSysledImport = false;
                return;
            }
    
            const existingIds = new Set(existing.map(item => String(item.id_pedido)));
            const alreadyImported = processedData.filter(row => existingIds.has(String(row.id_prevenda)));
            dataToProcess = processedData.filter(row => !existingIds.has(String(row.id_prevenda)));
    
            if (alreadyImported.length > 0) {
                alert(`Venda(s) já importada(s) e ignorada(s): ${alreadyImported.map(r => r.id_prevenda).join(', ')}`);
            }
        }
    
        if (dataToProcess.length > 0) {
            await this.processRTData(dataToProcess);
        } else {
            alert("Nenhuma venda nova para importar. Todas as vendas filtradas já foram processadas anteriormente.");
            this.isSysledImport = false;
        }
    }
    
    async handleConsultarVendasClick(e) {
        e.preventDefault();
        const id = document.getElementById('edit-arquiteto-original-id').value;
        if (!id) return;
        const arq = this.arquitetos.find(a => a.id === id);
        document.getElementById('sales-history-modal-title').textContent = `Histórico de Vendas para ${arq ? arq.nome : id}`;
        const container = document.getElementById('sales-history-table-container');
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Consultando... <i class="fas fa-spinner fa-spin"></i></p>`;
        document.getElementById('sales-history-modal').classList.add('flex');
        try {
            const { data, error } = await supabase.from('sysled_imports').select('id_pedido, valor_nota, data_finalizacao_prevenda').eq('id_parceiro', id).order('data_finalizacao_prevenda', { ascending: false });
            if (error) throw error;
            this.renderSalesHistoryModal(data, false);
        } catch (error) {
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao consultar vendas.</p>`;
        }
    }

    async handleConsultarVendasSysledClick(e) {
        e.preventDefault();
        const id = document.getElementById('edit-arquiteto-original-id').value;
        if (!id) return;
        const arq = this.arquitetos.find(a => a.id === id);
        document.getElementById('sales-history-modal-title').textContent = `Vendas da API Sysled para ${arq ? arq.nome : id}`;
        const container = document.getElementById('sales-history-table-container');
        container.innerHTML = `<p class="text-center text-gray-500 py-8">Consultando API... <i class="fas fa-spinner fa-spin"></i></p>`;
        document.getElementById('sales-history-modal').classList.add('flex');
        try {
            if (this.sysledData.length === 0) await this.fetchSysledData();
            if (this.sysledData.length === 0) { container.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum dado da API foi carregado.</p>`; return; }
            const sales = this.sysledData.filter(row => String(row.idParceiro) === id && row.statusPagamento == 1);
            const mapped = sales.map(s => ({ id_pedido: s.idPedido || 'N/A', valor_nota: parseApiNumber(s.valorNota), data_finalizacao_prevenda: s.dataFinalizacaoPrevenda }));
            this.renderSalesHistoryModal(mapped, true);
        } catch (error) {
            container.innerHTML = `<p class="text-center text-red-500 py-8">Erro ao consultar API Sysled.</p>`;
        }
    }
    
    handleSalesHistoryTableClick(e) {
        const btn = e.target.closest('.view-sale-details-btn');
        if (btn) { e.preventDefault(); this.openSaleDetailsModal(btn.dataset.pedidoId); }
    }
    
    async handleImportSingleSale(e) {
        const id = e.target.dataset.pedidoId;
        if (!id || id === 'N/A') return;
        const { data: existing } = await supabase.from('sysled_imports').select('id_pedido').eq('id_pedido', id).maybeSingle();
        if (existing) { alert(`Venda ${id} já importada.`); return; }
        const sale = this.sysledData.find(row => String(row.idPedido) === id);
        if (!sale) { alert('Dados da venda não encontrados.'); return; }
        const data = [{ id_parceiro: sale.idParceiro, valor_venda: parseApiNumber(sale.valorNota), parceiro: sale.parceiro }];
        this.isSysledImport = false;
        await this.processRTData(data);
        const { error } = await supabase.from('sysled_imports').insert([{ id_parceiro: sale.idParceiro, valor_nota: parseApiNumber(sale.valorNota), data_finalizacao_prevenda: sale.dataFinalizacaoPrevenda, id_pedido: sale.idPedido }]);
        if (error) console.error("Erro ao registrar importação:", error);
        this.closeSaleDetailsModal();
        this.closeSalesHistoryModal();
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
        this.renderArquitetosTable();
    }

    calculateRT() {
        const valor = parseCurrency(document.getElementById('rt-valor-vendas').textContent);
        const perc = parseFloat(document.getElementById('rt-percentual').value);
        document.getElementById('rt-valor-calculado').textContent = formatCurrency(valor * perc);
    }

    handleArquivosImportadosClick(e) {
        const btn = e.target.closest('.download-arquivo-btn');
        if (btn) { e.preventDefault(); this.downloadImportedFile(btn.dataset.date); }
    }

    downloadImportedFile(date) {
        const file = this.importedFiles[date];
        if (file) {
            const link = document.createElement('a');
            link.href = file.dataUrl;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    async handleAddComissaoManual(e) {
        e.preventDefault();
        const form = e.target;
        const idParceiro = document.getElementById('manual-id-parceiro').value.trim();
        const idVenda = document.getElementById('manual-id-venda').value.trim();
        const valorVenda = parseFloat(document.getElementById('manual-valor-venda').value);

        if (!idParceiro || isNaN(valorVenda) || valorVenda <= 0) {
            alert('Preencha o ID do Parceiro e um Valor de Venda válido.');
            return;
        }

        // Verificação de duplicidade ANTES de criar a solicitação
        if (idVenda) {
            // 1. Checa se já foi importado via Sysled
            const { data: existingImport, error: importError } = await supabase
                .from('sysled_imports')
                .select('id_pedido')
                .eq('id_pedido', idVenda)
                .maybeSingle();
            
            if (importError) {
                alert('Erro ao verificar duplicidade de importação: ' + importError.message);
                return;
            }
            if (existingImport) {
                alert(`Venda com ID ${idVenda} já foi importada anteriormente e não pode ser incluída manualmente.`);
                return;
            }

            // 2. Checa se já existe uma comissão manual com o mesmo ID de venda
            const { data: existingManual, error: manualError } = await supabase
                .from('comissoes_manuais')
                .select('id')
                .eq('id_venda', idVenda)
                .maybeSingle();
            
            if (manualError) {
                alert('Erro ao verificar duplicidade de comissão manual: ' + manualError.message);
                return;
            }
            if (existingManual) {
                alert(`Já existe uma inclusão manual para a venda com ID ${idVenda}.`);
                return;
            }
        }

        const arq = this.arquitetos.find(a => a.id === idParceiro);
        if (!arq) {
            alert(`Arquiteto com ID ${idParceiro} não encontrado.`);
            return;
        }

        const newComissao = {
            id_parceiro: idParceiro,
            id_venda: idVenda,
            valor_venda: valorVenda,
            data_venda: document.getElementById('manual-data-venda').value,
            consultor: document.getElementById('manual-consultor').value,
            justificativa: document.getElementById('manual-justificativa').value,
            status: 'pendente'
        };

        const { error } = await supabase.from('comissoes_manuais').insert(newComissao);

        if (error) {
            alert("Erro ao salvar solicitação: " + error.message);
            return;
        }

        alert('Solicitação de comissão manual enviada para aprovação!');
        await this.logAction(`Enviou comissão manual para aprovação de ${formatCurrency(valorVenda)} para ${arq.nome}`);
        form.reset();
        await this.loadData();
        this.renderAll();
    }
    
    async handleAprovarInclusaoManual(e) {
        const btn = e.target.closest('#aprovar-inclusao-manual-btn');
        if (!btn) return;
    
        const comissaoId = parseInt(btn.dataset.comissaoId, 10);
        const comissao = this.comissoesManuais.find(c => c.id === comissaoId);
        if (!comissao) {
            alert('Erro: Comissão não encontrada.'); return;
        }
    
        if (comissao.status === 'aprovada') {
            alert('Esta comissão já foi aprovada.'); return;
        }

        // Verifica se a venda já foi importada antes de aprovar
        if (comissao.id_venda) {
            const { data: existingSale, error: checkError } = await supabase
                .from('sysled_imports')
                .select('id_pedido')
                .eq('id_pedido', comissao.id_venda)
                .maybeSingle();

            if (checkError) {
                alert('Erro ao verificar a existência da venda: ' + checkError.message);
                return;
            }

            if (existingSale) {
                alert(`Não é possível aprovar. A venda com ID ${comissao.id_venda} já foi importada anteriormente.`);
                return;
            }
        }
    
        if (!confirm(`Aprovar a inclusão de ${formatCurrency(comissao.valor_venda)} para o parceiro ${comissao.id_parceiro}?`)) return;
    
        const arq = this.arquitetos.find(a => a.id === comissao.id_parceiro);
        if (!arq) {
            alert(`Arquiteto com ID ${comissao.id_parceiro} não foi encontrado.`); return;
        }
    
        const valorVenda = comissao.valor_venda;
        const payload = {
            valorVendasTotal: (arq.valorVendasTotal || 0) + valorVenda,
            pontos: (this.pontuacoes[comissao.id_parceiro] || 0) + Math.floor(valorVenda / 1000),
            salesCount: (arq.salesCount || 0) + 1,
        };
        if (this.schemaHasRtAcumulado) {
            payload.rt_acumulado = parseFloat(arq.rt_acumulado || 0) + (valorVenda * (arq.rtPercentual || 0.05));
        }
    
        const { error: updateError } = await supabase.from('arquitetos').update(payload).eq('id', comissao.id_parceiro);
        if (updateError) {
            alert("Erro ao atualizar dados do arquiteto: " + updateError.message); return;
        }
    
        const { error: comissaoError } = await supabase.from('comissoes_manuais').update({ status: 'aprovada' }).eq('id', comissaoId);
        if (comissaoError) {
            alert("Dados do arquiteto atualizados, mas falha ao marcar comissão como aprovada: " + comissaoError.message);
        }
    
        if (comissao.id_venda) {
            const { error } = await supabase.from('sysled_imports').insert({ 
                id_parceiro: comissao.id_parceiro, 
                valor_nota: comissao.valor_venda, 
                data_finalizacao_prevenda: comissao.data_venda, 
                id_pedido: comissao.id_venda 
            });
            if (error) alert("Aviso: Erro ao registrar na tabela de controle de duplicados (sysled_imports).");
        }
        
        alert('Comissão aprovada e valores contabilizados com sucesso!');
        await this.logAction(`Aprovou comissão manual de ${formatCurrency(valorVenda)} para ${arq.nome} (ID: ${arq.id})`);
        
        this.closeComissaoManualDetailsModal();
        await this.loadData();
        this.renderAll();
    }

    handleHistoricoManualClick(e) {
        const btn = e.target.closest('.view-comissao-details-btn');
        if (btn) { e.preventDefault(); this.openComissaoManualDetailsModal(parseInt(btn.dataset.comissaoId, 10)); }
    }

    // NOVO: Limpa todos os logs de eventos
    async clearEventsLog() {
        if (confirm('Tem certeza que deseja apagar TODOS os logs de eventos? Esta ação é irreversível.')) {
            const { error } = await supabase.from('action_logs').delete().neq('id', 0); // Deleta todos os registros
            if (error) {
                alert('Erro ao limpar o log de eventos: ' + error.message);
            } else {
                alert('Log de eventos limpo com sucesso.');
                await this.logAction('Limpou todo o log de eventos.');
                await this.loadData(); // Recarrega os dados (agora vazios)
                this.renderEventosLog(); // Re-renderiza a tabela
            }
        }
    }
}

export default RelacionamentoApp;
