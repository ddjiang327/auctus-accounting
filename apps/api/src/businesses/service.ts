import type { SupabaseServiceClient } from "../supabase/client.js";
import { AccountingSeedError, seedAccountingFoundation } from "../ledger/seed.js";
import { recordAuditEvent } from "../audit/service.js";

export type CreateBusinessInput = {
  name: string;
};

export type CreatedBusiness = {
  id: string;
  name: string;
  currency: string;
  locale: string;
};

export type BusinessSummary = {
  id: string;
  name: string;
  currency: string;
  locale: string;
  role: "owner" | "admin" | "bookkeeper" | "viewer";
  settings: {
    gstEnabled: boolean;
    basBasis: "cash" | "accrual";
  } | null;
};

export type UpdatedBusinessProfile = {
  id: string;
  name: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUri?: string;
  logoText?: string;
  paymentInstructions?: string;
  invoiceFooter?: string;
};

export type UpdatedBusinessSettings = {
  gstEnabled: boolean;
  gstRate: number;
  basBasis: "cash" | "accrual";
  invoicePrefix: string;
  billPrefix: string;
  creditNotePrefix: string;
  supplierCreditPrefix: string;
  receiptPrefix: string;
  nextInvoiceNumber: number;
  nextBillNumber: number;
  nextCreditNoteNumber: number;
  nextSupplierCreditNumber: number;
  nextReceiptNumber: number;
};

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const adminRoles = new Set(["owner", "admin"]);
const basBases = new Set(["cash", "accrual"]);

const normalizeBusinessName = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_business_name", "Business name is required.");
  }

  const name = value.trim();
  if (name.length < 2 || name.length > 120) {
    throw new ApiError(400, "invalid_business_name", "Business name must be 2-120 characters.");
  }

  return name;
};

const ensureObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const readString = (
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  required = false,
): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ApiError(400, "invalid_business_update", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_business_update", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new ApiError(400, "invalid_business_update", `${key} is required.`);
    }
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_business_update", `${key} is too long.`);
  }
  return trimmed;
};

const readBoolean = (body: Record<string, unknown>, key: string): boolean | undefined => {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_business_settings", `${key} must be a boolean.`);
  }
  return value;
};

const readNumber = (body: Record<string, unknown>, key: string): number | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ApiError(400, "invalid_business_settings", `${key} must be a number.`);
  }
  return number;
};

const readPositiveInteger = (body: Record<string, unknown>, key: string): number | undefined => {
  const number = readNumber(body, key);
  if (number === undefined) {
    return undefined;
  }
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, "invalid_business_settings", `${key} must be a positive integer.`);
  }
  return number;
};

const requireAdminRole = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<void> => {
  const { data, error } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "business_permission_check_failed", error.message);
  }

  const role = (data as { role?: string } | null)?.role;
  if (!role || !adminRoles.has(role)) {
    throw new ApiError(403, "forbidden", "Only owners and admins can update business settings.");
  }
};

export const parseCreateBusinessInput = (body: unknown): CreateBusinessInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }

  return {
    name: normalizeBusinessName((body as { name?: unknown }).name),
  };
};

export const createBusinessWorkspace = async (
  supabase: SupabaseServiceClient,
  user: { id: string; email: string },
  input: CreateBusinessInput,
): Promise<CreatedBusiness> => {
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
  });

  if (profileError) {
    throw new ApiError(500, "profile_upsert_failed", profileError.message);
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name: input.name,
    })
    .select("id,name,currency,locale")
    .single();

  if (businessError || !business) {
    throw new ApiError(500, "business_create_failed", businessError?.message ?? "No business returned.");
  }

  try {
    const { error: memberError } = await supabase.from("business_members").insert({
      business_id: business.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      throw new ApiError(500, "business_member_create_failed", memberError.message);
    }

    const { error: settingsError } = await supabase.from("business_settings").insert({
      business_id: business.id,
    });

    if (settingsError) {
      throw new ApiError(500, "business_settings_create_failed", settingsError.message);
    }

    await seedAccountingFoundation(supabase, business.id);
  } catch (error) {
    await supabase.from("businesses").delete().eq("id", business.id);
    if (error instanceof AccountingSeedError) {
      throw new ApiError(500, error.code, error.message);
    }
    throw error;
  }

  return business;
};

