import { paginate, totalPages } from '../core/utils.js';

export function dataTransaksiTab() {
    return {
        searchTransaction: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredTransactionList() {
            let q = this.searchTransaction.toLowerCase();
            return this.$parent.transactionList.filter(t => t.noDocument.toLowerCase().includes(q) || t.noTodo.toLowerCase().includes(q));
        },
        get totalPages() { return totalPages(this.filteredTransactionList, this.perPage); },
        get paginatedTransactionList() { return paginate(this.filteredTransactionList, this.page, this.perPage); }
    };
}