import { paginate, totalPages } from '../core/utils.js';

export function stokGudangTab() {
    return {
        selectedGudang: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredStok() {
            if (this.selectedGudang === '') return this.$parent.stokGudangList;
            return this.$parent.stokGudangList.filter(s => s.gudang === this.selectedGudang);
        },
        get totalPages() { return totalPages(this.filteredStok, this.perPage); },
        get paginatedStok() { return paginate(this.filteredStok, this.page, this.perPage); }
    };
}