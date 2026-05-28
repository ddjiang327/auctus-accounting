import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { chartAccountName, fmtMoney, todayStr, uid } from '../../domain/accounting';
import type { DepreciationMethod, DepreciationRun, FixedAsset, LedgerData, ManualJournal } from '../../domain/models';

interface FixedAssetsProps {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  canWrite?: boolean;
}

function bookValue(asset: FixedAsset, runs: DepreciationRun[]): number {
  const accumulated = runs
    .filter((r) => r.assetId === asset.id)
    .reduce((s, r) => s + r.amount, 0);
  return asset.cost - accumulated;
}

function annualDepreciation(asset: FixedAsset, currentBookValue: number): number {
  if (asset.method === 'straight_line') {
    return (asset.cost - asset.residualValue) / Math.max(asset.usefulLifeYears, 1);
  }
  return currentBookValue * asset.depreciationRate;
}

export function FixedAssets({ data, onDataChange, canWrite = true }: FixedAssetsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [depreciateAsset, setDepreciateAsset] = useState<FixedAsset | null>(null);

  const assets = data.fixedAssets || [];
  const runs = data.depreciationRuns || [];
  const activeAssets = assets.filter((a) => !a.disposedAt);
  const totalCost = activeAssets.reduce((s, a) => s + a.cost, 0);
  const totalAccum = activeAssets.reduce((s, a) => s + (a.cost - bookValue(a, runs)), 0);
  const totalBook = totalCost - totalAccum;

  function saveAsset(asset: FixedAsset) {
    const fixedAssets = assets.some((a) => a.id === asset.id)
      ? assets.map((a) => a.id === asset.id ? asset : a)
      : [...assets, asset];
    onDataChange({ ...data, fixedAssets });
    setModalOpen(false);
    setEditingAsset(null);
  }

  function disposeAsset(asset: FixedAsset) {
    const fixedAssets = assets.map((a) => a.id === asset.id ? { ...a, disposedAt: todayStr() } : a);
    onDataChange({ ...data, fixedAssets });
  }

  function postDepreciation(asset: FixedAsset, date: string, amount: number) {
    const journalId = uid('mj_dep_');
    const journal: ManualJournal = {
      id: journalId,
      date,
      memo: `Depreciation — ${asset.name}`,
      lines: [
        { chartAccountId: asset.depExpChartAccountId, debit: amount, credit: 0 },
        { chartAccountId: asset.accumDepChartAccountId, debit: 0, credit: amount },
      ],
      createdAt: new Date().toISOString(),
    };
    const run: DepreciationRun = {
      id: uid('dep_'),
      assetId: asset.id,
      date,
      amount,
      journalId,
      createdAt: new Date().toISOString(),
    };
    onDataChange({
      ...data,
      manualJournals: [...(data.manualJournals || []), journal],
      depreciationRuns: [...(data.depreciationRuns || []), run],
    });
    setDepreciateAsset(null);
  }

  return (
    <section className="view">
      <header className="large-header split-header">
        <div>
          <h1>Fixed Assets</h1>
          <p>Asset register and depreciation schedule</p>
        </div>
        {canWrite ? <button className="primary" onClick={() => { setEditingAsset(null); setModalOpen(true); }}>Add Asset</button> : null}
      </header>

      <div className="stats-grid three">
        <div className="stat-card"><span>Total Cost</span><strong>{fmtMoney(totalCost)}</strong></div>
        <div className="stat-card"><span>Accumulated Depreciation</span><strong className="expense">{fmtMoney(totalAccum)}</strong></div>
        <div className="stat-card"><span>Net Book Value</span><strong>{fmtMoney(totalBook)}</strong></div>
      </div>

      <div className="asset-table-wrap">
        <table className="asset-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Cost</th>
              <th className="num">Accum. Dep.</th>
              <th className="num">Book Value</th>
              <th>Method</th>
              <th>Last Dep.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr><td colSpan={7} className="empty-cell">No assets registered</td></tr>
            ) : assets.map((asset) => {
              const bv = bookValue(asset, runs);
              const accumulated = asset.cost - bv;
              const assetRuns = runs.filter((r) => r.assetId === asset.id).sort((a, b) => b.date.localeCompare(a.date));
              const lastRun = assetRuns[0];
              const isDisposed = !!asset.disposedAt;
              const annualDep = annualDepreciation(asset, bv);
              return (
                <tr key={asset.id} className={isDisposed ? 'asset-row-disposed' : ''}>
                  <td>
                    <div className="asset-name">{asset.name}</div>
                    <div className="asset-meta">{asset.purchaseDate} · {chartAccountName(data, asset.assetChartAccountId)}</div>
                  </td>
                  <td className="num">{fmtMoney(asset.cost)}</td>
                  <td className="num expense">{accumulated > 0.005 ? `(${fmtMoney(accumulated)})` : '---'}</td>
                  <td className="num"><strong>{fmtMoney(Math.max(bv, 0))}</strong></td>
                  <td>
                    <span className="asset-method-badge">
                      {asset.method === 'straight_line'
                        ? `SL · ${asset.usefulLifeYears}yr`
                        : `DV · ${(asset.depreciationRate * 100).toFixed(0)}%`}
                    </span>
                    <div className="asset-annual">{fmtMoney(annualDep)}/yr</div>
                  </td>
                  <td className="asset-last-run">{lastRun ? lastRun.date : '---'}</td>
                  <td>
                    <div className="row-actions">
                      {canWrite && !isDisposed ? (
                        <>
                          <button onClick={() => setDepreciateAsset(asset)}>Depreciate</button>
                          <button onClick={() => { setEditingAsset(asset); setModalOpen(true); }}>Edit</button>
                          <button className="danger-action" onClick={() => disposeAsset(asset)}>Dispose</button>
                        </>
                      ) : isDisposed ? <span className="muted">Disposed {asset.disposedAt}</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {runs.length > 0 && (
        <div className="report-card wide-card" style={{ marginTop: 24 }}>
          <h3>Depreciation History</h3>
          <div className="report-table">
            {[...runs].sort((a, b) => b.date.localeCompare(a.date)).map((run) => {
              const asset = assets.find((a) => a.id === run.assetId);
              return (
                <div key={run.id} className="report-row">
                  <span>{run.date} · {asset?.name || run.assetId}</span>
                  <b className="expense">({fmtMoney(run.amount)})</b>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canWrite && (
        <>
          <AssetModal
            open={modalOpen}
            data={data}
            asset={editingAsset}
            onClose={() => { setModalOpen(false); setEditingAsset(null); }}
            onSave={saveAsset}
          />
          <DepreciateModal
            asset={depreciateAsset}
            runs={runs}
            onClose={() => setDepreciateAsset(null)}
            onPost={postDepreciation}
          />
        </>
      )}
    </section>
  );
}

function AssetModal({ open, data, asset, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  asset: FixedAsset | null;
  onClose: () => void;
  onSave: (asset: FixedAsset) => void;
}) {
  const [name, setName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [cost, setCost] = useState('');
  const [residualValue, setResidualValue] = useState('0');
  const [method, setMethod] = useState<DepreciationMethod>('straight_line');
  const [usefulLifeYears, setUsefulLifeYears] = useState('5');
  const [depreciationRate, setDepreciationRate] = useState('20');
  const [assetChartAccountId, setAssetChartAccountId] = useState('');
  const [accumDepChartAccountId, setAccumDepChartAccountId] = useState('');
  const [depExpChartAccountId, setDepExpChartAccountId] = useState('');

  const assetAccounts = data.chartOfAccounts.filter((a) => a.class === 'asset');
  const expenseAccounts = data.chartOfAccounts.filter((a) => a.class === 'expense');

  useEffect(() => {
    if (!open) return;
    setName(asset?.name || '');
    setPurchaseDate(asset?.purchaseDate || todayStr());
    setCost(asset ? String(asset.cost) : '');
    setResidualValue(asset ? String(asset.residualValue) : '0');
    setMethod(asset?.method || 'straight_line');
    setUsefulLifeYears(asset ? String(asset.usefulLifeYears) : '5');
    setDepreciationRate(asset ? String(asset.depreciationRate * 100) : '20');
    setAssetChartAccountId(asset?.assetChartAccountId || assetAccounts[0]?.id || '');
    setAccumDepChartAccountId(asset?.accumDepChartAccountId || assetAccounts.find((a) => a.isContra)?.id || assetAccounts[0]?.id || '');
    setDepExpChartAccountId(asset?.depExpChartAccountId || expenseAccounts[0]?.id || '');
  }, [open, asset, assetAccounts, expenseAccounts]);

  function submit() {
    if (!name.trim() || !cost || !assetChartAccountId || !accumDepChartAccountId || !depExpChartAccountId) return;
    onSave({
      id: asset?.id || uid('fa_'),
      name: name.trim(),
      purchaseDate,
      cost: Number(cost) || 0,
      residualValue: Number(residualValue) || 0,
      method,
      usefulLifeYears: Number(usefulLifeYears) || 5,
      depreciationRate: (Number(depreciationRate) || 20) / 100,
      assetChartAccountId,
      accumDepChartAccountId,
      depExpChartAccountId,
      disposedAt: asset?.disposedAt,
      createdAt: asset?.createdAt || new Date().toISOString(),
    });
  }

  return (
    <Modal
      open={open}
      title={asset ? 'Edit Asset' : 'Add Fixed Asset'}
      onClose={onClose}
      footer={<button className="primary wide" onClick={submit}>{asset ? 'Save Asset' : 'Add Asset'}</button>}
    >
      <div className="form-card">
        <label>Asset Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Equipment" /></label>
        <label>Purchase Date <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></label>
        <label>Cost <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label>Residual Value <input type="number" min="0" step="0.01" value={residualValue} onChange={(e) => setResidualValue(e.target.value)} /></label>
        <label>Method
          <select value={method} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}>
            <option value="straight_line">Straight Line</option>
            <option value="diminishing_value">Diminishing Value</option>
          </select>
        </label>
        {method === 'straight_line' ? (
          <label>Useful Life (years) <input type="number" min="1" step="1" value={usefulLifeYears} onChange={(e) => setUsefulLifeYears(e.target.value)} /></label>
        ) : (
          <label>Annual Rate (%) <input type="number" min="1" max="100" step="1" value={depreciationRate} onChange={(e) => setDepreciationRate(e.target.value)} /></label>
        )}
        <label>Asset Account
          <select value={assetChartAccountId} onChange={(e) => setAssetChartAccountId(e.target.value)}>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <label>Accum. Depreciation Account
          <select value={accumDepChartAccountId} onChange={(e) => setAccumDepChartAccountId(e.target.value)}>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <label>Depreciation Expense Account
          <select value={depExpChartAccountId} onChange={(e) => setDepExpChartAccountId(e.target.value)}>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  );
}

function DepreciateModal({ asset, runs, onClose, onPost }: {
  asset: FixedAsset | null;
  runs: DepreciationRun[];
  onClose: () => void;
  onPost: (asset: FixedAsset, date: string, amount: number) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (asset) { setDate(todayStr()); setCustomAmount(''); setUseCustom(false); }
  }, [asset]);

  if (!asset) return null;

  const bv = bookValue(asset, runs);
  const calculated = annualDepreciation(asset, bv);
  const amount = useCustom ? (Number(customAmount) || 0) : calculated;
  const remaining = Math.max(bv - asset.residualValue, 0);

  return (
    <Modal
      open={!!asset}
      title={`Depreciate -- ${asset.name}`}
      onClose={onClose}
      footer={
        <button
          className="primary wide"
          onClick={() => amount > 0 && onPost(asset, date, Math.min(amount, remaining))}
          disabled={amount <= 0 || remaining < 0.005}
        >
          Post Depreciation Entry
        </button>
      }
    >
      <div className="form-card">
        <div className="dep-summary">
          <div><span>Current Book Value</span><strong>{fmtMoney(bv)}</strong></div>
          <div><span>Residual Value</span><strong>{fmtMoney(asset.residualValue)}</strong></div>
          <div><span>Remaining Depreciable</span><strong>{fmtMoney(remaining)}</strong></div>
          <div><span>Calculated Annual Dep.</span><strong className="expense">{fmtMoney(calculated)}</strong></div>
        </div>
        <label>Depreciation Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="dep-custom-toggle">
          <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
          <span>Override amount</span>
        </label>
        {useCustom && (
          <label>Amount <input type="number" min="0" step="0.01" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} /></label>
        )}
        <div className="dep-posting-preview">
          <strong>Will post:</strong>
          <div>Dr Depreciation Expense {fmtMoney(Math.min(amount, remaining))}</div>
          <div>Cr Accum. Depreciation {fmtMoney(Math.min(amount, remaining))}</div>
        </div>
      </div>
    </Modal>
  );
}
