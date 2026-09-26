export function createStockModule(app) {
    return {
        async catatPenggunaanKabel(drumId, panjangDipakai) {
            if (!app.supabaseClient) {
                let drum = app.drumLedger.find(d => d.drumId === drumId);
                if (!drum) {
                    app.showNotification('Drum ID tidak ditemukan!', 'error');
                    return false;
                }
                if (drum.remainingLength < panjangDipakai) {
                    app.showNotification('Sisa panjang kabel tidak mencukupi!', 'error');
                    return false;
                }
                drum.remainingLength = Math.round((drum.remainingLength - panjangDipakai) * 100) / 100;
                return true;
            }

            try {
                const { data, error } = await app.supabaseClient.rpc('potong_stok_kabel', {
                    p_drum_id: drumId,
                    p_panjang_dipakai: parseFloat(panjangDipakai)
                });
                if (error) throw error;
                if (data && data.status === 'error') {
                    app.showNotification(`Gagal: ${data.message}`, 'error');
                    return false;
                }
                app.showNotification(`Sisa stok drum: ${data ? data.sisa_stok : '-'}m`, 'success');
                await app.loadDataFromSupabase();
                return true;
            } catch (err) {
                app.showNotification('Gagal memotong stok: ' + (err.message || err), 'error');
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
            if (app.supabaseClient) return app.stokGudang;
            return app.paginate(app.getFilteredStokGudang(), app.pageStok, app.pageSizeStok);
        },
        getPaginatedDrumLedger() {
            return app.paginate(app.getFilteredDrumLedger(), app.pageDrum, app.pageSizeDrum);
        },
        getPaginatedMaterialUsage() {
            if (app.supabaseClient) return app.materialUsage;
            return app.paginate(app.getFilteredMaterialUsage(), app.pageUsage, app.pageSizeUsage);
        },
        getPaginatedTransactions() {
            if (app.supabaseClient) return app.transactions;
            return app.paginate(app.getFilteredTransactions(), app.pageTx, app.pageSizeTx);
        },

        getFilteredStokGudang() {
            if (app.supabaseClient) {
                const dummy = new Array(app.totalStokCount || app.stokGudang.length);
                const start = (app.pageStok - 1) * app.pageSizeStok;
                for (let i = 0; i < app.stokGudang.length; i++) {
                    dummy[start + i] = app.stokGudang[i];
                }
                return dummy;
            }
            let list = app.stokGudang;
            if (!app.isSuperAdmin) {
                const reg = app.userRegion().toLowerCase();
                const regionalWhNames = app.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(s => regionalWhNames.includes(s.gudang));
            }
            if (app.filterStokGudang) {
                list = list.filter(s => s.gudang === app.filterStokGudang);
            }
            return list;
        },

        getFilteredDrumLedger() {
            let list = app.drumLedger;
            if (!app.isSuperAdmin) {
                const reg = app.userRegion().toLowerCase();
                const regionalWhNames = app.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(d => regionalWhNames.includes(d.gudang));
            }
            if (app.filterStokGudang) list = list.filter(d => d.gudang === app.filterStokGudang);
            if (app.selectedCableKode) list = list.filter(d => d.kodeBarang === app.selectedCableKode);
            return list;
        },

        getFilteredMaterialUsage() {
            if (app.supabaseClient) return app.materialUsage;
            let list = app.materialUsage;
            if (!app.isSuperAdmin) {
                const reg = (app.userRegion() || '').toLowerCase();
                const regionalProjectCodes = app.masterProject
                    .filter(p => (p.region || '').toLowerCase() === reg)
                    .map(p => p.kodeProject);
                list = list.filter(u => regionalProjectCodes.includes(u.kodeProject));
            }
            if (app.searchMaterialUsageProject) {
                const q = app.searchMaterialUsageProject.toLowerCase();
                list = list.filter(u => 
                    (u.kodeProject && u.kodeProject.toLowerCase().includes(q)) || 
                    (u.projectName && u.projectName.toLowerCase().includes(q)) ||
                    (u.noPO && u.noPO.toLowerCase().includes(q))
                );
            }
            return list;
        },

        getFilteredTransactions() {
            if (app.supabaseClient) {
                const dummy = new Array(app.totalTxCount || app.transactions.length);
                const start = (app.pageTx - 1) * app.pageSizeTx;
                for (let i = 0; i < app.transactions.length; i++) {
                    dummy[start + i] = app.transactions[i];
                }
                return dummy;
            }
            let list = app.transactions;
            if (!app.isSuperAdmin) {
                const reg = app.userRegion().toLowerCase();
                const regionalWhNames = app.masterGudang.filter(g => (g.region || '').toLowerCase() === reg).map(g => g.namaGudang);
                list = list.filter(t => regionalWhNames.includes(t.gudangAsal) || regionalWhNames.includes(t.gudangTujuan));
            }
            if (app.searchNoTransaksi) {
                const q = app.searchNoTransaksi.toLowerCase();
                list = list.filter(t => t.noTransaksi.toLowerCase().includes(q) || (t.noReferensi && t.noReferensi.toLowerCase().includes(q)));
            }
            return list;
        },

        async reuseDrum(drum, index) {
            const scrapQty = prompt(`Jumlah kuantitas/panjang yang di-reuse/scrap dari drum ${drum.drumId} (Sisa: ${drum.remainingLength}m):`, drum.remainingLength);
            if (scrapQty === null) return;
            const qtyVal = parseFloat(scrapQty);
            if (isNaN(qtyVal) || qtyVal <= 0 || qtyVal > drum.remainingLength) {
                app.showNotification('Jumlah tidak valid!', 'error');
                return;
            }
            await app.catatPenggunaanKabel(drum.drumId, qtyVal);
        },

        async exportStokCSV() {
            let items = app.getFilteredStokGudang();
            let csv = 'Kode Barang,Nama Barang,Kategori,Gudang,Total Stok,Satuan\n';
            items.forEach(s => { csv += `"${s.kodeBarang || ''}","${s.namaBarang || ''}","${s.kategori || ''}","${s.gudang || ''}",${s.qty || 0},"${s.sat || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'stok_gudang.csv'; a.click();
        },

        async exportUsageCSV() {
            let items = app.getFilteredMaterialUsage();
            let csv = 'Kode Project,No PO,Project Name,Nama Barang,Drum ID,Qty Pakai,Tanggal\n';
            items.forEach(u => { csv += `"${u.kodeProject || ''}","${u.noPO || ''}","${u.projectName || ''}","${u.namaBarang || ''}","${u.drumId || ''}",${u.qty || 0},"${u.tanggal || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'material_usage.csv'; a.click();
        },

        async exportTransactionCSV() {
            let items = app.getFilteredTransactions();
            let csv = 'Tanggal,No Transaksi,Tipe Transaksi,Gudang Asal,Gudang Tujuan,Keterangan\n';
            items.forEach(t => { csv += `"${t.tanggal || ''}","${t.noTransaksi || ''}","${t.tipeTransaksi || ''}","${t.gudangAsal || ''}","${t.gudangTujuan || ''}","${t.keterangan || ''}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'data_transaksi.csv'; a.click();
        }
    };
}