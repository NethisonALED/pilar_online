// --- Configuração do Supabase ---
const SUPABASE_URL = 'https://zelozgmdphofqxpxsbna.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplbG96Z21kcGhvZnF4cHhzYm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMDA2NTMsImV4cCI6MjA3MjY3NjY1M30.PXY7G6OfD_ALW4n7L5IQvc-ViR4VgX25Fs3gR-wElDA';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const authError = document.getElementById('auth-error');

let app = null;

// --- LÓGICA DE AUTENTICAÇÃO ---

supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        if (!app) { 
            app = new RelacionamentoApp();
        }
    } else {
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
        app = null; 
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
