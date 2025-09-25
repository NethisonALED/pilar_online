// --- MÉTODOS UTILITÁRIOS ---

/**
 * Converte um objeto de arquivo para uma string base64.
 * @param {File} file - O arquivo a ser convertido.
 * @returns {Promise<string>} Uma promessa que resolve com a string base64.
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

/**
 * Converte um array de objetos JSON para uma data URL de um arquivo XLSX.
 * @param {Array<Object>} jsonData - Os dados JSON para converter.
 * @returns {string} A data URL para o arquivo XLSX.
 */
function jsonToXLSXDataURL(jsonData) {
    const ws = XLSX.utils.json_to_sheet(jsonData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sysled Import");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
}

/**
 * Converte um valor de string da API (com vírgula decimal) para um número.
 * @param {*} value - O valor a ser convertido.
 * @returns {number} O valor convertido para número.
 */
function parseApiNumber(value) {
    if (value === null || value === undefined) return 0;
    return Number(String(value).replace(',', '.')) || 0;
}

/**
 * Converte uma string de moeda formatada (R$ 1.234,56) para um número.
 * @param {*} value - O valor da moeda a ser convertido.
 * @returns {number} O valor convertido para número.
 */
function parseCurrency(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || value === null) return 0;
    return parseFloat(String(value).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Formata um número para o padrão de moeda brasileiro (BRL).
 * @param {*} value - O número a ser formatado.
 * @returns {string} A string formatada como moeda.
 */
function formatCurrency(value) {
    const number = typeof value === 'number' ? value : parseCurrency(value);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata uma string de data (YYYY-MM-DDTHH:mm:ss) para o padrão brasileiro (DD/MM/YYYY).
 * @param {string} dateString - A string de data.
 * @returns {string} A data formatada.
 */
function formatApiDateToBR(dateString) {
     if (!dateString || typeof dateString !== 'string') return '';
     const datePart = dateString.split('T')[0];
     const parts = datePart.split('-');
     if (parts.length !== 3) return dateString; 
     const [year, month, day] = parts;
     return `${day}/${month}/${year}`;
}

/**
 * Formata um número vindo da API para uma string com padrão brasileiro (duas casas decimais).
 * @param {*} value - O valor a ser formatado.
 * @returns {string} O número formatado como string.
 */
function formatApiNumberToBR(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = parseApiNumber(value);
    if (isNaN(number)) return value;
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
