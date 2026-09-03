import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_SUPABASE } from './config.js';
import { loadLocal, saveLocal } from './utils.js';

// ============================================================
// DATABASE LAYER (LocalStorage + Supabase)
// ============================================================

let supabase = null;

if (USE_SUPABASE && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/module.esm.js');
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[DB] Supabase client initialized');
    } catch (e) {
        console.error('[DB] Failed to init Supabase:', e);
    }
}

const TABLES = {
    barang: 'master_barang',
    gudang: 'master_gudang',
    project: 'master_project',
    transaction: 'wms_transaction',
    stok: 'stok_gudang',
    opname: 'wms_opname_history'
};

const LOCAL_KEYS = {
    barang: 'wms_barang',
    gudang: 'wms_gudang',
    project: 'wms_project',
    transaction: 'wms_transaction',
    stok: 'wms_stok_gudang',
    opname: 'wms_opname_history'
};

function getLocal(store) {
    return loadLocal(LOCAL_KEYS[store], []);
}

function setLocal(store, data) {
    saveLocal(LOCAL_KEYS[store], data);
}

async function sbLoad(table) {
    if (!supabase) return [];
    const { data, error } = await supabase.from(table).select('*');
    if (error) { console.error(`[SB] Load ${table} error:`, error); return []; }
    if (table === 'master_project') {
        return (data || []).map(r => ({
            kodeProject: r.kode_project,
            periode: r.periode,
            type: r.type,
            region: r.region,
            noPrPo: r.no_pr_po,
            poPlan: r.po_plan,
            poFinal: r.po_final,
            statusPo: r.status_po,
            permit: r.permit,
            statusSnd: r.status_snd,
            statusProject: r.status_project,
            statusDoc: r.status_doc
        }));
    }
    if (table === 'stok_gudang') {
        return (data || []).map(r => ({
            gudang: r.gudang,
            kodeBarang: r.kode_barang,
            namaBarang: r.nama_barang,
            qty: r.qty,
            masuk: r.masuk,
            keluar: r.keluar,
            t_masuk: r.t_masuk,
            t_keluar: r.t_keluar
        }));
    }
    return data || [];
}

async function sbUpsert(table, rows) {
    if (!supabase || !rows || rows.length === 0) return;
    let payload = rows;
    if (table === 'master_project') {
        payload = rows.map(r => ({
            kode_project: r.kodeProject,
            periode: r.periode,
            type: r.type,
            region: r.region,
            no_pr_po: r.noPrPo,
            po_plan: r.poPlan,
            po_final: r.poFinal,
            status_po: r.statusPo,
            permit: r.permit,
            status_snd: r.statusSnd,
            status_project: r.statusProject,
            status_doc: r.statusDoc
        }));
    } else if (table === 'stok_gudang') {
        payload = rows.map(r => ({
            gudang: r.gudang,
            kode_barang: r.kodeBarang,
            nama_barang: r.namaBarang,
            qty: r.qty,
            masuk: r.masuk,
            keluar: r.keluar,
            t_masuk: r.t_masuk,
            t_keluar: r.t_keluar
        }));
    }
    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
    if (error) console.error(`[SB] Upsert ${table} error:`, error);
}

async function sbDelete(table, idField, idValue) {
    if (!supabase) return;
    const { error } = await supabase.from(table).delete().eq(idField, idValue);
    if (error) console.error(`[SB] Delete ${table} error:`, error);
}

export const db = {
    async loadAll() {
        const result = {};
        for (const key of Object.keys(TABLES)) {
            result[key + 'List'] = getLocal(key);
            if (supabase) {
                try {
                    const remote = await sbLoad(TABLES[key]);
                    if (remote && remote.length > 0) {
                        result[key + 'List'] = remote;
                        setLocal(key, remote);
                    }
                } catch (e) { console.warn(`[DB] Remote load failed for ${key}`); }
            }
        }
        return result;
    },
    get(store) { return getLocal(store); },
    set(store, data) { setLocal(store, data); if (supabase) sbUpsert(TABLES[store], data); },
    add(store, item) {
        const data = getLocal(store);
        data.unshift(item);
        setLocal(store, data);
        if (supabase) sbUpsert(TABLES[store], [item]);
    },
    update(store, matchFn, updates) {
        const data = getLocal(store);
        const idx = data.findIndex(matchFn);
        if (idx !== -1) {
            data[idx] = { ...data[idx], ...updates };
            setLocal(store, data);
            if (supabase) sbUpsert(TABLES[store], [data[idx]]);
        }
    },
    remove(store, matchFn) {
        const data = getLocal(store);
        const removed = data.find(matchFn);
        const filtered = data.filter(i => !matchFn(i));
        setLocal(store, filtered);
        if (supabase && removed) {
            const idField = store === 'barang' ? 'kode' : store === 'gudang' ? 'kode' : store === 'project' ? 'kode_project' : 'id';
            sbDelete(TABLES[store], idField, removed.kode || removed.kodeProject || removed.id);
        }
    },
    async syncToCloud() {
        if (!supabase) return { success: false, message: 'Supabase tidak dikonfigurasi' };
        try {
            for (const key of Object.keys(TABLES)) {
                const data = getLocal(key);
                if (data.length > 0) await sbUpsert(TABLES[key], data);
            }
            return { success: true, message: 'Sinkronisasi ke cloud berhasil' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    },
    isOnline() { return !!supabase; }
};
