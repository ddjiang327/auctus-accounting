-- Atomic period-lock clear workflow.
-- Scope: clear all period locks for a business and write the matching audit record in one transaction.

create or replace function public.clear_period_locks_with_audit(
  target_business_id uuid,
  actor_user_id uuid,
  previous_latest_lock date,
  cleared_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.period_locks
  where business_id = target_business_id;

  insert into public.audit_log (
    business_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    detail,
    metadata
  )
  values (
    target_business_id,
    actor_user_id,
    'unlock',
    'period',
    'all',
    'Cleared all accounting period locks (through ' || previous_latest_lock::text || ')',
    jsonb_build_object(
      'clearedCount', cleared_count,
      'previousLatestLock', previous_latest_lock
    )
  );
end;
$$;
