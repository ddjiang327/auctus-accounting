import type { InventoryItem, InventoryMovement, JournalEntry, LedgerData, Product } from '@auctus/shared-types';

const INVENTORY_ASSET_CODE = '1220';
const COGS_CODE = '5000';
const ADJUSTMENT_CODE = '5040';
const AP_CODE = '2000';

function chartIdByCode(data: LedgerData, code: string): string | undefined {
  return data.chartOfAccounts.find((a) => a.code === code)?.id;
}

function inventoryChartId(data: LedgerData, product: Product): string | undefined {
  return product.inventoryChartAccountId || chartIdByCode(data, INVENTORY_ASSET_CODE);
}

function cogsChartId(data: LedgerData, product: Product): string | undefined {
  return product.cogsChartAccountId || chartIdByCode(data, COGS_CODE);
}

function adjustmentChartId(data: LedgerData): string | undefined {
  return chartIdByCode(data, ADJUSTMENT_CODE);
}

function apChartId(data: LedgerData): string | undefined {
  return chartIdByCode(data, AP_CODE);
}

export function inventoryMovementJournalEntry(
  movement: InventoryMovement,
  data: LedgerData,
): JournalEntry | null {
  const product = data.products?.find((p) => p.id === movement.productId);
  if (!product) return null;

  const invId = inventoryChartId(data, product);
  if (!invId) return null;

  const totalCost = Math.abs(movement.quantity) * Math.abs(movement.unitCost);
  const memo = movement.memo || `${movement.type[0].toUpperCase() + movement.type.slice(1)}: ${product.name}`;

  if (movement.type === 'purchase') {
    const apId = apChartId(data);
    if (!apId) return null;
    return {
      id: `je_inv_${movement.id}`,
      date: movement.date,
      memo,
      sourceId: movement.id,
      lines: [
        { chartAccountId: invId, debit: totalCost, credit: 0 },
        { chartAccountId: apId, debit: 0, credit: totalCost },
      ],
    };
  }

  if (movement.type === 'sale') {
    const cogsId = cogsChartId(data, product);
    if (!cogsId) return null;
    return {
      id: `je_inv_${movement.id}`,
      date: movement.date,
      memo,
      sourceId: movement.id,
      lines: [
        { chartAccountId: cogsId, debit: totalCost, credit: 0 },
        { chartAccountId: invId, debit: 0, credit: totalCost },
      ],
    };
  }

  // adjustment
  const adjId = adjustmentChartId(data);
  if (!adjId) return null;
  const isUp = movement.quantity > 0;
  return {
    id: `je_inv_${movement.id}`,
    date: movement.date,
    memo,
    sourceId: movement.id,
    lines: isUp
      ? [{ chartAccountId: invId, debit: totalCost, credit: 0 }, { chartAccountId: adjId, debit: 0, credit: totalCost }]
      : [{ chartAccountId: adjId, debit: totalCost, credit: 0 }, { chartAccountId: invId, debit: 0, credit: totalCost }],
  };
}

export function allInventoryJournalEntries(data: LedgerData): JournalEntry[] {
  return (data.inventoryMovements || [])
    .map((m) => inventoryMovementJournalEntry(m, data))
    .filter((e): e is JournalEntry => e !== null);
}

export function computeInventoryItems(data: LedgerData): InventoryItem[] {
  const items: Record<string, InventoryItem> = {};

  for (const movement of (data.inventoryMovements || []).sort((a, b) => a.date.localeCompare(b.date))) {
    const item = items[movement.productId] ?? { productId: movement.productId, quantity: 0, avgCost: 0 };

    if (movement.type === 'purchase' && movement.quantity > 0) {
      const totalValue = item.quantity * item.avgCost + movement.quantity * movement.unitCost;
      const newQty = item.quantity + movement.quantity;
      item.avgCost = newQty > 0 ? totalValue / newQty : movement.unitCost;
      item.quantity = newQty;
    } else if (movement.type === 'sale') {
      item.quantity = Math.max(0, item.quantity - Math.abs(movement.quantity));
    } else if (movement.type === 'adjustment') {
      const delta = movement.quantity;
      if (delta > 0) {
        const totalValue = item.quantity * item.avgCost + delta * movement.unitCost;
        const newQty = item.quantity + delta;
        item.avgCost = newQty > 0 ? totalValue / newQty : movement.unitCost;
        item.quantity = newQty;
      } else {
        item.quantity = Math.max(0, item.quantity + delta);
      }
    }

    items[movement.productId] = item;
  }

  return Object.values(items);
}

export function inventoryValuation(data: LedgerData): Array<{
  product: Product;
  quantity: number;
  avgCost: number;
  totalValue: number;
}> {
  const items = computeInventoryItems(data);
  return items
    .map((item) => {
      const product = data.products?.find((p) => p.id === item.productId);
      if (!product) return null;
      return {
        product,
        quantity: item.quantity,
        avgCost: item.avgCost,
        totalValue: item.quantity * item.avgCost,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
