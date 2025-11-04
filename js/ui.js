import { formatCurrency, formatApiDateToBR, parseCurrency, formatApiNumberToBR } from './utils.js';

/**
 * Renderiza ou atualiza todos os componentes visuais da aplicação.
 * @param {RelacionamentoApp} app - A instância principal da aplicação.
 */
export function renderAll(app) {
    renderArquitetosTable(app);
    renderRankingTable(app);
    populateArquitetoSelect(app);
    renderPagamentos(app);
    renderResgates(app);
    renderArquivosImportados(app);
    renderHistoricoManual(app);
    renderResultados(app);
    renderEventosLog(app);
    checkPaymentFeature(app);
    console.log("Todos os componentes foram renderizados.");
}

/**
 * Renderiza a tabela de arquitetos.
 * @description Filtra e ordena os arquitetos com base no estado atual da UI e os renderiza em uma tabela HTML.
 * Inclui funcionalidades de ordenação e exibe colunas condicionais com base no schema do banco de dados.
 */
export function renderArquitetosTable(app) {
    const container = document.getElementById('arquitetos-table-container');
    if (!container) return;
    const filter = document.getElementById('arquiteto-search-input').value.toLowerCase();
    let filteredArquitetos = app.arquitetos.filter(a =>
        (a.id || '').toString().toLowerCase().includes(filter) ||
        (a.nome || '').toLowerCase().includes(filter)
    );

    filteredArquitetos.sort((a, b) => {
        const key = app.sortColumn;
        const dir = app.sortDirection === 'asc' ? 1 : -1;
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
        container.innerHTML = `<p class="text-center text-gray-400 py-4">Nenhum arquiteto encontrado.</p>`;
        return;
    }

    const getSortIcon = (column) => {
        if (app.sortColumn !== column) return '<i class="fas fa-sort text-gray-300 ml-1"></i>';
        return app.sortDirection === 'asc' ? '<i class="fas fa-sort-up text-primary ml-1"></i>' : '<i class="fas fa-sort-down text-primary ml-1"></i>';
    };

    const headerRtAcumulado = app.schemaHasRtAcumulado ? `<th class="sortable-header cursor-pointer" data-sort="rt_acumulado">RT Acumulado ${getSortIcon('rt_acumulado')}</th>` : '';
    const headerRtTotal = app.schemaHasRtTotalPago ? `<th class="sortable-header cursor-pointer" data-sort="rt_total_pago">Total Pago ${getSortIcon('rt_total_pago')}</th>` : '';
    const headerRow = `<tr>
                            <th class="sortable-header cursor-pointer" data-sort="id">ID ${getSortIcon('id')}</th>
                            <th class="sortable-header cursor-pointer" data-sort="nome">Nome ${getSortIcon('nome')}</th>
                            <th class="sortable-header cursor-pointer text-center" data-sort="salesCount">Vendas ${getSortIcon('salesCount')}</th>
                            <th class="sortable-header cursor-pointer text-right" data-sort="valorVendasTotal">Valor Vendas ${getSortIcon('valorVendasTotal')}</th>
                            ${headerRtAcumulado}${headerRtTotal}
                            <th class="text-center">Ações</th></tr>`;

    const rows = filteredArquitetos.map(a => {
        let cellRtAcumulado = '';
        if (app.schemaHasRtAcumulado) {
            const rtAcumulado = a.rt_acumulado || 0;
            cellRtAcumulado = `<td class="text-right font-semibold ${rtAcumulado >= 300 ? 'text-primary' : ''}">${formatCurrency(rtAcumulado)}</td>`;
        }
        const cellRtTotal = app.schemaHasRtTotalPago ? `<td class="text-right">${formatCurrency(a.rt_total_pago || 0)}</td>` : '';
        return `<tr>
            <td><a href="#" class="id-link text-primary/80 hover:text-primary font-semibold" data-id="${a.id}">${a.id}</a></td>
            <td>${a.nome}</td>
            <td class="text-center">${a.salesCount || 0}</td>
            <td class="text-right">${formatCurrency(a.valorVendasTotal || 0)}</td>
            ${cellRtAcumulado}${cellRtTotal}
            <td class="text-center">
                <button class="add-value-btn text-green-400 hover:text-green-300" title="Adicionar Valor Manual" data-id="${a.id}"><span class="material-symbols-outlined">add_circle</span></button>
                <button class="edit-btn text-blue-400 hover:text-blue-300 ml-2" title="Editar" data-id="${a.id}"><span class="material-symbols-outlined">edit</span></button>
                <button class="delete-btn text-red-500 hover:text-red-400 ml-2" title="Apagar" data-id="${a.id}"><span class="material-symbols-outlined">delete</span></button>
            </td></tr>`;
    }).join('');

    container.innerHTML = `<div class="max-h-[65vh] overflow-y-auto"><table class="w-full"><thead>${headerRow}</thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Renderiza a seção de pagamentos agrupados por data.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} [filter=''] - Uma string para filtrar os pagamentos pelo ID do parceiro.
 */
export function renderPagamentos(app, filter = '') {
    const container = document.getElementById('pagamentos-container');
    if (!container) return;
    container.innerHTML = '';
    const dates = Object.keys(app.pagamentos).sort((a,b) => new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-')));
    if (dates.length === 0) {
        container.innerHTML = `<div class="glass-card rounded-lg p-6 text-center text-gray-400">Nenhum pagamento foi gerado ainda.</div>`; return;
    }

    let hasResults = false;
    dates.forEach(date => {
        let pagamentosDoDia = app.pagamentos[date].filter(p => !filter || (p.id_parceiro && p.id_parceiro.toString().includes(filter)));
        if (pagamentosDoDia.length > 0) {
            hasResults = true;
            const rowsHtml = pagamentosDoDia.map(p => {
                const hasComprovante = p.comprovante && p.comprovante.url;
                return `<tr>
                            <td>${p.id_parceiro}</td>
                            <td>${p.parceiro}</td>
                            <td>${p.consultor || 'N/A'}</td>
                            <td class="text-right font-semibold">${formatCurrency(p.rt_valor)}<button class="edit-rt-btn text-blue-400 hover:text-blue-300 ml-2" title="Editar Valor RT" data-id="${p.id}"><span class="material-symbols-outlined text-base align-middle">edit</span></button></td>
                            <td class="text-center"><input type="checkbox" class="pagamento-status h-5 w-5 rounded bg-background-dark border-white/20 text-primary focus:ring-primary" data-id="${p.id}" ${p.pago ? 'checked' : ''}></td>
                            <td><div class="flex items-center gap-2"><label for="comprovante-input-${p.id}" class="file-input-label bg-white/10 hover:bg-white/20 text-xs py-1 px-3 !font-medium whitespace-nowrap">Anexar</label><input type="file" id="comprovante-input-${p.id}" class="comprovante-input file-input" data-id="${p.id}"><span class="file-status-text text-xs ${hasComprovante ? 'text-green-400 font-semibold' : 'text-gray-400'}">${hasComprovante ? 'Comprovante anexado' : 'Nenhum arquivo'}</span></div></td>
                            <td class="text-center"><button class="view-comprovante-btn text-primary/80 hover:text-primary font-semibold" data-id="${p.id}" ${!hasComprovante ? 'disabled' : ''} style="${!hasComprovante ? 'opacity: 0.5; cursor: not-allowed;' : ''}">Ver</button></td>
                        </tr>`;
            }).join('');
            container.innerHTML += `<div class="payment-group-card"><div class="flex flex-wrap justify-between items-center mb-4 gap-4"><h2 class="text-xl font-semibold">Pagamentos Gerados em ${date}</h2><div class="flex items-center gap-2"><button class="gerar-relatorio-btn btn-modal !py-1 !px-3 !text-xs bg-blue-500/80 hover:bg-blue-500" data-date="${date}">Gerar Relatório</button><button class="download-xlsx-btn btn-modal !py-1 !px-3 !text-xs bg-green-500/80 hover:bg-green-500" data-date="${date}">Baixar XLSX</button><button class="delete-pagamentos-btn btn-modal !py-1 !px-3 !text-xs bg-red-600/80 hover:bg-red-600" data-date="${date}">Excluir Lote</button></div></div><div class="overflow-x-auto"><table><thead><tr><th>ID Parceiro</th><th>Parceiro</th><th>Consultor</th><th class="text-right">Valor RT</th><th class="text-center">Pago</th><th>Anexar Comprovante</th><th class="text-center">Ver</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
        }
    });
    if (!hasResults && filter) container.innerHTML = `<div class="glass-card rounded-lg p-6 text-center text-gray-400">Nenhum pagamento encontrado para o ID informado.</div>`;
}

