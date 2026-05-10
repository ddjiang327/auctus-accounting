-- Harden direct authenticated workspace writes before trial use.
--
-- The API uses the service-role client and enforces membership, role guards,
-- validation, and audit logging itself. Authenticated web/mobile clients should
-- keep direct Supabase read access for joined workspaces, but should not be able
-- to mutate workspace, membership, or settings rows outside the API.

drop policy if exists businesses_update_admin on public.businesses;
drop policy if exists business_members_insert_admin on public.business_members;
drop policy if exists business_members_update_admin on public.business_members;
drop policy if exists business_members_delete_admin on public.business_members;
drop policy if exists business_settings_insert_admin on public.business_settings;
drop policy if exists business_settings_update_admin on public.business_settings;
