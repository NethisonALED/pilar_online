/*
  Tipo de arquivo: .js (Módulo JavaScript)
  Descrição: Contém funções de ajuda reutilizáveis, como formatação de
  moeda, datas e conversão de arquivos. Manter isso separado limpa
  o código principal.
*/
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

export function jsonToXLSXDataURL(jsonData) {
    const ws = XLSX.utils.json_to_sheet(jsonData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sysled Import");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    return "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
}

export function parseApiNumber(value) {
    if (value === null || value === undefined) return 0;
    return Number(String(value).replace(',', '.')) || 0;
}

export function parseCurrency(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || value === null) return 0;
    return parseFloat(String(value).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatCurrency(value) {
    const number = parseCurrency(value);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatApiDateToBR(dateString) {
     if (!dateString || typeof dateString !== 'string') return '';
     const datePart = dateString.split('T')[0];
     const parts = datePart.split('-');
     if (parts.length !== 3) return dateString; 
     const [year, month, day] = parts;
     return `${day}/${month}/${year}`;
}

export function formatApiNumberToBR(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = parseApiNumber(value);
    if (isNaN(number)) return value;
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
