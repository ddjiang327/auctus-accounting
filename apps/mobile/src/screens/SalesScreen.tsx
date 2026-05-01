import { Header, Screen } from '../components/ui';
import { InvoiceWorkspace, type CreditNoteAllocation, type PaymentAllocation } from '../components/InvoiceList';
import type { Contact, LedgerData, RecurringTemplate, Transaction, TransactionType } from '../domain/models';

export function SalesScreen({ data, onEdit, onPay, onNew, onAllocate, onSaveContact, onVoid, onMarkSent, onNewCredit, onApplyCredit, onVoidPayment, onSaveRecurring, onDeleteRecurring, onToggleRecurring }: { data: LedgerData; onEdit: (tx: Transaction) => void; onPay: (tx: Transaction) => void; onNew: () => void; onAllocate: (allocations: PaymentAllocation[]) => void; onSaveContact: (contact: Contact) => void; onVoid: (tx: Transaction) => void; onMarkSent: (tx: Transaction) => void; onNewCredit: (type: Extract<TransactionType, 'income' | 'expense'>) => void; onApplyCredit: (allocations: CreditNoteAllocation[]) => void; onVoidPayment: (tx: Transaction, paymentId: string) => void; onSaveRecurring: (template: RecurringTemplate) => void; onDeleteRecurring: (templateId: string) => void; onToggleRecurring: (templateId: string) => void }) {
  return (
    <Screen>
      <Header title="Sales" subtitle="Customer invoices and receipts" />
      <InvoiceWorkspace
        data={data}
        type="income"
        title="Invoices"
        contactTitle="Customers"
        openLabel="Open Invoices"
        paidLabel="Paid"
        newLabel="New Invoice"
        onEdit={onEdit}
        onPay={onPay}
        onNew={onNew}
        onAllocate={onAllocate}
        onSaveContact={onSaveContact}
        onVoid={onVoid}
        onMarkSent={onMarkSent}
        onNewCredit={onNewCredit}
        onApplyCredit={onApplyCredit}
        onVoidPayment={onVoidPayment}
        onSaveRecurring={onSaveRecurring}
        onDeleteRecurring={onDeleteRecurring}
        onToggleRecurring={onToggleRecurring}
      />
    </Screen>
  );
}
