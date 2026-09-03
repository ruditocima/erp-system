import { paginate, totalPages } from '../core/utils.js';

export function dashboardTab() {
    return {
        dashboardChart: null,
        init() { this.$nextTick(() => this.renderChart()); },
        renderChart() {
            if (typeof Chart === 'undefined') return;
            const ctx = document.getElementById('dashboardChart');
            if (!ctx) return;
            if (this.dashboardChart) this.dashboardChart.destroy();
            const labels = [], masukData = [], keluarData = [], transferData = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                labels.push(d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }));
                const dayTrx = this.$parent.transactionList.filter(t => t.tanggal === dateStr && t.status === 'Approved');
                masukData.push(dayTrx.filter(t => t.tipe === 'Masuk').reduce((sum, t) => sum + (Array.isArray(t.items) ? t.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : 0), 0));
                keluarData.push(dayTrx.filter(t => t.tipe === 'Keluar').reduce((sum, t) => sum + (Array.isArray(t.items) ? t.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : 0), 0));
                transferData.push(dayTrx.filter(t => t.tipe === 'Transfer').reduce((sum, t) => sum + (Array.isArray(t.items) ? t.items.reduce((s, i) => s + (Number(i.qty) || 0), 0) : 0), 0));
            }
            this.dashboardChart = new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [
                    { label: 'Masuk', data: masukData, backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Keluar', data: keluarData, backgroundColor: '#f59e0b', borderRadius: 4 },
                    { label: 'Transfer', data: transferData, backgroundColor: '#3b82f6', borderRadius: 4 }
                ]},
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
            });
        }
    };
}