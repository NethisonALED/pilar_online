// --- Configuração do Supabase ---
// Este arquivo centraliza a criação do cliente Supabase para ser importado em outros módulos.

const SUPABASE_URL = 'https://zelozgmdphofqxpxsbna.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbG96Z21kcGhvZnF4cHhzYm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMDA2NTMsImV4cCI6MjA3MjY3NjY1M30.PXY7G6OfD_ALW4n7L5IQvc-ViR4VgX25Fs3gR-wElDA';

// A verificação `window.supabase` garante que o script carregado no HTML foi encontrado
export const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!supabase) {
    console.error("Cliente Supabase não pôde ser inicializado. Verifique se o script está carregado no HTML.");
}
