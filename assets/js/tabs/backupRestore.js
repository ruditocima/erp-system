export function backupRestoreTab() {
    return { init() {}, handleImportFile(event) { this.$parent.handleImportFile(event); } };
}