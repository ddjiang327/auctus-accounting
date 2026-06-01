import { useMemo, useState } from 'react';
import { computeInventoryItems, fmtMoney, inventoryValuation, todayStr, uid, validateInventoryMovementInput } from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import type { InventoryMovement, InventoryMovementType, LedgerData, Product, PurchaseOrder } from '../../domain/models';
import { PurchaseOrders } from './PurchaseOrders';

interface InventoryProps {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
  onSaveProduct?: (product: Product, mode: 'create' | 'update') => void | Promise<void>;
  onArchiveProduct?: (productId: string) => void | Promise<void>;
  onCreateMovement?: (movement: InventoryMovement) => void | Promise<void>;
  onCreatePurchaseOrder?: (po: PurchaseOrder) => void | Promise<void>;
  onMarkPurchaseOrderSent?: (po: PurchaseOrder) => void | Promise<void>;
  onCancelPurchaseOrder?: (po: PurchaseOrder) => void | Promise<void>;
  onReceivePurchaseOrder?: (po: PurchaseOrder, receiptQtys: Record<number, number>, date: string) => void | Promise<void>;
  onCreateBillFromPO?: (po: PurchaseOrder) => void | Promise<void>;
}

type Tab = 'products' | 'stock' | 'movements' | 'orders';

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  adjustment: 'Adjustment',
};

function blankProduct(): Omit<Product, 'id'> {
  return { name: '', sku: '', unitOfMeasure: 'unit', costPrice: 0, sellPrice: 0, reorderPoint: undefined };
}

function blankMovement(productId: string): Omit<InventoryMovement, 'id'> {
  return { productId, date: todayStr(), type: 'purchase', quantity: 1, unitCost: 0, memo: '' };
}

