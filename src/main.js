import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/+esm';
import warehouseApp from './components/warehouseApp.js?v=3';

window.Alpine = Alpine;
Alpine.data('warehouseApp', warehouseApp);
Alpine.start();

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// [FIX] Ikon Lucide di dalam x-for/x-if dirender ulang Alpine sebagai <i> baru
// tanpa pemicu createIcons(), sehingga ikon bisa hilang setelah interaksi.
// MutationObserver ringan (debounce) menjamin ikon selalu dibuat ulang setiap
// perubahan DOM tanpa mengubah template apa pun.
let __iconTimer = null;
const scheduleIconRefresh = () => {
    if (__iconTimer) clearTimeout(__iconTimer);
    __iconTimer = setTimeout(() => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 60);
};
if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(scheduleIconRefresh).observe(document.body, { childList: true, subtree: true });
}
