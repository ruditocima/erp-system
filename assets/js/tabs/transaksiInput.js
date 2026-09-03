import { generateDocNumber } from '../core/utils.js';
import { db } from '../core/db.js';

export function transaksiInputTab() {
    return {
        form: { noDocument: '', tanggal: new Date().toISOString().split('T')[0], noTodo: '', tipe: 'Masuk', gudangAsal: '-', gudangTujuan: '-', kodeProject: '-', items: [], petugas: '', disetujui: '', diketahui: '', keterangan: '' },
        newItemBarang: '', newItemQty: 1,
        init() { this.form.petugas = this.$parent.username; this.generateDocNumber(); },
        generateDocNumber() { this.form.noDocument = generateDocNumber(this.form.tipe); },
        addItem() {
            if (!this.newItemBarang || this.newItemQty < 1) { this.$parent.showToast('Pilih barang dan isi Qty minimal 1', 'error'); return; }
            const brg = this.$parent.barangList.find(b => b.kode === this.newItemBarang);
            if (brg) {
                const existing = this.form.items.find(i => i.kode === brg.kode);
                if (existing) existing.qty += parseInt(this.newItemQty);
                else this.form.items.push({ kode: brg.kode, nama: brg.nama, qty: parseInt(this.newItemQty) });
                this.newItemBarang = ''; this.newItemQty = 1;
            }
        },
        submit() {
            if (this.form.items.length === 0) { this.$parent.showToast('Tambahkan minimal 1 barang', 'error'); return; }
            const trxData = JSON.parse(JSON.stringify(this.form));
            trxData.status = 'Pending'; trxData.timestamp = new Date().getTime();
            this.$parent.transactionList.unshift(trxData); db.set('transaction', this.$parent.transactionList);
            this.$parent.showToast('Transaksi diajukan (Menunggu Approval)', 'success');
            this.form.items = []; this.form.keterangan = ''; this.form.noTodo = ''; this.generateDocNumber();
        },
        printForm() {
            this.$parent.printableTrx = JSON.parse(JSON.stringify(this.form));
            setTimeout(() => { window.print(); }, 300);
        }
    };
}