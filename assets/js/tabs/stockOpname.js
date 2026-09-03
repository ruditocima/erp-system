import { paginate, totalPages } from '../core/utils.js';
import { db } from '../core/db.js';

export function stockOpnameTab() {
    return {
        opnameGudangFilter: '', opnameItems: [], opnameInProgress: false, opnameSearch: '', page: 1, perPage: 10,
        init() { this.page = 1; },
        get filteredOpnameHistory() {
            let q = this.opnameSearch.toLowerCase();
            return this.$parent.opnameHistory.filter(o => o.gudang.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
        },
        get totalPages() { return totalPages(this.filteredOpnameHistory, this.perPage); },
        get paginatedOpnameHistory() { return paginate(this.filteredOpnameHistory, this.page, this.perPage); },
        loadOpnameItems() {
            this.opnameItems = [];
            const gudangStok = this.$parent.stokGudangList.filter(s => s.gudang === this.opnameGudangFilter);
            gudangStok.forEach(s => { this.opnameItems.push({ kodeBarang: s.kodeBarang, namaBarang: s.namaBarang, qtySistem: s.qty || 0, qtyFisik: s.qty || 0, selisih: 0, keterangan: '' }); });
            this.opnameItems.sort((a, b) => a.kodeBarang.localeCompare(b.kodeBarang));
        },
        startOpname() {
            if (!this.opnameGudangFilter) { this.$parent.showToast('Pilih gudang terlebih dahulu', 'warning'); return; }
            this.loadOpnameItems(); this.opnameInProgress = true; this.$parent.showToast('Stock opname dimulai untuk ' + this.opnameGudangFilter, 'info');
        },
        cancelOpname() { this.opnameInProgress = false; this.opnameItems = []; this.$parent.showToast('Stock opname dibatalkan', 'info'); },
        saveOpname() {
            if (this.opnameItems.length === 0) { this.$parent.showToast('Tidak ada item untuk disimpan', 'error'); return; }
            const hasSelisih = this.opnameItems.some(i => i.selisih !== 0);
            if (hasSelisih && !confirm('Ada selisih stok. Yakin ingin menyimpan hasil opname?')) return;
            const opnameRecord = { id: 'OPN-' + Date.now(), tanggal: new Date().toISOString().split('T')[0], waktu: new Date().toLocaleTimeString('id-ID'), gudang: this.opnameGudangFilter, petugas: this.$parent.username, items: JSON.parse(JSON.stringify(this.opnameItems)) };
            this.$parent.opnameHistory.unshift(opnameRecord); db.set('opname', this.$parent.opnameHistory);
            this.opnameItems.forEach(item => {
                if (item.selisih !== 0) {
                    let stok = this.$parent.stokGudangList.find(s => s.gudang === this.opnameGudangFilter && s.kodeBarang === item.kodeBarang);
                    if (stok) { stok.qty = item.qtyFisik; if (item.selisih > 0) stok.masuk = (stok.masuk || 0) + item.selisih; else stok.keluar = (stok.keluar || 0) + Math.abs(item.selisih); }
                }
            });
            db.set('stok', this.$parent.stokGudangList);
            this.opnameInProgress = false; this.opnameItems = []; this.$parent.showToast('Hasil stock opname berhasil disimpan. Stok diperbarui.', 'success');
        },
        viewDetail(op) {
            let detail = `Detail Opname ${op.id}\nGudang: ${op.gudang}\nTanggal: ${op.tanggal} ${op.waktu}\nPetugas: ${op.petugas}\n\n`;
            op.items.forEach((it, i) => { detail += `${i+1}. ${it.kodeBarang} - ${it.namaBarang}\n   Sistem: ${it.qtySistem} | Fisik: ${it.qtyFisik} | Selisih: ${it.selisih > 0 ? '+' : ''}${it.selisih}\n`; if (it.keterangan) detail += `   Ket: ${it.keterangan}\n`; });
            alert(detail);
        }
    };
}