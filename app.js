// ==========================================
// ENTERPRISE WMS v2.0 - MAIN ALPINE APP LOGIC
// ==========================================
document.addEventListener('alpine:init', () => {
    Alpine.data('wmsApp', () => ({
        isLoggedIn: false,
        username: '',
        role: 'Admin',
        activeTab: 'dashboard',
        idleTimer: null,
        idleWarning: false,
        idleCountdown: 30,
        idleInterval: null,

        tabs: [
            { id: 'dashboard', name: 'Dashboard', icon: 'layout-dashboard' },
            { id: 'master_barang', name: 'Master Barang', icon: 'package' },
            { id: 'master_gudang', name: 'Master Gudang', icon: 'warehouse' },
            { id: 'master_project', name: 'Master Project', icon: 'briefcase' },
            { id: 'input_transaksi', name: 'Input Transaksi', icon: 'file-plus' },
            { id: 'approval_transaksi', name: 'Approval', icon: 'check-circle' },
            { id: 'data_transaksi', name: 'Data Transaksi', icon: 'database' },
            { id: 'stock_opname', name: 'Stock Opname', icon: 'clipboard-list' },
            { id: 'project_usage', name: 'Project Usage', icon: 'activity' },
            { id: 'laporan', name: 'Laporan & Stok', icon: 'bar-chart-3' }
        ],

        toasts: [],
        confirmModal: { show: false, title: '', message: '', type: 'danger', confirmText: 'Hapus', onConfirm: () => {}, onCancel: () => {} },

        // Data Lists
        barangList: [],
        gudangList: [],
        projectList: [],
        transactionList: [],
        opnameHistory: [],

        // Search & Pagination States
        searchBarang: '', pageBarang: 1, perPageBarang: 10,
        searchGudang: '', pageGudang: 1, perPageGudang: 10,
        searchProject: '', pageProject: 1, perPageProject: 10,
        transactionSearch: '', transactionFilterTipe: '', pageTransaction: 1, perPageTransaction: 10,
        opnameSearch: '', pageOpname: 1, perPageOpname: 10,
        selectedProjectFilter: '', pageProjectUsage: 1, perPageProjectUsage: 10,
        reportSearch: '', reportGudangFilter: '', pageReport: 1, perPageReport: 10,

        // Modal States
        modalMode: 'create',
        activeModal: null,
        formBarang: { kategori: '', jenis: '', kode: '', nama: '', satuan: 'Pcs', stokMin: 5 },
        formGudang: { kode: '', nama: '', tipe: 'Perusahaan Sendiri', lokasi: '', pic: '' },
        formProject: { kodeProject: '', periode: '', type: '', region: '', noPrPo: '', poPlan: '', poFinal: '', statusPo: 'Draft', permit: 'Pending', statusSnd: 'Draft', statusProject: 'Planning', statusDoc: 'Incomplete' },

        // Form Transaksi
        trxForm: { noDocument: '', tanggal: new Date().toISOString().split('T')[0], tipe: 'Masuk', gudangAsal: '', gudangTujuan: '', kodeProject: '', catatan: '', items: [{ kode: '', nama: '', qty: 1, satuan: 'Pcs' }] },
        
        // Stock Opname Form
        opnameForm: { gudang: '', tanggal: new Date().toISOString().split('T')[0], catatan: '', items: [] },

        init() {
            this.loadInitialData();
            this.initIdleTimer();
            // Lucide icons init after DOM render
            this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
        },

        async loadInitialData() {
            // Cek session login tersimpan
            const savedUser = localStorage.getItem('wms_user');
            const savedRole = localStorage.getItem('wms_role');
            if (savedUser) {
                this.username = savedUser;
                this.role = savedRole || 'Admin';
                this.isLoggedIn = true;
            }

            if (supabaseClient) {
                try {
                    // Fetch dari Supabase
                    let { data: b } = await supabaseClient.from('barang').select('*');
                    let { data: g } = await supabaseClient.from('gudang').select('*');
                    let { data: p } = await supabaseClient.from('project').select('*');
                    let { data: t } = await supabaseClient.from('transactions').select('*');
                    let { data: o } = await supabaseClient.from('opname_history').select('*');

                    if (b && b.length > 0) this.barangList = b.map(x => ({ ...x, stokMin: x.stok_min }));
                    if (g && g.length > 0) this.gudangList = g;
                    if (p && p.length > 0) this.projectList = p.map(x => ({ ...x, kodeProject: x.kode_project, noPrPo: x.no_pr_po, poPlan: x.po_plan, poFinal: x.po_final, statusPo: x.status_po, statusSnd: x.status_snd, statusProject: x.status_project, statusDoc: x.status_doc }));
                    if (t && t.length > 0) this.transactionList = t.map(x => ({ ...x, noDocument: x.no_document, gudangAsal: x.gudang_asal, gudangTujuan: x.gudang_tujuan, kodeProject: x.kode_project }));
                    if (o && o.length > 0) this.opnameHistory = o;
                } catch (err) {
                    console.warn('Gagal memuat dari Supabase, menggunakan LocalStorage:', err);
                    this.loadFromLocalStorage();
                }
            } else {
                this.loadFromLocalStorage();
            }

            if (this.barangList.length === 0) {
                // Dummy Data Default jika kosong
                this.barangList = [
                    { kategori: 'Network', jenis: 'Router', kode: 'RT-001', nama: 'Router Cisco ISR 4331', satuan: 'Unit', stokMin: 2 },
                    { kategori: 'Cable', jenis: 'Fiber Optic', kode: 'FO-100', nama: 'Kabel FO Multimode 100m', satuan: 'Roll', stokMin: 5 }
                ];
                this.gudangList = [
                    { kode: 'WH-JKT', nama: 'Gudang Pusat Jakarta', tipe: 'Perusahaan Sendiri', lokasi: 'Jakarta', pic: 'Budi' },
                    { kode: 'WH-SBY', nama: 'Gudang Cabang Surabaya', tipe: 'Perusahaan Sendiri', lokasi: 'Surabaya', pic: 'Siti' }
                ];
            }
        },

        loadFromLocalStorage() {
            const b = localStorage.getItem('wms_barang');
            const g = localStorage.getItem('wms_gudang');
            const p = localStorage.getItem('wms_project');
            const t = localStorage.getItem('wms_transactions');
            const o = localStorage.getItem('wms_opname');
            if (b) this.barangList = JSON.parse(b);
            if (g) this.gudangList = JSON.parse(g);
            if (p) this.projectList = JSON.parse(p);
            if (t) this.transactionList = JSON.parse(t);
            if (o) this.opnameHistory = JSON.parse(o);
        },

        saveToLocalStorage() {
            localStorage.setItem('wms_barang', JSON.stringify(this.barangList));
            localStorage.setItem('wms_gudang', JSON.stringify(this.gudangList));
            localStorage.setItem('wms_project', JSON.stringify(this.projectList));
            localStorage.setItem('wms_transactions', JSON.stringify(this.transactionList));
            localStorage.setItem('wms_opname', JSON.stringify(this.opnameHistory));
        },

        showToast(message, type = 'success') {
            const id = Date.now();
            this.toasts.push({ id, message, type });
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 3000);
        },

        login() {
            if (!this.username.trim()) return;
            this.isLoggedIn = true;
            localStorage.setItem('wms_user', this.username);
            localStorage.setItem('wms_role', this.role);
            this.showToast(`Selamat datang, ${this.username} (${this.role})`, 'success');
        },

        logout() {
            this.isLoggedIn = false;
            localStorage.removeItem('wms_user');
            localStorage.removeItem('wms_role');
            this.showToast('Anda telah keluar dari sistem', 'info');
        },

        switchTab(tabId) {
            this.activeTab = tabId;
            this.$nextTick(() => {
                if (window.lucide) lucide.createIcons();
                if (tabId === 'dashboard') this.renderChart();
            });
        },

        // Idle Session Timeout Handler
        initIdleTimer() {
            const reset = () => {
                this.idleWarning = false;
                clearInterval(this.idleInterval);
                clearTimeout(this.idleTimer);
                this.idleTimer = setTimeout(() => {
                    this.idleWarning = true;
                    this.idleCountdown = 30;
                    this.idleInterval = setInterval(() => {
                        this.idleCountdown--;
                        if (this.idleCountdown <= 0) {
                            clearInterval(this.idleInterval);
                            this.logout();
                        }
                    }, 1000);
                }, 25 * 60 * 1000); // 25 Menit
            };
            window.addEventListener('mousemove', reset);
            window.addEventListener('keypress', reset);
            reset();
        },

        resetIdleTimer() {
            this.idleWarning = false;
            clearInterval(this.idleInterval);
            clearTimeout(this.idleTimer);
            this.initIdleTimer();
        },

        // CRUD Helper & COMPUTED PROPERTIES
        get pendingCount() {
            return this.transactionList.filter(t => t.status === 'Pending').length;
        },
        get totalStokGlobal() {
            let total = 0;
            this.transactionList.filter(t => t.status === 'Approved').forEach(trx => {
                if (Array.isArray(trx.items)) {
                    trx.items.forEach(i => {
                        if (trx.tipe === 'Masuk') total += Number(i.qty || 0);
                        if (trx.tipe === 'Keluar') total -= Number(i.qty || 0);
                    });
                }
            });
            return total;
        },
        get stokMenipisList() {
            let mapStok = {};
            this.transactionList.filter(t => t.status === 'Approved').forEach(trx => {
                if (!Array.isArray(trx.items)) return;
                trx.items.forEach(i => {
                    let key = i.kode + '_' + (trx.tipe === 'Masuk' ? trx.gudangTujuan : trx.gudangAsal);
                    if (!mapStok[key]) mapStok[key] = { kodeBarang: i.kode, namaBarang: i.nama, gudang: trx.tipe === 'Masuk' ? trx.gudangTujuan : trx.gudangAsal, qty: 0 };
                    if (trx.tipe === 'Masuk') mapStok[key].qty += Number(i.qty || 0);
                    if (trx.tipe === 'Keluar') mapStok[key].qty -= Number(i.qty || 0);
                });
            });
            let result = [];
            this.barangList.forEach(b => {
                this.gudangList.forEach(g => {
                    let key = b.kode + '_' + g.kode;
                    let currentQty = mapStok[key] ? mapStok[key].qty : 0;
                    if (currentQty <= (b.stokMin || 5)) {
                        result.push({ kodeBarang: b.kode, namaBarang: b.nama, gudang: g.nama, qty: currentQty, stokMin: b.stokMin || 5 });
                    }
                });
            });
            return result;
        },

        // Filter & Pagination getters for Barang
        get filteredBarang() {
            let q = this.searchBarang.toLowerCase();
            return this.barangList.filter(b => b.kode.toLowerCase().includes(q) || b.nama.toLowerCase().includes(q) || b.kategori.toLowerCase().includes(q));
        },
        get totalPagesBarang() { return Math.ceil(this.filteredBarang.length / this.perPageBarang) || 1; },
        get paginatedBarang() {
            let start = (this.pageBarang - 1) * this.perPageBarang;
            return this.filteredBarang.slice(start, start + this.perPageBarang);
        },

        // Filter & Pagination getters for Gudang
        get filteredGudangList() {
            let q = this.searchGudang.toLowerCase();
            return this.gudangList.filter(g => g.kode.toLowerCase().includes(q) || g.nama.toLowerCase().includes(q));
        },
        get totalPagesGudang() { return Math.ceil(this.filteredGudangList.length / this.perPageGudang) || 1; },
        get paginatedGudangList() {
            let start = (this.pageGudang - 1) * this.perPageGudang;
            return this.filteredGudangList.slice(start, start + this.perPageGudang);
        },

        // Filter & Pagination getters for Project
        get filteredProjectList() {
            let q = this.searchProject.toLowerCase();
            return this.projectList.filter(p => p.kodeProject.toLowerCase().includes(q) || p.noPrPo.toLowerCase().includes(q));
        },
        get totalPagesProject() { return Math.ceil(this.filteredProjectList.length / this.perPageProject) || 1; },
        get paginatedProjectList() {
            let start = (this.pageProject - 1) * this.perPageProject;
            return this.filteredProjectList.slice(start, start + this.perPageProject);
        },

        openModal(type) {
            this.modalMode = 'create';
            this.activeModal = type;
            if (type === 'barang') this.formBarang = { kategori: '', jenis: '', kode: 'BRG-' + Math.floor(100 + Math.random() * 900), nama: '', satuan: 'Pcs', stokMin: 5 };
            if (type === 'gudang') this.formGudang = { kode: 'WH-' + Math.floor(100 + Math.random() * 900), nama: '', tipe: 'Perusahaan Sendiri', lokasi: '', pic: '' };
            if (type === 'project') this.formProject = { kodeProject: 'PRJ-' + Math.floor(100 + Math.random() * 900), periode: '2026/Q1', type: 'FTTH', region: 'Jawa', noPrPo: 'PO-' + Math.floor(1000 + Math.random() * 9000), poPlan: '2026-03-01', poFinal: '2026-03-10', statusPo: 'Draft', permit: 'Pending', statusSnd: 'Draft', statusProject: 'Planning', statusDoc: 'Incomplete' };
        },

        async saveBarang() {
            if (!this.formBarang.kode || !this.formBarang.nama) return;
            if (this.modalMode === 'create') {
                this.barangList.push({ ...this.formBarang });
                if (supabaseClient) {
                    await supabaseClient.from('barang').insert([{ kode: this.formBarang.kode, kategori: this.formBarang.kategori, jenis: this.formBarang.jenis, nama: this.formBarang.nama, satuan: this.formBarang.satuan, stok_min: this.formBarang.stokMin }]);
                }
                this.showToast('Barang berhasil ditambahkan', 'success');
            } else {
                let idx = this.barangList.findIndex(b => b.kode === this.formBarang.kode);
                if (idx !== -1) this.barangList[idx] = { ...this.formBarang };
                if (supabaseClient) {
                    await supabaseClient.from('barang').update({ kategori: this.formBarang.kategori, jenis: this.formBarang.jenis, nama: this.formBarang.nama, satuan: this.formBarang.satuan, stok_min: this.formBarang.stokMin }).eq('kode', this.formBarang.kode);
                }
                this.showToast('Barang berhasil diperbarui', 'success');
            }
            this.saveToLocalStorage();
            this.activeModal = null;
        },

        editBarang(item) {
            this.modalMode = 'edit';
            this.formBarang = { ...item };
            this.activeModal = 'barang';
        },

        async saveGudang() {
            if (!this.formGudang.kode || !this.formGudang.nama) return;
            if (this.modalMode === 'create') {
                this.gudangList.push({ ...this.formGudang });
                if (supabaseClient) {
                    await supabaseClient.from('gudang').insert([this.formGudang]);
                }
                this.showToast('Gudang berhasil ditambahkan', 'success');
            } else {
                let idx = this.gudangList.findIndex(g => g.kode === this.formGudang.kode);
                if (idx !== -1) this.gudangList[idx] = { ...this.formGudang };
                if (supabaseClient) {
                    await supabaseClient.from('gudang').update(this.formGudang).eq('kode', this.formGudang.kode);
                }
                this.showToast('Gudang berhasil diperbarui', 'success');
            }
            this.saveToLocalStorage();
            this.activeModal = null;
        },

        editGudang(g) {
            this.modalMode = 'edit';
            this.formGudang = { ...g };
            this.activeModal = 'gudang';
        },

        async saveProject() {
            if (!this.formProject.kodeProject) return;
            if (this.modalMode === 'create') {
                this.projectList.push({ ...this.formProject });
                if (supabaseClient) {
                    await supabaseClient.from('project').insert([{
                        kode_project: this.formProject.kodeProject, periode: this.formProject.periode, type: this.formProject.type, region: this.formProject.region, no_pr_po: this.formProject.noPrPo, po_plan: this.formProject.poPlan, po_final: this.formProject.poFinal, status_po: this.formProject.statusPo, permit: this.formProject.permit, status_snd: this.formProject.statusSnd, status_project: this.formProject.statusProject, status_doc: this.formProject.statusDoc
                    }]);
                }
                this.showToast('Project berhasil ditambahkan', 'success');
            } else {
                let idx = this.projectList.findIndex(p => p.kodeProject === this.formProject.kodeProject);
                if (idx !== -1) this.projectList[idx] = { ...this.formProject };
                if (supabaseClient) {
                    await supabaseClient.from('project').update({
                        periode: this.formProject.periode, type: this.formProject.type, region: this.formProject.region, no_pr_po: this.formProject.noPrPo, po_plan: this.formProject.poPlan, po_final: this.formProject.poFinal, status_po: this.formProject.statusPo, permit: this.formProject.permit, status_snd: this.formProject.statusSnd, status_project: this.formProject.statusProject, status_doc: this.formProject.statusDoc
                    }).eq('kode_project', this.formProject.kodeProject);
                }
                this.showToast('Project berhasil diperbarui', 'success');
            }
            this.saveToLocalStorage();
            this.activeModal = null;
        },

        editProject(p) {
            this.modalMode = 'edit';
            this.formProject = { ...p };
            this.activeModal = 'project';
        },

        confirmDelete(type, id) {
            this.confirmModal = {
                show: true,
                title: 'Konfirmasi Hapus',
                message: `Apakah Anda yakin ingin menghapus data ${type} dengan kode ${id}?`,
                type: 'danger',
                confirmText: 'Hapus',
                onConfirm: async () => {
                    if (type === 'barang') {
                        this.barangList = this.barangList.filter(b => b.kode !== id);
                        if (supabaseClient) await supabaseClient.from('barang').delete().eq('kode', id);
                    } else if (type === 'gudang') {
                        this.gudangList = this.gudangList.filter(g => g.kode !== id);
                        if (supabaseClient) await supabaseClient.from('gudang').delete().eq('kode', id);
                    } else if (type === 'project') {
                        this.projectList = this.projectList.filter(p => p.kodeProject !== id);
                        if (supabaseClient) await supabaseClient.from('project').delete().eq('kode_project', id);
                    }
                    this.saveToLocalStorage();
                    this.showToast('Data berhasil dihapus', 'success');
                },
                onCancel: () => {}
            };
        },

        renderChart() {
            const ctx = document.getElementById('dashboardChart');
            if (!ctx) return;
            if (window.myDashboardChart) window.myDashboardChart.destroy();
            window.myDashboardChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
                    datasets: [{
                        label: 'Volume Transaksi',
                        data: [12, 19, 8, 15, 22, 10, 5],
                        backgroundColor: '#6366f1',
                        borderRadius: 6
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    }));
});