type BusinessMemberRow = {
  role: BusinessSummary["role"];
  businesses:
    | {
        id: string;
        name: string;
        currency: string;
        locale: string;
      }
    | null;
};

type BusinessSettingsRow = {
  business_id: string;
  gst_enabled: boolean;
  bas_basis: "cash" | "accrual";
};

export const listBusinessWorkspaces = async (
  supabase: SupabaseServiceClient,
  userId: string,
): Promise<BusinessSummary[]> => {
  const { data, error } = await supabase
    .from("business_members")
    .select(
      `
        role,
        businesses:business_id (
          id,
          name,
          currency,
          locale
        )
      `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "business_list_failed", error.message);
  }

  const membershipRows = ((data ?? []) as unknown as BusinessMemberRow[]).filter((row) => row.businesses);
  const businessIds = membershipRows.map((row) => row.businesses?.id).filter((id): id is string => Boolean(id));

  const { data: settingsRows, error: settingsError } = await supabase
    .from("business_settings")
    .select("business_id,gst_enabled,bas_basis")
    .in("business_id", businessIds);

  if (settingsError) {
    throw new ApiError(500, "business_list_failed", settingsError.message);
  }

  const settingsByBusinessId = new Map(
    ((settingsRows ?? []) as unknown as BusinessSettingsRow[]).map((settings) => [settings.business_id, settings]),
  );

  return membershipRows.map((row) => {
    const business = row.businesses;
    if (!business) {
      throw new ApiError(500, "business_list_failed", "Business membership is missing business data.");
    }

    const settings = settingsByBusinessId.get(business.id) ?? null;

    return {
      id: business.id,
      name: business.name,
      currency: business.currency,
      locale: business.locale,
      role: row.role,
      settings: settings
        ? {
            gstEnabled: settings.gst_enabled,
            basBasis: settings.bas_basis,
          }
        : null,
    };
  });
};

export const updateBusinessProfile = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<UpdatedBusinessProfile> => {
  await requireAdminRole(supabase, userId, businessId);
  const input = ensureObject(body);
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = normalizeBusinessName(input.name);
  if (input.abn !== undefined) update.abn = readString(input, "abn", 40);
  if (input.email !== undefined) update.email = readString(input, "email", 254);
  if (input.phone !== undefined) update.phone = readString(input, "phone", 60);
  if (input.address !== undefined) update.address = readString(input, "address", 1000);
  if (input.logoUri !== undefined) update.logo_uri = readString(input, "logoUri", 1000);
  if (input.logoText !== undefined) update.logo_text = readString(input, "logoText", 12);
  if (input.paymentInstructions !== undefined) {
    update.payment_instructions = readString(input, "paymentInstructions", 1000);
  }
  if (input.invoiceFooter !== undefined) update.invoice_footer = readString(input, "invoiceFooter", 1000);

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "invalid_business_update", "No business profile fields to update.");
  }

  const { data, error } = await supabase
    .from("businesses")
    .update(update)
    .eq("id", businessId)
    .select("id,name,abn,email,phone,address,logo_uri,logo_text,payment_instructions,invoice_footer")
    .single();

  if (error || !data) {
    throw new ApiError(500, "business_update_failed", error?.message ?? "No business returned.");
  }

  const row = data as unknown as {
    id: string;
    name: string;
    abn: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    logo_uri: string | null;
    logo_text: string | null;
    payment_instructions: string | null;
    invoice_footer: string | null;
  };

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "business_profile",
    entityId: businessId,
    detail: `Updated business profile ${row.name}`,
    metadata: {
      fields: Object.keys(update),
    },
  });

  return {
    id: row.id,
    name: row.name,
    abn: row.abn ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    logoUri: row.logo_uri ?? undefined,
    logoText: row.logo_text ?? undefined,
    paymentInstructions: row.payment_instructions ?? undefined,
    invoiceFooter: row.invoice_footer ?? undefined,
  };
};

