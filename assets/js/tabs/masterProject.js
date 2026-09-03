import { paginate, totalPages } from '../core/utils.js';

export function masterProjectTab() {
    return {
        searchProject: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredProjectList() {
            let q = this.searchProject.toLowerCase();
            return this.$parent.projectList.filter(p => p.kodeProject.toLowerCase().includes(q) || p.noPrPo.toLowerCase().includes(q));
        },
        get totalPages() { return totalPages(this.filteredProjectList, this.perPage); },
        get paginatedProjectList() { return paginate(this.filteredProjectList, this.page, this.perPage); },
        openModal() { this.$parent.openModal('project'); },
        editItem(item) {
            this.$parent.modalProject = { ...item };
            this.$parent.isEditProjectMode = true; this.$parent.modalTitle = 'Edit Data Project'; this.$parent.modalType = 'project'; this.$parent.isModalOpen = true;
        }
    };
}