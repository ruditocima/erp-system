export function transaksiApprovalTab() {
    return {
        init() {},
        approve(trx) { this.$parent.approveTransaction(trx); },
        reject(trx) { this.$parent.rejectTransaction(trx); }
    };
}