/**
 * Renderiza a tabela unificada de resgates.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} [filter=''] - Uma string para filtrar os resgates pelo ID do parceiro.
 */
export function renderResgates(app, filter = '') {
    const container = document.getElementById('resgates-container');
    if (!container) return;

    let filteredResgates = app.resgates.filter(p => !filter || (p.id_parceiro && p.id_parceiro.toString().includes(filter)));

    if (filteredResgates.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 py-4">Nenhum resgate encontrado.</p>`;
        return;
    }

    // Ordena por data, o mais recente primeiro
    filteredResgates.sort((a, b) => new Date(b.data_geracao) - new Date(a.data_geracao));

    const rowsHtml = filteredResgates.map(p => {
        const hasComprovante = p.comprovante && p.comprovante.url;
        return `<tr>
                    <td>${formatApiDateToBR(p.data_geracao)}</td>
                    <td>${p.id_parceiro}</td>
                    <td>${p.parceiro}</td>
                    <td>${p.consultor || 'N/A'}</td>
                    <td class="text-right font-semibold">${formatCurrency(p.rt_valor)}<button class="edit-rt-btn text-blue-400 hover:text-blue-300 ml-2" title="Editar Valor RT" data-id="${p.id}"><span class="material-symbols-outlined text-base align-middle">edit</span></button></td>
                    <td class="text-center"><input type="checkbox" class="pagamento-status h-5 w-5 rounded bg-background-dark border-white/20 text-primary focus:ring-primary" data-id="${p.id}" ${p.pago ? 'checked' : ''}></td>
                    <td><div class="flex items-center gap-2"><label for="comprovante-input-${p.id}" class="file-input-label bg-white/10 hover:bg-white/20 text-xs py-1 px-3 !font-medium whitespace-nowrap">Anexar</label><input type="file" id="comprovante-input-${p.id}" class="comprovante-input file-input" data-id="${p.id}"><span class="file-status-text text-xs ${hasComprovante ? 'text-green-400 font-semibold' : 'text-gray-400'}">${hasComprovante ? 'Comprovante anexado' : 'Nenhum arquivo'}</span></div></td>
                    <td class="text-center"><button class="view-comprovante-btn text-primary/80 hover:text-primary font-semibold" data-id="${p.id}" ${!hasComprovante ? 'disabled' : ''} style="${!hasComprovante ? 'opacity: 0.5; cursor: not-allowed;' : ''}">Ver</button></td>
                </tr>`;
    }).join('');

    container.innerHTML = `<div class="overflow-x-auto"><table><thead><tr><th>Data</th><th>ID Parceiro</th><th>Parceiro</th><th>Consultor</th><th class="text-right">Valor RT</th><th class="text-center">Pago</th><th>Anexar Comprovante</th><th class="text-center">Ver</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

/**
 * Renderiza a tabela de ranking de arquitetos por pontuação.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function renderRankingTable(app) {
    const container = document.getElementById('ranking-table-container');
    const ranking = app.arquitetos.map(a => ({ ...a, pontos: app.pontuacoes[a.id] || 0 })).sort((a, b) => b.pontos - a.pontos);
    if (ranking.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400">Nenhum arquiteto para exibir.</p>`; return;
    }
    const rows = ranking.map(a => `<tr><td>${a.id}</td><td>${a.nome}</td><td class="font-bold text-primary">${a.pontos}</td></tr>`).join('');
    container.innerHTML = `<table><thead><tr><th>ID</th><th>Nome</th><th>Pontos</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Popula o select de arquitetos com os nomes dos arquitetos cadastrados.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function populateArquitetoSelect(app) {
    const select = document.getElementById('arquiteto-select');
    select.innerHTML = '<option value="" class="bg-background-dark">Selecione um arquiteto</option>';
    app.arquitetos.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(a => {
        select.innerHTML += `<option value="${a.id}" class="bg-background-dark">${a.nome}</option>`;
    });
}

/**
 * Renderiza a lista de arquivos que foram importados.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function renderArquivosImportados(app) {
    const container = document.getElementById('arquivos-importados-container');
    container.innerHTML = '';
    const dates = Object.keys(app.importedFiles).sort((a,b) => new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-')));
    if (dates.length === 0) {
        container.innerHTML = `<div class="glass-card rounded-lg p-6 text-center text-gray-400">Nenhum arquivo foi importado.</div>`; return;
    }
    dates.forEach(date => {
        const fileInfo = app.importedFiles[date];
        container.innerHTML += `<div class="imported-file-card"><div class="flex flex-wrap justify-between items-center gap-4"><div><h3 class="font-semibold text-lg text-white">Importação de ${date}</h3><p class="text-sm text-gray-400 mt-1">${fileInfo.name}</p></div><button class="download-arquivo-btn btn-modal !py-2 !px-4 !text-sm bg-indigo-500/80 hover:bg-indigo-500 flex items-center gap-2" data-date="${date}"><span class="material-symbols-outlined">download</span>Baixar</button></div></div>`;
    });
}

/**
 * Renderiza o histórico de comissões manuais.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function renderHistoricoManual(app) {
    const container = document.getElementById('historico-manual-container');
    if (!container) return;

    let rowsHtml = '';
    if (app.comissoesManuais.length === 0) {
        rowsHtml = `<tr><td colspan="7" class="text-center text-gray-400 py-4">Nenhuma comissão manual adicionada ainda.</td></tr>`;
    } else {
        rowsHtml = app.comissoesManuais.map(c => {
            const status = c.status || 'pendente';
            let statusColor, statusText;
            switch (status) {
                case 'aprovada':
                    statusColor = 'bg-green-500/20 text-green-300'; statusText = 'Aprovada'; break;
                case 'Recusada Gestão':
                    statusColor = 'bg-red-500/20 text-red-300'; statusText = 'Recusada'; break;
                default:
                    statusColor = 'bg-yellow-500/20 text-yellow-300'; statusText = 'Pendente'; break;
            }
            return `
            <tr>
                <td>${c.id_parceiro}</td>
                <td><a href="#" class="view-comissao-details-btn text-primary/80 hover:text-primary font-semibold" data-comissao-id="${c.id}">${c.id_venda || 'N/A'}</a></td>
                <td>${formatApiDateToBR(c.data_venda)}</td>
                <td class="text-right">${formatCurrency(c.valor_venda)}</td>
                <td title="${c.justificativa}">${(c.justificativa || '').substring(0, 30)}${c.justificativa && c.justificativa.length > 30 ? '...' : ''}</td>
                <td>${c.consultor || ''}</td>
                <td class="text-center"><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">${statusText}</span></td>
            </tr>`;
        }).join('');
    }

    container.innerHTML = `
        <div class="max-h-[65vh] overflow-y-auto">
            <table>
                <thead>
                    <tr>
                        <th>ID Parceiro</th>
                        <th>ID Venda</th>
                        <th>Data</th>
                        <th class="text-right">Valor</th>
                        <th>Justificativa</th>
                        <th>Consultor</th>
                        <th class="text-center">Status</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;
}

