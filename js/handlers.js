import { supabase, parseCurrency, formatCurrency, fileToBase64, jsonToXLSXDataURL, formatApiDateToBR, formatApiNumberToBR, parseApiNumber } from './utils.js';
import * as ui from './ui.js';

// --- MÉTODOS DE LÓGICA DE NEGÓCIO E MANIPULAÇÃO DE DADOS ---

/**
 * Registra uma ação no log de eventos do Supabase.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} actionDescription - A descrição da ação a ser registrada.
 */
export async function logAction(app, actionDescription) {
    const { error } = await supabase.from('action_logs').insert({
        who_did: app.currentUserEmail,
        what_did: actionDescription
    });
    if (error) {
        console.error('Erro ao registrar ação no log:', error);
    }
}

/**
 * Manipula cliques na tabela de arquitetos, delegando para as ações corretas (editar, deletar, adicionar valor).
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handleArquitetosTableClick(app, e) {
    const idLink = e.target.closest('.id-link');
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const addValueBtn = e.target.closest('.add-value-btn');

    if (idLink) {
        e.preventDefault();
        handleConsultarVendasClick(app, e, idLink.dataset.id);
    }
    if (editBtn) ui.openEditModal(app, editBtn.dataset.id);
    if (deleteBtn) deleteArquiteto(app, deleteBtn.dataset.id);
    if (addValueBtn) ui.openAddValueModal(app, addValueBtn.dataset.id);
}

/**
 * Manipula a seleção de um arquivo de RT (vendas) e abre o modal de mapeamento.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} event - O objeto do evento de seleção de arquivo.
 */
