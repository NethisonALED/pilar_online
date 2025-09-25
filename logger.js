import { supabase } from './supabaseClient.js';

/**
 * Registra uma ação do usuário no banco de dados.
 * @param {string} actionDescription - A descrição da ação realizada.
 */
export async function logAction(actionDescription) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.warn("Tentativa de log sem usuário autenticado.");
            return;
        }

        const logEntry = {
            who_did: user.email,
            what_did: actionDescription,
            // when_did é gerado automaticamente pelo banco de dados (now())
        };

        const { error } = await supabase.from('action_logs').insert(logEntry);

        if (error) {
            console.error('Erro ao registrar ação no log:', error);
            // Opcional: Criar a tabela se ela não existir
            if (error.code === '42P01') { // "undefined_table"
                 console.warn('Tabela "action_logs" não encontrada. Por favor, crie-a no Supabase com as colunas: id (int8), who_did (text), what_did (text), when_did (timestamptz, default now()).');
            }
        }
    } catch (e) {
        console.error('Erro inesperado na função de log:', e);
    }
}
