/*
  Tipo de arquivo: .js (Módulo JavaScript)
  Descrição: Centraliza a configuração do Supabase. Outros arquivos
  irão importar o cliente 'supabase' daqui, evitando repetição e
  facilitando futuras alterações.
*/

// --- Configuração do Supabase ---
const SUPABASE_URL = 'https://zelozgmdphofqxpxsbna.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbG96Z21kcGhvZnF4cHhzYm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMDA2NTMsImV4cCI6MjA3MjY3NjY1M30.PXY7G6OfD_ALW4n7L5IQvc-ViR4VgX25Fs3gR-wElDA';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
