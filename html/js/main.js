// js/main.js
import { isLoggedIn, logout } from './api.js';
import { loadFiles, uploadFile, deleteFile, downloadFile, viewFile, closeModal, handleSearch, toggleFileSelection, toggleSelectAll, deleteSelectedFiles } from './files.js';
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
window.toggleFileSelection = toggleFileSelection;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedFiles = deleteSelectedFiles;

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
initDragAndDrop();
});
// Функція налаштування Drag-and-Drop (можна додати в кінець файлу main.js)
function initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0; // Лічильник, щоб уникнути мерехтіння

    // Забороняємо браузеру відкривати файли замість завантаження
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Коли файл затягують у вікно
    document.body.addEventListener('dragenter', (e) => {
        dragCounter++;
        if (dropZone) dropZone.classList.remove('hidden');
    });

    // Коли файл витягують з вікна (або відпускають)
    document.body.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0 && dropZone) {
            dropZone.classList.add('hidden');
        }
    });

    // Коли файл відпустили (DROP)
    document.body.addEventListener('drop', (e) => {
        dragCounter = 0; // Скидаємо лічильник
        if (dropZone) dropZone.classList.add('hidden');
        
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files && files.length > 0) {
            // Викликаємо нашу функцію завантаження
            uploadFile(files);
        }
    });
}
