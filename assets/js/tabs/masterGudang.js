import { paginate, totalPages } from '../core/utils.js';

export function masterGudangTab() {
    return {
        searchGudang: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredGudangList() {
            let q = this.searchGudang.toLowerCase();
            return this.$parent.gudangList.filter(g => g.kode.toLowerCase().includes(q) || g.nama.toLowerCase().includes(q));
        },
        get totalPages() { return totalPages(this.filteredGudangList, this.perPage); },
        get paginatedGudangList() { return paginate(this.filteredGudangList, this.page, this.perPage); },
        openModal() { this.$parent.openModal('gudang'); },
        editItem(item) {
            this.$parent.modalGudang = { ...item };
            this.$parent.isEditGudangMode = true; this.$parent.modalTitle = 'Edit Data Gudang'; this.$parent.modalType = 'gudang'; this.$parent.isModalOpen = true;
        }
    };
}