export function Inventory({
  data,
  onDataChange,
  canWrite = true,
  onSaveProduct,
  onArchiveProduct,
  onCreateMovement,
  onCreatePurchaseOrder,
  onMarkPurchaseOrderSent,
  onCancelPurchaseOrder,
  onReceivePurchaseOrder,
  onCreateBillFromPO,
}: InventoryProps) {
  const [tab, setTab] = useState<Tab>('stock');
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [movementModal, setMovementModal] = useState(false);
  const [movementProductId, setMovementProductId] = useState('');
  const [stockTakeModal, setStockTakeModal] = useState(false);
  const [stockTakeDate, setStockTakeDate] = useState(todayStr());
  const [stockTakeCounts, setStockTakeCounts] = useState<Record<string, string>>({});
  const [movementError, setMovementError] = useState<string | null>(null);
  const [stockTakeError, setStockTakeError] = useState<string | null>(null);

  const [productForm, setProductForm] = useState(blankProduct());
  const [movForm, setMovForm] = useState<Omit<InventoryMovement, 'id'>>(blankMovement(''));

  const valuation = useMemo(() => inventoryValuation(data), [data]);
  const allItems = useMemo(() => computeInventoryItems(data), [data]);
  const activeProducts = useMemo(() => (data.products || []).filter((p) => !p.archivedAt), [data]);
  const movements = useMemo(
    () => [...(data.inventoryMovements || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );

  const lowStockItems = useMemo(
    () => valuation.filter((r) => r.product.reorderPoint != null && r.quantity <= r.product.reorderPoint!),
    [valuation],
  );

  function openNewProduct() {
    setEditingProduct(null);
    setProductForm(blankProduct());
    setProductModal(true);
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p);
    setProductForm({ name: p.name, sku: p.sku || '', unitOfMeasure: p.unitOfMeasure || 'unit', costPrice: p.costPrice, sellPrice: p.sellPrice, reorderPoint: p.reorderPoint });
    setProductModal(true);
  }

  async function saveProduct() {
    if (!productForm.name.trim()) return;
    const products = data.products || [];
    if (editingProduct) {
      const product = { ...editingProduct, ...productForm };
      if (onSaveProduct) {
        await onSaveProduct(product, 'update');
      } else {
        onDataChange({ ...data, products: products.map((p) => p.id === editingProduct.id ? product : p) });
      }
    } else {
      const product = { ...productForm, id: uid() };
      if (onSaveProduct) {
        await onSaveProduct(product, 'create');
      } else {
        onDataChange({ ...data, products: [...products, product] });
      }
    }
    setProductModal(false);
  }

  async function archiveProduct(productId: string) {
    if (onArchiveProduct) {
      await onArchiveProduct(productId);
    } else {
      onDataChange({ ...data, products: (data.products || []).map((p) => p.id === productId ? { ...p, archivedAt: new Date().toISOString() } : p) });
    }
  }

  function openAddMovement(productId: string) {
    setMovementProductId(productId);
    setMovementError(null);
    const product = (data.products || []).find((p) => p.id === productId);
    setMovForm({ ...blankMovement(productId), unitCost: product?.costPrice || 0 });
    setMovementModal(true);
  }

  async function saveMovement() {
    if (!movForm.productId || movForm.quantity === 0) return;
    const movement: InventoryMovement = { ...movForm, id: uid() };
    const validation = validateInventoryMovementInput(data, movement);
    if (!validation.ok) {
      setMovementError(validation.errors.join('\n'));
      return;
    }
    if (onCreateMovement) {
      await onCreateMovement(movement);
    } else {
      onDataChange({ ...data, inventoryMovements: [...(data.inventoryMovements || []), movement] });
    }
    setMovementModal(false);
  }

  function openStockTake() {
    const counts: Record<string, string> = {};
    for (const row of valuation) {
      counts[row.product.id] = row.quantity.toFixed(2);
    }
    for (const p of activeProducts.filter((p) => !allItems.some((i) => i.productId === p.id))) {
      counts[p.id] = '0.00';
    }
    setStockTakeCounts(counts);
    setStockTakeDate(todayStr());
    setStockTakeError(null);
    setStockTakeModal(true);
  }

  async function postStockTake() {
    const allRows = [
      ...valuation.map((r) => ({ product: r.product, systemQty: r.quantity, avgCost: r.avgCost })),
      ...activeProducts
        .filter((p) => !allItems.some((i) => i.productId === p.id))
        .map((p) => ({ product: p, systemQty: 0, avgCost: p.costPrice })),
    ];

    const newMovements: InventoryMovement[] = [];
    for (const { product, systemQty, avgCost } of allRows) {
      const counted = parseFloat(stockTakeCounts[product.id] ?? '') || 0;
      const diff = Math.round((counted - systemQty) * 10000) / 10000;
      if (Math.abs(diff) < 0.0001) continue;
      const movement: InventoryMovement = {
        id: uid(),
        productId: product.id,
        date: stockTakeDate,
        type: 'adjustment',
        quantity: diff,
        unitCost: avgCost,
        memo: 'Stock take adjustment',
      };
      const validation = validateInventoryMovementInput(data, movement);
      if (!validation.ok) {
        setStockTakeError(validation.errors.join('\n'));
        return;
      }
      newMovements.push(movement);
    }

    if (newMovements.length > 0) {
      if (onCreateMovement) {
        for (const movement of newMovements) {
          await onCreateMovement(movement);
        }
      } else {
        onDataChange({ ...data, inventoryMovements: [...(data.inventoryMovements || []), ...newMovements] });
      }
    }
    setStockTakeModal(false);
  }

  const totalInventoryValue = valuation.reduce((sum, row) => sum + row.totalValue, 0);

  const stockTakeAllRows = useMemo(() => [
    ...valuation.map((r) => ({ product: r.product, systemQty: r.quantity })),
    ...activeProducts.filter((p) => !allItems.some((i) => i.productId === p.id)).map((p) => ({ product: p, systemQty: 0 })),
  ], [valuation, activeProducts, allItems]);

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
        {lowStockItems.length > 0 && (
          <div className="inv-stat inv-stat-alert">
            <span className="inv-stat-label">Low Stock</span>
            <span className="inv-stat-value">{lowStockItems.length}</span>
          </div>
        )}
      </div>

      <div className="inv-tabs">
        {(['stock', 'products', 'movements', 'orders'] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'stock' ? 'Stock Levels' : t === 'products' ? 'Products' : t === 'movements' ? 'Movements' : 'Purchase Orders'}
          </button>
        ))}
        {canWrite && tab === 'stock' && activeProducts.length > 0 && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openStockTake}>Stock Take</button>
        )}
        {canWrite && tab === 'products' && (
          <button className="top-add" style={{ marginLeft: 'auto' }} onClick={openNewProduct}>+ Add Product</button>
        )}
      </div>

      {tab === 'stock' && (
        <>
          {lowStockItems.length > 0 && (
            <div className="low-stock-banner">
              ⚠ {lowStockItems.length} product{lowStockItems.length > 1 ? 's' : ''} below reorder point:{' '}
              {lowStockItems.map((r) => r.product.name).join(', ')}
            </div>
          )}
          <table className="ledger-table">
            <thead>
              <tr><th>Product</th><th>SKU</th><th>Unit</th><th className="num">Qty on Hand</th><th className="num">Reorder Point</th><th className="num">Avg Cost</th><th className="num">Total Value</th><th></th></tr>
            </thead>
            <tbody>
              {valuation.length === 0 && activeProducts.length === 0 && (
                <tr><td colSpan={8} className="empty-row">No stock on hand. Add products and record purchase movements to get started.</td></tr>
              )}
              {valuation.map((row) => {
                const isLow = row.product.reorderPoint != null && row.quantity <= row.product.reorderPoint!;
                return (
                  <tr key={row.product.id} className={isLow ? 'low-stock-row' : ''}>
                    <td>{row.product.name}{isLow && <span className="low-stock-badge">Low</span>}</td>
                    <td className="muted">{row.product.sku || '—'}</td>
                    <td className="muted">{row.product.unitOfMeasure || 'unit'}</td>
                    <td className="num">{row.quantity.toFixed(2)}</td>
                    <td className="num muted">{row.product.reorderPoint != null ? row.product.reorderPoint : '—'}</td>
                    <td className="num">{fmtMoney(row.avgCost)}</td>
                    <td className="num">{fmtMoney(row.totalValue)}</td>
                    <td>
                      {canWrite && (
                        <button className="btn-link" onClick={() => openAddMovement(row.product.id)}>+ Movement</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {activeProducts.filter((p) => !allItems.some((i) => i.productId === p.id)).map((p) => (
                <tr key={p.id} className="muted">
                  <td>{p.name}</td>
                  <td className="muted">{p.sku || '—'}</td>
                  <td className="muted">{p.unitOfMeasure || 'unit'}</td>
                  <td className="num">0.00</td>
                  <td className="num muted">{p.reorderPoint != null ? p.reorderPoint : '—'}</td>
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
        </>
      )}

      {tab === 'products' && (
        <table className="ledger-table">
          <thead>
            <tr><th>Name</th><th>SKU</th><th>Unit</th><th className="num">Cost Price</th><th className="num">Sell Price</th><th className="num">Reorder Point</th><th></th></tr>
          </thead>
          <tbody>
            {activeProducts.length === 0 && (
              <tr><td colSpan={7} className="empty-row">No products yet. Click "+ Add Product" to create one.</td></tr>
            )}
            {activeProducts.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.sku || '—'}</td>
                <td className="muted">{p.unitOfMeasure || 'unit'}</td>
                <td className="num">{fmtMoney(p.costPrice)}</td>
                <td className="num">{fmtMoney(p.sellPrice)}</td>
                <td className="num muted">{p.reorderPoint != null ? p.reorderPoint : '—'}</td>
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

      {tab === 'orders' && (
        <PurchaseOrders
          data={data}
          onDataChange={onDataChange}
          canWrite={canWrite}
          onCreatePurchaseOrder={onCreatePurchaseOrder}
          onMarkPurchaseOrderSent={onMarkPurchaseOrderSent}
          onCancelPurchaseOrder={onCancelPurchaseOrder}
          onReceivePurchaseOrder={onReceivePurchaseOrder}
          onCreateBillFromPO={onCreateBillFromPO}
        />
      )}

      {productModal && (
        <Modal title={editingProduct ? 'Edit Product' : 'New Product'} open={productModal} onClose={() => setProductModal(false)}>
          <div className="form-grid">
            <label>Name *<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} autoFocus /></label>
            <label>SKU<input value={productForm.sku || ''} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} /></label>
            <label>Unit of Measure<input value={productForm.unitOfMeasure || ''} onChange={(e) => setProductForm({ ...productForm, unitOfMeasure: e.target.value })} placeholder="e.g. unit, kg, hr" /></label>
            <label>Cost Price<input type="number" step="0.01" min="0" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: parseFloat(e.target.value) || 0 })} /></label>
            <label>Sell Price<input type="number" step="0.01" min="0" value={productForm.sellPrice} onChange={(e) => setProductForm({ ...productForm, sellPrice: parseFloat(e.target.value) || 0 })} /></label>
            <label>Reorder Point<input type="number" step="1" min="0" value={productForm.reorderPoint ?? ''} placeholder="Optional — alert when stock falls to this level" onChange={(e) => setProductForm({ ...productForm, reorderPoint: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })} /></label>
          </div>
          <div className="modal-actions">
            <button onClick={() => setProductModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveProduct} disabled={!productForm.name.trim()}>Save</button>
          </div>
        </Modal>
      )}

      {movementModal && (
        <Modal title="Add Movement" open={movementModal} onClose={() => setMovementModal(false)}>
          {movementError ? <p className="lock-error">{movementError}</p> : null}
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

      {stockTakeModal && (
        <Modal title="Stock Take" open={stockTakeModal} onClose={() => setStockTakeModal(false)}>
          {stockTakeError ? <p className="lock-error">{stockTakeError}</p> : null}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>Count Date</span>
              <input type="date" value={stockTakeDate} onChange={(e) => setStockTakeDate(e.target.value)} style={{ flex: 1 }} />
            </label>
          </div>
          <table className="ledger-table">
            <thead>
              <tr><th>Product</th><th className="num">System Qty</th><th className="num">Counted Qty</th><th className="num">Difference</th></tr>
            </thead>
            <tbody>
              {stockTakeAllRows.map(({ product, systemQty }) => {
                const counted = parseFloat(stockTakeCounts[product.id] ?? '') || 0;
                const diff = Math.round((counted - systemQty) * 10000) / 10000;
                return (
                  <tr key={product.id} className={diff !== 0 ? 'stock-take-diff' : ''}>
                    <td>{product.name}</td>
                    <td className="num">{systemQty.toFixed(2)}</td>
                    <td className="num">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="stock-take-input"
                        value={stockTakeCounts[product.id] ?? ''}
                        onChange={(e) => setStockTakeCounts({ ...stockTakeCounts, [product.id]: e.target.value })}
                      />
                    </td>
                    <td className={`num ${diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'muted'}`}>
                      {diff === 0 ? '—' : diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="form-hint">Only products with a difference will generate adjustment movements.</p>
          <div className="modal-actions">
            <button onClick={() => setStockTakeModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={postStockTake}>Post Stock Take</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
