import { uid } from './formatting.js';

export function auditEntry(action: string, entityType: string, entityId: string, detail: string) {
  return { id: uid('audit_'), action, entityType, entityId, detail, date: new Date().toISOString() };
}
