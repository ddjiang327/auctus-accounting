import { useMemo, useState } from 'react';
import { fmtMoney, todayStr, uid } from '../../domain/accounting';
import { Modal } from '../../components/Modal';
import type { InventoryMovement, LedgerData, POLine, POStatus, Product, PurchaseOrder } from '../../domain/models';

interface Props {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
}

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft', sent: 'Sent', received: 'Received', cancelled: 'Cancelled',
};
const STATUS_BADGE: Record<POStatus, string> = {
  draft: 'adjustment', sent: 'purchase', received: 'sale', cancelled: 'muted',
};

function blankLine(products: Product[]): POLine {
  return { productId: products[0]?.id || '', orderedQty: 1, unitCost: products[0]?.costPrice || 0, receivedQty: 0 };
}

function poTotal(po: PurchaseOrder) {
  return po.lines.reduce((s, l) => s + l.orderedQty * l.unitCost, 0);
}

export function PurchaseOrders({ data, onDataChange, canWrite = true }: Props) {
  const [createModal, setCreateModal] = useState(false);
  const [receiveModal, setReceiveModal] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<number, string>>({});

  const [form, setForm] = useState<Omit<PurchaseOrder, 'id' | 'status' | 'receivedAt'>>({
    date: todayStr(), expectedDate: '', supplierId: '', supplierName: '', memo: '', lines: [],
  });

  const orders = useMemo(
    () => [...(data.purchaseOrders || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );
  const activeProducts = useMemo(
    () => (data.products || []).filter((p) => !p.archivedAt),
    [data],
  );
  const suppliers = useMemo(
    () => (data.contacts || []).filter((c) => !c.archivedAt && (c.type === 'supplier' || c.type === 'both')),
    [data],
  );

  function openCreate() {
    const firstLine = activeProducts.length ? [blankLine(activeProducts)] : [];
    setForm({ date: todayStr(), expectedDate: '', supplierId: '', supplierName: '', memo: '', lines: firstLine });
    setCreateModal(true);
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, blankLine(activeProducts)] });
  }

  function removeLine(i: number) {
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) });
  }

  function updateLine(i: number, patch: Partial<POLine>) {
    const lines = form.lines.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, ...patch };
      if (patch.productId) {
        const prod = activeProducts.find((p) => p.id === patch.productId);
        if (prod) updated.unitCost = prod.costPrice;
      }
      return updated;
    });
    setForm({ ...form, lines });
  }

  function saveCreate() {
    if (!form.lines.length) return;
    const supplierContact = suppliers.find((c) => c.id === form.supplierId);
    const po: PurchaseOrder = {
      ...form,
      id: uid(),
      status: 'draft',
      supplierName: form.supplierId ? supplierContact?.name : form.supplierName,
    };
    onDataChange({ ...data, purchaseOrders: [...(data.purchaseOrders || []), po] });
    setCreateModal(false);
  }

  function markSent(po: PurchaseOrder) {
    onDataChange({
      ...data,
      purchaseOrders: (data.purchaseOrders || []).map((p) =>
        p.id === po.id ? { ...p, status: 'sent' } : p,
      ),
    });
  }

  function cancelPO(po: PurchaseOrder) {
    onDataChange({
      ...data,
      purchaseOrders: (data.purchaseOrders || []).map((p) =>
        p.id === po.id ? { ...p, status: 'cancelled' } : p,
      ),
    });
  }

  function openReceive(po: PurchaseOrder) {
    const qtys: Record<number, string> = {};
    po.lines.forEach((l, i) => {
      const remaining = l.orderedQty - (l.receivedQty || 0);
      qtys[i] = remaining > 0 ? String(remaining) : '0';
    });
    setReceiveQtys(qtys);
    setReceiveModal(po);
  }

  function confirmReceive() {
    if (!receiveModal) return;
    const today = todayStr();
    const newMovements: InventoryMovement[] = [];
    const updatedLines = receiveModal.lines.map((l, i) => {
      const qty = parseFloat(receiveQtys[i] ?? '0') || 0;
      if (qty > 0) {
        newMovements.push({
          id: uid(),
          productId: l.productId,
          date: today,
          type: 'purchase',
          quantity: qty,
          unitCost: l.unitCost,
          memo: `PO received${receiveModal.supplierName ? ' from ' + receiveModal.supplierName : ''}`,
        });
      }
      return { ...l, receivedQty: (l.receivedQty || 0) + qty };
    });

    const allReceived = updatedLines.every((l) => l.receivedQty >= l.orderedQty);
    onDataChange({
      ...data,
      inventoryMovements: [...(data.inventoryMovements || []), ...newMovements],
      purchaseOrders: (data.purchaseOrders || []).map((p) =>
        p.id === receiveModal.id
          ? { ...p, lines: updatedLines, status: allReceived ? 'received' : 'sent', receivedAt: allReceived ? new Date().toISOString() : undefined }
          : p,
      ),
    });
    setReceiveModal(null);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canWrite && activeProducts.length > 0 && (
          <button className="btn-primary" onClick={openCreate}>+ New Purchase Order</button>
        )}
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th><th>Supplier</th><th className="num">Lines</th>
            <th className="num">Total</th><th>Expected</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 && (
            <tr><td colSpan={7} className="empty-row">No purchase orders yet. Click "+ New Purchase Order" to create one.</td></tr>
          )}
          {orders.map((po) => (
            <tr key={po.id}>
              <td>{po.date}</td>
              <td>{po.supplierName || <span className="muted">—</span>}</td>
              <td className="num">{po.lines.length}</td>
              <td className="num">{fmtMoney(poTotal(po))}</td>
              <td className="muted">{po.expectedDate || '—'}</td>
              <td><span className={`badge badge-${STATUS_BADGE[po.status]}`}>{STATUS_LABEL[po.status]}</span></td>
              <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                {canWrite && po.status === 'draft' && (
                  <button className="btn-link" onClick={() => markSent(po)}>Mark Sent</button>
                )}
                {canWrite && po.status === 'sent' && (
                  <button className="btn-link" onClick={() => openReceive(po)}>Receive</button>
                )}
                {canWrite && (po.status === 'draft' || po.status === 'sent') && (
                  <button className="btn-link text-danger" onClick={() => cancelPO(po)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {createModal && (
        <Modal title="New Purchase Order" open={createModal} onClose={() => setCreateModal(false)}>
          <div className="form-grid">
            <label>Order Date *
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>Expected Delivery
              <input type="date" value={form.expectedDate || ''} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
            </label>
            {suppliers.length > 0 ? (
              <label>Supplier
                <select value={form.supplierId || ''} onChange={(e) => setForm({ ...form, supplierId: e.target.value, supplierName: '' })}>
                  <option value="">— Select or type below —</option>
                  {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : null}
            {!form.supplierId && (
              <label>Supplier Name
                <input value={form.supplierName || ''} placeholder="Free-text supplier name" onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
              </label>
            )}
            <label style={{ gridColumn: '1 / -1' }}>Memo
              <input value={form.memo || ''} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </label>
          </div>

          <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 13 }}>Lines</div>
          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select value={l.productId} onChange={(e) => updateLine(i, { productId: e.target.value })}>
                {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Qty" value={l.orderedQty} onChange={(e) => updateLine(i, { orderedQty: parseFloat(e.target.value) || 0 })} />
              <input type="number" min="0" step="0.01" placeholder="Unit cost" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })} />
              <button className="btn-link text-danger" onClick={() => removeLine(i)} style={{ padding: '0 4px' }}>✕</button>
            </div>
          ))}
          <button className="btn-link" onClick={addLine}>+ Add line</button>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveCreate} disabled={!form.lines.length}>Create PO</button>
          </div>
        </Modal>
      )}

      {receiveModal && (
        <Modal title="Receive Stock" open={!!receiveModal} onClose={() => setReceiveModal(null)}>
          <p style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
            Enter quantities received. Each line creates an inventory movement.
          </p>
          <table className="ledger-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Product</th><th className="num">Ordered</th><th className="num">Prev. Received</th><th className="num">Receive Now</th><th className="num">Unit Cost</th></tr>
            </thead>
            <tbody>
              {receiveModal.lines.map((l, i) => {
                const product = (data.products || []).find((p) => p.id === l.productId);
                const remaining = l.orderedQty - (l.receivedQty || 0);
                return (
                  <tr key={i}>
                    <td>{product?.name || l.productId}</td>
                    <td className="num">{l.orderedQty}</td>
                    <td className="num muted">{l.receivedQty || 0}</td>
                    <td className="num">
                      <input
                        type="number" min="0" step="0.01"
                        style={{ width: 80, textAlign: 'right' }}
                        value={receiveQtys[i] ?? ''}
                        max={remaining}
                        onChange={(e) => setReceiveQtys({ ...receiveQtys, [i]: e.target.value })}
                      />
                    </td>
                    <td className="num muted">{fmtMoney(l.unitCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="modal-actions">
            <button onClick={() => setReceiveModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={confirmReceive}>Confirm Receipt</button>
          </div>
        </Modal>
      )}
    </>
  );
}
