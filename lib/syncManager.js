export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AccountingOfflineDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('vouchers')) {
                db.createObjectStore('vouchers', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
};

export const saveVoucherOffline = async (voucherData) => {
    const db = await initDB();
    const tx = db.transaction('vouchers', 'readwrite');
    const store = tx.objectStore('vouchers');
    store.add({
        ...voucherData,
        timestamp: Date.now(),
        syncStatus: 'pending'
    });
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

export const getOfflineVouchers = async () => {
    const db = await initDB();
    const tx = db.transaction('vouchers', 'readonly');
    const store = tx.objectStore('vouchers');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteOfflineVoucher = async (id) => {
    const db = await initDB();
    const tx = db.transaction('vouchers', 'readwrite');
    const store = tx.objectStore('vouchers');
    store.delete(id);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};
