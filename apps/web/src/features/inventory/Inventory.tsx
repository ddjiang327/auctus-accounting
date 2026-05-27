import { useMemo, useState } from 'react';
import { computeInventoryItems, fmtMoney, inventoryValuation, todayStr, uid } from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import type { InventoryMovement, InventoryMovementType, LedgerData, Product } from '../../domain/models';

interface InventoryProps {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
}

type Tab = 'products' | 'stock' | 'movements';

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
};

function blankProduct(): Omit<Product, 'id'> {
  return { name: '', sku: '', unitOfMeasure: 'unit', costPrice: 0, sellPrice: 0 };
}

function blankMovement(productId: string): Omit<InventoryMovement, 'id'> {
  return { productId, date: todayStr(), type: 'purchase', quantity: 1, unitCost: 0, memo: '' };
}

export function Inventory({ data, onDataChange, canWrite = true }: InventoryProps) {
  const [tab, setTab] = useState<Tab>('stock');
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementModal, setMovementModal] = useState(false);
  const [movementProductId, setMovementProductId] = useState('');

  const [productForm, setProductForm] = useState(blankProduct());
  const [movForm, setMovForm] = useState<Omit<InventoryMovement, 'id'>>(blankMovement(''));

  const valuation = useMemo(() => inventoryValuation(data), [data]);
  const allItems = useMemo(() => computeInventoryItems(data), [data]);
  const activeProducts = useMemo(() => (data.products || []).filter((p) => !p.archivedAt), [data]);
  const movements = useMemo(
    () => [...(data.inventoryMovements || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );

  function openNewProduct() {
    setEditingProduct(null);
    setProductForm(blankProduct());
    setProductModal(true);
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p);
    setProductForm({ name: p.name, sku: p.sku || '', unitOfMeasure: p.unitOfMeasure || 'unit', costPrice: p.costPrice, sellPrice: p.sellPrice });
    setProductModal(true);
  }

  function saveProduct() {
    if (!productForm.name.trim()) return;
    const products = data.products || [];
    if (editingProduct) {
      onDataChange({ ...data, products: products.map((p) => p.id === editingProduct.id ? { ...editingProduct, ...productForm } : p) });
    } else {
      onDataChange({ ...data, products: [...products, { ...productForm, id: uid() }] });
    }
    setProductModal(false);
  }

  function archiveProduct(productId: string) {
    onDataChange({ ...data, products: (data.products || []).map((p) => p.id === productId ? { ...p, archivedAt: new Date().toISOString() } : p) });
  }

  function openAddMovement(productId: string) {
    setMovementProductId(productId);
    const product = (data.products || []).find((p) => p.id === productId);
    setMovForm({ ...blankMovement(productId), unitCost: product?.costPrice || 0 });
    setMovementModal(true);
  }

  function saveMovement() {
    if (!movForm.productId || movForm.quantity === 0) return;
    const movement: InventoryMovement = { ...movForm, id: uid() };
    onDataChange({ ...data, inventoryMovements: [...(data.inventoryMovements || []), movement] });
    setMovementModal(false);
  }

  const totalInventoryValue = valuation.reduce((sum, row) => sum + row.totalValue, 0);

  return (
    <div className="inv-root">
      <div className="inv-summary">
        <div className="inv-stat">
          <span className="inv-stat-label">Total Products</span>
          <span className="inv-stat-value">{activeProducts.length}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Total Stock Value</span>
          <span className="inv-stat-value">{fmtMoney(totalInventoryValue)}</span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Movements</span>
          <span className="inv-stat-value">{movements.length}</span>
        </div>
      </div>

      <div className="inv-tabs">
        {(['stock', 'products', 'movements'] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'stock' ? 'Stock Levels' : t === 'products' ? 'Products' : 'Movements'}
          </button>
        ))}
        {canWrite && tab === 'products' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewProduct}>+ Add Product</button>
        )}
      </div>

      {tab === 'stock' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Product</th><th>SKU</th><th>Unit</th><th className="num">Qty on Hand</th><th className="num">Avg Cost</th><th className="num">Total Value</th><th></th></tr>
          </thead>
          <tbody>
            {valuation.length === 0 && (
              <tr><td colSpan={7} className="empty-row">No stock on hand. Add products and record purchase movements to get started.</td></tr>
            )}
            {valuation.map((row) => (
              <tr key={row.product.id}>
                <td>{row.product.name}</td>
                <td className="muted">{row.product.sku || '—'}</td>
                <td className="muted">{row.product.unitOfMeasure || 'unit'}</td>
                <td className="num">{row.quantity.toFixed(2)}</td>
                <td className="num">{fmtMoney(row.avgCost)}</td>
                <td className="num">{fmtMoney(row.totalValue)}</td>
                <td>
                  {canWrite && (
                    <button className="btn-link" onClick={() => openAddMovement(row.product.id)}>+ Movement</button>
                  )}
                </td>
              </tr>
            ))}
            {activeProducts.filter((p) => !allItems.some((i) => i.productId === p.id)).map((p) => (
              <tr key={p.id} className="muted">
                <td>{p.name}</td>
                <td className="muted">{p.sku || '—'}</td>
                <td className="muted">{p.unitOfMeasure || 'unit'}</td>
                <td className="num">0.00</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td>
                  {canWrite && (
                    <button className="btn-link" onClick={() => openAddMovement(p.id)}>+ Movement</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'products' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Name</th><th>SKU</th><th>Unit</th><th className="num">Cost Price</th><th className="num">Sell Price</th><th></th></tr>
          </thead>
          <tbody>
            {activeProducts.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No products yet. Click "+ Add Product" to create one.</td></tr>
            )}
            {activeProducts.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.sku || '—'}</td>
                <td className="muted">{p.unitOfMeasure || 'unit'}</td>
                <td className="num">{fmtMoney(p.costPrice)}</td>
                <td className="num">{fmtMoney(p.sellPrice)}</td>
                <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {canWrite && (
                    <>
                      <button className="btn-link" onClick={() => openEditProduct(p)}>Edit</button>
                      <button className="btn-link text-danger" onClick={() => archiveProduct(p.id)}>Archive</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'movements' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Date</th><th>Product</th><th>Type</th><th className="num">Qty</th><th className="num">Unit Cost</th><th className="num">Total</th><th>Memo</th></tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr><td colSpan={7} className="empty-row">No inventory movements yet.</td></tr>
            )}
            {movements.map((m) => {
              const product = (data.products || []).find((p) => p.id === m.productId);
              return (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{product?.name || m.productId}</td>
                  <td><span className={`badge badge-${m.type}`}>{MOVEMENT_LABELS[m.type]}</span></td>
                  <td className="num">{m.quantity}</td>
                  <td className="num">{fmtMoney(m.unitCost)}</td>
                  <td className="num">{fmtMoney(Math.abs(m.quantity) * m.unitCost)}</td>
                  <td className="muted">{m.memo || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {productModal && (
        <Modal title={editingProduct ? 'Edit Product' : 'New Product'} open={productModal} onClose={() => setProductModal(false)}>
          <div className="form-grid">
            <label>Name *<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} autoFocus /></label>
            <label>SKU<input value={productForm.sku || ''} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} /></label>
            <label>Unit of Measure<input value={productForm.unitOfMeasure || ''} onChange={(e) => setProductForm({ ...productForm, unitOfMeasure: e.target.value })} placeholder="e.g. unit, kg, hr" /></label>
            <label>Cost Price<input type="number" step="0.01" min="0" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: parseFloat(e.target.value) || 0 })} /></label>
            <label>Sell Price<input type="number" step="0.01" min="0" value={productForm.sellPrice} onChange={(e) => setProductForm({ ...productForm, sellPrice: parseFloat(e.target.value) || 0 })} /></label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setProductModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveProduct} disabled={!productForm.name.trim()}>Save</button>
          </div>
        </Modal>
      )}

      {movementModal && (
        <Modal title="Add Movement" open={movementModal} onClose={() => setMovementModal(false)}>
          <div className="form-grid">
            <label>Product
              <select value={movForm.productId} onChange={(e) => setMovForm({ ...movForm, productId: e.target.value })}>
                {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Type
              <select value={movForm.type} onChange={(e) => setMovForm({ ...movForm, type: e.target.value as InventoryMovementType })}>
                <option value="purchase">Purchase (Receive stock)</option>
                <option value="sale">Sale (Reduce stock)</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label>Date<input type="date" value={movForm.date} onChange={(e) => setMovForm({ ...movForm, date: e.target.value })} /></label>
            <label>Quantity<input type="number" step="0.01" value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: parseFloat(e.target.value) || 0 })} /></label>
            <label>Unit Cost<input type="number" step="0.01" min="0" value={movForm.unitCost} onChange={(e) => setMovForm({ ...movForm, unitCost: parseFloat(e.target.value) || 0 })} /></label>
            <label>Memo<input value={movForm.memo || ''} onChange={(e) => setMovForm({ ...movForm, memo: e.target.value })} /></label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setMovementModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveMovement}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
