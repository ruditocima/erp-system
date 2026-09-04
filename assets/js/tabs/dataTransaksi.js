import { paginate, totalPages } from '../core/utils.js';

export function dataTransaksiTab() {
    return {
        searchTransaction: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredTransactionList() {
            let q = this.searchTransaction.toLowerCase();
            const txList = this.$store?.wms?.transactionList || [];
            return txList.filter(t => t.noDocument.toLowerCase().includes(q) || (t.noTodo && t.noTodo.toLowerCase().includes(q)));
        },
        get totalPages() { return totalPages(this.filteredTransactionList, this.perPage); },
        get paginatedTransactionList() { return paginate(this.filteredTransactionList, this.page, this.perPage); }
    };
}
