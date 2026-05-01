import type { Contact, ContactType, PaymentTerms } from "@auctus/shared-types";

import { recordAuditEvent } from "../audit/service.js";
import { ApiError } from "../businesses/service.js";
import { getLedgerSnapshot } from "../ledger/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

const writableRoles = new Set(["owner", "admin", "bookkeeper"]);
const contactTypes = new Set<ContactType>(["customer", "supplier", "both"]);
const paymentTerms = new Set<PaymentTerms>(["due_on_receipt", "net_7", "net_14", "net_30", "net_60", "custom"]);

type ContactInput = {
  type: ContactType;
  name: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms: PaymentTerms;
};

type ContactPatch = Partial<ContactInput>;

type ContactRow = {
  id: string;
  type: ContactType;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: PaymentTerms | null;
  created_at: string;
  archived_at: string | null;
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
      throw new ApiError(400, "invalid_contact", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_contact", `${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new ApiError(400, "invalid_contact", `${key} is required.`);
    }
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ApiError(400, "invalid_contact", `${key} is too long.`);
  }
  return trimmed;
};

const readEnum = <T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: Set<T>,
  required = false,
): T | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ApiError(400, "invalid_contact", `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new ApiError(400, "invalid_contact", `${key} is invalid.`);
  }
  return value as T;
};

const ensureObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
};

const parseContactInput = (body: unknown): ContactInput => {
  const input = ensureObject(body);
  const type = readEnum(input, "type", contactTypes, true);
  if (!type) {
    throw new ApiError(400, "invalid_contact", "type is required.");
  }

  return {
    type,
    name: readString(input, "name", 160, true) ?? "",
    abn: readString(input, "abn", 40),
    email: readString(input, "email", 254),
    phone: readString(input, "phone", 60),
    address: readString(input, "address", 1000),
    paymentTerms: readEnum(input, "paymentTerms", paymentTerms) ?? "due_on_receipt",
  };
};

const parseContactPatch = (body: unknown): ContactPatch => {
  const input = ensureObject(body);

  return {
    type: readEnum(input, "type", contactTypes),
    name: readString(input, "name", 160),
    abn: readString(input, "abn", 40),
    email: readString(input, "email", 254),
    phone: readString(input, "phone", 60),
    address: readString(input, "address", 1000),
    paymentTerms: readEnum(input, "paymentTerms", paymentTerms),
  };
};

const toContact = (row: ContactRow): Contact => ({
  id: row.id,
  type: row.type,
  name: row.name,
  abn: row.abn ?? undefined,
  email: row.email ?? undefined,
  phone: row.phone ?? undefined,
  address: row.address ?? undefined,
  paymentTerms: row.payment_terms ?? "due_on_receipt",
  createdAt: row.created_at,
  archivedAt: row.archived_at ?? undefined,
});

const getWriteContext = async (supabase: SupabaseServiceClient, userId: string, businessId: string) => {
  const snapshot = await getLedgerSnapshot(supabase, userId, businessId);
  if (!writableRoles.has(snapshot.business.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to write contacts.");
  }
  return { snapshot };
};

export const createContact = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  body: unknown,
): Promise<Contact> => {
  await getWriteContext(supabase, userId, businessId);
  const input = parseContactInput(body);

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      business_id: businessId,
      type: input.type,
      name: input.name,
      abn: input.abn,
      email: input.email,
      phone: input.phone,
      address: input.address,
      payment_terms: input.paymentTerms,
    })
    .select("id,type,name,abn,email,phone,address,payment_terms,created_at,archived_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "contact_create_failed", error?.message ?? "No contact returned.");
  }

  const contact = toContact(data as unknown as ContactRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "create",
    entityType: "contact",
    entityId: contact.id,
    detail: `Created ${contact.type} contact ${contact.name}`,
    metadata: {
      type: contact.type,
      name: contact.name,
    },
  });

  return contact;
};

export const updateContact = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  contactId: string,
  body: unknown,
): Promise<Contact> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.contacts.find((contact) => contact.id === contactId);
  if (!existing) {
    throw new ApiError(404, "contact_not_found", "Contact not found.");
  }

  const patch = parseContactPatch(body);
  const update: Record<string, unknown> = {};
  if (patch.type) update.type = patch.type;
  if (patch.name) update.name = patch.name;
  if (patch.abn !== undefined) update.abn = patch.abn;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.paymentTerms) update.payment_terms = patch.paymentTerms;

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "invalid_contact", "No contact fields to update.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("business_id", businessId)
    .eq("id", contactId)
    .is("archived_at", null)
    .select("id,type,name,abn,email,phone,address,payment_terms,created_at,archived_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "contact_update_failed", error?.message ?? "No contact returned.");
  }

  const contact = toContact(data as unknown as ContactRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "update",
    entityType: "contact",
    entityId: contact.id,
    detail: `Updated contact ${contact.name}`,
    metadata: {
      fields: Object.keys(update),
    },
  });

  return contact;
};

export const archiveContact = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
  contactId: string,
): Promise<Contact> => {
  const context = await getWriteContext(supabase, userId, businessId);
  const existing = context.snapshot.ledger.contacts.find((contact) => contact.id === contactId);
  if (!existing) {
    throw new ApiError(404, "contact_not_found", "Contact not found.");
  }

  const inUse = context.snapshot.ledger.transactions.some((transaction) => !transaction.voidedAt && transaction.contactId === contactId);
  if (inUse) {
    throw new ApiError(400, "contact_in_use", "Contact is used by active transactions and cannot be archived.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", contactId)
    .is("archived_at", null)
    .select("id,type,name,abn,email,phone,address,payment_terms,created_at,archived_at")
    .single();

  if (error || !data) {
    throw new ApiError(500, "contact_archive_failed", error?.message ?? "No contact returned.");
  }

  const contact = toContact(data as unknown as ContactRow);
  await recordAuditEvent(supabase, {
    businessId,
    actorUserId: userId,
    action: "archive",
    entityType: "contact",
    entityId: contact.id,
    detail: `Archived contact ${contact.name}`,
    metadata: {
      archivedAt: contact.archivedAt,
    },
  });

  return contact;
};