export function handleRTFileSelect(app, event) {
    app.isSysledImport = false;
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('rt-file-name').textContent = `Arquivo: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        app.tempRTData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
        const headers = app.tempRTData.length > 0 ? Object.keys(app.tempRTData[0]) : [];
        ui.openRtMappingModal(app, headers);
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Processa o mapeamento de colunas de RT (vendas) e inicia o processamento dos dados.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleRtMapping(app) {
    const mapping = {};
    document.getElementById('rt-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });
    if (!mapping.id_parceiro || !mapping.valor_venda) {
        alert("Os campos 'ID Parceiro' e 'Valor Venda' são obrigatórios."); return;
    }
    if (app.isSysledImport && !mapping.id_prevenda) {
        alert("O 'ID Prevenda' é obrigatório para importações Sysled para evitar duplicatas."); return;
    }
    let processedData = app.tempRTData.map(row => {
        const newRow = {};
        for (const key in mapping) { if (mapping[key]) newRow[key] = row[mapping[key]]; }
        if (app.isSysledImport) newRow.valor_venda = parseApiNumber(newRow.valor_venda);
        return newRow;
    });

    if (app.isSysledImport) {
        const pedidoIds = processedData.map(row => row.id_prevenda).filter(id => id);
        if (pedidoIds.length > 0) {
            const { data: existing, error } = await supabase.from('sysled_imports').select('id_pedido').in('id_pedido', pedidoIds);
        }
    }
    if (processedData.length > 0) {
        await processRTData(app, processedData);
    } else {
        alert("Nenhuma venda nova para importar.");
    }
}

/**
 * Processa os dados de vendas, atualizando ou criando arquitetos e salvando o arquivo importado.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Array<Object>} data - Os dados de vendas a serem processados.
 */
export async function processRTData(app, data) {
    const todayKey = new Date().toLocaleDateString('pt-BR');
    const todayDB = new Date().toISOString().slice(0, 10);
    let fileToSave = null;

    if (app.isSysledImport) {
        fileToSave = { name: `importacao_sysled_${todayKey.replace(/\//g, '-')}.xlsx`, dataUrl: jsonToXLSXDataURL(app.tempRTData) };
    } else {
        const file = document.getElementById('rt-file-input').files[0];
        if (file) fileToSave = { name: file.name, dataUrl: await fileToBase64(file) };
    }

    if (fileToSave) {
        const { data: fileData, error } = await supabase.from('arquivos_importados').insert({ data_importacao: todayDB, name: fileToSave.name, dataUrl: fileToSave.dataUrl }).select().single();
        if (error) console.error("Erro ao salvar arquivo:", error);
        else {
            app.importedFiles[todayKey] = { name: fileData.name, dataUrl: fileData.dataUrl, id: fileData.id };
            await logAction(app, `Importou o arquivo: ${fileToSave.name}`);
        }
    }

    const architectUpdates = {};
    for (const record of data) {
        const partnerId = String(record.id_parceiro);
        if (!partnerId) continue;
        const valorVenda = parseCurrency(record.valor_venda);
        let arquiteto = app.arquitetos.find(a => a.id === partnerId);
        if (!arquiteto) {
            const newArquitetoData = { id: partnerId, nome: record.parceiro || 'Novo Parceiro', salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05, rt_acumulado: 0, rt_total_pago: 0 };
            const { data: created, error } = await supabase.from('arquitetos').insert(newArquitetoData).select().single();
            if (error) { console.error(`Erro ao criar arquiteto ${partnerId}:`, error); continue; }
            app.arquitetos.push(created);
            arquiteto = created;
            await logAction(app, `Criou novo arquiteto (ID: ${partnerId}) via importação.`);
        }
        if (!architectUpdates[partnerId]) architectUpdates[partnerId] = { valorVendasTotal: arquiteto.valorVendasTotal || 0, salesCount: arquiteto.salesCount || 0, pontos: arquiteto.pontos || 0, rt_acumulado: parseFloat(arquiteto.rt_acumulado || 0) };
        architectUpdates[partnerId].valorVendasTotal += valorVenda;
        architectUpdates[partnerId].salesCount += 1;
        architectUpdates[partnerId].pontos += Math.floor(valorVenda / 1000);
        if (app.schemaHasRtAcumulado) architectUpdates[partnerId].rt_acumulado += valorVenda * (arquiteto.rtPercentual || 0.05);
    }
    await Promise.all(Object.keys(architectUpdates).map(id => supabase.from('arquitetos').update(architectUpdates[id]).eq('id', id)));

    if (app.isSysledImport) {
        const payload = data.map(row => ({
            id_parceiro: row.id_parceiro,
            valor_nota: row.valor_venda,
            data_finalizacao_prevenda: row.data_venda,
            id_pedido: row.id_prevenda,
            consultor: row.executivo // Adicionado o campo consultor
        }));
        const { error } = await supabase.from('sysled_imports').insert(payload);
        if (error) {
            alert("AVISO: Os dados dos arquitetos foram atualizados, mas ocorreu um erro ao salvar o histórico de importação para evitar duplicatas. Vendas podem ser importadas novamente no futuro. Erro: " + error.message);
            console.error("Erro ao salvar na tabela sysled_imports:", error);
        }
    }

    alert('Dados de vendas processados com sucesso!');
    await app.loadData();
}

/**
 * Manipula o envio do formulário de adição de arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de envio do formulário.
 */
export async function handleAddArquiteto(app, e) {
    e.preventDefault();
    const id = document.getElementById('arquiteto-id').value;
    const nome = document.getElementById('arquiteto-nome').value;
    if (app.arquitetos.some(a => a.id === id)) { alert('ID já existe.'); return; }
    const newArquiteto = { id, nome, email: document.getElementById('arquiteto-email').value, telefone: document.getElementById('arquiteto-telefone').value, pix: document.getElementById('arquiteto-pix').value, salesCount: 0, valorVendasTotal: 0, pontos: 0, rtPercentual: 0.05, rt_acumulado: 0, rt_total_pago: 0 };
    const { data, error } = await supabase.from('arquitetos').insert(newArquiteto).select().single();
    if (error) { alert('Erro: ' + error.message); }
    else {
        app.arquitetos.push(data);
        app.pontuacoes[data.id] = data.pontos;
        await logAction(app, `Adicionou o arquiteto: ${nome} (ID: ${id})`);
        ui.renderAll(app);
        e.target.reset();
    }
}

/**
 * Manipula a seleção de um arquivo de arquitetos e abre o modal de mapeamento.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} event - O objeto do evento de seleção de arquivo.
 */
export function handleArquitetoFileUpload(app, event) {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('file-name-arquitetos').textContent = `Arquivo: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        app.tempArquitetoData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
        const headers = app.tempArquitetoData.length > 0 ? Object.keys(app.tempArquitetoData[0]) : [];
        ui.openArquitetoMappingModal(app, headers);
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Processa o mapeamento de colunas de arquitetos, criando novos ou atualizando existentes.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleArquitetoMapping(app) {
    const mapping = {};
    document.getElementById('arquiteto-mapping-form').querySelectorAll('select').forEach(s => { mapping[s.name] = s.value; });

    if (!mapping.id || !mapping.nome) {
        alert("Os campos 'ID' e 'Nome' são obrigatórios no mapeamento.");
        return;
    }

    const novosArquitetos = [];
    const arquitetosParaAtualizar = [];

    app.tempArquitetoData.forEach(row => {
        const id = String(row[mapping.id] || '');
        if (!id) return; // Pula linhas sem ID

        const arquitetoData = {
            id: id,
            nome: row[mapping.nome],
            email: row[mapping.email] || null,
            telefone: row[mapping.telefone] || null,
            pix: row[mapping.chave_pix] || null,
            tipo_chave_pix: row[mapping.tipo_chave_pix] || null
        };

        const arquitetoExistente = app.arquitetos.find(a => a.id === id);

        if (arquitetoExistente) {
            arquitetosParaAtualizar.push(arquitetoData);
        } else {
            novosArquitetos.push({
                ...arquitetoData,
                salesCount: 0,
                valorVendasTotal: 0,
                pontos: 0,
                rtPercentual: 0.05,
                rt_acumulado: 0,
                rt_total_pago: 0
            });
        }
    });

    let success = true;
    let errorMessage = '';
    let novosCount = 0;
    let atualizadosCount = 0;

    try {
        if (novosArquitetos.length > 0) {
            const { error } = await supabase.from('arquitetos').insert(novosArquitetos);
            if (error) throw error;
            novosCount = novosArquitetos.length;
        }

        if (arquitetosParaAtualizar.length > 0) {
            const updatePromises = arquitetosParaAtualizar.map(arq =>
                supabase.from('arquitetos').update({
                    nome: arq.nome,
                    email: arq.email,
                    telefone: arq.telefone,
                    pix: arq.pix,
                    tipo_chave_pix: arq.tipo_chave_pix
                }).eq('id', arq.id)
            );
            const results = await Promise.all(updatePromises);
            const updateErrors = results.filter(res => res.error);
            if (updateErrors.length > 0) {
                throw new Error(updateErrors.map(e => e.error.message).join(', '));
            }
            atualizadosCount = arquitetosParaAtualizar.length;
        }

    } catch (error) {
        success = false;
        errorMessage = error.message;
    }

    if (success) {
        let alertMessage = '';
        if (novosCount > 0) alertMessage += `${novosCount} novos arquitetos importados.\n`;
        if (atualizadosCount > 0) alertMessage += `${atualizadosCount} arquitetos atualizados.\n`;
        if (novosCount === 0 && atualizadosCount === 0) alertMessage = 'Nenhum arquiteto para importar ou atualizar.';

        alert(alertMessage.trim());
        await logAction(app, `Importou ${novosCount} e atualizou ${atualizadosCount} arquitetos via planilha.`);
        await app.loadData();
    } else {
        alert("Ocorreu um erro durante o processo:\n" + errorMessage);
    }
}

/**
 * Manipula o envio do formulário de edição de arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de envio do formulário.
 */
export async function handleEditArquiteto(app, e) {
    e.preventDefault();
    const originalId = document.getElementById('edit-arquiteto-original-id').value;
    const arquiteto = app.arquitetos.find(a => a.id === originalId);
    if (!arquiteto) return;

    const tipoPixValue = document.getElementById('edit-arquiteto-tipo-pix').value;
    const updatedData = {
        nome: document.getElementById('edit-arquiteto-nome').value,
        email: document.getElementById('edit-arquiteto-email').value,
        telefone: document.getElementById('edit-arquiteto-telefone').value,
        pix: document.getElementById('edit-arquiteto-pix').value,
        tipo_chave_pix: tipoPixValue || null,
        salesCount: parseInt(document.getElementById('edit-arquiteto-vendas').value, 10) || 0,
        rtPercentual: parseFloat(document.getElementById('rt-percentual').value)
    };

    if (app.schemaHasRtAcumulado && updatedData.rtPercentual !== arquiteto.rtPercentual) {
        updatedData.rt_acumulado = (arquiteto.valorVendasTotal || 0) * updatedData.rtPercentual - (arquiteto.rt_total_pago || 0);
    }
    const { data, error } = await supabase.from('arquitetos').update(updatedData).eq('id', originalId).select().single();
    if (error) { alert("Erro ao salvar: " + error.message); }
    else {
        const index = app.arquitetos.findIndex(a => a.id === originalId);
        app.arquitetos[index] = { ...app.arquitetos[index], ...data };
        await logAction(app, `Editou o arquiteto: ${updatedData.nome} (ID: ${originalId})`);
        ui.renderAll(app);
        ui.closeEditModal();
    }
}

/**
 * Deleta um arquiteto do banco de dados.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} id - O ID do arquiteto a ser deletado.
 */
export async function deleteArquiteto(app, id) {
    const arq = app.arquitetos.find(a => a.id === id);
    if (!arq) return;
    if (confirm(`Tem certeza que deseja apagar o arquiteto ${arq.nome} (ID: ${id})?`)) {
        const { error } = await supabase.from('arquitetos').delete().eq('id', id);
        if (error) { alert("Erro ao apagar: " + error.message); }
        else {
            app.arquitetos = app.arquitetos.filter(a => a.id !== id);
            delete app.pontuacoes[id];
            await logAction(app, `Apagou o arquiteto: ${arq.nome} (ID: ${id})`);
            ui.renderAll(app);
        }
    }
}

/**
 * Deleta TODOS os arquitetos e dados relacionados do banco de dados.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @description Esta é uma ação destrutiva que requer confirmação do usuário.
 */
export async function deleteAllArquitetos(app) {
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
            await logAction(app, `APAGOU TODOS OS DADOS DO SISTEMA.`);
        }
        await app.loadData();
        ui.renderAll(app);
    }
}

/**
 * Exporta os dados dos arquitetos para um arquivo CSV.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function exportArquitetosCSV(app) {
    if (app.arquitetos.length === 0) { alert("Não há dados para exportar."); return; }
    const data = app.arquitetos.map(a => {
        const row = { id: a.id, nome: a.nome, email: a.email, telefone: a.telefone, tipo_chave_pix: a.tipo_chave_pix, pix: a.pix, quantidade_vendas: a.salesCount || 0, valor_total_vendas: a.valorVendasTotal || 0, pontos: app.pontuacoes[a.id] || 0 };
        if (app.schemaHasRtAcumulado) row.rt_acumulado = a.rt_acumulado || 0;
        if (app.schemaHasRtTotalPago) row.rt_total_pago = a.rt_total_pago || 0;
        return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arquitetos");
    XLSX.writeFile(wb, "cadastro_arquitetos.xlsx");
    logAction(app, "Exportou a lista de arquitetos para CSV.");
}

/**
 * Manipula o envio do formulário para adicionar um valor de venda manual a um arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de envio do formulário.
 */
export async function handleAddValue(app, e) {
    e.preventDefault();
    const id = document.getElementById('add-value-arquiteto-id').value;
    const value = parseFloat(document.getElementById('add-value-input').value);
    const arq = app.arquitetos.find(a => a.id === id);
    if (arq && !isNaN(value)) {
        const payload = {
            valorVendasTotal: (arq.valorVendasTotal || 0) + value,
            pontos: (app.pontuacoes[id] || 0) + Math.floor(value / 1000),
            salesCount: (arq.salesCount || 0) + 1,
            ...(app.schemaHasRtAcumulado && { rt_acumulado: parseFloat(arq.rt_acumulado || 0) + (value * (arq.rtPercentual || 0.05)) })
        };
        const { data, error } = await supabase.from('arquitetos').update(payload).eq('id', id).select().single();
        if(error) { alert("Erro: " + error.message); }
        else {
            const index = app.arquitetos.findIndex(a => a.id === id);
            app.arquitetos[index] = data;
            app.pontuacoes[id] = data.pontos;
            await logAction(app, `Adicionou venda manual de ${formatCurrency(value)} para ${arq.nome} (ID: ${id})`);
            ui.renderAll(app);
            ui.closeAddValueModal();
        }
    }
}

/**
 * Manipula o envio do formulário para adicionar ou remover pontos de um arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de envio do formulário.
 */
export async function handleAddPontos(app, e) {
    e.preventDefault();
    const id = document.getElementById('arquiteto-select').value;
    const pontos = parseInt(document.getElementById('pontos-valor').value, 10);
    const arq = app.arquitetos.find(a => a.id === id);
    if (arq && !isNaN(pontos)) {
        const newPoints = (app.pontuacoes[id] || 0) + pontos;
        const { error } = await supabase.from('arquitetos').update({ pontos: newPoints }).eq('id', id);
        if (error) { alert("Erro: " + error.message); }
        else {
            app.pontuacoes[id] = newPoints;
            arq.pontos = newPoints;
            await logAction(app, `Ajustou ${pontos} pontos para ${arq.nome} (ID: ${id})`);
            ui.renderAll(app);
            e.target.reset();
        }
    }
}

/**
 * Manipula alterações nos checkboxes de status de pagamento e inputs de comprovante.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de alteração.
 */
export function handlePagamentosChange(app, e) {
    const target = e.target;
    if (!target.matches('.pagamento-status, .comprovante-input')) return;

    const container = target.closest('#pagamentos-container, #resgates-container');
    if (!container) return;
    const type = container.id === 'resgates-container' ? 'resgate' : 'pagamento';
    const { id } = target.dataset;

    if (target.matches('.pagamento-status')) {
        updatePagamentoStatus(app, id, target.checked, type);
    }
    if (target.matches('.comprovante-input')) {
        const statusSpan = target.parentElement.querySelector('.file-status-text');
        if (target.files.length > 0 && statusSpan) {
            statusSpan.textContent = 'Comprovante anexado';
            statusSpan.className = 'file-status-text text-xs text-green-400 font-semibold';
        }
        handleComprovanteUpload(app, id, target.files[0], type);
    }
}

/**
 * Manipula cliques nos botões da seção de pagamentos e resgates.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handlePagamentosClick(app, e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const container = btn.closest('#pagamentos-container, #resgates-container');
    if (!container) return;
    const type = container.id === 'resgates-container' ? 'resgate' : 'pagamento';
    const { date, id } = btn.dataset;

    if (btn.matches('.view-comprovante-btn') && !btn.disabled) {
        e.preventDefault();
        ui.openComprovanteModal(app, id, type);
    }
    if (btn.matches('.edit-rt-btn')) {
        ui.openEditRtModal(app, id, type);
    }

    // Ações específicas para a view de pagamentos (lotes)
    if (type === 'pagamento') {
        if (btn.matches('.delete-pagamentos-btn')) deletePagamentosGroup(app, date);
        if (btn.matches('.download-xlsx-btn')) exportPagamentosXLSX(app, date);
        if (btn.matches('.gerar-relatorio-btn')) generatePagamentoPrint(app, date);
    }
}

/**
 * Atualiza o status de um pagamento (pago/não pago) no banco de dados.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} pagamentoId - O ID do pagamento ou resgate.
 * @param {boolean} isChecked - O novo status de pagamento.
 * @param {('pagamento'|'resgate')} type - O tipo de transação.
 */
export async function updatePagamentoStatus(app, pagamentoId, isChecked, type) {
    let pagamento;
    if (type === 'resgate') {
        pagamento = app.resgates.find(p => p.id.toString() === pagamentoId);
    } else {
        pagamento = Object.values(app.pagamentos).flat().find(p => p.id.toString() === pagamentoId);
    }

    if (pagamento) {
        const { error } = await supabase.from('pagamentos').update({ pago: isChecked }).eq('id', pagamento.id);
        if (error) alert("Erro: " + error.message);
        else {
            pagamento.pago = isChecked;
            await logAction(app, `Marcou ${type} (ID: ${pagamentoId}) para ${pagamento.parceiro} como ${isChecked ? 'PAGO' : 'NÃO PAGO'}.`);
            ui.renderAll(app);
        }
    }
}

/**
 * Manipula o upload de um comprovante para um pagamento ou resgate.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} pagamentoId - O ID do pagamento ou resgate.
 * @param {File} file - O arquivo de comprovante.
 * @param {('pagamento'|'resgate')} type - O tipo de transação.
 */
export async function handleComprovanteUpload(app, pagamentoId, file, type) {
    if (!file) return;

    let pagamento;
    if (type === 'resgate') {
        pagamento = app.resgates.find(p => p.id.toString() === pagamentoId);
    } else {
        pagamento = Object.values(app.pagamentos).flat().find(p => p.id.toString() === pagamentoId);
    }

    if(pagamento){
        const dataUrl = await fileToBase64(file);
        pagamento.comprovante = { name: file.name, url: dataUrl };
        const { error } = await supabase.from('pagamentos').update({ comprovante: pagamento.comprovante }).eq('id', pagamento.id);
        if(error) alert("Erro: " + error.message);
        else {
            await logAction(app, `Anexou comprovante para o ${type} (ID: ${pagamentoId}) de ${pagamento.parceiro}.`);
        }
    }
}

/**
 * Deleta um grupo de pagamentos de uma data específica.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} date - A data do grupo de pagamentos a ser deletado.
 */
export async function deletePagamentosGroup(app, date) {
    if (confirm(`Tem certeza que deseja apagar os pagamentos de ${date}?`)) {
        const ids = app.pagamentos[date].map(p => p.id);
        const { error } = await supabase.from('pagamentos').delete().in('id', ids);
        if (error) { alert("Erro: " + error.message); }
        else {
            delete app.pagamentos[date];
            await logAction(app, `Apagou o lote de pagamentos gerado em ${date}.`);
            ui.renderAll(app);
        }
    }
}

/**
 * Manipula a atualização do valor de um RT (pagamento ou resgate).
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de envio do formulário.
 */
export async function handleUpdateRtValue(app, e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('edit-rt-pagamento-id').value;
    const type = form.dataset.type;
    const newValue = parseFloat(document.getElementById('edit-rt-input').value);
    if (isNaN(newValue) || newValue < 0) { alert('Valor inválido.'); return; }

    let pagamento;
    if (type === 'resgate') {
        pagamento = app.resgates.find(p => p.id.toString() === id);
    } else {
        pagamento = Object.values(app.pagamentos).flat().find(p => p.id.toString() === id);
    }

    if (pagamento) {
        const oldValue = pagamento.rt_valor;
        const { error } = await supabase.from('pagamentos').update({ rt_valor: newValue }).eq('id', pagamento.id);
        if (error) { alert("Erro: " + error.message); }
        else {
            pagamento.rt_valor = newValue;
            await logAction(app, `Alterou valor do ${type} (ID: ${id}) de ${formatCurrency(oldValue)} para ${formatCurrency(newValue)}.`);
            ui.renderAll(app);
            ui.closeEditRtModal();
        }
    }
}

/**
 * Exporta os pagamentos de uma data específica para um arquivo XLSX.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} date - A data do grupo de pagamentos a ser exportado.
 */
export function exportPagamentosXLSX(app, date) {
    const data = app.pagamentos[date];
    if (!data || data.length === 0) { alert("Sem dados para exportar."); return; }
    const reportData = data.map(p => ({
        'ID Parceiro': p.id_parceiro,
        'Parceiro': p.parceiro,
        'Consultor': p.consultor || '',
        'Valor RT': parseCurrency(p.rt_valor),
        'Pago': p.pago ? 'Sim' : 'Não',
        'Data Geração': p.data_geracao
    }));
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pagamentos");
    XLSX.writeFile(wb, `Pagamentos_${date.replace(/\//g, '-')}.xlsx`);
    logAction(app, `Exportou o relatório de pagamentos de ${date}.`);
}

/**
 * Gera uma versão para impressão do relatório de pagamentos de uma data específica.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} date - A data do grupo de pagamentos.
 */
export function generatePagamentoPrint(app, date) {
    const data = app.pagamentos[date];
    if (!data || data.length === 0) { alert('Sem dados para gerar relatório.'); return; }
    const total = data.reduce((sum, p) => sum + parseCurrency(p.rt_valor || 0), 0);
    const rows = data.sort((a, b) => a.parceiro.localeCompare(b.parceiro)).map(p => {
        const arquiteto = app.arquitetos.find(arq => arq.id === p.id_parceiro);
        const chavePix = arquiteto ? `${arquiteto.tipo_chave_pix || ''} ${arquiteto.pix || 'Não cadastrada'}`.trim() : 'Não encontrado';
        return `
        <tr class="border-b">
            <td class="p-2">${p.id_parceiro}</td>
            <td class="p-2">${p.parceiro}</td>
            <td class="p-2">${chavePix}</td>
            <td class="p-2">${p.consultor || ''}</td>
            <td class="p-2 text-right">${formatCurrency(p.rt_valor)}</td>
        </tr>`;
    }).join('');
    const content = `<div class="report-section">
      <h2 class="text-2xl font-bold mb-6">Relatório de Pagamento - ${date}</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b-2 border-gray-300">
            <th class="p-2 text-left">ID</th>
            <th class="p-2 text-left">Parceiro</th>
            <th class="p-2 text-left">Chave Pix</th>
            <th class="p-2 text-left">Consultor</th>
            <th class="p-2 text-right">Valor RT</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    const template = `<html><head><title>Relatório - ${date}</title><script src="https://cdn.tailwindcss.com"><\/script><style>@media print{.no-print{display: none;}} body { font-family: sans-serif; }</style></head><body class="p-8 bg-gray-100"><div class="no-print text-center mb-8"><button onclick="window.print()" class="bg-blue-600 text-white py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 transition">Imprimir</button></div><div class="max-w-5xl mx-auto bg-white p-12 rounded-xl shadow-2xl">${content}<div class="mt-12 text-right border-t-2 pt-6"><h3 class="text-xl font-bold text-gray-700">Soma Total (RT) a Pagar</h3><p class="text-4xl font-bold mt-2 text-green-600">${formatCurrency(total)}</p></div></div></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(template);
    win.document.close();
}

/**
 * Manipula o clique para iniciar a geração de pagamentos em lote.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleGerarPagamentosClick(app) {
    if (!app.schemaHasRtAcumulado || !app.schemaHasRtTotalPago) { alert("Funcionalidade desabilitada. Verifique o console."); return; }
    const { data, error } = await supabase.from('arquitetos').select('*');
    if (error) { alert("Não foi possível buscar dados atualizados."); return; }
    app.arquitetos = data || [];
    app.eligibleForPayment = app.arquitetos.filter(a => parseFloat(a.rt_acumulado || 0) >= 300);
    if (app.eligibleForPayment.length === 0) { alert('Nenhum arquiteto atingiu o valor mínimo para pagamento.'); return; }
    ui.openGerarPagamentosModal(app);
}

/**
 * Confirma e gera os comprovantes de pagamento para os arquitetos elegíveis.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function confirmarGeracaoComprovantes(app) {
    if (app.eligibleForPayment.length === 0) return;

    const partnerIds = app.eligibleForPayment.map(a => a.id);
    const { data: consultantData, error: consultantError } = await supabase
        .from('sysled_imports')
        .select('id_parceiro, consultor, data_finalizacao_prevenda')
        .in('id_parceiro', partnerIds)
        .order('data_finalizacao_prevenda', { ascending: false });

    if (consultantError) {
        alert("Erro ao buscar dados do consultor: " + consultantError.message);
        return;
    }

    const consultantMap = {};
    if (consultantData) {
        for (const record of consultantData) {
            if (!consultantMap[record.id_parceiro]) {
                consultantMap[record.id_parceiro] = record.consultor;
            }
        }
    }

    const todayDB = new Date().toISOString().slice(0, 10);
    const pagamentos = app.eligibleForPayment.map(a => ({
        id_parceiro: a.id,
        parceiro: a.nome,
        rt_valor: a.rt_acumulado,
        pago: false,
        data_geracao: todayDB,
        consultor: consultantMap[a.id] || null,
        form_pagamento: 1 // Pagamento Comum
    }));

    const { error: insertError } = await supabase.from('pagamentos').insert(pagamentos);
    if (insertError) { alert("Erro ao gerar comprovantes: " + insertError.message); return; }

    const updates = app.eligibleForPayment.map(a =>
        supabase.from('arquitetos').update({
            rt_acumulado: 0,
            rt_total_pago: (parseFloat(a.rt_total_pago) || 0) + (parseFloat(a.rt_acumulado) || 0)
        }).eq('id', a.id)
    );
    await Promise.all(updates);

    alert(`${app.eligibleForPayment.length} comprovantes gerados!`);
    await logAction(app, `Gerou ${app.eligibleForPayment.length} pagamentos em lote.`);
    await app.loadData();
    ui.renderAll(app);
    ui.closeGerarPagamentosModal();
}

/**
 * Gera um pagamento individual a partir da ficha do arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleGerarPagamentoFicha(app) {
    const id = document.getElementById('edit-arquiteto-original-id').value;
    const arq = app.arquitetos.find(a => a.id === id);
    if (!arq) { alert('Erro: Arquiteto não encontrado.'); return; }
    const valor = parseFloat(arq.rt_acumulado || 0);
    if (valor <= 0) { alert('Arquiteto sem saldo de RT acumulado para pagamento.'); return; }

    if (confirm(`Gerar pagamento de ${formatCurrency(valor)} para ${arq.nome}? O saldo será zerado.`)) {
        const { data: latestImport, error: consultantError } = await supabase
            .from('sysled_imports')
            .select('consultor')
            .eq('id_parceiro', arq.id)
            .order('data_finalizacao_prevenda', { ascending: false })
            .limit(1)
            .single();

        if (consultantError && consultantError.code !== 'PGRST116') {
            console.error("Aviso: Não foi possível encontrar o consultor. O pagamento será gerado sem essa informação.", consultantError);
        }
        const consultantName = latestImport ? latestImport.consultor : null;

        const todayDB = new Date().toISOString().slice(0, 10);
        const { error: insertError } = await supabase.from('pagamentos').insert([{
            id_parceiro: arq.id,
            parceiro: arq.nome,
            rt_valor: valor,
            pago: false,
            data_geracao: todayDB,
            consultor: consultantName,
            form_pagamento: 1 // Pagamento comum
        }]);

        if (insertError) { alert("Erro ao gerar comprovante: " + insertError.message); return; }

        const { error: updateError } = await supabase.from('arquitetos').update({ rt_acumulado: 0, rt_total_pago: (parseFloat(arq.rt_total_pago) || 0) + valor }).eq('id', arq.id);
        if (updateError) alert("Comprovante gerado, mas erro ao atualizar saldo: " + updateError.message);
        else {
            alert(`Comprovante gerado com sucesso para ${arq.nome}!`);
            await logAction(app, `Gerou pagamento individual de ${formatCurrency(valor)} para ${arq.nome} (ID: ${id}).`);
        }
        await app.loadData();
        ui.renderAll(app);
        ui.closeEditModal();
    }
}

/**
 * Gera um resgate a partir da ficha do arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleGerarResgateFicha(app) {
    console.log("Iniciando handleGerarResgateFicha...");

    const id = document.getElementById('edit-arquiteto-original-id').value;
    const arq = app.arquitetos.find(a => a.id === id);

    if (!arq) {
        console.error("handleGerarResgateFicha: Arquiteto não encontrado com o ID:", id);
        alert('Erro: Arquiteto não encontrado.');
        return;
    }
    console.log("handleGerarResgateFicha: Arquiteto encontrado:", arq);

    const valor = parseFloat(arq.rt_acumulado || 0);
    console.log("handleGerarResgateFicha: Valor do resgate:", valor);

    if (valor <= 0) {
        alert('Arquiteto sem saldo de RT acumulado para resgate.');
        return;
    }

    if (confirm(`Gerar resgate de ${formatCurrency(valor)} para ${arq.nome}? O saldo será zerado.`)) {
        console.log("handleGerarResgateFicha: Usuário confirmou o resgate.");

        // Busca o último consultor associado a uma venda para este parceiro
        const { data: latestImport, error: consultantError } = await supabase
            .from('sysled_imports')
            .select('consultor')
            .eq('id_parceiro', arq.id)
            .order('data_finalizacao_prevenda', { ascending: false })
            .limit(1)
            .single();

        if (consultantError && consultantError.code !== 'PGRST116') { // PGRST116 = no rows found, which is ok
            console.error("handleGerarResgateFicha: Erro ao buscar consultor:", consultantError);
        }
        const consultantName = latestImport ? latestImport.consultor : null;
        console.log("handleGerarResgateFicha: Consultor encontrado:", consultantName);

        const todayDB = new Date().toISOString().slice(0, 10);

        const payload = {
            id_parceiro: arq.id,
            parceiro: arq.nome,
            rt_valor: valor,
            pago: false,
            data_geracao: todayDB,
            consultor: consultantName,
            form_pagamento: 2 // Identifica o registro como um RESGATE
        };
        console.log("handleGerarResgateFicha: Enviando payload para Supabase:", payload);

        // Insere o novo registro na tabela 'pagamentos' com form_pagamento = 2
        const { error: insertError } = await supabase.from('pagamentos').insert([payload]);

        if (insertError) {
            console.error("handleGerarResgateFicha: Erro ao inserir resgate no Supabase:", insertError);
            alert("Erro ao gerar resgate: " + insertError.message);
            return;
        }
        console.log("handleGerarResgateFicha: Resgate inserido com sucesso.");

        // Zera o saldo acumulado e atualiza o total pago do arquiteto
        const updatePayload = {
            rt_acumulado: 0,
            rt_total_pago: (parseFloat(arq.rt_total_pago) || 0) + valor
        };
        console.log("handleGerarResgateFicha: Atualizando arquiteto com payload:", updatePayload);

        const { error: updateError } = await supabase.from('arquitetos').update(updatePayload).eq('id', arq.id);

        if (updateError) {
            console.error("handleGerarResgateFicha: Erro ao atualizar saldo do arquiteto:", updateError);
            alert("Resgate gerado, mas erro ao atualizar saldo do arquiteto: " + updateError.message);
        } else {
            console.log("handleGerarResgateFicha: Saldo do arquiteto atualizado com sucesso.");
            alert(`Resgate de ${formatCurrency(valor)} gerado com sucesso para ${arq.nome}!`);
            await logAction(app, `Gerou resgate individual de ${formatCurrency(valor)} para ${arq.nome} (ID: ${id}).`);
        }
        await app.loadData();
        ui.renderAll(app);
        ui.closeEditModal();
    }
}

/**
 * Busca os dados da API Sysled.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function fetchSysledData(app) {
    const container = document.getElementById('sysled-table-container');
    container.innerHTML = `<p class="text-center text-gray-400 py-8">Buscando dados... <span class="material-symbols-outlined animate-spin align-middle">progress_activity</span></p>`;
    try {
        const response = await fetch('https://integration.sysled.com.br/n8n/api/?v_crm_oportunidades_propostas_up180dd=null', { headers: { 'Authorization': 'e4b6f9082f1b8a1f37ad5b56e637f3ec719ec8f0b6acdd093972f9c5bb29b9ed' } });
        if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
        app.sysledData = await response.json();
        await logAction(app, "Atualizou os dados da consulta Sysled.");
    } catch (error) {
        console.error("Erro na API Sysled:", error);
        container.innerHTML = `<p class="text-center text-red-400 py-8">Erro ao carregar dados da API.</p>`;
    } finally {
        ui.renderSysledTable(app);
    }
}

/**
 * Limpa os filtros da tabela Sysled e a renderiza novamente.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function clearSysledFilters(app) {
    document.getElementById('sysled-filter-data-inicio').value = '';
    document.getElementById('sysled-filter-data-fim').value = '';
    document.getElementById('sysled-filter-parceiro').value = '';
    document.getElementById('sysled-filter-excluir-parceiro').value = '';
    ui.renderSysledTable(app);
}

/**
 * Manipula o clique para copiar os dados filtrados da Sysled para a importação de RT.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function handleCopyToRTClick(app) {
    if (app.sysledFilteredData.length === 0) {
        alert('Não há dados filtrados para copiar. Por favor, filtre os dados primeiro ou atualize a consulta.');
        return;
    }

    if (!confirm(`Você está prestes a importar ${app.sysledFilteredData.length} venda(s) da Sysled. Deseja continuar?`)) {
        return;
    }

    app.isSysledImport = true;
    app.tempRTData = app.sysledFilteredData;

    const mapping = {
        id_prevenda: 'idPedido', data_venda: 'dataFinalizacaoPrevenda', nome_cliente: 'clienteFantasia',
        valor_venda: 'valorNota', executivo: 'consultor', id_parceiro: 'idParceiro',
        parceiro: 'parceiro', loja: 'idEmpresa'
    };

    const firstRow = app.tempRTData[0];
    if (!firstRow.hasOwnProperty(mapping.id_parceiro) || !firstRow.hasOwnProperty(mapping.valor_venda) || !firstRow.hasOwnProperty(mapping.id_prevenda)) {
        alert("Os dados da Sysled parecem estar incompletos. Colunas essenciais como 'idParceiro', 'valorNota' ou 'idPedido' não foram encontradas. Importação cancelada.");
        app.isSysledImport = false;
        return;
    }

    let processedData = app.tempRTData.map(row => {
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

    // Verificar se existem arquitetos não cadastrados
    const arquitetosNaoCadastrados = await verificarArquitetosNaoCadastrados(app, processedData);
    if (arquitetosNaoCadastrados.length > 0) {
        app.pendingImportData = processedData;
        ui.showNovoArquitetoModal(app, arquitetosNaoCadastrados[0]);
        return;
    }

    let dataToProcess = processedData;

    const pedidoIds = processedData.map(row => row.id_prevenda).filter(id => id);
    if (pedidoIds.length > 0) {
        const { data: existing, error } = await supabase.from('sysled_imports').select('id_pedido').in('id_pedido', pedidoIds);

        if (error) {
            alert('Erro ao verificar vendas existentes: ' + error.message);
            app.isSysledImport = false;
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
        await processRTData(app, dataToProcess);
    } else {
        alert("Nenhuma venda nova para importar. Todas as vendas filtradas já foram processadas anteriormente.");
        app.isSysledImport = false;
    }
}

/**
 * Manipula o clique para consultar o histórico de vendas de um arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 * @param {string} id - O ID do arquiteto.
 */
export async function handleConsultarVendasClick(app, e, id) {
    e.preventDefault();
    if (!id) return;
    const arq = app.arquitetos.find(a => a.id === id);
    document.getElementById('sales-history-modal-title').textContent = `Histórico de Vendas para ${arq ? arq.nome : id}`;
    const container = document.getElementById('sales-history-table-container');
    container.innerHTML = `<p class="text-center text-gray-400 py-8">Consultando... <span class="material-symbols-outlined animate-spin align-middle">progress_activity</span></p>`;
    const modal = document.getElementById('sales-history-modal');
    modal.classList.add('active');
    try {
        const { data, error } = await supabase.from('sysled_imports').select('id_pedido, valor_nota, data_finalizacao_prevenda').eq('id_parceiro', id).order('data_finalizacao_prevenda', { ascending: false });
        if (error) throw error;
        ui.renderSalesHistoryModal(data, true);
    } catch (error) {
        console.error('Erro ao buscar histórico de vendas:', error);
        container.innerHTML = `<p class="text-center text-red-400 py-8">Erro ao consultar vendas.</p>`;
    }
}

/**
 * Manipula cliques na tabela de histórico de vendas.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handleSalesHistoryTableClick(app, e) {
    const btn = e.target.closest('.view-sale-details-btn');
    if (btn) {
        e.preventDefault();
        ui.openSaleDetailsModal(app, btn.dataset.pedidoId);
    }
}

/**
 * Importa uma única venda a partir do modal de detalhes da venda.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export async function handleImportSingleSale(app, e) {
    const id = e.target.dataset.pedidoId;
    if (!id || id === 'N/A') return;
    const { data: existing } = await supabase.from('sysled_imports').select('id_pedido').eq('id_pedido', id).maybeSingle();
    if (existing) { alert(`Venda ${id} já importada.`); return; }
    const sale = app.sysledData.find(row => String(row.idPedido) === id);
    if (!sale) { alert('Dados da venda não encontrados.'); return; }
    const data = [{ id_parceiro: sale.idParceiro, valor_venda: parseApiNumber(sale.valorNota), parceiro: sale.parceiro }];
    app.isSysledImport = false;
    await processRTData(app, data);
    const { error } = await supabase.from('sysled_imports').insert([{ id_parceiro: sale.idParceiro, valor_nota: parseApiNumber(sale.valorNota), data_finalizacao_prevenda: sale.dataFinalizacaoPrevenda, id_pedido: sale.idPedido }]);
    if (error) console.error("Erro ao registrar importação:", error);
    ui.closeSaleDetailsModal();
}

/**
 * Manipula a ordenação da tabela de arquitetos.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handleSort(app, e) {
    const header = e.target.closest('.sortable-header');
    if (!header) return;
    const column = header.dataset.sort;
    if (app.sortColumn === column) {
        app.sortDirection = app.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        app.sortColumn = column;
        app.sortDirection = 'asc';
    }
    ui.renderArquitetosTable(app);
}

/**
 * Calcula e exibe um valor de RT de exemplo no modal de edição de arquiteto.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export function calculateRT(app) {
    const valor = parseCurrency(document.getElementById('rt-valor-vendas').textContent);
    const perc = parseFloat(document.getElementById('rt-percentual').value);
    document.getElementById('rt-valor-calculado').textContent = formatCurrency(valor * perc);
}

/**
 * Manipula cliques na seção de arquivos importados.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handleArquivosImportadosClick(app, e) {
    const btn = e.target.closest('.download-arquivo-btn');
    if (btn) { e.preventDefault(); downloadImportedFile(app, btn.dataset.date); }
}

/**
 * Inicia o download de um arquivo importado.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {string} date - A data do arquivo a ser baixado.
 */
export function downloadImportedFile(app, date) {
    const file = app.importedFiles[date];
    if (file) {
        const link = document.createElement('a');
        link.href = file.dataUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Manipula a submissão do formulário de adição de comissão manual.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de submissão.
 */
export async function handleAddComissaoManual(app, e) {
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

    const arq = app.arquitetos.find(a => a.id === idParceiro);
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
    await logAction(app, `Enviou comissão manual para aprovação de ${formatCurrency(valorVenda)} para ${arq.nome}`);
    form.reset();
    await app.loadData();
    ui.renderAll(app);
}

/**
 * Aprova uma inclusão manual de comissão.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export async function handleAprovarInclusaoManual(app, e) {
    const btn = e.target.closest('#aprovar-inclusao-manual-btn');
    if (!btn) return;

    const comissaoId = parseInt(btn.dataset.comissaoId, 10);
    const comissao = app.comissoesManuais.find(c => c.id === comissaoId);
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

    const arq = app.arquitetos.find(a => a.id === comissao.id_parceiro);
    if (!arq) {
        alert(`Arquiteto com ID ${comissao.id_parceiro} não foi encontrado.`); return;
    }

    const valorVenda = comissao.valor_venda;
    const payload = {
        valorVendasTotal: (arq.valorVendasTotal || 0) + valorVenda,
        pontos: (app.pontuacoes[comissao.id_parceiro] || 0) + Math.floor(valorVenda / 1000),
        salesCount: (arq.salesCount || 0) + 1,
    };
    if (app.schemaHasRtAcumulado) {
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
            id_pedido: comissao.id_venda,
            consultor: comissao.consultor // Adicionado o campo consultor
        });
        if (error) alert("Aviso: Erro ao registrar na tabela de controle de duplicados (sysled_imports).");
    }

    alert('Comissão aprovada e valores contabilizados com sucesso!');
    await logAction(app, `Aprovou comissão manual de ${formatCurrency(valorVenda)} para ${arq.nome} (ID: ${arq.id})`);
    await app.loadData();
    ui.renderAll(app);
    ui.closeComissaoManualDetailsModal();
}

/**
 * Manipula cliques no histórico de comissões manuais.
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de clique.
 */
export function handleHistoricoManualClick(app, e) {
    const btn = e.target.closest('.view-comissao-details-btn');
    if (btn) {
        e.preventDefault();
        const comissaoId = parseInt(btn.dataset.comissaoId, 10);
        ui.openComissaoManualDetailsModal(app, comissaoId);
    }
}

/**
 * Limpa todos os logs de eventos.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function clearEventsLog(app) {
    if (confirm('Tem certeza que deseja apagar TODOS os logs de eventos? Esta ação é irreversível.')) {
        const { error } = await supabase.from('action_logs').delete().neq('id', 0); // Deleta todos os registros
        if (error) {
            alert('Erro ao limpar o log de eventos: ' + error.message);
        } else {
            alert('Log de eventos limpo com sucesso.');
            await logAction(app, 'Limpou todo o log de eventos.');
            await app.loadData(); // Recarrega os dados (agora vazios)
            ui.renderAll(app);
        }
    }
}

/**
 * Verifica se há arquitetos não cadastrados nos dados processados.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Array<Object>} processedData - Os dados de vendas a serem verificados.
 * @returns {Promise<Array<Object>>} Uma lista de arquitetos não cadastrados.
 */
export async function verificarArquitetosNaoCadastrados(app, processedData) {
    const arquitetosIds = [...new Set(processedData.map(row => String(row.id_parceiro)))];
    const arquitetosNaoCadastrados = [];

    for (const id of arquitetosIds) {
        const arquiteto = app.arquitetos.find(a => a.id === id);
        if (!arquiteto) {
            const vendaExemplo = processedData.find(row => String(row.id_parceiro) === id);
            arquitetosNaoCadastrados.push({
                id: id,
                nome: vendaExemplo.parceiro || 'Novo Parceiro'
            });
        }
    }

    return arquitetosNaoCadastrados;
}

/**
 * Processa o cadastro de um novo arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 * @param {Event} e - O objeto do evento de submissão do formulário.
 */
export async function handleNovoArquitetoSubmit(app, e) {
    e.preventDefault();

    const id = document.getElementById('novo-arquiteto-id').value;
    const nome = document.getElementById('novo-arquiteto-nome').value;
    const email = document.getElementById('novo-arquiteto-email').value;
    const tipoPix = document.getElementById('novo-arquiteto-tipo-pix').value;
    const pix = document.getElementById('novo-arquiteto-pix').value;
    const telefone = document.getElementById('novo-arquiteto-telefone').value;

    if (!email || !pix) {
        alert('E-mail e Chave PIX são obrigatórios.');
        return;
    }

    try {
        const novoArquitetoData = {
            id: id,
            nome: nome,
            email: email,
            telefone: telefone,
            tipo_chave_pix: tipoPix,
            pix: pix,
            salesCount: 0,
            valorVendasTotal: 0,
            pontos: 0,
            rtPercentual: 0.05,
            rt_acumulado: 0,
            rt_total_pago: 0
        };

        const { data: created, error } = await supabase.from('arquitetos').insert(novoArquitetoData).select().single();

        if (error) {
            alert('Erro ao cadastrar arquiteto: ' + error.message);
            return;
        }

        // Adicionar à lista local
        app.arquitetos.push(created);
        app.pontuacoes[id] = 0;

        await logAction(app, `Cadastrou novo arquiteto: ${nome} (ID: ${id})`);

        // Fechar modal
        document.getElementById('novo-arquiteto-modal').classList.remove('active');

        // Continuar com a importação
        if (app.pendingImportData) {
            await continuarImportacao(app);
        }

    } catch (error) {
        alert('Erro ao cadastrar arquiteto: ' + error.message);
    }
}

/**
 * Continua o processo de importação após o cadastro de um novo arquiteto.
 * @async
 * @param {RelacionamentoApp} app - A instância da aplicação.
 */
export async function continuarImportacao(app) {
    if (!app.pendingImportData) return;

    const dataToProcess = app.pendingImportData;
    app.pendingImportData = null;

    const pedidoIds = dataToProcess.map(row => row.id_prevenda).filter(id => id);
    if (pedidoIds.length > 0) {
        const { data: existing, error } = await supabase.from('sysled_imports').select('id_pedido').in('id_pedido', pedidoIds);

        if (error) {
            alert('Erro ao verificar vendas existentes: ' + error.message);
            app.isSysledImport = false;
            return;
        }

        const existingIds = new Set(existing.map(item => String(item.id_pedido)));
        const alreadyImported = dataToProcess.filter(row => existingIds.has(String(row.id_prevenda)));
        const newDataToProcess = dataToProcess.filter(row => !existingIds.has(String(row.id_prevenda)));

        if (alreadyImported.length > 0) {
            alert(`Venda(s) já importada(s) e ignorada(s): ${alreadyImported.map(r => r.id_prevenda).join(', ')}`);
        }

        if (newDataToProcess.length > 0) {
            await processRTData(app, newDataToProcess);
        } else {
            alert("Nenhuma venda nova para importar. Todas as vendas filtradas já foram processadas anteriormente.");
            app.isSysledImport = false;
        }
    } else {
        await processRTData(app, dataToProcess);
    }
}
