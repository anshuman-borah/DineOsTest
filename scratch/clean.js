// Run this directly in the browser console
async function cleanStuckBills() {
  console.log("Cleaning stuck bills from IndexedDB...");
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dinestay-offline');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction(['syncQueue'], 'readwrite');
    const store = tx.objectStore('syncQueue');
    const getReq = store.getAll();

    getReq.onsuccess = (e) => {
      const items = e.target.result;
      let count = 0;
      
      items.forEach(item => {
        // Look for billing/bills entities or payload endpoints containing bills
        if (item.entityType === 'billing/bills' || 
            (item.payload && item.payload.endpoint && item.payload.endpoint.includes('/bills'))) {
          store.delete(item.id);
          console.log(`Deleted stuck bill sync item: ${item.id}`, item);
          count++;
        }
      });
      
      console.log(`Successfully deleted ${count} stuck bill items from local queue!`);
      if (count > 0) {
        console.log("Please refresh the page to apply changes.");
      }
    };

    tx.oncomplete = () => {
      db.close();
    };
  } catch (err) {
    console.error("Failed to clean IndexedDB:", err);
  }
}

cleanStuckBills();