export const updateBusinessSettings = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<UpdatedBusinessSettings> => {
  await requireAdminRole(supabase, userId, businessId);
  const input = ensureObject(body);
  const update: Record<string, unknown> = {};

  const gstEnabled = readBoolean(input, "gstEnabled");
  if (gstEnabled !== undefined) update.gst_enabled = gstEnabled;
  const gstRate = readNumber(input, "gstRate");
  if (gstRate !== undefined) {
    if (gstRate < 0 || gstRate > 1) {
      throw new ApiError(400, "invalid_business_settings", "gstRate must be between 0 and 1.");
    }
    update.gst_rate = gstRate;
  }
  const basBasis = readString(input, "basBasis", 20);
  if (basBasis !== undefined) {
    if (!basBases.has(basBasis)) {
      throw new ApiError(400, "invalid_business_settings", "basBasis is invalid.");
    }
    update.bas_basis = basBasis;
  }

  if (input.invoicePrefix !== undefined) update.invoice_prefix = readString(input, "invoicePrefix", 20);
  if (input.billPrefix !== undefined) update.bill_prefix = readString(input, "billPrefix", 20);
  if (input.creditNotePrefix !== undefined) update.credit_note_prefix = readString(input, "creditNotePrefix", 20);
  if (input.supplierCreditPrefix !== undefined) {
    update.supplier_credit_prefix = readString(input, "supplierCreditPrefix", 20);
  }
  if (input.receiptPrefix !== undefined) update.receipt_prefix = readString(input, "receiptPrefix", 20);

  if (input.nextInvoiceNumber !== undefined) update.next_invoice_number = readPositiveInteger(input, "nextInvoiceNumber");
  if (input.nextBillNumber !== undefined) update.next_bill_number = readPositiveInteger(input, "nextBillNumber");
  if (input.nextCreditNoteNumber !== undefined) {
    update.next_credit_note_number = readPositiveInteger(input, "nextCreditNoteNumber");
  }
  if (input.nextSupplierCreditNumber !== undefined) {
    update.next_supplier_credit_number = readPositiveInteger(input, "nextSupplierCreditNumber");
  }
  if (input.nextReceiptNumber !== undefined) update.next_receipt_number = readPositiveInteger(input, "nextReceiptNumber");

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "invalid_business_settings", "No business settings fields to update.");
  }

  const { data, error } = await supabase
    .from("business_settings")
    .update(update)
    .eq("business_id", businessId)
    .select(
      "gst_enabled,gst_rate,bas_basis,invoice_prefix,bill_prefix,credit_note_prefix,supplier_credit_prefix,receipt_prefix,next_invoice_number,next_bill_number,next_credit_note_number,next_supplier_credit_number,next_receipt_number",
    )
    .single();

  if (error || !data) {
    throw new ApiError(500, "business_settings_update_failed", error?.message ?? "No settings returned.");
  }

  const row = data as unknown as {
    gst_enabled: boolean;
    gst_rate: number;
    bas_basis: "cash" | "accrual";
    invoice_prefix: string;
    bill_prefix: string;
    credit_note_prefix: string;
    supplier_credit_prefix: string;
    receipt_prefix: string;
    next_invoice_number: number;
    next_bill_number: number;
    next_credit_note_number: number;
    next_supplier_credit_number: number;
    next_receipt_number: number;
  };

  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "business_settings",
    entityId: businessId,
    detail: "Updated business settings",
    metadata: {
      fields: Object.keys(update),
    },
  });

  return {
    gstEnabled: row.gst_enabled,
    gstRate: Number(row.gst_rate),
    basBasis: row.bas_basis,
    invoicePrefix: row.invoice_prefix,
    billPrefix: row.bill_prefix,
    creditNotePrefix: row.credit_note_prefix,
    supplierCreditPrefix: row.supplier_credit_prefix,
    receiptPrefix: row.receipt_prefix,
    nextInvoiceNumber: row.next_invoice_number,
    nextBillNumber: row.next_bill_number,
    nextCreditNoteNumber: row.next_credit_note_number,
    nextSupplierCreditNumber: row.next_supplier_credit_number,
    nextReceiptNumber: row.next_receipt_number,
  };
};
