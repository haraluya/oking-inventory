import React, { useState, useEffect, useMemo, createContext, useContext, useRef, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, runTransaction, query, where, orderBy, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';
import { Home, Package, ShoppingCart, DollarSign, FileText, PlusCircle, Edit, Trash2, AlertCircle, ChevronDown, ChevronRight, Truck, Printer, ClipboardList, Users, FolderKanban, CheckCircle, Archive, Building } from 'lucide-react';
import app, { auth, db } from './firebaseConfig.js';

// --- App & Firebase Initialization ---
// Firebase 已在 firebaseConfig.js 中初始化
// 我們現在直接匯入已初始化的 'app', 'auth', 和 'db' 服務
const appId = app.options.appId;

// --- Collection Path Helpers ---
const getCollectionPath = (collectionName) => `artifacts/${appId}/public/data/${collectionName}`;
const getDocPath = (collectionName, docId) => `artifacts/${appId}/public/data/${collectionName}/${docId}`;

// --- Helper Functions ---
const TIER_MAP = {
    retail: '零售',
    bronze: '銅牌',
    silver: '銀牌',
    gold: '金牌'
};

// --- Modal Context for Messages and Confirmations ---
const ModalContext = createContext(null);
const useModal = () => useContext(ModalContext);

const ModalProvider = ({ children }) => {
    const [modal, setModal] = useState(null);
    const [messages, setMessages] = useState([]);

    const showMessage = (message, type = 'success') => {
        const id = Date.now();
        setMessages(prev => [...prev, { id, message, type }]);
        setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 3000);
    };

    const showConfirmation = (message) => {
        return new Promise(resolve => {
            setModal({ type: 'confirmation', message, onResolve: (result) => { setModal(null); resolve(result); } });
        });
    };

    return (
        <ModalContext.Provider value={{ showMessage, showConfirmation }}>
            {children}
            <div className="fixed top-5 right-5 z-50 space-y-2">
                {messages.map(({ id, message, type }) => (
                    <div key={id} className={`px-4 py-2 rounded-lg shadow-lg text-white ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message}</div>
                ))}
            </div>
            {modal?.type === 'confirmation' && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm text-center">
                        <p className="text-lg mb-6">{modal.message}</p>
                        <div className="flex justify-center space-x-4">
                            <button onClick={() => modal.onResolve(false)} className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300">取消</button>
                            <button onClick={() => modal.onResolve(true)} className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600">確定</button>
                        </div>
                    </div>
                </div>
            )}
        </ModalContext.Provider>
    );
};

// --- Auth Context for Role Management ---
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState('admin');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) { setLoading(false); return; }
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser); setLoading(false);
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Firebase 匿名登入失敗:", error); setLoading(false);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const value = { user, role, setRole, loading };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// --- Main App Component ---
export default function App() {
    return (
        <AuthProvider>
            <ModalProvider>
                <style>{`
                    input[type=number]::-webkit-inner-spin-button,
                    input[type=number]::-webkit-outer-spin-button {
                      -webkit-appearance: none;
                      margin: 0;
                    }
                    input[type=number] {
                      -moz-appearance: textfield;
                    }
                `}</style>
                <InventorySystem />
            </ModalProvider>
        </AuthProvider>
    );
}

const InventorySystem = () => {
    const { loading, role, user } = useAuth();
    const [currentView, setCurrentView] = useState('dashboard');

    useEffect(() => {
        const availableViews = getAvailableViews(role);
        const flatViews = availableViews.flatMap(v => v.children ? v.children : v);
        if (!flatViews.find(v => v.id === currentView)) {
            setCurrentView('dashboard');
        }
    }, [role, currentView]);

    const renderView = () => {
        if (loading || !user) return <div className="flex items-center justify-center h-full"><div className="text-xl font-semibold">驗證使用者身份中...</div></div>;
        switch (currentView) {
            case 'dashboard': return <Dashboard />;
            case 'products': return role === 'admin' ? <ProductManagement /> : <AccessDenied />;
            case 'customers': return role === 'admin' ? <CustomerManagement /> : <AccessDenied />;
            case 'suppliers': return role === 'admin' ? <SupplierManagement /> : <AccessDenied />;
            case 'inventory': return role === 'admin' ? <InventoryManagement /> : <AccessDenied />;
            case 'sales': return role === 'admin' ? <SalesManagement /> : <AccessDenied />;
            case 'shipping': return <WarehouseShippingManagement />;
            case 'purchases': return role === 'admin' ? <PurchaseManagement /> : <AccessDenied />;
            case 'reports': return role === 'admin' ? <Reports /> : <AccessDenied />;
            default: return <Dashboard />;
        }
    };

    if (!auth || !db) return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-semibold text-red-500">Firebase 設定錯誤，請檢查設定。</div></div>;

    return (
        <div className="flex h-screen bg-gray-50 font-sans">
            <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto flex-1">{renderView()}</div>
            </main>
        </div>
    );
}

const getAvailableViews = (role) => {
    const allViews = [
        { id: 'dashboard', label: '儀表板', icon: Home },
        { 
            id: 'basicData', 
            label: '基礎資料', 
            icon: FolderKanban,
            children: [
                { id: 'products', label: '商品管理', icon: Package },
                { id: 'customers', label: '客戶管理', icon: Users },
                { id: 'suppliers', label: '供應商管理', icon: Building },
            ] 
        },
        { id: 'inventory', label: '庫存管理', icon: ClipboardList },
        { id: 'sales', label: '銷貨管理', icon: ShoppingCart },
        { id: 'shipping', label: '倉庫出貨管理', icon: Truck },
        { id: 'purchases', label: '進貨管理', icon: DollarSign },
        { id: 'reports', label: '報表與結算', icon: FileText },
    ];
    if (role === 'admin') {
        return allViews;
    }
    if (role === 'warehouse') {
        const allowedIds = ['dashboard', 'shipping'];
        return allViews.filter(view => allowedIds.includes(view.id) && !view.children);
    }
    return [];
};

const Header = () => {
    const { role, setRole } = useAuth();
    return (
        <header className="bg-white shadow-sm p-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-700">歡迎使用系統</h2>
            <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">目前角色: <span className="font-bold text-blue-600">{role === 'admin' ? '管理員' : '倉庫人員'}</span></span>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="p-2 border rounded-md bg-white text-sm">
                    <option value="admin">切換為 管理員</option>
                    <option value="warehouse">切換為 倉庫人員</option>
                </select>
            </div>
        </header>
    );
};

const Sidebar = ({ currentView, setCurrentView }) => {
    const { role } = useAuth();
    const menuItems = getAvailableViews(role);
    const [expandedItems, setExpandedItems] = useState({ basicData: true });

    const handleParentClick = (id) => {
        setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <nav className="w-64 bg-white shadow-md flex flex-col">
            <div className="p-6 border-b"><h1 className="text-2xl font-bold text-gray-800">進銷存系統</h1></div>
            <ul className="flex-1 p-4 space-y-1">
                {menuItems.map(item => {
                    if (item.children) {
                        const isChildActive = item.children.some(child => child.id === currentView);
                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => handleParentClick(item.id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                                        isChildActive ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <item.icon className="w-5 h-5 mr-3" />
                                        <span className="font-medium">{item.label}</span>
                                    </div>
                                    {expandedItems[item.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {expandedItems[item.id] && (
                                    <ul className="pl-6 pt-1 space-y-1">
                                        {item.children.map(child => (
                                            <li key={child.id}>
                                                <button
                                                    onClick={() => setCurrentView(child.id)}
                                                    className={`w-full flex items-center p-2 rounded-lg transition-colors text-sm ${
                                                        currentView === child.id 
                                                        ? 'bg-blue-500 text-white' 
                                                        : 'text-gray-500 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <child.icon className="w-4 h-4 mr-3" />
                                                    <span>{child.label}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    }
                    return (
                        <li key={item.id}>
                            <button
                                onClick={() => setCurrentView(item.id)}
                                className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                                    currentView === item.id 
                                    ? 'bg-blue-500 text-white shadow-sm' 
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                <item.icon className="w-5 h-5 mr-3" />
                                <span className="font-medium">{item.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="p-4 border-t text-xs text-gray-500"><p>使用者ID:</p><p className="break-all">{auth.currentUser?.uid || 'N/A'}</p></div>
        </nav>
    );
};

const Dashboard = () => {
    const [products, setProducts] = useState([]);
    const [sales, setSales] = useState([]);
    const { role, user } = useAuth();
    const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);

    useEffect(() => {
        if (!user) return;
        const productsUnsub = onSnapshot(collection(db, getCollectionPath('products')), snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), error => console.error("讀取商品錯誤:", error));
        const salesUnsub = onSnapshot(collection(db, getCollectionPath('salesOrders')), snapshot => setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), error => console.error("讀取銷售單錯誤:", error));
        return () => { productsUnsub(); salesUnsub(); };
    }, [user]);

    const filteredCompletedSales = useMemo(() => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return sales.filter(order => {
            const orderDate = order.createdAt?.toDate();
            return order.status === 'Completed' && orderDate >= start && orderDate <= end;
        });
    }, [sales, startDate, endDate]);

    const totalRevenue = useMemo(() => filteredCompletedSales.reduce((sum, order) => sum + order.totalAmount, 0), [filteredCompletedSales]);
    const totalCompletedOrders = useMemo(() => filteredCompletedSales.length, [filteredCompletedSales]);
    const totalInventoryCost = useMemo(() => products.reduce((sum, p) => sum + ((p.stock || 0) * (p.averageCost || 0)), 0), [products]);
    const lowStockProducts = useMemo(() => products.filter(p => p.stock <= (p.lowStockThreshold || 5)), [products]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">儀表板</h2>
                <div className="flex items-center space-x-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">開始日期</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ml-2 p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">結束日期</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="ml-2 p-2 border rounded-md" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {role === 'admin' && <StatCard icon={DollarSign} title="期間總銷售額" value={`$${totalRevenue.toLocaleString()}`} color="green" />}
                {role === 'admin' && <StatCard icon={CheckCircle} title="期間已完成訂單" value={totalCompletedOrders} color="blue" />}
                {role === 'admin' && <StatCard icon={Archive} title="總庫存成本" value={`$${totalInventoryCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} color="purple" />}
                <StatCard icon={Package} title="商品總數" value={products.length} color="blue" />
                <StatCard icon={Truck} title="待出貨訂單" value={sales.filter(o => o.status === 'Pending Shipment').length} color="orange" />
                <StatCard icon={AlertCircle} title="低庫存商品" value={lowStockProducts.length} color="red" />
            </div>
        </div>
    );
};
const StatCard = ({ icon: Icon, title, value, color }) => { const colors = { green: 'bg-green-100 text-green-600', blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', red: 'bg-red-100 text-red-600', orange: 'bg-orange-100 text-orange-600' }; return ( <div className="bg-white p-6 rounded-lg shadow flex items-center"> <div className={`p-3 rounded-full ${colors[color]}`}><Icon className="w-7 h-7" /></div> <div className="ml-4"><p className="text-sm text-gray-500">{title}</p><p className="text-2xl font-bold text-gray-800">{value}</p></div> </div> ); };

// --- Resizable Table Components ---
const ResizableHeader = ({ children, width, onResize }) => {
    const headerRef = useRef(null);
    const handleMouseDown = (e) => {
        e.preventDefault();
        const startX = e.pageX;
        const startWidth = headerRef.current.offsetWidth;

        const handleMouseMove = (moveEvent) => {
            const newWidth = startWidth + (moveEvent.pageX - startX);
            if (newWidth > 50) { // Minimum width
                onResize(newWidth);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <th ref={headerRef} style={{ width: `${width}px` }} className="relative px-6 py-3 border-r border-gray-200">
            {children}
            <div
                onMouseDown={handleMouseDown}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
            />
        </th>
    );
};

// --- Customer Management ---
const CustomerManagement = () => {
    const [customers, setCustomers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuth();
    const { showConfirmation } = useModal();
    const [columnWidths, setColumnWidths] = useState({ code: 150, name: 300, tier: 150, actions: 100 });

    const handleResize = (key) => (newWidth) => {
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(collection(db, getCollectionPath('customers')), snapshot => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    const handleAdd = async (customer) => {
        const { id, ...customerData } = customer; 
        await addDoc(collection(db, getCollectionPath('customers')), customerData);
    };
    const handleUpdate = async (customer) => {
        const { id, ...customerData } = customer;
        await updateDoc(doc(db, getDocPath('customers', id)), customerData);
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirmation('確定要刪除此客戶嗎？');
        if (confirmed) await deleteDoc(doc(db, getDocPath('customers', id)));
    };
    const openModal = (customer = null) => { setEditingCustomer(customer); setIsModalOpen(true); };

    const filteredCustomers = useMemo(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        return customers.filter(c => 
            (c.code || '').toLowerCase().includes(lowercasedTerm) ||
            (c.name || '').toLowerCase().includes(lowercasedTerm)
        );
    }, [customers, searchTerm]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">客戶管理</h2>
                <div className="flex items-center space-x-4">
                    <input 
                        type="text" 
                        placeholder="搜尋客戶編碼或名稱..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64 p-2 border rounded-md"
                    />
                    <button onClick={() => openModal()} className="flex items-center bg-blue-500 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-600 transition"><PlusCircle className="w-5 h-5 mr-2" /> 新增客戶</button>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 table-fixed">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <ResizableHeader width={columnWidths.code} onResize={handleResize('code')}>客戶編碼</ResizableHeader>
                            <ResizableHeader width={columnWidths.name} onResize={handleResize('name')}>客戶名稱</ResizableHeader>
                            <ResizableHeader width={columnWidths.tier} onResize={handleResize('tier')}>客戶等級</ResizableHeader>
                            <th style={{width: `${columnWidths.actions}px`}} className="px-6 py-3">操作</th>
                        </tr>
                    </thead>
                    <tbody>{filteredCustomers.map(c => (
                        <tr key={c.id} className="bg-white border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900 truncate border-r border-gray-200">{c.code}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{c.name}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{TIER_MAP[c.tier] || c.tier}</td>
                            <td className="px-6 py-4 flex space-x-2">
                                <button onClick={() => openModal(c)} className="text-blue-600 hover:text-blue-800"><Edit className="w-5 h-5" /></button>
                                <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-5 h-5" /></button>
                            </td>
                        </tr>))}
                    </tbody>
                </table>
            </div></div>
            {isModalOpen && <CustomerForm customer={editingCustomer} onClose={() => setIsModalOpen(false)} onSave={editingCustomer ? handleUpdate : handleAdd} />}
        </div>
    );
};

const CustomerForm = ({ customer, onClose, onSave }) => {
    const [formData, setFormData] = useState({ name: customer?.name || '', tier: customer?.tier || 'retail', code: customer?.code || '' });
    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleSubmit = (e) => { e.preventDefault(); onSave({ id: customer?.id, ...formData }); onClose(); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
                <h3 className="text-2xl font-bold mb-6">{customer ? '編輯客戶' : '新增客戶'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">客戶編碼</label>
                        <input name="code" value={formData.code} onChange={handleChange} className="w-full p-2 border rounded" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">客戶名稱</label>
                        <input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">客戶等級</label>
                        <select name="tier" value={formData.tier} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="retail">零售</option><option value="bronze">銅牌</option>
                            <option value="silver">銀牌</option><option value="gold">金牌</option>
                        </select>
                    </div>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">取消</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">儲存</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Supplier Management ---
const SupplierManagement = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuth();
    const { showConfirmation } = useModal();
    const [columnWidths, setColumnWidths] = useState({ code: 150, name: 300, actions: 100 });

    const handleResize = (key) => (newWidth) => {
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(collection(db, getCollectionPath('suppliers')), snapshot => setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    const handleAdd = async (supplier) => {
        const { id, ...supplierData } = supplier;
        await addDoc(collection(db, getCollectionPath('suppliers')), supplierData);
    };
    const handleUpdate = async (supplier) => {
        const { id, ...supplierData } = supplier;
        await updateDoc(doc(db, getDocPath('suppliers', id)), supplierData);
    };
    const handleDelete = async (id) => {
        const confirmed = await showConfirmation('確定要刪除此供應商嗎？');
        if (confirmed) await deleteDoc(doc(db, getDocPath('suppliers', id)));
    };
    const openModal = (supplier = null) => { setEditingSupplier(supplier); setIsModalOpen(true); };

    const filteredSuppliers = useMemo(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        return suppliers.filter(s => 
            (s.code || '').toLowerCase().includes(lowercasedTerm) ||
            (s.name || '').toLowerCase().includes(lowercasedTerm)
        );
    }, [suppliers, searchTerm]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">供應商管理</h2>
                <div className="flex items-center space-x-4">
                    <input 
                        type="text" 
                        placeholder="搜尋供應商編碼或名稱..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64 p-2 border rounded-md"
                    />
                    <button onClick={() => openModal()} className="flex items-center bg-blue-500 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-600 transition"><PlusCircle className="w-5 h-5 mr-2" /> 新增供應商</button>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 table-fixed">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <ResizableHeader width={columnWidths.code} onResize={handleResize('code')}>供應商編碼</ResizableHeader>
                            <ResizableHeader width={columnWidths.name} onResize={handleResize('name')}>供應商名稱</ResizableHeader>
                            <th style={{width: `${columnWidths.actions}px`}} className="px-6 py-3">操作</th>
                        </tr>
                    </thead>
                    <tbody>{filteredSuppliers.map(s => (
                        <tr key={s.id} className="bg-white border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900 truncate border-r border-gray-200">{s.code}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{s.name}</td>
                            <td className="px-6 py-4 flex space-x-2">
                                <button onClick={() => openModal(s)} className="text-blue-600 hover:text-blue-800"><Edit className="w-5 h-5" /></button>
                                <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-5 h-5" /></button>
                            </td>
                        </tr>))}
                    </tbody>
                </table>
            </div></div>
            {isModalOpen && <SupplierForm supplier={editingSupplier} onClose={() => setIsModalOpen(false)} onSave={editingSupplier ? handleUpdate : handleAdd} />}
        </div>
    );
};

const SupplierForm = ({ supplier, onClose, onSave }) => {
    const [formData, setFormData] = useState({ name: supplier?.name || '', code: supplier?.code || '' });
    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleSubmit = (e) => { e.preventDefault(); onSave({ id: supplier?.id, ...formData }); onClose(); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
                <h3 className="text-2xl font-bold mb-6">{supplier ? '編輯供應商' : '新增供應商'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供應商編碼</label>
                        <input name="code" value={formData.code} onChange={handleChange} className="w-full p-2 border rounded" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">供應商名稱</label>
                        <input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" required />
                    </div>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">取消</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">儲存</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Product Management ---
const ProductManagement = () => {
    const [products, setProducts] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useAuth();
    const { showConfirmation } = useModal();
    const [columnWidths, setColumnWidths] = useState({ sku: 150, brand: 150, name: 300, spec: 200, actions: 100 });

    const handleResize = (key) => (newWidth) => {
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(collection(db, getCollectionPath('products')), snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    const handleAdd = async (product) => {
        const { id, ...productData } = product;
        await addDoc(collection(db, getCollectionPath('products')), { ...productData, averageCost: 0, cost: 0, stock: 0, price_retail: 0, price_bronze: 0, price_silver: 0, price_gold: 0, createdAt: new Date() });
    };
    const handleUpdate = async (product) => {
        const {id, ...productData} = product;
        await updateDoc(doc(db, getDocPath('products', product.id)), productData);
    }
    const handleDelete = async (id) => {
        const confirmed = await showConfirmation('確定要刪除此商品嗎？');
        if (confirmed) await deleteDoc(doc(db, getDocPath('products', id)));
    };
    const openModal = (product = null) => { setEditingProduct(product); setIsModalOpen(true); };
    
    const filteredProducts = useMemo(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        return products.filter(p => 
            (p.sku || '').toLowerCase().includes(lowercasedTerm) ||
            (p.brand || '').toLowerCase().includes(lowercasedTerm) ||
            (p.name || '').toLowerCase().includes(lowercasedTerm) ||
            (p.spec || '').toLowerCase().includes(lowercasedTerm)
        );
    }, [products, searchTerm]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">商品管理</h2>
                 <div className="flex items-center space-x-4">
                    <input 
                        type="text" 
                        placeholder="搜尋商品..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64 p-2 border rounded-md"
                    />
                    <button onClick={() => openModal()} className="flex items-center bg-blue-500 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-600 transition"><PlusCircle className="w-5 h-5 mr-2" /> 新增商品</button>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow"><div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 table-fixed">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <ResizableHeader width={columnWidths.sku} onResize={handleResize('sku')}>SKU</ResizableHeader>
                            <ResizableHeader width={columnWidths.brand} onResize={handleResize('brand')}>品牌</ResizableHeader>
                            <ResizableHeader width={columnWidths.name} onResize={handleResize('name')}>產品名稱</ResizableHeader>
                            <ResizableHeader width={columnWidths.spec} onResize={handleResize('spec')}>規格</ResizableHeader>
                            <th style={{width: `${columnWidths.actions}px`}} className="px-6 py-3">操作</th>
                        </tr>
                    </thead>
                    <tbody>{filteredProducts.map(p => (
                        <tr key={p.id} className="bg-white border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900 truncate border-r border-gray-200">{p.sku}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{p.brand}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{p.name}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{p.spec}</td>
                            <td className="px-6 py-4 flex space-x-2">
                                <button onClick={() => openModal(p)} className="text-blue-600 hover:text-blue-800"><Edit className="w-5 h-5" /></button>
                                <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-5 h-5" /></button>
                            </td>
                        </tr>))}
                    </tbody>
                </table>
            </div></div>
            {isModalOpen && <ProductForm product={editingProduct} onClose={() => setIsModalOpen(false)} onSave={editingProduct ? handleUpdate : handleAdd} />}
        </div>
    );
};

const ProductForm = ({ product, onClose, onSave }) => {
    const isEditing = !!product;
    const [formData, setFormData] = useState({
        sku: product?.sku || '', brand: product?.brand || '', name: product?.name || '', spec: product?.spec || '', description: product?.description || '',
        price_retail: product?.price_retail ?? '', price_bronze: product?.price_bronze ?? '', price_silver: product?.price_silver ?? '', price_gold: product?.price_gold ?? '',
        lowStockThreshold: product?.lowStockThreshold ?? '',
    });

    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSave = {
            ...formData,
            price_retail: parseFloat(formData.price_retail) || 0,
            price_bronze: parseFloat(formData.price_bronze) || 0,
            price_silver: parseFloat(formData.price_silver) || 0,
            price_gold: parseFloat(formData.price_gold) || 0,
            lowStockThreshold: parseInt(formData.lowStockThreshold, 10) || 5,
        };
        onSave({ id: product?.id, ...dataToSave });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">
                <h3 className="text-2xl font-bold mb-6">{isEditing ? '編輯商品' : '新增商品'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">商品貨號 (SKU)</label><input name="sku" value={formData.sku} onChange={handleChange} className="w-full p-2 border rounded" required /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">品牌</label><input name="brand" value={formData.brand} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">產品名稱</label><input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" required /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">規格</label><input name="spec" value={formData.spec} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">商品描述</label><textarea name="description" value={formData.description} onChange={handleChange} rows="3" className="w-full p-2 border rounded" /></div>
                    
                    {isEditing && (
                        <div className="p-4 border rounded-md bg-gray-50">
                            <label className="block text-sm font-medium text-gray-700 mb-2">設定售價</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs text-gray-600 mb-1">零售價</label><input type="number" name="price_retail" value={formData.price_retail} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-xs text-gray-600 mb-1">銅牌價</label><input type="number" name="price_bronze" value={formData.price_bronze} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-xs text-gray-600 mb-1">銀牌價</label><input type="number" name="price_silver" value={formData.price_silver} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-xs text-gray-600 mb-1">金牌價</label><input type="number" name="price_gold" value={formData.price_gold} onChange={handleChange} className="w-full p-2 border rounded" /></div>
                            </div>
                        </div>
                    )}
                    
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">低庫存警示數量</label><input type="number" name="lowStockThreshold" value={formData.lowStockThreshold} onChange={handleChange} className="w-full p-2 border rounded" required /></div>

                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">取消</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">儲存</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const InventoryManagement = () => {
    const [products, setProducts] = useState([]);
    const [ledgerProduct, setLedgerProduct] = useState(null);
    const [costLedgerProduct, setCostLedgerProduct] = useState(null);
    const { user } = useAuth();
    const [columnWidths, setColumnWidths] = useState({ sku: 150, name: 300, stock: 150, avgCost: 150 });
    const handleResize = (key) => (newWidth) => setColumnWidths(prev => ({ ...prev, [key]: newWidth }));

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(collection(db, getCollectionPath('products')), snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">庫存管理</h2>
            <div className="bg-white p-4 rounded-lg shadow"><div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 table-fixed">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <ResizableHeader width={columnWidths.sku} onResize={handleResize('sku')}>SKU</ResizableHeader>
                            <ResizableHeader width={columnWidths.name} onResize={handleResize('name')}>商品名稱</ResizableHeader>
                            <ResizableHeader width={columnWidths.stock} onResize={handleResize('stock')}>目前庫存數量</ResizableHeader>
                            <ResizableHeader width={columnWidths.avgCost} onResize={handleResize('avgCost')}>單位平均成本</ResizableHeader>
                        </tr>
                    </thead>
                    <tbody>{products.map(p => (
                        <tr key={p.id} className="bg-white border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900 truncate border-r border-gray-200">{p.sku}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">{`${p.brand || ''} ${p.name} ${p.spec || ''}`.trim()}</td>
                            <td className="px-6 py-4 truncate border-r border-gray-200">
                                <button onClick={() => setLedgerProduct(p)} className="text-blue-600 hover:underline">{p.stock}</button>
                            </td>
                            <td className="px-6 py-4 font-semibold text-blue-600 truncate">
                                <button onClick={() => setCostLedgerProduct(p)} className="text-blue-600 hover:underline">${p.averageCost?.toFixed(2) || 'N/A'}</button>
                            </td>
                        </tr>))}
                    </tbody>
                </table>
            </div></div>
            {ledgerProduct && <InventoryLedgerModal product={ledgerProduct} onClose={() => setLedgerProduct(null)} />}
            {costLedgerProduct && <CostLedgerModal product={costLedgerProduct} onClose={() => setCostLedgerProduct(null)} />}
        </div>
    );
};

const InventoryLedgerModal = ({ product, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, getCollectionPath('inventoryLogs')), where("productId", "==", product.id), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            setLogs(querySnapshot.docs.map(doc => doc.data()));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [product.id]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">庫存流水帳: {product.name}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                <div className="overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">日期</th>
                                <th className="px-6 py-3">類型</th>
                                <th className="px-6 py-3">關聯單號</th>
                                <th className="px-6 py-3 text-right">數量變化</th>
                                <th className="px-6 py-3 text-right">庫存結餘</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="text-center p-8">載入中...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="5" className="text-center p-8">無歷史紀錄</td></tr>
                            ) : (
                                logs.map((log, index) => (
                                    <tr key={index} className="bg-white border-b">
                                        <td className="px-6 py-4">{log.timestamp?.toDate().toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs ${log.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {log.type === 'in' ? '進貨' : '銷貨'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{log.relatedDoc}</td>
                                        <td className={`px-6 py-4 text-right font-medium ${log.change > 0 ? 'text-green-600' : 'text-red-600'}`}>{log.change > 0 ? `+${log.change}` : log.change}</td>
                                        <td className="px-6 py-4 text-right font-bold">{log.newStock}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const CostLedgerModal = ({ product, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, getCollectionPath('costLogs')), where("productId", "==", product.id), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            setLogs(querySnapshot.docs.map(doc => doc.data()));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [product.id]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-4xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">成本流水帳: {product.name}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                <div className="overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">日期</th>
                                <th className="px-6 py-3">類型</th>
                                <th className="px-6 py-3">關聯單號</th>
                                <th className="px-6 py-3 text-right">舊平均成本</th>
                                <th className="px-6 py-3 text-right">新平均成本</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="text-center p-8">載入中...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="5" className="text-center p-8">無歷史紀錄</td></tr>
                            ) : (
                                logs.map((log, index) => (
                                    <tr key={index} className="bg-white border-b">
                                        <td className="px-6 py-4">{log.timestamp?.toDate().toLocaleString()}</td>
                                        <td className="px-6 py-4"><span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">進貨</span></td>
                                        <td className="px-6 py-4">{log.relatedDoc}</td>
                                        <td className="px-6 py-4 text-right">${log.oldAvgCost?.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right font-bold">${log.newAvgCost?.toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


const SalesManagement = () => {
    const [salesOrders, setSalesOrders] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { user } = useAuth();
    const { showMessage, showConfirmation } = useModal();

    useEffect(() => {
        if (!user) return;
        const salesCollection = collection(db, getCollectionPath('salesOrders'));
        const unsubscribe = onSnapshot(salesCollection, snapshot => setSalesOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    const handleAddOrder = async (order) => {
        const totalAmount = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderNumber = `SO-${Date.now()}`;
        await addDoc(collection(db, getCollectionPath('salesOrders')), { 
            ...order, 
            totalAmount, 
            orderNumber, 
            status: 'Pending Approval', // New initial status
            createdAt: serverTimestamp() 
        });
        showMessage('銷售訂單已成功建立，等待批准。');
    };

    const handleApproveOrder = async (orderId) => {
        const confirmed = await showConfirmation('確定要批准此訂單嗎？批准後將通知倉庫備貨。');
        if (confirmed) {
            await updateDoc(doc(db, getDocPath('salesOrders', orderId)), { status: 'Pending Shipment' });
            showMessage('訂單已批准，已通知倉庫。');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">銷貨管理</h2>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center bg-green-500 text-white px-4 py-2 rounded-lg shadow hover:bg-green-600 transition"><PlusCircle className="w-5 h-5 mr-2" /> 新增銷售單</button>
            </div>
            <OrderList orders={salesOrders} type="sales" onApprove={handleApproveOrder} />
            {isModalOpen && <OrderForm type="sales" onClose={() => setIsModalOpen(false)} onSave={handleAddOrder} />}
        </div>
    );
};

const PurchaseManagement = () => {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { user } = useAuth();
    const { showMessage } = useModal();

    useEffect(() => {
        if (!user) return;
        const unsubscribe = onSnapshot(collection(db, getCollectionPath('purchaseOrders')), snapshot => setPurchaseOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user]);

    const handleAddOrder = async (order) => {
        const totalAmount = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0);
        await addDoc(collection(db, getCollectionPath('purchaseOrders')), { ...order, totalAmount, orderNumber: `PO-${Date.now()}`, status: 'Pending', createdAt: serverTimestamp() });
    };

    const handleReceiveItems = async (order) => {
        try {
            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, getDocPath('purchaseOrders', order.id));
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists() || orderDoc.data().status === 'Received') throw new Error("訂單不存在或已入庫。");

                for (const item of order.items) {
                    const productRef = doc(db, getDocPath('products', item.productId));
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists()) throw new Error(`商品 ID ${item.productId} 不存在。`);
                    
                    const productData = productDoc.data();
                    const oldStock = productData.stock || 0;
                    const oldAvgCost = productData.averageCost || 0;
                    const newStock = oldStock + item.quantity;
                    const newAvgCost = newStock > 0 ? ((oldStock * oldAvgCost) + (item.quantity * item.cost)) / newStock : item.cost;
                    
                    transaction.update(productRef, { stock: newStock, averageCost: newAvgCost, cost: item.cost });
                    
                    const invLogRef = doc(collection(db, getCollectionPath('inventoryLogs')));
                    transaction.set(invLogRef, {
                        productId: item.productId, productName: item.name, type: 'in', change: item.quantity, newStock: newStock,
                        relatedDoc: order.orderNumber, timestamp: serverTimestamp()
                    });

                    if (oldAvgCost.toFixed(5) !== newAvgCost.toFixed(5)) {
                        const costLogRef = doc(collection(db, getCollectionPath('costLogs')));
                        transaction.set(costLogRef, {
                            productId: item.productId, productName: item.name, type: 'in', relatedDoc: order.orderNumber,
                            oldAvgCost: oldAvgCost, newAvgCost: newAvgCost, timestamp: serverTimestamp()
                        });
                    }
                }
                transaction.update(orderRef, { status: 'Received', receivedAt: serverTimestamp() });
            });
            showMessage('庫存已成功更新！');
        } catch (error) { showMessage(`錯誤: ${error.message}`, 'error'); }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">進貨管理</h2>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center bg-purple-500 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-600 transition"><PlusCircle className="w-5 h-5 mr-2" /> 新增採購單</button>
            </div>
            <OrderList orders={purchaseOrders} type="purchases" onReceive={handleReceiveItems} />
            {isModalOpen && <OrderForm type="purchases" onClose={() => setIsModalOpen(false)} onSave={handleAddOrder} />}
        </div>
    );
};
const OrderList = ({ orders, type, onApprove, onReceive, onShip, onOpen }) => {
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const { role } = useAuth();
    const isSales = type === 'sales';
    const isShipping = type === 'shipping';

    const statusColor = (status) => {
        switch(status) {
            case 'Pending Approval': return 'text-yellow-600';
            case 'Pending Shipment': return 'text-orange-600';
            case 'Completed': return 'text-green-600';
            case 'Pending': return 'text-yellow-600';
            case 'Received': return 'text-green-600';
            default: return 'text-gray-600';
        }
    };
    
    const statusText = (status) => {
        switch(status) {
            case 'Pending Approval': return '待批准';
            case 'Pending Shipment': return '待出貨';
            case 'Completed': return '已完成';
            case 'Pending': return '待收貨';
            case 'Received': return '已收貨';
            default: return status;
        }
    }

    return (
        <div className="bg-white rounded-lg shadow"><div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
                <thead className={`text-xs text-gray-700 uppercase bg-gray-50`}>
                    <tr>
                        <th className="px-6 py-3 w-12 border-r border-gray-200"></th><th className="px-6 py-3 border-r border-gray-200">日期</th><th className="px-6 py-3 border-r border-gray-200">單號</th>
                        <th className="px-6 py-3 border-r border-gray-200">{isSales || isShipping ? '客戶' : '供應商'}</th>
                        {role === 'admin' && <th className="px-6 py-3 border-r border-gray-200">總金額</th>}
                        <th className="px-6 py-3 border-r border-gray-200">狀態</th><th className="px-6 py-3">操作</th>
                    </tr>
                </thead>
                <tbody>{orders.map(order => (
                    <React.Fragment key={order.id}>
                        <tr className="bg-white border-b border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => isShipping ? onOpen(order) : setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                            <td className="px-6 py-4 border-r border-gray-200">{isShipping ? <Edit className="w-4 h-4 text-gray-400"/> : (expandedOrderId === order.id ? <ChevronDown /> : <ChevronRight />)}</td>
                            <td className="px-6 py-4 border-r border-gray-200">{order.createdAt?.toDate().toLocaleDateString()}</td>
                            <td className="px-6 py-4 font-medium text-gray-900 border-r border-gray-200">{order.orderNumber}</td>
                            <td className="px-6 py-4 border-r border-gray-200">{order.partyName || 'N/A'}</td>
                            {role === 'admin' && <td className="px-6 py-4 border-r border-gray-200">${order.totalAmount.toLocaleString()}</td>}
                            <td className={`px-6 py-4 font-semibold ${statusColor(order.status)} border-r border-gray-200`}>{statusText(order.status)}</td>
                            <td className="px-6 py-4">
                                {isSales && order.status === 'Pending Approval' && (<button onClick={(e) => { e.stopPropagation(); onApprove(order.id); }} className="text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-xs flex items-center"><CheckCircle className="w-4 h-4 mr-1"/> 批准</button>)}
                                {type === 'purchases' && order.status === 'Pending' && (<button onClick={(e) => { e.stopPropagation(); onReceive(order); }} className="text-white bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-xs">收貨入庫</button>)}
                            </td>
                        </tr>
                        {expandedOrderId === order.id && !isShipping && (
                            <tr className="bg-gray-50"><td colSpan={role === 'admin' ? 8 : 7} className="p-4"><div className="p-4 bg-white rounded-md border">
                                <h4 className="font-bold mb-2">訂單明細:</h4>
                                <ul>{order.items.map((item, index) => (
                                    <li key={index} className="flex justify-between py-1 border-b">
                                        <span>{item.name}</span><span>數量: {item.quantity}</span>
                                        {role === 'admin' && <span>單價: ${isSales ? item.price.toLocaleString() : item.cost.toLocaleString()}</span>}
                                    </li>))}
                                </ul>
                            </div></td></tr>
                        )}
                    </React.Fragment>))}
                </tbody>
            </table>
        </div></div>
    );
};
const OrderForm = ({ type, onClose, onSave }) => {
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [partyName, setPartyName] = useState('');
    const [items, setItems] = useState([{ productId: '', quantity: 1, name: '', price: 0, cost: 0 }]);
    const { showMessage } = useModal();
    const isSales = type === 'sales';
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;
        const unsubProducts = onSnapshot(collection(db, getCollectionPath('products')), snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        if (isSales) {
            const unsubCustomers = onSnapshot(collection(db, getCollectionPath('customers')), snapshot => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            return () => { unsubProducts(); unsubCustomers(); };
        } else {
            const unsubSuppliers = onSnapshot(collection(db, getCollectionPath('suppliers')), snapshot => setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            return () => { unsubProducts(); unsubSuppliers(); };
        }
    }, [user, isSales]);

    const handlePartyChange = (partyId) => {
        if (isSales) {
            const customer = customers.find(c => c.id === partyId);
            setSelectedCustomer(customer);
            setPartyName(customer ? customer.name : '');
        } else {
            const supplier = suppliers.find(s => s.id === partyId);
            setPartyName(supplier ? supplier.name : '');
        }
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        if (field === 'productId') {
            const product = products.find(p => p.id === value);
            if (product) {
                newItems[index].name = `${product.brand || ''} ${product.name} ${product.spec || ''}`.trim();
                newItems[index].cost = product.cost || 0;
                if (isSales) {
                    const tier = selectedCustomer?.tier || 'retail';
                    newItems[index].price = product[`price_${tier}`] || product.price_retail || 0;
                }
            }
        }
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { productId: '', quantity: 1, name: '', price: 0, cost: 0 }]);
    const removeItem = (index) => setItems(items.filter((_, i) => i !== index));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!partyName) {
            return showMessage(isSales ? '請選擇一位客戶。' : '請選擇一位供應商。', 'error');
        }
        const finalItems = items.filter(item => item.productId && item.quantity > 0);
        if (finalItems.length === 0) return showMessage('請至少新增一項有效的商品。', 'error');
        onSave({ partyName, items: finalItems });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <h3 className="text-2xl font-bold mb-6">{isSales ? '新增銷售單' : '新增採購單'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {isSales ? (
                        <select onChange={(e) => handlePartyChange(e.target.value)} className="w-full p-2 border rounded bg-white" required>
                            <option value="">-- 選擇客戶 --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code}) - {TIER_MAP[c.tier]}</option>)}
                        </select>
                    ) : (
                         <select onChange={(e) => handlePartyChange(e.target.value)} className="w-full p-2 border rounded bg-white" required>
                            <option value="">-- 選擇供應商 --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                    )}
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">{items.map((item, index) => (
                        <div key={index} className="flex items-center space-x-2 p-2 border rounded-md">
                            <select value={item.productId} onChange={(e) => handleItemChange(index, 'productId', e.target.value)} className="w-1/2 p-2 border rounded bg-white" required>
                                <option value="">選擇商品</option>
                                {products.map(p => <option key={p.id} value={p.id}>{`${p.brand || ''} ${p.name} ${p.spec || ''}`.trim()} (庫存: {p.stock})</option>)}
                            </select>
                            <input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)} min="1" placeholder="數量" className="w-1/4 p-2 border rounded" required />
                            <div className="w-1/4 p-2">${(isSales ? item.price : item.cost)?.toLocaleString() || 0}</div>
                            <button type="button" onClick={() => removeItem(index)} className="text-red-500"><Trash2 className="w-5 h-5"/></button>
                        </div>))}
                    </div>
                    <button type="button" onClick={addItem} className="text-blue-500 hover:text-blue-700 flex items-center"><PlusCircle className="w-4 h-4 mr-1"/> 新增品項</button>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">取消</button>
                        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">建立訂單</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
const Reports = () => {
    const [sales, setSales] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [statementData, setStatementData] = useState(null);
    const [performanceData, setPerformanceData] = useState(null);
    const { user } = useAuth();
    const { showMessage } = useModal();

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, getCollectionPath('salesOrders')), where('status', '==', 'Completed'));
        const unsub = onSnapshot(q, snapshot => {
            const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSales(salesData);
            const uniqueCustomers = [...new Set(salesData.map(order => order.partyName).filter(Boolean))];
            setCustomers(uniqueCustomers);
        });
        return () => unsub();
    }, [user]);

    const filterOrdersByDate = useCallback((orders) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return orders.filter(order => {
            const orderDate = order.createdAt.toDate();
            return orderDate >= start && orderDate <= end;
        });
    }, [startDate, endDate]);
    
    useEffect(() => {
        const filteredSales = filterOrdersByDate(sales);
        const totalRevenue = filteredSales.reduce((sum, order) => sum + order.totalAmount, 0);
        const totalCogs = filteredSales.reduce((sum, order) => sum + (order.items.reduce((itemSum, item) => itemSum + (item.costAtSale || 0) * item.quantity, 0)), 0);
        const grossProfit = totalRevenue - totalCogs;
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        setPerformanceData({ totalRevenue, totalCogs, grossProfit, profitMargin });
    }, [sales, filterOrdersByDate]);

    const handleGenerateStatement = () => {
        if (!selectedCustomer) { showMessage('請選擇一位客戶。', 'error'); return; }
        const customerOrders = sales.filter(order => order.partyName === selectedCustomer);
        const filteredOrders = filterOrdersByDate(customerOrders).sort((a,b) => a.createdAt.toDate() - b.createdAt.toDate());
        const total = filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
        setStatementData({ customer: selectedCustomer, startDate, endDate, orders: filteredOrders, totalAmount: total });
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">報表與結算</h2>
            
            <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h3 className="text-xl font-semibold mb-4">整體業績分析 (僅含已完成訂單)</h3>
                <div className="flex items-center space-x-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded-md" />
                    </div>
                </div>
                {performanceData && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-gray-50 rounded-lg"><p className="text-sm text-gray-500">總銷售額</p><p className="text-2xl font-bold text-green-600">${performanceData.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p></div>
                        <div className="p-4 bg-gray-50 rounded-lg"><p className="text-sm text-gray-500">總銷售成本</p><p className="text-2xl font-bold text-red-600">${performanceData.totalCogs.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p></div>
                        <div className="p-4 bg-gray-50 rounded-lg"><p className="text-sm text-gray-500">毛利</p><p className="text-2xl font-bold text-blue-600">${performanceData.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p></div>
                        <div className="p-4 bg-gray-50 rounded-lg"><p className="text-sm text-gray-500">毛利率</p><p className="text-2xl font-bold text-purple-600">{performanceData.profitMargin.toFixed(2)}%</p></div>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h3 className="text-xl font-semibold mb-4">客戶對帳單產生器 (僅含已完成訂單)</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">客戶</label><select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="">-- 選擇客戶 --</option>{customers.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div className="md:col-span-2"><button onClick={handleGenerateStatement} className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-600 transition h-10">產生對帳單</button></div>
                </div>
            </div>

            {statementData && (
                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-2xl font-bold text-gray-800">對帳單</h3>
                            <p className="text-gray-600">客戶: <span className="font-semibold">{statementData.customer}</span></p>
                            <p className="text-gray-600">期間: {statementData.startDate} to {statementData.endDate}</p>
                        </div>
                        <button onClick={() => window.print()} className="flex items-center text-gray-600 hover:text-blue-500"><Printer className="w-5 h-5 mr-2" /> 列印</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr><th className="px-6 py-3 border-r border-gray-200">訂單日期</th><th className="px-6 py-3 border-r border-gray-200">訂單號碼</th><th className="px-6 py-3 text-right">金額</th></tr>
                            </thead>
                            <tbody>{statementData.orders.map(order => (<tr key={order.id} className="bg-white border-b border-gray-200"><td className="px-6 py-4 border-r border-gray-200">{order.createdAt.toDate().toLocaleDateString()}</td><td className="px-6 py-4 border-r border-gray-200">{order.orderNumber}</td><td className="px-6 py-4 text-right">${order.totalAmount.toLocaleString()}</td></tr>))}</tbody>
                            <tfoot><tr className="font-semibold text-gray-900"><td colSpan="2" className="px-6 py-3 text-right text-lg border-r border-gray-200">總計</td><td className="px-6 py-3 text-right text-lg">${statementData.totalAmount.toLocaleString()}</td></tr></tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
const AccessDenied = () => (<div className="flex flex-col items-center justify-center h-full text-center"><AlertCircle className="w-16 h-16 text-red-500 mb-4" /><h2 className="text-2xl font-bold text-gray-700">權限不足</h2><p className="text-gray-500 mt-2">您目前的角色無法存取此頁面。</p></div>);
const WarehouseShippingManagement = () => {
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const { user } = useAuth();
    const { showMessage, showConfirmation } = useModal();

    useEffect(() => {
        if (!user) return;
        const statusMap = {
            pending: ['Pending Shipment'],
            completed: ['Completed']
        };
        const q = query(collection(db, getCollectionPath('salesOrders')), where('status', 'in', statusMap[activeTab]));
        const unsubscribe = onSnapshot(q, snapshot => setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => unsubscribe();
    }, [user, activeTab]);

    const handleShipOrder = async (order) => {
        const confirmed = await showConfirmation('確定此訂單已完成出貨？此動作將會正式扣除庫存。');
        if (!confirmed) return;

        try {
            await runTransaction(db, async (transaction) => {
                const orderNumber = order.orderNumber;
                const updatedItems = [];

                for (const item of order.items) {
                    const productRef = doc(db, getDocPath('products', item.productId));
                    const productDoc = await transaction.get(productRef);
                    if (!productDoc.exists() || productDoc.data().stock < item.quantity) throw new Error(`商品 ${item.name} 庫存不足`);
                    
                    const productData = productDoc.data();
                    const newStock = productData.stock - item.quantity;
                    transaction.update(productRef, { stock: newStock });

                    // 將當時的平均成本記錄到品項中
                    updatedItems.push({
                        ...item,
                        costAtSale: productData.averageCost || 0
                    });

                    const invLogRef = doc(collection(db, getCollectionPath('inventoryLogs')));
                    transaction.set(invLogRef, {
                        productId: item.productId, productName: item.name, type: 'out', change: -item.quantity, newStock: newStock,
                        relatedDoc: orderNumber, timestamp: serverTimestamp()
                    });
                }
                const orderRef = doc(db, getDocPath('salesOrders', order.id));
                // 更新訂單狀態，並將帶有銷售成本的品項陣列存回
                transaction.update(orderRef, { status: 'Completed', shippedAt: serverTimestamp(), items: updatedItems });
            });
            showMessage('訂單已出貨，庫存已更新！');
            setSelectedOrder(null);
        } catch (error) {
            showMessage(`出貨失敗: ${error.message}`, 'error');
        }
    };

    const handleSaveRemarks = async (orderId, remarks) => {
        await updateDoc(doc(db, getDocPath('salesOrders', orderId)), { remarks });
        showMessage('備註已儲存。');
        setSelectedOrder(prev => ({ ...prev, remarks }));
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">倉庫出貨管理</h2>
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('pending')} className={`${activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>待出貨</button>
                    <button onClick={() => setActiveTab('completed')} className={`${activeTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>已完成</button>
                </nav>
            </div>
            <div className="mt-4">
                <OrderList orders={orders} type="shipping" onOpen={setSelectedOrder} />
            </div>
            {selectedOrder && <ShippingDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onShip={handleShipOrder} onSaveRemarks={handleSaveRemarks} />}
        </div>
    );
};

const ShippingDetailModal = ({ order, onClose, onShip, onSaveRemarks }) => {
    const [remarks, setRemarks] = useState(order.remarks || '');
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-3xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800">訂單明細: {order.orderNumber}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <p><strong>客戶:</strong> {order.partyName}</p>
                    <p><strong>訂單日期:</strong> {order.createdAt?.toDate().toLocaleDateString()}</p>
                </div>
                <div className="overflow-y-auto max-h-[40vh] border rounded-md">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">商品</th>
                                <th className="px-6 py-3 text-right">數量</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, index) => (
                                <tr key={index} className="bg-white border-b">
                                    <td className="px-6 py-4">{item.name}</td>
                                    <td className="px-6 py-4 text-right">{item.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">倉庫備註</label>
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows="3" className="w-full p-2 border rounded-md"></textarea>
                    <button onClick={() => onSaveRemarks(order.id, remarks)} className="mt-2 bg-gray-600 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-700 transition text-sm">儲存備註</button>
                </div>
                <div className="flex justify-end space-x-4 pt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">關閉</button>
                    {order.status === 'Pending Shipment' && (
                        <button onClick={() => onShip(order)} className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"><Truck className="w-5 h-5 mr-2" /> 確認出貨</button>
                    )}
                </div>
            </div>
        </div>
    );
};
