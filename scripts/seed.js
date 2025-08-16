const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
// !! 重要 !!
// 1. 從 Firebase 控制台下載你的服務帳號金鑰
// 2. 將它重新命名為 'serviceAccountKey.json' 並放在這個 'scripts' 資料夾中
// 3. 確認 'scripts/serviceAccountKey.json' 已經加入到 .gitignore
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- 初始資料定義 (根據你的新結構) ---

const suppliersData = [
    { supplierCode: 'SUP-001', name: '大同電子', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { supplierCode: 'SUP-002', name: '聲寶集團', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { supplierCode: 'SUP-003', name: '宏碁電腦', createdAt: admin.firestore.FieldValue.serverTimestamp() }
];

const customersData = [
    { customerCode: 'CUS-001', name: '全國電子', level: 'gold', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { customerCode: 'CUS-002', name: '燦坤3C', level: 'silver', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { customerCode: 'CUS-003', name: '順發電腦', level: 'bronze', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { customerCode: 'CUS-004', name: '網路散客', level: 'retail', createdAt: admin.firestore.FieldValue.serverTimestamp() }
];

const productsData = [
    { 
        sku: 'TATUNG-TAC-11R', brand: '大同', name: '電鍋', spec: '11人份/不鏽鋼', description: '百年經典，國民電鍋', 
        prices: { retail: 2890, bronze: 2800, silver: 2750, gold: 2700 },
        lowStockThreshold: 10, 
        createdAt: admin.firestore.FieldValue.serverTimestamp(), 
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { 
        sku: 'SAMPO-ES-B10F', brand: '聲寶', name: '定頻洗衣機', spec: '10KG', description: '強力洗淨，節能省水',
        prices: { retail: 8490, bronze: 8300, silver: 8200, gold: 8000 },
        lowStockThreshold: 5, 
        createdAt: admin.firestore.FieldValue.serverTimestamp(), 
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { 
        sku: 'ACER-AN515', brand: 'Acer', name: 'Nitro 5 電競筆電', spec: 'i5-12500H/16G/512G/RTX3050', description: '入門電競首選，高效散熱',
        prices: { retail: 32900, bronze: 32000, silver: 31500, gold: 31000 },
        lowStockThreshold: 3, 
        createdAt: admin.firestore.FieldValue.serverTimestamp(), 
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
];

// --- 腳本函式 ---

/**
 * 清空並填入一個集合的資料 (包含子集合)
 * @param {string} collectionPath 集合路徑
 * @param {Array<object>} data 要寫入的資料陣列
 * @param {{ subcollection: string, itemsField: string, idField: string } | null} subcollectionConfig 子集合設定
 * @returns {Promise<Array<string>>} 新增文件的 ID 列表
 */
const seedCollection = async (collectionPath, data, subcollectionConfig = null) => {
  console.log(`正在初始化 ${collectionPath}...`);
  const collectionRef = db.collection(collectionPath);
  
  // 刪除舊資料
  const snapshot = await collectionRef.limit(500).get();
  if (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(` -> 已清除 ${snapshot.size} 筆舊文件。`);
  }

  // 新增資料
  const batch = db.batch();
  const docIds = [];
  for (const item of data) {
    const docRef = collectionRef.doc(); // 自動產生 ID
    const { [subcollectionConfig?.itemsField]: subcollectionItems, ...mainData } = item;
    batch.set(docRef, mainData);
    docIds.push(docRef.id);

    if (subcollectionConfig && subcollectionItems) {
      for (const subItem of subcollectionItems) {
        const subDocRef = docRef.collection(subcollectionConfig.subcollection).doc(subItem[subcollectionConfig.idField]);
        batch.set(subDocRef, subItem);
      }
    }
  }
  await batch.commit();
  console.log(` -> 已新增 ${data.length} 筆新文件。`);
  return docIds;
};

const main = async () => {
  try {
    console.log('🔥 開始執行資料庫初始化腳本...');
    
    const supplierIds = await seedCollection('suppliers', suppliersData);
    const customerIds = await seedCollection('customers', customersData);
    
    // 新增商品，並為每個商品建立對應的庫存文件
    const productIds = await seedCollection('products', productsData);

    console.log('正在初始化 inventory...');
    const inventoryBatch = db.batch();
    productIds.forEach((productId, index) => {
        const inventoryRef = db.collection('inventory').doc(productId);
        inventoryBatch.set(inventoryRef, {
            currentStock: 100, // 給予初始庫存
            averageCost: productsData[index].prices.retail * 0.8 // 假設初始成本
        });
    });
    await inventoryBatch.commit();
    console.log(` -> 已為 ${productIds.length} 個商品建立初始庫存文件。`);

    // 新增銷售訂單範例
    const salesOrdersData = [
      {
        orderNumber: `SO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-001`,
        customerId: customerIds[0],
        customerName: customersData[0].name,
        status: 'completed',
        totalAmount: productsData[0].prices.gold * 2,
        totalCost: (productsData[0].prices.retail * 0.8) * 2,
        grossProfit: (productsData[0].prices.gold * 2) - ((productsData[0].prices.retail * 0.8) * 2),
        createdBy: 'script-user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        shippedAt: admin.firestore.FieldValue.serverTimestamp(),
        items: [
          {
            productId: productIds[0],
            sku: productsData[0].sku,
            name: productsData[0].name,
            quantity: 2,
            unitPrice: productsData[0].prices.gold,
            unitCost: productsData[0].prices.retail * 0.8
          }
        ]
      }
    ];
    await seedCollection('salesOrders', salesOrdersData, { subcollection: 'items', itemsField: 'items', idField: 'productId' });

    // 新增採購訂單範例
    const purchaseOrdersData = [
      {
        orderNumber: `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-001`,
        supplierId: supplierIds[1],
        supplierName: suppliersData[1].name,
        status: 'completed',
        totalAmount: 1500 * 5,
        createdBy: 'script-user',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        items: [
          {
            productId: productIds[2],
            sku: productsData[2].sku,
            name: productsData[2].name,
            quantity: 5,
            purchasePrice: 1500
          }
        ]
      }
    ];
    await seedCollection('purchaseOrders', purchaseOrdersData, { subcollection: 'items', itemsField: 'items', idField: 'productId' });

    console.log('\n✅ 資料庫初始化成功！');
  } catch (error) {
    console.error('\n❌ 資料庫初始化失敗:', error);
    process.exit(1);
  }
};

main();