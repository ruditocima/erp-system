import { supabaseClient } from '../services/supabaseClient.js';
import { createAuthModule } from './stores/authStore.js';
import { createMasterModule } from './stores/masterStore.js';
import { createTransactionModule } from './stores/transactionStore.js';
import { createStockModule } from './stores/stockStore.js';

function safeLoadStorage(key, fallback) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        return fallback;
    }
}

export default function warehouseApp() {
    const app = {
        googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxGfGRF55_aYHdG9kMMLgGqV7_ksL5VZGtb6JLRpXBn9nTaMKYUlVrk6s587cTNYC7_/exec',
        supabaseClient: supabaseClient,

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

        masterBarang: safeLoadStorage('vortex_masterBarang', [{ kategori: 'Cable', jenis: 'ADSS', kodeBarang: 'CBL-ADSS-036', namaBarang: 'Kabel ADSS-036 36Core', sat: 'Meter' }]),
        masterGudang: safeLoadStorage('vortex_masterGudang', [{ region: 'Jakarta', kodeGudang: 'NPM-JKT-01', namaGudang: 'Gudang Utama Jakarta', tipeKepemilikan: 'Milik Sendiri', lokasi: 'Cakung' }]),
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
                    if (formData) localStorage.setItem('vortex_draft_transaksi', JSON.stringify(formData));
                } catch (e) {}
            }, 500);
        },
        loadFormDraft() {
            try {
                const savedDraft = localStorage.getItem('vortex_draft_transaksi');
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && typeof parsed === 'object') {
                        this.newTrans = parsed;
                        return true;
                    }
                }
            } catch (e) {}
            return false;
        },
        clearFormDraft() {
            try { localStorage.removeItem('vortex_draft_transaksi'); } catch (e) {}
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
        showNotification(msg, type = 'success') {
            this.notification = { show: true, message: msg, type: type };
            this.refreshIcons();
            setTimeout(() => { this.notification.show = false; }, 4000);
        },
        switchTab(tabName) {
            this.currentTab = tabName;
            this.showDrumLedger = false;
            this.selectedCableKode = '';
            this.refreshIcons();
        },
        refreshIcons() {
            this.$nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
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
        },

        inisialisasiRealtimeStok() {
            if (!this.supabaseClient) return;
            this.supabaseClient.channel('pantau-stok-wms-optimized')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stok_gudang' }, () => { this.scheduleReload(); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { this.scheduleReload(); })
                .subscribe();
        },

        async loadDataFromSupabase() {
            if (!this.supabaseClient) return;
            this.isLoading = true;
            try {
                const { data: pData } = await this.supabaseClient.from('master_project').select('*');
                if (pData) this.masterProject = pData.map(p => ({ periode: p.periode, region: p.region, kodeProject: p.kode_project, type: p.type, noPO: p.no_po, projectName: p.project_name }));

                const { data: bData } = await this.supabaseClient.from('master_barang').select('*');
                if (bData) this.masterBarang = bData.map(b => ({ kategori: b.kategori, jenis: b.jenis, kodeBarang: b.kode_barang, namaBarang: b.nama_barang, sat: b.sat }));

                const { data: gData } = await this.supabaseClient.from('master_gudang').select('*');
                if (gData) this.masterGudang = gData.map(g => ({ region: g.region || '', kodeGudang: g.kode_gudang, namaGudang: g.nama_gudang, tipeKepemilikan: g.tipe_kepemilikan, lokasi: g.lokasi }));

                let stockQuery = this.supabaseClient.from('stok_gudang').select('*', { count: 'exact' });
                if (this.filterStokGudang) stockQuery = stockQuery.eq('gudang', this.filterStokGudang);
                const fromStok = (this.pageStok - 1) * this.pageSizeStok;
                const { data: stockData, count: countStok } = await stockQuery.order('kode_barang', { ascending: true }).range(fromStok, fromStok + this.pageSizeStok - 1);
                if (stockData) {
                    this.stokGudang = stockData.map(s => ({
                        kodeBarang: s.kode_barang, namaBarang: s.nama_barang, kategori: s.kategori, gudang: s.gudang,
                        masuk: parseFloat(s.masuk) || 0, keluar: parseFloat(s.keluar) || 0, tMasuk: parseFloat(s.t_masuk) || 0, tKeluar: parseFloat(s.t_keluar) || 0,
                        qty: parseFloat(s.qty) || 0, sat: s.sat
                    }));
                    this.totalStokCount = countStok !== null ? countStok : stockData.length;
                }

                let drumQuery = this.supabaseClient.from('drum_ledger').select('*', { count: 'exact' });
                if (this.filterStokGudang) drumQuery = drumQuery.eq('gudang', this.filterStokGudang);
                if (this.selectedCableKode) drumQuery = drumQuery.eq('kode_barang', this.selectedCableKode);
                const fromDrum = (this.pageDrum - 1) * this.pageSizeDrum;
                const { data: drumData, count: countDrum } = await drumQuery.order('drum_id', { ascending: true }).range(fromDrum, fromDrum + this.pageSizeDrum - 1);
                if (drumData) {
                    this.drumLedger = drumData.map(d => ({ drumId: d.drum_id, kodeBarang: d.kode_barang, namaBarang: d.nama_barang, gudang: d.gudang, initialLength: parseFloat(d.initial_length) || 0, remainingLength: parseFloat(d.remaining_length) || 0 }));
                    this.totalDrumCount = countDrum !== null ? countDrum : drumData.length;
                }

                let txQuery = this.supabaseClient.from('transactions').select('*', { count: 'exact' });
                if (this.searchNoTransaksi) txQuery = txQuery.or(`no_transaksi.ilike.%${this.searchNoTransaksi}%,no_referensi.ilike.%${this.searchNoTransaksi}%`);
                const fromTx = (this.pageTx - 1) * this.pageSizeTx;
                const { data: txData, count: countTx } = await txQuery.order('tanggal', { ascending: false }).range(fromTx, fromTx + this.pageSizeTx - 1);
                if (txData) {
                    this.transactions = txData.map(t => ({
                        noTransaksi: t.no_transaksi, tanggal: t.tanggal, noReferensi: t.no_referensi, tipeTransaksi: t.tipe_transaksi,
                        gudangAsal: t.gudang_asal, gudangTujuan: t.gudang_tujuan, kodeProject: t.kode_project, keterangan: t.keterangan,
                        staffGudang: t.staff_gudang, projectManager: t.project_manager, namaPenerima: t.nama_penerima, lampiranUrl: t.lampiran_url,
                        items: typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
                    }));
                    this.totalTxCount = countTx !== null ? countTx : txData.length;
                }
            } catch (err) {
                console.error('Gagal memuat data:', err);
            } finally {
                this.isLoading = false;
                this.refreshIcons();
            }
        }
    };

    // Gabungkan fungsionalitas dari modul-modul terpisah
    Object.assign(app, createAuthModule(app));
    Object.assign(app, createMasterModule(app));
    Object.assign(app, createTransactionModule(app));
    Object.assign(app, createStockModule(app));

    return app;
}