/**
 * Renderiza os resultados financeiros totais, como RTs pagas e a pagar.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function renderResultados(app) {
    const todosPagamentos = Object.values(app.pagamentos).flat().concat(app.resgates);

    // Cálculos de RTs Pagas
    const pagamentosPagos = todosPagamentos.filter(p => p.pago);
    const totalRTsPagas = pagamentosPagos.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
    const quantidadeRTsPagas = pagamentosPagos.length;
    const rtMedia = quantidadeRTsPagas > 0 ? totalRTsPagas / quantidadeRTsPagas : 0;

    // Cálculos de RTs a Pagar
    const pagamentosNaoPagos = todosPagamentos.filter(p => !p.pago);
    const valorEmPagamentosNaoPagos = pagamentosNaoPagos.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
    const valorAcumuladoNaoGerado = app.arquitetos.reduce((sum, arq) => sum + (parseFloat(arq.rt_acumulado) || 0), 0);
    const totalRtAPagar = valorEmPagamentosNaoPagos + valorAcumuladoNaoGerado;
    const quantidadeRTsNaoPagas = pagamentosNaoPagos.length;


    // Atualização do DOM
    document.getElementById('total-rt').textContent = formatCurrency(totalRTsPagas);
    document.getElementById('total-rt-quantidade').textContent = quantidadeRTsPagas;
    document.getElementById('rt-media').textContent = formatCurrency(rtMedia);
    document.getElementById('total-rt-a-pagar').textContent = formatCurrency(totalRtAPagar);
    document.getElementById('total-rt-nao-pagas').textContent = quantidadeRTsNaoPagas;
}

/**
 * Renderiza a tabela de dados da API Sysled.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @description Filtra e exibe os dados da API Sysled com base nos filtros da UI.
 * Formata valores de data e moeda para exibição.
 */
