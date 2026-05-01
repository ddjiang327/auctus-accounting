import type { SupabaseServiceClient } from "../supabase/client.js";

export type AuditEventInput = {
  businessId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

export const recordAuditEvent = async (
  supabase: SupabaseServiceClient,
  event: AuditEventInput,
): Promise<void> => {
  const { error } = await supabase.from("audit_log").insert({
    business_id: event.businessId,
    actor_user_id: event.actorUserId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    detail: event.detail,
    metadata: event.metadata,
  });

  if (error) {
    throw error;
  }
};
