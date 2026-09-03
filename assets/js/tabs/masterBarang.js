import { paginate, totalPages } from '../core/utils.js';

export function masterBarangTab() {
    return {
        searchBarang: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredBarang() {
            let q = this.searchBarang.toLowerCase();
            return this.$parent.barangList.filter(b => b.kode.toLowerCase().includes(q) || b.nama.toLowerCase().includes(q));
        },
        get totalPages() { return totalPages(this.filteredBarang, this.perPage); },
        get paginatedBarang() { return paginate(this.filteredBarang, this.page, this.perPage); },
        openModal() { this.$parent.openModal('barang'); },
        editItem(item) {
            this.$parent.modalBarang = { ...item };
            if (this.$parent.modalBarang.stokMin === undefined) this.$parent.modalBarang.stokMin = 0;
            this.$parent.isEditMode = true; this.$parent.modalTitle = 'Edit Data Barang'; this.$parent.modalType = 'barang'; this.$parent.isModalOpen = true;
        }
    };
}