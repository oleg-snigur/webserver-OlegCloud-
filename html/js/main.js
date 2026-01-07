// js/main.js
import { isLoggedIn, logout } from './api.js';
import { 
    loadFiles, uploadFile, deleteFile, downloadFile, viewFile, closeModal, handleSearch,
    toggleFileSelection, toggleSelectAll, deleteSelectedFiles, downloadSelectedFiles,
    handleSort, startRename, saveRename, cancelRename, handleContextMenu,
    startMove, submitMove, createFolder, createFolderInModal, loadMoveFolders
} from './files.js';
import { renderUserAvatar, toggleSidebar, toggleDropdown, initDropdownListeners } from './ui.js';
import { getCurrentUser } from './auth.js';
import { initStoragePage } from './charts.js';

// --- ЕКСПОРТ ФУНКЦІЙ (Щоб HTML їх бачив) ---

// Основні
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.toggleDropdown = toggleDropdown;
window.closeModal = closeModal;

// Файли та папки
window.loadFiles = loadFiles; // <--- ОСЬ ЦЬОГО РЯДКА НЕ ВИСТАЧАЛО!
window.uploadFile = uploadFile;
window.deleteFile = deleteFile;
window.downloadFile = downloadFile;
window.viewFile = viewFile;
window.createFolder = createFolder;
window.createFolderInModal = createFolderInModal;

// Масові дії та пошук
window.handleSearch = handleSearch;
window.toggleFileSelection = toggleFileSelection;
window.toggleSelectAll = toggleSelectAll;
window.deleteSelectedFiles = deleteSelectedFiles;
window.downloadSelectedFiles = downloadSelectedFiles;

// Редагування та сортування
window.handleSort = handleSort;
window.startRename = startRename;
window.saveRename = saveRename;
window.cancelRename = cancelRename;
window.handleContextMenu = handleContextMenu;

// Переміщення
window.startMove = startMove;
window.submitMove = submitMove;
window.loadMoveFolders = loadMoveFolders;


document.addEventListener('DOMContentLoaded', () => {
    // 1. Авторизація
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    // 2. Ініціалізація UI
    initDropdownListeners();
    const user = getCurrentUser();
    if (user && user.sub) renderUserAvatar(user.sub);

    // 3. Маршрутизація
    const isDashboard = document.getElementById('files-table-body');
    const isStorage = document.getElementById('storageChartPage');

    if (isDashboard) {
        loadFiles(); // Завантажуємо корінь
        
        document.addEventListener('click', (e) => {
            const searchContainer = document.querySelector('.search-container');
            const dropdown = document.getElementById('search-results-dropdown');
            if (searchContainer && dropdown && !searchContainer.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        
        initDragAndDrop();
    } 
    
    if (isStorage) {
        initStoragePage();
    }
});

function initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault(); e.stopPropagation();
        }, false);
    });

    document.body.addEventListener('dragenter', () => {
        dragCounter++;
        if (dropZone) dropZone.classList.remove('hidden');
    });

    document.body.addEventListener('dragleave', () => {
        dragCounter--;
        if (dragCounter === 0 && dropZone) dropZone.classList.add('hidden');
    });

    document.body.addEventListener('drop', (e) => {
        dragCounter = 0;
        if (dropZone) dropZone.classList.add('hidden');
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length > 0) uploadFile(dt.files);
    });
}
