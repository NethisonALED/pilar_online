/*
  Tipo de arquivo: .js (Módulo JavaScript)
  Descrição: Isola toda a lógica de autenticação. É responsável por
  gerenciar o login, logout e o estado da sessão do usuário.
*/
import { supabase } from './config.js';

export function setupAuth(onLogin, onLogout) {
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-button');
    const authError = document.getElementById('auth-error');

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            authContainer.style.display = 'none';
            appContainer.style.display = 'block';
            onLogin(); // Chama a função para iniciar o app principal
        } else {
            authContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            onLogout(); // Chama a função para limpar o estado do app
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        authError.textContent = '';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            authError.textContent = 'Erro: ' + error.message;
        }
    });

    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair: ' + error.message);
        }
    });
}
