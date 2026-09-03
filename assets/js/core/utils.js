import { DB_VERSION } from './config.js';

// ============================================================
// UTILITAS GLOBAL
// ============================================================

export function paginate(data, page, perPage) {
    if (!Array.isArray(data)) return [];
    const start = (page - 1) * perPage;
    return data.slice(start, start + perPage);
}

export function totalPages(data, perPage) {
    if (!Array.isArray(data)) return 1;
    return Math.ceil(data.length / perPage) || 1;
}

// LocalStorage helpers with schema versioning
export function loadLocal(key, defaultVal) {
    defaultVal = defaultVal || [];
    try {
        const storedVersion = localStorage.getItem('wms_db_version');
        if (!storedVersion) {
            localStorage.setItem('wms_db_version', DB_VERSION);
        }
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultVal;
    } catch (e) {
        console.error('Error loading ' + key + ':', e);
        return defaultVal;
    }
}

export function saveLocal(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        alert('Penyimpanan penuh! Export data lalu hapus riwayat.');
        throw e;
    }
}

export function removeLocal(key) {
    localStorage.removeItem(key);
}

// CSV Export
export function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const csv = [];
    for (let i = 0; i < table.rows.length; i++) {
        let row = [], cols = table.rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) {
            // Replace newlines with space, then escape quotes
            let text = cols[j].innerText;
            text = text.replace(new RegExp(String.fromCharCode(13, 10), "g"), " "); // \r\n
            text = text.replace(new RegExp(String.fromCharCode(10), "g"), " ");      // \n
            text = text.replace(new RegExp(String.fromCharCode(13), "g"), " ");      // \r
            text = text.replace(new RegExp('"', "g"), '""');
            row.push('"' + text + '"');
        }
        csv.push(row.join(","));
    }
    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// Doc number generator
export function generateDocNumber(tipe) {
    tipe = tipe || 'Masuk';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const tipeCode = tipe.substring(0, 2).toUpperCase();
    return 'TRX-' + tipeCode + '-' + year + month + '-' + rand;
}
