import { apiRequest } from './api.js';

let storageChart = null; // Зберігаємо посилання на графік, щоб видаляти перед перемалюванням

export async function initStoragePage() {
    const ctx = document.getElementById('storageChartPage');
    if (!ctx) return; // Якщо ми не на сторінці storage.html, нічого не робимо

    try {
        const res = await apiRequest('/storage-info');
        if (res && res.ok) {
            const data = await res.json();
            renderStats(data);
            renderChart(ctx, data);
        }
    } catch (e) {
        console.error("Помилка завантаження статистики", e);
    }
}

function renderStats(data) {
    // Оновлення текстових полів
    document.getElementById('stat-used').innerText = data.total_used_mb.toFixed(2) + ' MB';
    document.getElementById('stat-total').innerText = data.total_limit_mb + ' MB';
    document.getElementById('stat-free').innerText = (data.total_limit_mb - data.total_used_mb).toFixed(2) + ' MB';
    
    // Оновлення прогрес-бару
    const percent = data.percent_used;
    document.getElementById('stat-percent').innerText = percent + '%';
    
    const bar = document.getElementById('stat-bar');
    bar.style.width = `${percent}%`;
    
    // Колір прогрес-бару залежно від заповненості
    bar.className = `h-4 rounded-full transition-all duration-1000 ${
        percent > 90 ? 'bg-red-500' : (percent > 70 ? 'bg-yellow-500' : 'bg-blue-600')
    }`;

    // Список деталей (внизу праворуч)
    const list = document.getElementById('stat-details-list');
    if (list) {
        list.innerHTML = '';
        for (const [type, size] of Object.entries(data.usage_by_type)) {
            list.innerHTML += `
                <li class="flex justify-between items-center border-b border-gray-700 pb-2 last:border-0">
                    <span class="text-gray-300 font-medium">${type}</span>
                    <span class="text-blue-400 font-bold">${size.toFixed(2)} MB</span>
                </li>
            `;
        }
    }
}

function renderChart(ctx, data) {
    // Видаляємо старий графік, якщо він був, щоб не накладались
    if (storageChart) {
        storageChart.destroy();
    }

    const labels = Object.keys(data.usage_by_type);
    const values = Object.values(data.usage_by_type);
    
    // Якщо диск пустий, показуємо "Вільно 100%"
    if (labels.length === 0) { 
        labels.push("Вільно"); 
        values.push(100); 
    }

    // Chart.js доступний глобально через CDN в index.html / storage.html
    storageChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#9ca3af' } 
                } 
            }
        }
    });
}