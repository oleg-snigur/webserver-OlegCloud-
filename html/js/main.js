// js/main.js
import { isLoggedIn, logout } from './api.js';
import { loadFiles, uploadFile, deleteFile, downloadFile, viewFile, closeModal, handleSearch } from './files.js';
import { renderUserAvatar, toggleSidebar, toggleDropdown, initDropdownListeners } from './ui.js';
import { getCurrentUser } from './auth.js';
import { initStoragePage } from './charts.js';

// --- Експортуємо функції в глобальну область (для HTML onclick) ---
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.toggleDropdown = toggleDropdown;
window.uploadFile = uploadFile;
window.deleteFile = deleteFile;
window.downloadFile = downloadFile;
window.viewFile = viewFile;
window.closeModal = closeModal;
window.handleSearch = handleSearch;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Перевірка авторизації
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    // 2. Ініціалізація UI
    initDropdownListeners(); // Закриття меню при кліку
    const user = getCurrentUser();
    if (user && user.sub) {
        renderUserAvatar(user.sub);
    }

    // 3. Маршрутизація
    const isDashboard = document.getElementById('files-table-body');
    const isStorage = document.getElementById('storageChartPage');

    if (isDashboard) {
        loadFiles();
        
        // Закриття пошуку при кліку поза ним
        document.addEventListener('click', (e) => {
            const searchContainer = document.querySelector('.search-container');
            const dropdown = document.getElementById('search-results-dropdown');
            if (searchContainer && dropdown && !searchContainer.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    } 
    
    if (isStorage) {
        initStoragePage();
    }
});