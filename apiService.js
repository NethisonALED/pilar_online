/*
  Tipo de arquivo: .js (Módulo JavaScript)
  Descrição: Abstrai todas as interações com o banco de dados (Supabase)
  e APIs externas (Sysled). A lógica principal chamará essas funções
  em vez de interagir diretamente com o Supabase/fetch.
*/
import { supabase } from './config.js';

// --- API Sysled ---
export async function fetchSysledData() {
    const apiUrl = 'https://integration.sysled.com.br/n8n/api/?v_crm_oportunidades_propostas_up180dd=null';
    const apiKey = 'e4b6f9082f1b8a1f37ad5b56e637f3ec719ec8f0b6acdd093972f9c5bb29b9ed';
    const response = await fetch(apiUrl, { headers: { 'Authorization': apiKey } });
    if (!response.ok) throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    return response.json();
}

// --- Funções para 'arquitetos' ---
export async function getArquitetos() {
    const { data, error } = await supabase.from('arquitetos').select('*');
    if (error) console.error('Erro ao carregar arquitetos:', error);
    return data || [];
}

export async function addArquiteto(newArquiteto) {
    return supabase.from('arquitetos').insert(newArquiteto).select().single();
}

export async function updateArquiteto(id, updatedData) {
    return supabase.from('arquitetos').update(updatedData).eq('id', id).select().single();
}

export async function deleteArquiteto(id) {
    return supabase.from('arquitetos').delete().eq('id', id);
}

// --- Funções para 'pagamentos' ---
export async function getPagamentos() {
    const { data, error } = await supabase.from('pagamentos').select('*');
    if (error) console.error('Erro ao carregar pagamentos:', error);
    return data || [];
}

// ... Outras funções de API (insertPagamento, updatePagamentoStatus, etc.)
