import { apiRequest } from './api.js';

// Декодування JWT токена (Base64 decode)
export function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Отримання даних поточного користувача з токена
export function getCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return parseJwt(token);
}

// Функція входу (можна використовувати в login.html)
export async function loginUser(identifier, password) {
    const res = await apiRequest('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
    });
    
    if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        return true;
    } else {
        throw new Error('Невірний логін або пароль');
    }
}

// Функція реєстрації
export async function registerUser(username, email, password) {
    const res = await apiRequest('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Помилка реєстрації');
    }
    return true;
}