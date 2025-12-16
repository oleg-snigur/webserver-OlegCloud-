const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('token');
}

export function isLoggedIn() {
    return !!getToken();
}

export function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// Універсальна функція для запитів
export async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    // Заголовки за замовчуванням
    const headers = options.headers || {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers: headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, config);

    // Якщо токен протух (401) — викидаємо на логін
    if (response.status === 401) {
        logout();
        return null;
    }

    return response;
}