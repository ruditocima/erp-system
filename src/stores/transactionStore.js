export function createTransactionModule(app) {
    return {
        openInputTransaction() { 
            app.resetInputTransaction();
            app.loadFormDraft();
            app.switchTab('input-transaksi'); 
        },

        async resetInputTransaction() {
            app.editingOriginalNo = null;
            app.selectedFilesList = [];
            app.newTrans = {
                tanggal: app.todayWIB(),
                noTransaksi: '',
                noReferensi: '', 
                tipeTransaksi: 'Masuk',
                gudangAsal: '', 
                gudangTujuan: '', 
                kodeProject: '', 
                keterangan: '', 
                lampiran: '', 
                lampiranUrl: '',
                staffGudang: '',
                projectManager: 'RUDI',
                namaPenerima: app.currentUser || '',
                items: [{ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: '' }]
            };
            if (app.newTrans.tipeTransaksi === 'Keluar') {
                app.newTrans.staffGudang = app.currentUser || '';
            } else {
                app.newTrans.staffGudang = '';
            }
            await app.generateNoTransaksi();
            app.clearFormDraft();
            const fileInput = document.getElementById('attachmentInput');
            if (fileInput) fileInput.value = '';
        },

        async generateNoTransaksi() {
            if (app.editingOriginalNo) return;
            if (!app.supabaseClient) {
                const dateStr = (app.newTrans.tanggal || app.todayWIB()).replace(/-/g, '').substring(0, 6);
                const typeCode = app.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (app.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const prefix = `ACM-${typeCode}-${dateStr}-`;
                let maxSeq = 0;
                app.transactions.forEach(t => {
                    if (t.noTransaksi && t.noTransaksi.startsWith(prefix)) {
                        const seqNum = parseInt(t.noTransaksi.replace(prefix, ''), 10);
                        if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                    }
                });
                app.newTrans.noTransaksi = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
                return;
            }

            try {
                const typeCode = app.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (app.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const { data, error } = await app.supabaseClient.rpc('generate_no_transaksi', { p_tipe: typeCode });
                if (error) throw error;
                app.newTrans.noTransaksi = data;
            } catch (err) {
                const dateStr = (app.newTrans.tanggal || app.todayWIB()).replace(/-/g, '').substring(0, 6);
                const typeCode = app.newTrans.tipeTransaksi === 'Masuk' ? 'IN' : (app.newTrans.tipeTransaksi === 'Keluar' ? 'OUT' : 'TRF');
                const prefix = `ACM-${typeCode}-${dateStr}-`;
                let maxSeq = 0;
                app.transactions.forEach(t => {
                    if (t.noTransaksi && t.noTransaksi.startsWith(prefix)) {
                        const seqNum = parseInt(t.noTransaksi.replace(prefix, ''), 10);
                        if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
                    }
                });
                app.newTrans.noTransaksi = `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
            }
        },

        onTipeTransaksiChange() { 
            app.newTrans.gudangAsal = ''; 
            app.newTrans.gudangTujuan = ''; 
            if (app.newTrans.tipeTransaksi === 'Keluar') {
                app.newTrans.staffGudang = app.currentUser || '';
            } else {
                app.newTrans.staffGudang = '';
            }
            app.generateNoTransaksi(); 
        },
        resetItemsOnWarehouseChange() { app.newTrans.items.forEach(i => i.drumId = ''); },
        
        getGudangTujuanList() { 
            let list = app.masterGudang;
            if (!app.isSuperAdmin) {
                const reg = app.userRegion().toLowerCase();
                list = list.filter(g => (g.region || '').toLowerCase() === reg);
            }
            return list.filter(g => g.namaGudang !== app.newTrans.gudangAsal); 
        },

        getFilteredProjectsForAsal() { 
            if (app.isSuperAdmin) return app.masterProject;
            const reg = app.userRegion().toLowerCase();
            return app.masterProject.filter(p => (p.region || '').toLowerCase() === reg);
        },

        addTransactionItem() { app.newTrans.items.push({ kategori: '', jenis: '', kodeBarang: '', namaBarang: '', drumId: '', qty: '' }); },
        removeTransactionItem(index) { if (app.newTrans.items.length > 1) app.newTrans.items.splice(index, 1); },

        getCategories() { return [...new Set(app.masterBarang.map(b => b.kategori))]; },
        getJenis(cat) { return [...new Set(app.masterBarang.filter(b => b.kategori === cat).map(b => b.jenis))]; },
        getBarangList(cat, jns) { return app.masterBarang.filter(b => b.kategori === cat && b.jenis === jns); },
        getCategoryByKode(code) { return app.masterBarang.find(b => b.kodeBarang === code)?.kategori || ''; },
        fillNamaBarang(item) { item.namaBarang = app.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || ''; },
        getDrumList(item) { return app.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === app.newTrans.gudangAsal && d.remainingLength > 0); },

        getMaxStock(item) {
            if (app.newTrans.tipeTransaksi === 'Masuk') return 999999;
            if (!app.newTrans.gudangAsal || !item.kodeBarang) return 999999;
            if (app.getCategoryByKode(item.kodeBarang) === 'Cable' && item.drumId) {
                const drum = app.drumLedger.find(d => d.drumId === item.drumId);
                return drum ? drum.remainingLength : 0;
            }
            const stok = app.stokGudang.find(s => s.kodeBarang === item.kodeBarang && s.gudang === app.newTrans.gudangAsal);
            return stok ? stok.qty : 0;
        },

        hasStockExceeded() {
            if (app.newTrans.tipeTransaksi === 'Masuk') return false;
            return app.newTrans.items.some(item => {
                const max = app.getMaxStock(item);
                const qty = parseFloat(item.qty) || 0;
                return qty > max;
            });
        },

        handleFileSelect(event) {
            const files = event.target && event.target.files ? Array.from(event.target.files) : [];
            if (files.length === 0) {
                app.selectedFilesList = [];
                app.newTrans.lampiran = '';
                return;
            }
            app.selectedFilesList = files;
            if (files.length === 1) {
                app.newTrans.lampiran = files[0].name;
            } else {
                app.newTrans.lampiran = `${files.length} File Lampiran (Disatukan)`;
            }
        },

        clearSelectedFiles() {
            app.selectedFilesList = [];
            app.newTrans.lampiran = '';
            app.newTrans.lampiranUrl = '';
            const fileInput = document.getElementById('attachmentInput');
            if (fileInput) fileInput.value = '';
        },

        fileToDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        },

        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const raw = e.target.result;
                    const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
                    resolve(base64);
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        },

        getImageDimensions(dataUrl) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.width, height: img.height });
                img.onerror = () => resolve({ width: 800, height: 600 });
                img.src = dataUrl;
            });
        },

        async combineFilesToOnePdf(files) {
            if (!files || files.length === 0) return null;
            if (files.length === 1 && files[0].type === 'application/pdf') {
                const base64 = await app.fileToBase64(files[0]);
                return { filename: files[0].name, mimetype: 'application/pdf', base64Data: base64 };
            }
            try {
                const { jsPDF } = window.jspdf || {};
                if (jsPDF) {
                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    const pageWidth = 210, pageHeight = 297;
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        if (i > 0) doc.addPage();
                        if (file.type.startsWith('image/')) {
                            const dataUrl = await app.fileToDataURL(file);
                            const dims = await app.getImageDimensions(dataUrl);
                            let w = dims.width, h = dims.height;
                            const margin = 10, maxW = pageWidth - (margin * 2), maxH = pageHeight - (margin * 2);
                            const scale = Math.min(maxW / w, maxH / h);
                            w = w * scale; h = h * scale;
                            const x = (pageWidth - w) / 2, y = (pageHeight - h) / 2;
                            doc.addImage(dataUrl, file.type.includes('png') ? 'PNG' : 'JPEG', x, y, w, h);
                        } else {
                            doc.setFontSize(14); doc.text(`Lampiran Dokumen #${i + 1}`, 15, 20);
                            doc.setFontSize(10); doc.text(`Nama File: ${file.name}`, 15, 30);
                        }
                    }
                    return { filename: `Lampiran_Gabungan_${Date.now()}.pdf`, mimetype: 'application/pdf', base64Data: doc.output('datauristring').split(',')[1] };
                }
            } catch (e) {
                console.warn('Gagal membuat PDF gabungan:', e);
            }
            const base64 = await app.fileToBase64(files[0]);
            return { filename: files[0].name, mimetype: files[0].type || 'application/octet-stream', base64Data: base64 };
        },

        async submitTransaction() {
            if (app.isLoading) return;
            if (app.newTrans.gudangAsal && app.newTrans.gudangTujuan && 
                app.newTrans.gudangAsal.trim().toLowerCase() === app.newTrans.gudangTujuan.trim().toLowerCase()) {
                app.showNotification('Gudang Asal dan Gudang Tujuan tidak boleh sama!', 'error');
                return;
            }
            if (!app.newTrans.noReferensi || !app.newTrans.keterangan) {
                app.showNotification('No Referensi dan Keterangan wajib diisi!', 'error');
                return;
            }

            app.newTrans.items = app.newTrans.items.filter(i => i.kategori || i.jenis || i.kodeBarang || i.drumId || (parseFloat(i.qty) > 0));
            if (app.newTrans.items.length === 0) {
                app.showNotification('Minimal satu item material wajib diisi!', 'error');
                return;
            }

            if (app.selectedFilesList && app.selectedFilesList.length > 0) {
                app.isLoading = true;
                try {
                    app.showNotification('Menyatukan lampiran dan mengunggah ke Google Drive...', 'info');
                    const mergedFile = await app.combineFilesToOnePdf(app.selectedFilesList);
                    if (mergedFile) {
                        const payload = { filename: mergedFile.filename, mimetype: mergedFile.mimetype, data: mergedFile.base64Data, file: mergedFile.base64Data, contents: mergedFile.base64Data };
                        const response = await fetch(app.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
                        const result = await response.json();
                        if (result && (result.status === 'success' || result.url || result.fileUrl)) {
                            app.newTrans.lampiranUrl = result.url || result.fileUrl || '';
                            app.showNotification('Lampiran berhasil disatukan & diunggah!', 'success');
                        } else {
                            throw new Error((result && (result.message || result.error)) || 'Respon Google Script tidak valid.');
                        }
                    }
                } catch (err) {
                    app.showNotification('Gagal mengunggah lampiran: ' + err.message, 'error');
                    app.isLoading = false;
                    return;
                }
            }

            app.newTrans.items.forEach(item => { item.qty = parseFloat(item.qty) || 0; });
            const tipe = app.newTrans.tipeTransaksi;
            const gudangMasuk = app.newTrans.gudangTujuan; 

            if (tipe === 'Masuk') {
                let processedItems = [];
                app.newTrans.items.forEach(item => {
                    const kat = app.getCategoryByKode(item.kodeBarang);
                    let totalQty = parseFloat(item.qty) || 0;
                    const namaBrg = item.namaBarang || app.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || '';
                    const satuanItem = (kat === 'Cable') ? 'Meter' : (item.satuan || 'Pcs');

                    if (kat === 'Cable' && totalQty > 0) {
                        const whObj = app.masterGudang.find(g => g.namaGudang === gudangMasuk);
                        let whCode = whObj && whObj.kodeGudang ? whObj.kodeGudang.split('-')[0].toUpperCase() : 'PLB';
                        const threeCharBarang = item.kodeBarang ? item.kodeBarang.split('-').pop() : '036';

                        if (item.drumId && item.drumId.trim() !== '') {
                            processedItems.push({ ...item, drumId: item.drumId, qty: totalQty, satuan: satuanItem, namaBarang: namaBrg });
                        } else {
                            let remainingToAllocate = totalQty;
                            let temporaryAssignedDrums = [];
                            const existingDrums = app.drumLedger.filter(d => d.kodeBarang === item.kodeBarang && d.gudang === gudangMasuk);
                            let currentMaxSeq = 0;
                            existingDrums.forEach(d => {
                                const parts = d.drumId.split('-D');
                                if (parts.length > 1) {
                                    const seqNum = parseInt(parts[parts.length - 1], 10);
                                    if (!isNaN(seqNum) && seqNum > currentMaxSeq) currentMaxSeq = seqNum;
                                }
                            });
                            while (remainingToAllocate > 0) {
                                let chunkQty = remainingToAllocate > 3000 ? 3000 : remainingToAllocate;
                                remainingToAllocate -= chunkQty;
                                currentMaxSeq++;
                                let assignedDrumId = `${whCode}-${threeCharBarang}-D${String(currentMaxSeq).padStart(2, '0')}`;
                                temporaryAssignedDrums.push(assignedDrumId);
                                processedItems.push({ ...item, drumId: assignedDrumId, qty: chunkQty, satuan: satuanItem, namaBarang: namaBrg });
                            }
                        }
                    } else {
                        processedItems.push({ ...item, satuan: satuanItem, namaBarang: namaBrg });
                    }
                });
                app.newTrans.items = processedItems;
            }

            if (app.supabaseClient) {
                try {
                    app.isLoading = true;
                    let editBackup = null;
                    if (app.editingOriginalNo) {
                        editBackup = app.transactions.find(t => t.noTransaksi === app.editingOriginalNo) || null;
                        await app.supabaseClient.from('transactions').delete().eq('no_transaksi', app.editingOriginalNo);
                        await app.supabaseClient.from('material_usage').delete().eq('transaction_no', app.editingOriginalNo);
                    }
                    const { error } = await app.supabaseClient.rpc('process_warehouse_transaction', app.buildRpcParams(app.newTrans));
                    if (error) {
                        if (editBackup) await app.supabaseClient.rpc('process_warehouse_transaction', app.buildRpcParams(editBackup));
                        throw error;
                    }
                    app.logAudit(app.editingOriginalNo ? 'transaction_update' : 'transaction_save', { no: app.newTrans.noTransaksi });
                    app.showNotification('Transaksi berhasil disimpan!', 'success');
                    app.clearFormDraft();
                    await app.resetInputTransaction();
                    app.switchTab('data-transaksi');
                    await app.loadDataFromSupabase();
                    return;
                } catch (err) {
                    app.showNotification('Gagal memproses transaksi: ' + (err.message || err), 'error');
                    app.isLoading = false;
                    return;
                } finally {
                    app.isLoading = false;
                }
            }
        },

        editTransaction(tx) {
            app.editingOriginalNo = tx.noTransaksi;
            app.newTrans = JSON.parse(JSON.stringify(tx));
            app.transactions = app.transactions.filter(t => t.noTransaksi !== tx.noTransaksi);
            app.switchTab('input-transaksi');
        },

        async deleteTransaction(tx) {
            if (!confirm(`Hapus transaksi "${tx.noTransaksi}"?`)) return;
            app.isLoading = true;
            try {
                if (app.supabaseClient) {
                    const { data, error } = await app.supabaseClient.rpc('delete_transaction_rollback', { p_no_transaksi: tx.noTransaksi });
                    if (error) throw error;
                    if (data && data.status === 'error') {
                        app.showNotification(data.message, 'error');
                        return;
                    }
                    app.showNotification('Transaksi berhasil dihapus!', 'success');
                    await app.loadDataFromSupabase();
                }
            } catch (err) {
                app.showNotification('Gagal menghapus: ' + (err.message || err), 'error');
            } finally {
                app.isLoading = false;
            }
        },

        printBAST(tx) {
            app.activeBast = tx;
            app.refreshIcons();
            setTimeout(() => { window.print(); }, 300);
        },

        getExpandedBastItems() {
            let expanded = [];
            if (!app.activeBast || !app.activeBast.items) return expanded;
            let counter = 1;
            app.activeBast.items.forEach(item => {
                expanded.push({
                    no: counter++,
                    kodeBarang: item.kodeBarang,
                    namaBarang: item.namaBarang || app.masterBarang.find(b => b.kodeBarang === item.kodeBarang)?.namaBarang || '',
                    drumId: item.drumId,
                    qty: parseFloat(item.qty) || 0
                });
            });
            return expanded;
        },

        getBastProjectName(kodeProject) {
            if (!kodeProject) return '-';
            const proj = app.masterProject.find(p => p.kodeProject === kodeProject);
            return proj ? proj.projectName : kodeProject;
        },

        getBastSummaryItems() {
            let expanded = app.getExpandedBastItems();
            if (!expanded || expanded.length === 0) return [];
            let nameCounts = {};
            expanded.forEach(item => {
                let name = item.namaBarang || '-';
                nameCounts[name] = (nameCounts[name] || 0) + 1;
            });
            if (!Object.values(nameCounts).some(c => c > 1)) return [];
            let summaryMap = {};
            expanded.forEach(item => {
                let name = item.namaBarang || '-';
                summaryMap[name] = (summaryMap[name] || 0) + (parseFloat(item.qty) || 0);
            });
            let result = [];
            let counter = 1;
            for (let name in summaryMap) {
                result.push({ no: counter++, namaBarang: name, totalQty: summaryMap[name] });
            }
            return result;
        }
    };
}