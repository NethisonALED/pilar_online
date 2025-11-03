import { supabase } from './utils.js';
import RelacionamentoApp from './app.js';

document.addEventListener('DOMContentLoaded', () => {
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-button');
    const authError = document.getElementById('auth-error');

    let appInstance = null; // Variável para guardar a instância da classe principal

    /**
     * @description Monitora o estado da autenticação em tempo real.
     * Se o usuário estiver logado, oculta a tela de login, exibe a aplicação e cria uma nova instância da classe principal.
     * Se o usuário não estiver logado, exibe a tela de login e destrói a instância da aplicação para limpar o estado.
     */
    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            // Se o usuário está logado
            authContainer.style.display = 'none';
            appContainer.style.display = 'block';
            if (!appInstance) { 
                // Cria a instância da aplicação principal apenas uma vez
                console.log("Usuário autenticado. Inicializando a aplicação...");
                appInstance = new RelacionamentoApp();
            }
        } else {
            // Se o usuário não está logado
            authContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            appInstance = null; // Destrói a instância ao fazer logout para limpar o estado
            console.log("Nenhum usuário logado. Exibindo tela de login.");
        }
    });

    /**
     * @description Manipula o evento de envio do formulário de login.
     * Realiza a autenticação do usuário com o Supabase e exibe uma mensagem de erro, se houver.
     */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        authError.textContent = '';

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            authError.textContent = 'Erro de autenticação: ' + error.message;
        }
    });

    /**
     * @description Manipula o evento de clique no botão de logout.
     * Realiza o logout do usuário com o Supabase e exibe uma mensagem de erro, se houver.
     */
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair: ' + error.message);
        }
    });
});
