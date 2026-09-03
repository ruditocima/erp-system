import { paginate, totalPages } from '../core/utils.js';

export function materialUsageTab() {
    return {
        selectedProject: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get projectUsageList() {
            let usage = [];
            let approvedTrx = this.$parent.transactionList.filter(t => t.status === 'Approved' && t.kodeProject && t.kodeProject !== '-');
            approvedTrx.forEach(trx => {
                if (!Array.isArray(trx.items)) return;
                trx.items.forEach(item => { if (!item) return; usage.push({ kodeProject: trx.kodeProject, noDocument: trx.noDocument, kodeBarang: item.kode, namaBarang: item.nama, qty: item.qty, tanggal: trx.tanggal }); });
            });
            return usage;
        },
        get filteredUsage() {
            if (this.selectedProject === '') return this.projectUsageList;
            return this.projectUsageList.filter(u => u.kodeProject === this.selectedProject);
        },
        get totalPages() { return totalPages(this.filteredUsage, this.perPage); },
        get paginatedUsage() { return paginate(this.filteredUsage, this.page, this.perPage); }
    };
}