import { supabaseClient } from '../services/supabaseClient.js';

function safeLoadStorage(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Peringatan: Gagal memuat data lokal dari key "${key}":`, e);
        return fallback;
    }
}

export default function warehouseApp() {
    return {
        googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxGfGRF55_aYHdG9kMMLgGqV7_ksL5VZGtb6JLRpXBn9nTaMKYUlVrk6s587cTNYC7_/exec',

        isLoggedIn: localStorage.getItem('vortex_logged_in') === 'true',
        currentUser: localStorage.getItem('vortex_user') || 'Admin',
        currentRole: localStorage.getItem('vortex_role') || 'Super Admin',
        currentTab: 'dashboard',
        loginForm: { email: '', password: '' },
        profileForm: { namaLengkap: '', email: '', newPassword: '' },

        showModal: false, modalType: '', modalForm: {}, isEdit: false, editIndex: null,
        isLoading: false, notification: { show: false, message: '', type: 'error' },
        filterStokGudang: '', filterRegionUsage: '', searchNoTransaksi: '', searchNoReferensi: '', searchMaterialUsageProject: '', editingOriginalNo: null,
        showDrumLedger: false, selectedCableKode: '',

        selectedFilesList: [],

        pageStok: 1, pageSizeStok: 10, totalStokCount: 0,
        pageDrum: 1, pageSizeDrum: 10, totalDrumCount: 0,
        pageUsage: 1, pageSizeUsage: 10, totalUsageCount: 0,
        pageTx: 1, pageSizeTx: 10, totalTxCount: 0,
        _reloadTimer: null,
        _draftTimer: null,

        masterBarang: safeLoadStorage('vortex_masterBarang', [
            { kategori: 'Cable', jenis: 'ADSS', kodeBarang: 'CBL-ADSS-036', namaBarang: 'Kabel ADSS-036 36Core', sat: 'Meter' }
        ]),
        masterGudang: safeLoadStorage('vortex_masterGudang', [
            { region: 'Jakarta', kodeGudang: 'NPM-JKT-01', namaGudang: 'Gudang Utama Jakarta', tipeKepemilikan: 'Milik Sendiri', lokasi: 'Cakung' }
        ]),
        masterProject: safeLoadStorage('vortex_masterProject', []),
        stokGudang: safeLoadStorage('vortex_stokGudang', []),
        drumLedger: safeLoadStorage('vortex_drumLedger', []),
        materialUsage: safeLoadStorage('vortex_materialUsage', []),
        transactions: safeLoadStorage('vortex_transactions', []),
        newTrans: { tanggal: '', noTransaksi: '', noReferensi: '', tipeTransaksi: 'Masuk', gudangAsal: '', gudangTujuan: '', kodeProject: '', keterangan: '', lampiran: '', lampiranUrl: '', staffGudang: '', projectManager: '', namaPenerima: '', items: [] },
        activeBast: {},

        get isSuperAdmin() {
            return !this.currentRole || this.currentRole.toLowerCase().includes('super') || this.currentRole.toLowerCase() === 'admin';
        },
        userRegion() {
            return localStorage.getItem('vortex_region') || (this.isSuperAdmin ? 'Semua Region' : 'Aceh');
        },
        getFilteredMasterGudang() {
            if (this.isSuperAdmin) return this.masterGudang;
            const reg = this.userRegion().toLowerCase();
            return this.masterGudang.filter(g => (g.region || '').toLowerCase() === reg);
        },
        getFilteredMasterProject() {
            if (this.isSuperAdmin) return this.masterProject;
            const reg = this.userRegion().toLowerCase();
            return this.masterProject.filter(p => (p.region || '').toLowerCase() === reg);
        },

        todayWIB() {
            return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        },

        scheduleReload() {
            if (this._reloadTimer) clearTimeout(this._reloadTimer);
            this._reloadTimer = setTimeout(() => { this.loadDataFromSupabase(); }, 1200);
        },

        saveFormDraft(formData) {
            if (this._draftTimer) clearTimeout(this._draftTimer);
            this._draftTimer = setTimeout(() => {
                try {
                    if (formData) {
                        localStorage.setItem('vortex_draft_transaksi', JSON.stringify(formData));
                    }
                } catch (e) { 
                    console.warn('Peringatan: Gagal menyimpan draf transaksi ke localStorage:', e); 
                }
            }, 500);
        },

        loadFormDraft() {
            try {
                const savedDraft = localStorage.getItem('vortex_draft_transaksi');
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && typeof parsed === 'object' && (parsed.noReferensi || parsed.keterangan || (parsed.items && parsed.items.some(i => i.kodeBarang || i.qty)))) {
                        this.newTrans = parsed;
                        return true;
                    }
                }
            } catch (e) { 
                console.warn('Peringatan: Gagal memuat draf transaksi dari localStorage:', e); 
            }
            return false;
        },

        clearFormDraft() {
            try {
                localStorage.removeItem('vortex_draft_transaksi');
            } catch (e) { 
                console.warn('Peringatan: Gagal membersihkan draf transaksi:', e); 
            }
        },

        buildRpcParams(tx) {
            return {
                p_no_transaksi: tx.noTransaksi,
                p_tanggal: tx.tanggal,
                p_no_referensi: tx.noReferensi || '',
                p_tipe_transaksi: tx.tipeTransaksi,
                p_gudang_asal: tx.gudangAsal || '',
                p_gudang_tujuan: tx.gudangTujuan || '',
                p_kode_project: tx.kodeProject || '',
                p_keterangan: tx.keterangan || '',
                p_staff_gudang: tx.staffGudang || '',
                p_project_manager: tx.projectManager || '',
                p_nama_penerima: tx.namaPenerima || '',
                p_lampiran_url: tx.lampiranUrl || '',
                p_items: tx.items || []
            };
        },

        async logAudit(action, details) {
            try {
                if (!supabaseClient) return;
                const { error } = await supabaseClient.from('audit_log').insert({
                    user_name: this.currentUser || 'unknown',
                    user_role: this.currentRole || '',
                    action: action,
                    details: JSON.stringify(details || {}),
                    created_at: new Date().toISOString()
                });
                if (error) {
                    console.error('Gagal mencatat audit log ke database:', error.message);
                }
            } catch (e) { 
                console.error('Terjadi kesalahan saat mencatat audit log:', e); 
            }
        },

        async validateSession() {
            if (!supabaseClient) return;
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (this.isLoggedIn && !session) { this.logout(); return; }
            if (session && session.user) {
                const { data: prof } = await supabaseClient.from('profiles')
                    .select('role, nama_lengkap, region').eq('id', session.user.id).single();
                if (prof) {
                    this.currentRole = prof.role || this.currentRole;
                    this.currentUser = prof.nama_lengkap || this.currentUser;
                    if (prof.region) localStorage.setItem('vortex_region', prof.region);
                    localStorage.setItem('vortex_role', this.currentRole);
                    localStorage.setItem('vortex_user', this.currentUser);
                }
                supabaseClient.auth.onAuthStateChange((event) => {
                    if (event === 'SIGNED_OUT') this.logout();
                });
            }
        },

        async init() {
            await this.resetInputTransaction();
            this.loadFormDraft();
            this.initProfileData();
            await this.validateSession();
            await this.loadDataFromSupabase();
            this.inisialisasiRealtimeStok();
            this.refreshIcons();

            this.$watch('currentTab', () => {
                this.showDrumLedger = false;
                this.selectedCableKode = '';
            });

            this.$watch('newTrans', val => {
                if (val && (val.noReferensi || val.keterangan || (val.items && val.items.some(i => i.kodeBarang || i.qty)))) {
                    this.saveFormDraft(val);
                }
            }, { deep: true });

            this.$watch('newTrans.tipeTransaksi', val => {
                if (val === 'Keluar') {
                    this.newTrans.staffGudang = this.currentUser || '';
                }
            });

            this.$watch('filterStokGudang', () => { this.pageStok = 1; this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchMaterialUsageProject', () => { this.pageUsage = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('searchNoTransaksi', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });

            this.$watch('pageStok', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeStok', () => { this.pageStok = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageDrum', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeDrum', () => { this.pageDrum = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageUsage', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeUsage', () => { this.pageUsage = 1; if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageTx', () => { if(supabaseClient) this.loadDataFromSupabase(); });
            this.$watch('pageSizeTx', () => { this.pageTx = 1; if(supabaseClient) this.loadDataFromSupabase(); });
        },

        inisialisasiRealtimeStok() {
            if (!supabaseClient) return;

            supabaseClient.channel('pantau-stok-wms-optimized')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stok_gudang' }, () => {
                    this.scheduleReload();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
                    this.scheduleReload();
                })
                .subscribe();
        },

        async catatPenggunaanKabel(drumId, panjangDipakai) {
            if (!supabaseClient) {
                let drum = this.drumLedger.find(d => d.drumId === drumId);
                if (!drum) {
                    this.showNotification('Drum ID tidak ditemukan!', 'error');
                    return false;
                }
                if (drum.remainingLength < panjangDipakai) {
                    this.showNotification('Sisa panjang kabel tidak mencukupi!', 'error');
                    return false;
                }
                drum.remainingLength = Math.round((drum.remainingLength - panjangDipakai) * 100) / 100;
                return true;
            }

            try {
                const { data, error } = await supabaseClient.rpc('potong_stok_kabel', {
                    p_drum_id: drumId,
                    p_panjang_dipakai: parseFloat(panjangDipakai)
                });

                if (error) throw error;

                if (data && data.status === 'error') {
                    this.showNotification(`Gagal: ${data.message}`, 'error');
                    return false;
                }

                this.showNotification(`Transaksi berhasil. Sisa stok drum: ${data ? data.sisa_stok : '-'}m`, 'success');
                await this.loadDataFromSupabase();
                return true;
            } catch (err) {
                console.error('Gagal eksekusi RPC potong_stok_kabel:', err.message);
                this.showNotification('Gagal memotong stok: ' + (err.message || err), 'error');
                return false;
            }
        },

        formatQty(val) {
            const n = parseFloat(val) || 0;
            return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
        },

        paginate(items, page, size) {
            const start = (page - 1) * size;
            return items.slice(start, start + size);
        },
        totalPages(items, size) {
            return Math.ceil(items.length / size) || 1;
        },

        getPaginatedStokGudang() {
            if (supabaseClient) return this.stokGudang;
            return this.paginate(this.getFilteredStokGudang(), this.pageStok, this.pageSizeStok);
        },
        getPaginatedDrumLedger() {
            return this.paginate(this.getFilteredDrumLedger(), this.pageDrum, this.pageSizeDrum);
        },
        getPaginatedMaterialUsage() {
            if (supabaseClient) return this.materialUsage;
            return this.paginate(this.getFilteredMaterialUsage(), this.pageUsage, this.pageSizeUsage);
        },
        getPaginatedTransactions() {
            if (supabaseClient) return this.transactions;
            return this.paginate(this.getFilteredTransactions(), this.pageTx, this.pageSizeTx);
        },

        async loadDataFromSupabase() {
            if (!supabaseClient) return;
            this.isLoading = true;
            try {
                const { data: projectData } = await supabaseClient.from('master_project').select('*');
                if (projectData) {
                    this.masterProject = projectData.map(p => ({
                        periode: p.periode, region: p.region, kodeProject: p.kode_project,
                        type: p.type, noPO: p.no_po, projectName: p.project_name
                    }));
                }

                const { data: barangData } = await supabaseClient.from('master_barang').select('*');
                if (barangData) {
                    this.masterBarang = barangData.map(b => ({
                        kategori: b.kategori, jenis: b.jenis, kodeBarang: b.kode_barang,
                        namaBarang: b.nama_barang, sat: b.sat
                    }));
                }

                const { data: gudangData } = await supabaseClient.from('master_gudang').select('*');
                if (gudangData) {
                    this.masterGudang = gudangData.map(g => ({
                        region: g.region || '', kodeGudang: g.kode_gudang,
                        namaGudang: g.nama_gudang, tipeKepemilikan: g.tipe_kepemilikan, lokasi: g.lokasi
                    }));
                }

                let stockQuery = supabaseClient.from('stok_gudang').select('*', { count: 'exact' });
                if (this.filterStokGudang) {
                    stockQuery = stockQuery.eq('gudang', this.filterStokGudang);
                }
                const fromStok = (this.pageStok - 1) * this.pageSizeStok;
                const { data: stockData, count: countStok } = await stockQuery.order('kode_barang', { ascending: true }).range(fromStok, fromStok + this.pageSizeStok - 1);
                if (stockData) {
                    this.stokGudang = stockData.map(s => ({
                        kodeBarang: s.kode_barang, 
                        namaBarang: s.nama_barang,
                        kategori: s.kategori, 
                        gudang: s.gudang, 
                        masuk: parseFloat(s.masuk) || 0,
                        keluar: parseFloat(s.keluar) || 0,
                        tMasuk: parseFloat(s.t_masuk) || 0,
                        tKeluar: parseFloat(s.t_keluar) || 0,
                        qty: parseFloat(s.qty) || 0, 
                        sat: s.sat
                    }));
                    this.totalStokCount = countStok !== null ? countStok : stockData.length;
                }

                let drumQuery = supabaseClient.from('drum_ledger').select('*', { count: 'exact' });
                if (this.filterStokGudang) drumQuery = drumQuery.eq('gudang', this.filterStokGudang);
                if (this.selectedCableKode) drumQuery = drumQuery.eq('kode_barang', this.selectedCableKode);
                const fromDrum = (this.pageDrum - 1) * this.pageSizeDrum;
                const { data: drumData, count: countDrum } = await drumQuery.order('drum_id', { ascending: true }).range(fromDrum, fromDrum + this.pageSizeDrum - 1);
                if (drumData) {
                    this.drumLedger = drumData.map(d => ({
                        drumId: d.drum_id, kodeBarang: d.kode_barang, namaBarang: d.nama_barang,
                        gudang: d.gudang, initialLength: parseFloat(d.initial_length) || 0,
                        remainingLength: parseFloat(d.remaining_length) || 0
                    }));
                    this.totalDrumCount = countDrum !== null ? countDrum : drumData.length;
                }

                let usageQuery = supabaseClient.from('material_usage').select('*', { count: 'exact' });
                if (this.searchMaterialUsageProject) {
                    usageQuery = usageQuery.or(`kode_project.ilike.%${this.searchMaterialUsageProject}%,project_name.ilike.%${this.searchMaterialUsageProject}%`);
                }
                const fromUsage = (this.pageUsage - 1) * this.pageSizeUsage;
                const { data: usageData, count: countUsage } = await usageQuery
                    .order('id', { ascending: false })
                    .range(fromUsage, fromUsage + this.pageSizeUsage - 1);

                if (usageData) {
                    this.materialUsage = usageData.map(u => ({
                        id: u.id,
                        tanggal: u.tanggal,
                        kodeProject: u.kode_project,
                        projectName: u.project_name,
                        noPO: u.no_po,
                        kodeBarang: u.kode_barang,
                        namaBarang: u.nama_barang,
                        drumId: u.drum_id,
                        qty: parseFloat(u.qty) || 0
                    }));
                    this.totalUsageCount = countUsage !== null ? countUsage : usageData.length;
                }

                let txQuery = supabaseClient.from('transactions').select('*', { count: 'exact' });
                if (this.searchNoTransaksi) txQuery = txQuery.or(`no_transaksi.ilike.%${this.searchNoTransaksi}%,no_referensi.ilike.%${this.searchNoTransaksi}%`);
                const fromTx = (this.pageTx - 1) * this.pageSizeTx;
                const { data: txData, count: countTx } = await txQuery.order('tanggal', { ascending: false }).range(fromTx, fromTx + this.pageSizeTx - 1);
                if (txData) {
                    this.transactions = txData.map(t => ({
                        noTransaksi: t.no_transaksi, tanggal: t.tanggal, noReferensi: t.no_referensi,
                        tipeTransaksi: t.tipe_transaksi, gudangAsal: t.gudang_asal, gudangTujuan: t.gudang_tujuan,
                        kodeProject: t.kode_project, keterangan: t.keterangan, staffGudang: t.staff_gudang,
                        projectManager: t.project_manager, namaPenerima: t.nama_penerima, lampiranUrl: t.lampiran_url,
                        items: typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
                    }));
                    this.totalTxCount = countTx !== null ? countTx : txData.length;
                }

            } catch (err) {
                console.error('Gagal memuat data dari Supabase:', err);
            } finally {
                this.isLoading = false;
                this.refreshIcons();
            }
        },

        refreshIcons() {
            this.$nextTick(() => { 
                if (window.lucide && window.lucide.createIcons) {
                    window.lucide.createIcons(); 
                }
            });
        },

        showNotification(msg, type = 'success') {
            this.notification = { show: true, message: msg, type: type };
            this.refreshIcons();
            setTimeout(() => { this.notification.show = false; }, 4000);
        },

        async login() {
            const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
            if (!supabaseClient && demoMode) {
                this.isLoggedIn = true;
                this.currentUser = 'Demo User';
                this.currentRole = 'Super Admin';
                localStorage.setItem('vortex_logged_in', 'true');
                localStorage.setItem('vortex_user', this.currentUser);
                localStorage.setItem('vortex_role', this.currentRole);
                this.showNotification('Berhasil masuk dalam mode Demo');
                return;
            }

            if (!supabaseClient) {
                this.showNotification('Supabase tidak terhubung.', 'error');
                return;
            }

            this.isLoading = true;
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: this.loginForm.email,
                    password: this.loginForm.password
                });

                if (error) throw error;

                this.isLoggedIn = true;
                localStorage.setItem('vortex_logged_in', 'true');
                await this.validateSession();
                await this.loadDataFromSupabase();
                this.showNotification('Login berhasil. Selamat datang!');
            } catch (err) {
                this.showNotification('Login gagal: ' + (err.message || 'Periksa email & password Anda'), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async logout() {
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }
            this.isLoggedIn = false;
            localStorage.removeItem('vortex_logged_in');
            localStorage.removeItem('vortex_user');
            localStorage.removeItem('vortex_role');
            localStorage.removeItem('vortex_region');
            this.clearFormDraft();
            this.showNotification('Anda telah keluar dari sistem.');
        },

        switchTab(tab) {
            this.currentTab = tab;
            this.refreshIcons();
        },

        initProfileData() {
            this.profileForm.namaLengkap = this.currentUser || '';
            this.profileForm.email = this.loginForm.email || 'user@company.com';
            this.profileForm.newPassword = '';
        },

        async updateProfile() {
            this.isLoading = true;
            try {
                if (supabaseClient && this.profileForm.newPassword) {
                    const { error } = await supabaseClient.auth.updateUser({ password: this.profileForm.newPassword });
                    if (error) throw error;
                }
                this.currentUser = this.profileForm.namaLengkap;
                localStorage.setItem('vortex_user', this.currentUser);
                this.showNotification('Profil berhasil diperbarui');
                this.profileForm.newPassword = '';
            } catch (err) {
                this.showNotification('Gagal memperbarui profil: ' + err.message, 'error');
            } finally {
                this.isLoading = false;
            }
        },

        getFilteredTransactions() {
            return this.transactions.filter(t => {
                if (!this.searchNoTransaksi) return true;
                const q = this.searchNoTransaksi.toLowerCase();
                return (t.noTransaksi || '').toLowerCase().includes(q) || (t.noReferensi || '').toLowerCase().includes(q);
            });
        },

        getFilteredStokGudang() {
            return this.stokGudang.filter(s => {
                if (!this.filterStokGudang) return true;
                return s.gudang === this.filterStokGudang;
            });
        },

        getFilteredDrumLedger() {
            return this.drumLedger.filter(d => {
                if (this.filterStokGudang && d.gudang !== this.filterStokGudang) return false;
                if (this.selectedCableKode && d.kodeBarang !== this.selectedCableKode) return false;
                return true;
            });
        },

        getFilteredMaterialUsage() {
            return this.materialUsage.filter(u => {
                if (!this.searchMaterialUsageProject) return true;
                const q = this.searchMaterialUsageProject.toLowerCase();
                return (u.kodeProject || '').toLowerCase().includes(q) || (u.projectName || '').toLowerCase().includes(q);
            });
        },

        openModal(type) {
            this.modalType = type;
            this.isEdit = false;
            this.editIndex = null;
            this.modalForm = {};
            this.showModal = true;
        },

        openEditModal(type, index) {
            this.modalType = type;
            this.isEdit = true;
            this.editIndex = index;
            if (type === 'barang') this.modalForm = { ...this.masterBarang[index] };
            if (type === 'gudang') this.modalForm = { ...this.masterGudang[index] };
            if (type === 'project') this.modalForm = { ...this.masterProject[index] };
            this.showModal = true;
        },

        generateKodeProject() {
            if (this.modalType === 'project' && this.modalForm.periode && this.modalForm.region) {
                const year = new Date(this.modalForm.periode).getFullYear();
                const reg = (this.modalForm.region || 'REG').substring(0, 3).toUpperCase();
                const randomNum = Math.floor(100 + Math.random() * 900);
                this.modalForm.kodeProject = `PRJ-${reg}-${year}-${randomNum}`;
            }
        },

        async saveModalData() {
            this.isLoading = true;
            try {
                if (this.modalType === 'barang') {
                    if (this.isEdit) this.masterBarang[this.editIndex] = { ...this.modalForm };
                    else this.masterBarang.push({ ...this.modalForm });
                    localStorage.setItem('vortex_masterBarang', JSON.stringify(this.masterBarang));
                } else if (this.modalType === 'gudang') {
                    if (this.isEdit) this.masterGudang[this.editIndex] = { ...this.modalForm };
                    else this.masterGudang.push({ ...this.modalForm });
                    localStorage.setItem('vortex_masterGudang', JSON.stringify(this.masterGudang));
                } else if (this.modalType === 'project') {
                    if (this.isEdit) this.masterProject[this.editIndex] = { ...this.modalForm };
                    else this.masterProject.push({ ...this.modalForm });
                    localStorage.setItem('vortex_masterProject', JSON.stringify(this.masterProject));
                }
                this.showModal = false;
                this.showNotification('Data berhasil disimpan');
            } catch (e) {
                this.showNotification('Gagal menyimpan data', 'error');
            } finally {
                this.isLoading = false;
            }
        },

        deleteItem(type, index) {
            if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
            if (type === 'barang') this.masterBarang.splice(index, 1);
            if (type === 'gudang') this.masterGudang.splice(index, 1);
            if (type === 'project') this.masterProject.splice(index, 1);
            this.showNotification('Data berhasil dihapus');
        },

        openInputTransaction() {
            this.resetInputTransaction();
            this.currentTab = 'input-transaksi';
        },

        async resetInputTransaction() {
            this.editingOriginalNo = null;
            this.selectedFilesList = [];
            this.newTrans = {
                tanggal: this.todayWIB(),
                noTransaksi: '',
                noReferensi: '',
                tipeTransaksi: 'Masuk',
                gudangAsal: '',
                gudangTujuan: '',
                kodeProject: '',
                keterangan: '',
                lampiranUrl: '',
                staffGudang: this.currentUser || '',
                projectManager: '',
                namaPenerima: '',
                items: [{ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: 1 }]
            };
            this.generateNoTransaksi();
            this.clearFormDraft();
        },

        generateNoTransaksi() {
            if (this.editingOriginalNo) return;
            const dateStr = (this.newTrans.tanggal || this.todayWIB()).replace(/-/g, '');
            const typePrefix = this.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (this.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
            const rand = Math.floor(1000 + Math.random() * 9000);
            this.newTrans.noTransaksi = `TX-${typePrefix}-${dateStr}-${rand}`;
        },

        onTipeTransaksiChange() {
            this.newTrans.gudangAsal = '';
            this.newTrans.gudangTujuan = '';
            this.generateNoTransaksi();
        },

        resetItemsOnWarehouseChange() {
            this.newTrans.items.forEach(i => {
                i.drumId = '';
            });
        },

        getGudangTujuanList() {
            if (this.newTrans.tipeTransaksi === 'Transfer') {
                return this.getFilteredMasterGudang().filter(g => g.namaGudang !== this.newTrans.gudangAsal);
            }
            return this.getFilteredMasterGudang();
        },

        getFilteredProjectsForAsal() {
            return this.getFilteredMasterProject();
        },

        handleFileSelect(event) {
            const files = Array.from(event.target.files);
            if (files.length > 0) {
                this.selectedFilesList = files;
            }
        },

        clearSelectedFiles() {
            this.selectedFilesList = [];
            const el = document.getElementById('attachmentInput');
            if (el) el.value = '';
        },

        addTransactionItem() {
            this.newTrans.items.push({ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: 1 });
        },

        removeTransactionItem(index) {
            if (this.newTrans.items.length > 1) {
                this.newTrans.items.splice(index, 1);
            }
        },

        getCategories() {
            const set = new Set(this.masterBarang.map(b => b.kategori));
            return Array.from(set);
        },

        getJenis(kategori) {
            if (!kategori) return [];
            const set = new Set(this.masterBarang.filter(b => b.kategori === kategori).map(b => b.jenis));
            return Array.from(set);
        },

        getBarangList(kategori, jenis) {
            return this.masterBarang.filter(b => b.kategori === kategori && b.jenis === jenis);
        },

        fillNamaBarang(item) {
            const found = this.masterBarang.find(b => b.kodeBarang === item.kodeBarang);
            if (found) {
                item.namaBarang = found.namaBarang;
            }
        },

        getCategoryByKode(kodeBarang) {
            const found = this.masterBarang.find(b => b.kodeBarang === kodeBarang);
            return found ? found.kategori : '';
        },

        getDrumList(item) {
            if (!item.kodeBarang) return [];
            const warehouse = this.newTrans.gudangAsal;
            return this.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === warehouse && d.remainingLength > 0);
        },

        getMaxStock(item) {
            if (!item.kodeBarang) return 0;
            const wh = this.newTrans.gudangAsal;
            const stockObj = this.stokGudang.find(s => s.kodeBarang === item.kodeBarang && s.gudang === wh);
            return stockObj ? stockObj.qty : 0;
        },

        hasStockExceeded() {
            if (this.newTrans.tipeTransaksi === 'Masuk') return false;
            return this.newTrans.items.some(item => {
                if (!item.kodeBarang) return false;
                const max = this.getMaxStock(item);
                return parseFloat(item.qty || 0) > max;
            });
        },

        async submitTransaction() {
            if (this.hasStockExceeded()) {
                this.showNotification('Terdapat item yang melebihi jumlah stok aktif!', 'error');
                return;
            }

            this.isLoading = true;
            try {
                if (supabaseClient) {
                    const params = this.buildRpcParams(this.newTrans);
                    const { data, error } = await supabaseClient.rpc('simpan_transaksi_wms', params);
                    if (error) throw error;
                } else {
                    this.transactions.unshift({ ...this.newTrans });
                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                }

                this.showNotification('Transaksi berhasil disimpan!');
                this.clearFormDraft();
                await this.resetInputTransaction();
                await this.loadDataFromSupabase();
                this.currentTab = 'data-transaksi';
            } catch (err) {
                this.showNotification('Gagal menyimpan transaksi: ' + (err.message || err), 'error');
            } finally {
                this.isLoading = false;
            }
        },

        editTransaction(tx) {
            this.editingOriginalNo = tx.noTransaksi;
            this.newTrans = JSON.parse(JSON.stringify(tx));
            this.currentTab = 'input-transaksi';
            this.refreshIcons();
        },

        async deleteTransaction(tx) {
            if (!confirm(`Hapus transaksi ${tx.noTransaksi}? Stok akan disesuaikan kembali.`)) return;
            this.isLoading = true;
            try {
                if (supabaseClient) {
                    const { error } = await supabaseClient.from('transactions').delete().eq('no_transaksi', tx.noTransaksi);
                    if (error) throw error;
                } else {
                    this.transactions = this.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
                    localStorage.setItem('vortex_transactions', JSON.stringify(this.transactions));
                }
                this.showNotification('Transaksi berhasil dihapus');
                await this.loadDataFromSupabase();
            } catch (err) {
                this.showNotification('Gagal menghapus transaksi: ' + err.message, 'error');
            } finally {
                this.isLoading = false;
            }
        },

        printBAST(tx) {
            this.activeBast = tx;
            this.$nextTick(() => {
                window.print();
            });
        },

        getBastProjectName(kodeProject) {
            if (!kodeProject) return '-';
            const found = this.masterProject.find(p => p.kodeProject === kodeProject);
            return found ? `${found.kodeProject} - ${found.projectName}` : kodeProject;
        },

        getExpandedBastItems() {
            if (!this.activeBast || !this.activeBast.items) return [];
            return this.activeBast.items.map((item, idx) => ({
                no: idx + 1,
                kodeBarang: item.kodeBarang,
                namaBarang: item.namaBarang,
                drumId: item.drumId,
                qty: item.qty
            }));
        },

        getBastSummaryItems() {
            if (!this.activeBast || !this.activeBast.items) return [];
            const summaryMap = {};
            this.activeBast.items.forEach(item => {
                const key = item.namaBarang || item.kodeBarang;
                if (!summaryMap[key]) {
                    summaryMap[key] = { namaBarang: key, totalQty: 0 };
                }
                summaryMap[key].totalQty += parseFloat(item.qty || 0);
            });
            return Object.values(summaryMap).map((s, idx) => ({ no: idx + 1, ...s }));
        },

        exportStokCSV() {
            let csv = 'Kode Barang,Nama Barang,Kategori,Gudang,Masuk,Keluar,T.Masuk,T.Keluar,Total Stok,Satuan\n';
            this.getFilteredStokGudang().forEach(s => {
                csv += `"${s.kodeBarang}","${s.namaBarang}","${s.kategori}","${s.gudang}",${s.masuk},${s.keluar},${s.tMasuk},${s.tKeluar},${s.qty},"${s.sat}"\n`;
            });
            this.downloadCSV(csv, 'stok_gudang.csv');
        },

        exportUsageCSV() {
            let csv = 'Tanggal,Kode Project,Project Name,No PO,Nama Barang,Drum ID,Qty Pakai\n';
            this.getFilteredMaterialUsage().forEach(u => {
                csv += `"${u.tanggal}","${u.kodeProject}","${u.projectName}","${u.noPO}","${u.namaBarang}","${u.drumId || ''}",${u.qty}\n`;
            });
            this.downloadCSV(csv, 'material_usage.csv');
        },

        exportTransactionCSV() {
            let csv = 'Tanggal,No Transaksi,No Referensi,Tipe,Gudang Asal,Gudang Tujuan,Keterangan\n';
            this.getFilteredTransactions().forEach(t => {
                csv += `"${t.tanggal}","${t.noTransaksi}","${t.noReferensi || ''}","${t.tipeTransaksi}","${t.gudangAsal || ''}","${t.gudangTujuan || ''}","${t.keterangan || ''}"\n`;
            });
            this.downloadCSV(csv, 'data_transaksi.csv');
        },

        downloadCSV(csvContent, fileName) {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        async reuseDrum(drum, index) {
            if (!confirm(`Tandai Drum ${drum.drumId} untuk Re-use / Scrap?`)) return;
            drum.remainingLength = 0;
            this.showNotification(`Drum ${drum.drumId} berhasil di-scrap/re-use.`);
        }
    };
}