export function renderSysledTable(app) {
    const container = document.getElementById('sysled-table-container');
    if (!container) return;
    if (app.sysledData.length === 0) {
         container.innerHTML = `<div class="text-center text-gray-400 py-8"><p>Clique em "Atualizar" para carregar as informações da API Sysled.</p></div>`; return;
    }
    const dataInicio = document.getElementById('sysled-filter-data-inicio').value;
    const dataFim = document.getElementById('sysled-filter-data-fim').value;
    const parceiro = document.getElementById('sysled-filter-parceiro').value.toLowerCase();
    const excluirParceiroInput = document.getElementById('sysled-filter-excluir-parceiro').value;
    const columnFilters = {};
    container.querySelectorAll('.sysled-column-filter').forEach(input => {
        if (input.value) columnFilters[input.dataset.column] = input.value.toLowerCase();
    });
    let dataToRender = [...app.sysledData];
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
    app.sysledFilteredData = dataToRender;
    const headers = Object.keys(app.sysledData[0]);
    const headerHtml = headers.map(h => `<th>${h.replace(/_/g, ' ')}</th>`).join('');
    const filterHtml = headers.map(h => `<th><input type="text" class="sysled-column-filter w-full p-1 border rounded-md text-sm bg-background-dark/50 border-white/10" placeholder="Filtrar..." data-column="${h}" value="${columnFilters[h] ? columnFilters[h].replace(/"/g, '&quot;') : ''}"></th>`).join('');
    const rowsHtml = app.sysledFilteredData.length === 0
        ? `<tr><td colspan="${headers.length}" class="text-center text-gray-400 py-8">Nenhum resultado encontrado.</td></tr>`
        : app.sysledFilteredData.map(row => `<tr>${headers.map(h => {
            let cellValue = row[h];
            const lowerCaseHeader = h.toLowerCase();
            if (lowerCaseHeader.includes('data')) cellValue = formatApiDateToBR(cellValue);
            else if (lowerCaseHeader.includes('valor') || lowerCaseHeader.includes('total') || lowerCaseHeader.includes('valornota')) {
                if (cellValue !== null && !isNaN(Number(String(cellValue)))) cellValue = formatApiNumberToBR(cellValue);
            }
            return `<td>${cellValue ?? ''}</td>`;
        }).join('')}</tr>`).join('');
    container.innerHTML = `<div class="max-h-[65vh] overflow-auto"><table><thead class="sticky top-0 z-10"><tr>${headerHtml}</tr><tr>${filterHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

/**
 * Renderiza o histórico de vendas em um modal.
 * @param {Array<Object>} salesData - Os dados das vendas a serem exibidos.
 * @param {boolean} isApiData - Flag que indica se os dados vêm da API, para adicionar links de detalhes.
 */
export function renderSalesHistoryModal(salesData, isApiData) {
    const container = document.getElementById('sales-history-table-container');
    if (!salesData || salesData.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 py-8">Nenhuma venda encontrada para este parceiro.</p>`; return;
    }
    const rowsHtml = salesData.map(sale => {
        const idCellContent = isApiData
            ? `<a href="#" class="view-sale-details-btn text-primary/80 hover:text-primary" data-pedido-id="${sale.id_pedido}">${sale.id_pedido}</a>`
            : sale.id_pedido;
        return `<tr><td>${idCellContent}</td><td class="text-right">${formatCurrency(sale.valor_nota)}</td><td class="text-center">${formatApiDateToBR(sale.data_finalizacao_prevenda)}</td></tr>`
    }).join('');
    container.innerHTML = `<table><thead><tr><th>ID Pedido</th><th class="text-right">Valor da Nota</th><th class="text-center">Data da Venda</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

/**
 * Renderiza a tabela de logs de eventos.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function renderEventosLog(app) {
    const container = document.getElementById('eventos-log-container');
    if (!container) return;

    if (app.actionLogs.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 py-8">Nenhum evento registrado.</p>`;
        return;
    }

    const rowsHtml = app.actionLogs.map(log => {
        const timestamp = new Date(log.when_did).toLocaleString('pt-BR');
        return `
            <tr>
                <td>${log.who_did}</td>
                <td>${log.what_did}</td>
                <td>${timestamp}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Quando</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

/**
 * Verifica se a funcionalidade de pagamento está habilitada e ajusta o botão correspondente na UI.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @description A funcionalidade de pagamento depende da existência das colunas 'rt_acumulado' e 'rt_total_pago' no banco de dados.
 */
export function checkPaymentFeature(app) {
    const btn = document.getElementById('gerar-pagamentos-rt-btn');
    if (!btn) return;
    const isEnabled = app.schemaHasRtAcumulado && app.schemaHasRtTotalPago;
    btn.disabled = !isEnabled;
    btn.title = isEnabled ? "Gerar pagamentos para arquitetos elegíveis" : "Funcionalidade desabilitada. Crie as colunas 'rt_acumulado' e 'rt_total_pago' no banco de dados.";
    btn.classList.toggle('opacity-50', !isEnabled);
    btn.classList.toggle('cursor-not-allowed', !isEnabled);
}

// --- MÉTODOS DE MANIPULAÇÃO DE MODAIS ---

/**
 * Abre o modal de mapeamento de colunas de RT (vendas).
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Array<string>} headers - Os cabeçalhos do arquivo importado.
 */
export function openRtMappingModal(app, headers) {
    const form = document.getElementById('rt-mapping-form');
    const modal = document.getElementById('rt-mapping-modal');
    form.innerHTML = '';
    const fields = { id_prevenda: 'ID Prevenda', data_venda: 'Data Venda', nome_cliente: 'Nome Cliente', valor_venda: 'Valor Venda', executivo: 'Executivo', id_parceiro: 'ID Parceiro', parceiro: 'Parceiro', loja: 'Loja' };
    const autoMap = { id_prevenda: 'idPedido', data_venda: 'dataFinalizacaoPrevenda', nome_cliente: 'clienteFantasia', valor_venda: 'valorNota', executivo: 'consultor', id_parceiro: 'idParceiro', parceiro: 'parceiro', loja: 'idEmpresa' };
    for (const key in fields) {
        const options = headers.map(h => `<option value="${h}" class="bg-background-dark">${h}</option>`).join('');
        form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label for="map-${key}" class="font-medium text-gray-300">${fields[key]}</label><select id="map-${key}" name="${key}" class="glass-input w-full p-2 rounded-lg"><option value="" class="bg-background-dark">Selecione...</option>${options}</select></div>`;
        if (app.isSysledImport) {
            const select = form.querySelector(`#map-${key}`);
            if (select && headers.includes(autoMap[key])) select.value = autoMap[key];
        }
    }
    modal.onclick = (e) => {
        if (e.target === modal) closeRtMappingModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de mapeamento de colunas de RT.
 */
export function closeRtMappingModal() {
    document.getElementById('rt-mapping-modal').classList.remove('active');
    const fileInput = document.getElementById('rt-file-input');
    if (fileInput) fileInput.value = '';
    document.getElementById('rt-file-name').textContent = '';
}

/**
 * Abre o modal de mapeamento de colunas de arquitetos.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Array<string>} headers - Os cabeçalhos do arquivo importado.
 */
export function openArquitetoMappingModal(app, headers) {
    const form = document.getElementById('arquiteto-mapping-form');
    const modal = document.getElementById('arquiteto-mapping-modal');
    form.innerHTML = '';
    const fields = { id: 'ID', nome: 'Nome', email: 'Email', telefone: 'Telefone', chave_pix: 'Chave PIX', tipo_chave_pix: 'Tipo Chave PIX' };
    for (const key in fields) {
        const options = headers.map(h => `<option value="${h}" class="bg-background-dark">${h}</option>`).join('');
        form.innerHTML += `<div class="grid grid-cols-2 gap-4 items-center"><label class="font-medium text-gray-300">${fields[key]}</label><select name="${key}" class="glass-input w-full p-2 rounded-lg"><option value="" class="bg-background-dark">Selecione...</option>${options}</select></div>`;
    }
    modal.onclick = (e) => {
        if (e.target === modal) closeArquitetoMappingModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de mapeamento de colunas de arquitetos.
 */
export function closeArquitetoMappingModal() {
    document.getElementById('arquiteto-mapping-modal').classList.remove('active');
    const fileInput = document.getElementById('arquiteto-file-input');
    if (fileInput) fileInput.value = '';
    document.getElementById('file-name-arquitetos').textContent = '';
}

/**
 * Abre o modal de edição de arquiteto.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} id - O ID do arquiteto a ser editado.
 */
export function openEditModal(app, id) {
    const arquiteto = app.arquitetos.find(a => String(a.id) === String(id));
    if (!arquiteto) return;
    document.getElementById('edit-arquiteto-original-id').value = arquiteto.id;
    document.getElementById('edit-arquiteto-id').textContent = `ID: ${arquiteto.id}`;
    document.getElementById('edit-arquiteto-nome').value = arquiteto.nome || '';
    document.getElementById('edit-arquiteto-email').value = arquiteto.email || '';
    document.getElementById('edit-arquiteto-telefone').value = arquiteto.telefone || '';
    document.getElementById('edit-arquiteto-pix').value = arquiteto.pix || '';
    document.getElementById('edit-arquiteto-tipo-pix').value = arquiteto.tipo_chave_pix || '';
    document.getElementById('edit-arquiteto-vendas').value = arquiteto.salesCount || 0;
    document.getElementById('rt-valor-vendas').textContent = formatCurrency(arquiteto.valorVendasTotal || 0);
    document.getElementById('rt-percentual').value = arquiteto.rtPercentual || 0.05;
    if(app.schemaHasRtAcumulado) document.getElementById('edit-arquiteto-rt-acumulado').textContent = formatCurrency(arquiteto.rt_acumulado || 0);
    if(app.schemaHasRtTotalPago) document.getElementById('edit-arquiteto-rt-total-pago').textContent = formatCurrency(arquiteto.rt_total_pago || 0);
    const modal = document.getElementById('edit-arquiteto-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeEditModal();
    };
    modal.classList.add('active');
    app.calculateRT();
}

/**
 * Fecha o modal de edição de arquiteto.
 */
export function closeEditModal() {
    document.getElementById('edit-arquiteto-modal').classList.remove('active');
}

/**
 * Abre o modal para adicionar um valor de venda manual a um arquiteto.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} id - O ID do arquiteto.
 */
export function openAddValueModal(app, id) {
    const arquiteto = app.arquitetos.find(a => a.id === id);
    if (!arquiteto) return;
    document.getElementById('add-value-modal-title').textContent = `Adicionar Venda Manual para ${arquiteto.nome}`;
    document.getElementById('add-value-arquiteto-id').value = id;
    const modal = document.getElementById('add-value-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeAddValueModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de adicionar valor de venda manual.
 */
export function closeAddValueModal() {
    const modal = document.getElementById('add-value-modal');
    modal.classList.remove('active');
    document.getElementById('add-value-form').reset();
}

/**
 * Abre o modal para visualizar o comprovante de um pagamento ou resgate.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} pagamentoId - O ID do pagamento ou resgate.
 * @param {('pagamento'|'resgate')} [type='pagamento'] - O tipo de transação.
 */
export function openComprovanteModal(app, pagamentoId, type = 'pagamento') {
    let pagamento;
    if (type === 'resgate') {
        pagamento = app.resgates.find(p => p.id.toString() === pagamentoId);
    } else {
        pagamento = Object.values(app.pagamentos).flat().find(p => p.id.toString() === pagamentoId);
    }

    if (!pagamento) return;

    document.getElementById('comprovante-modal-title').textContent = `Detalhes de Pagamento para ${pagamento.parceiro}`;
    document.getElementById('comprovante-valor-rt').textContent = formatCurrency(pagamento.rt_valor || 0);
    const imgContainer = document.getElementById('comprovante-img-container');
    imgContainer.innerHTML = (pagamento.comprovante && pagamento.comprovante.url)
        ? `<img src="${pagamento.comprovante.url}" alt="${pagamento.comprovante.name}" class="max-w-full max-h-96 object-contain rounded-lg">`
        : `<p class="text-gray-400">Nenhum comprovante anexado.</p>`;
    const modal = document.getElementById('comprovante-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeComprovanteModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de visualização de comprovante.
 */
export function closeComprovanteModal() {
    document.getElementById('comprovante-modal').classList.remove('active');
}

/**
 * Abre o modal para gerar pagamentos em lote para arquitetos elegíveis.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function openGerarPagamentosModal(app) {
    const container = document.getElementById('gerar-pagamentos-table-container');
    const rowsHtml = app.eligibleForPayment.map(a => `
        <tr><td>${a.id}</td><td>${a.nome}</td><td class="text-right font-semibold text-primary">${formatCurrency(a.rt_acumulado || 0)}</td><td>${(a.tipo_chave_pix ? a.tipo_chave_pix + ': ' : '') + (a.pix || 'Não cadastrado')}</td></tr>`).join('');
    container.innerHTML = `<table><thead><tr><th>ID</th><th>Nome</th><th class="text-right">Valor a Pagar</th><th>Chave PIX</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    const modal = document.getElementById('gerar-pagamentos-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeGerarPagamentosModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de geração de pagamentos.
 */
export function closeGerarPagamentosModal() {
    document.getElementById('gerar-pagamentos-modal').classList.remove('active');
}

/**
 * Abre o modal com os detalhes de uma venda específica da API Sysled.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} pedidoId - O ID do pedido a ser visualizado.
 */
export function openSaleDetailsModal(app, pedidoId) {
    if (!pedidoId || pedidoId === 'N/A') { alert("ID do Pedido inválido."); return; }
    const saleData = app.sysledData.find(row => String(row.idPedido) === String(pedidoId));
    if (!saleData) { alert(`Detalhes para o pedido ${pedidoId} não foram encontrados.`); return; }
    document.getElementById('sale-details-modal-title').textContent = `Detalhes da Venda - Pedido ${pedidoId}`;
    document.getElementById('import-single-sale-btn').dataset.pedidoId = pedidoId;
    const detailsHtml = Object.entries(saleData).map(([key, value]) => `<tr><td class="p-2 font-semibold text-gray-300 align-top">${key}</td><td class="p-2 text-gray-100">${value ?? ''}</td></tr>`).join('');
    document.getElementById('sale-details-content').innerHTML = `<table class="w-full text-sm"><tbody>${detailsHtml}</tbody></table>`;
    const modal = document.getElementById('sale-details-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeSaleDetailsModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de detalhes da venda.
 */
export function closeSaleDetailsModal() {
    document.getElementById('sale-details-modal').classList.remove('active');
}

/**
 * Fecha o modal de histórico de vendas.
 */
export function closeSalesHistoryModal() {
    document.getElementById('sales-history-modal').classList.remove('active');
}

/**
 * Abre o modal com os detalhes de uma comissão manual.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {number} comissaoId - O ID da comissão manual.
 */
export function openComissaoManualDetailsModal(app, comissaoId) {
    const comissao = app.comissoesManuais.find(c => c.id === comissaoId);
    if (!comissao) { alert('Detalhes da comissão não encontrados.'); return; }
    const arquiteto = app.arquitetos.find(a => a.id === comissao.id_parceiro);
    const status = comissao.status || 'pendente';

    let statusColor;
    if (status === 'aprovada') {
        statusColor = 'bg-green-500/20 text-green-300';
    } else if (status === 'Recusada Gestão') {
        statusColor = 'bg-red-500/20 text-red-300';
    } else {
        statusColor = 'bg-yellow-500/20 text-yellow-300';
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
    ].map(item => `<div class="grid grid-cols-3 gap-2"><p class="font-medium text-gray-400 col-span-1">${item.label}:</p><div class="col-span-2 ${item.pre ? 'whitespace-pre-wrap' : ''}">${item.value}</div></div>`).join('');
    document.getElementById('comissao-manual-details-content').innerHTML = content;

    const approveBtn = document.getElementById('aprovar-inclusao-manual-btn');
    approveBtn.dataset.comissaoId = comissaoId;
    approveBtn.style.display = status === 'aprovada' ? 'none' : 'inline-block';

    const modal = document.getElementById('comissao-manual-details-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeComissaoManualDetailsModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de detalhes da comissão manual.
 */
export function closeComissaoManualDetailsModal() {
    document.getElementById('comissao-manual-details-modal').classList.remove('active');
}

/**
 * Abre o modal para editar o valor de um RT (pagamento ou resgate).
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} pagamentoId - O ID do pagamento ou resgate.
 * @param {('pagamento'|'resgate')} [type='pagamento'] - O tipo de transação.
 */
export function openEditRtModal(app, pagamentoId, type = 'pagamento') {
    let pagamento;
    if (type === 'resgate') {
        pagamento = app.resgates.find(p => p.id.toString() === pagamentoId);
    } else {
        pagamento = Object.values(app.pagamentos).flat().find(p => p.id.toString() === pagamentoId);
    }
    if (!pagamento) return;

    const form = document.getElementById('edit-rt-form');
    form.dataset.type = type; // Armazena o tipo no dataset do formulário
    document.getElementById('edit-rt-pagamento-id').value = pagamento.id;
    document.getElementById('edit-rt-input').value = parseCurrency(pagamento.rt_valor);
    const modal = document.getElementById('edit-rt-modal');
    modal.onclick = (e) => {
        if (e.target === modal) closeEditRtModal();
    };
    modal.classList.add('active');
}

/**
 * Fecha o modal de edição de valor de RT.
 */
export function closeEditRtModal() {
    const modal = document.getElementById('edit-rt-modal');
    modal.classList.remove('active');
    document.getElementById('edit-rt-form').reset();
}

/**
 * Mostra o modal de cadastro de novo arquiteto.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Object} arquiteto - O objeto do arquiteto a ser cadastrado.
 */
export function showNovoArquitetoModal(app, arquiteto) {
    document.getElementById('novo-arquiteto-id').value = arquiteto.id;
    document.getElementById('novo-arquiteto-nome').value = arquiteto.nome;
    document.getElementById('novo-arquiteto-id-display').value = arquiteto.id;
    document.getElementById('novo-arquiteto-nome-display').value = arquiteto.nome;

    // Limpar campos
    document.getElementById('novo-arquiteto-email').value = '';
    document.getElementById('novo-arquiteto-tipo-pix').value = '';
    document.getElementById('novo-arquiteto-pix').value = '';
    document.getElementById('novo-arquiteto-telefone').value = '';

    const modal = document.getElementById('novo-arquiteto-modal');
    modal.onclick = (e) => {
        if (e.target === modal) cancelNovoArquiteto(app);
    };
    modal.classList.add('active');
}

/**
 * Cancela o cadastro de novo arquiteto e a importação pendente.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function cancelNovoArquiteto(app) {
    document.getElementById('novo-arquiteto-modal').classList.remove('active');
    app.isSysledImport = false;
    app.pendingImportData = null;
}
