/**
 * Shared TypeScript types for ContactsSync.
 *
 * These types define the normalized data model and the contracts used
 * throughout the server: provider adapters, sync engine, duplicate
 * detection, and merge service.
 */

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** The three supported contact providers. */
export type Provider = 'google' | 'outlook' | 'icloud';

// ---------------------------------------------------------------------------
// Contact sub-types
// ---------------------------------------------------------------------------

/** An email address attached to a normalized contact. */
export interface ContactEmail {
  /** Database primary key (UUID). */
  id: string;
  /** Foreign key to the owning contact. */
  contactId: string;
  /** The email address value. */
  email: string;
  /** Label describing the email (e.g. 'work', 'home', 'other'). */
  type: string;
  /** Whether this is the primary / preferred email. */
  isPrimary: boolean;
}

/** A phone number attached to a normalized contact. */
export interface ContactPhone {
  /** Database primary key (UUID). */
  id: string;
  /** Foreign key to the owning contact. */
  contactId: string;
  /** The phone number value. */
  phone: string;
  /** Label describing the phone (e.g. 'mobile', 'work', 'home', 'fax'). */
  type: string;
  /** Whether this is the primary / preferred phone. */
  isPrimary: boolean;
}

/** A postal address attached to a normalized contact. */
export interface ContactAddress {
  /** Database primary key (UUID). */
  id: string;
  /** Foreign key to the owning contact. */
  contactId: string;
  /** Label describing the address (e.g. 'work', 'home', 'other'). */
  type: string;
  street?: string;
  city?: string;
  /** State or province. */
  region?: string;
  postalCode?: string;
  country?: string;
}

// ---------------------------------------------------------------------------
// NormalizedContact
// ---------------------------------------------------------------------------

/**
 * The canonical, provider-agnostic representation of a contact stored in the
 * local database.  All provider adapters convert their native payloads to and
 * from this type.
 */
export interface NormalizedContact {
  /** Database primary key (UUID). */
  id: string;
  /** Foreign key to the owning user. */
  userId: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  displayName?: string;
  prefix?: string;
  suffix?: string;
  nickname?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  birthday?: string;
  notes?: string;
  photoUrl?: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  /** UTC timestamp of record creation. */
  createdAt: Date;
  /** UTC timestamp of last update. */
  updatedAt: Date;
  /** UTC timestamp of soft-deletion; null when the record is active. */
  deletedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Provider link / reference
// ---------------------------------------------------------------------------

/**
 * Maps a normalized contact to its corresponding record on a provider.
 * Corresponds to the `contact_provider_links` database table.
 */
export interface ProviderContactRef {
  /** Database primary key (UUID). */
  id: string;
  /** Foreign key to the owning contact. */
  contactId: string;
  /** The provider this link belongs to. */
  provider: Provider;
  /**
   * Provider-specific unique identifier:
   * - Google: resourceName (e.g. `people/c12345`)
   * - Outlook: contact GUID
   * - iCloud: vCard resource URL
   */
  providerId: string;
  /**
   * Provider-specific version / conflict token:
   * - Google: etag
   * - Outlook: changeKey
   * - iCloud: ETag
   */
  providerEtag?: string;
  /** UTC timestamp of last successful sync for this link. */
  lastSyncedAt?: Date;
  /** Full provider-specific payload preserved for round-trip fidelity. */
  rawData?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IContactProvider
// ---------------------------------------------------------------------------

/**
 * Result returned by {@link IContactProvider.fetchDeltaContacts}.
 * Includes the updated / deleted contacts together with the new sync token
 * to be persisted for the next delta call.
 */
export interface ProviderSyncResult {
  /** Contacts that were created or updated since the last sync. */
  upserted: ProviderContact[];
  /** Provider IDs of contacts that were deleted since the last sync. */
  deletedProviderIds: string[];
  /**
   * Opaque token to be supplied on the next
   * {@link IContactProvider.fetchDeltaContacts} call.
   */
  nextSyncToken: string;
}

/**
 * A contact in its provider-native normalized form — already converted to
 * {@link NormalizedContact} shape but without a local database `id`.
 * The `providerId` / `providerEtag` fields carry the provider's own
 * identifiers so the import service can upsert correctly.
 */
export interface ProviderContact {
  /** Provider-specific contact identifier. */
  providerId: string;
  /** Provider-specific version / conflict token. */
  providerEtag?: string;
  /** Normalized contact data (without a local DB id). */
  contact: Omit<NormalizedContact, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
}

/**
 * Contract that every provider adapter must implement.
 *
 * Adapters translate between the provider's native API and the normalized
 * {@link NormalizedContact} / {@link ProviderContact} types used by the rest
 * of the server.
 */
export interface IContactProvider {
  /**
   * Fetch **all** contacts from the provider (full sync / first import).
   *
   * @returns An array of provider contacts and a sync token for future delta
   *          calls.
   */
  fetchAllContacts(): Promise<ProviderSyncResult>;

  /**
   * Fetch only the contacts that changed since the last sync (delta sync).
   *
   * @param syncToken - The token returned by the previous
   *   {@link fetchAllContacts} or {@link fetchDeltaContacts} call.
   * @returns The changed/deleted contacts and a new sync token.
   * @throws If the token has expired the implementation should throw an error
   *   with `code: 'SYNC_TOKEN_EXPIRED'` so callers can fall back to a full
   *   sync.
   */
  fetchDeltaContacts(syncToken: string): Promise<ProviderSyncResult>;

  /**
   * Create a new contact on the provider.
   *
   * @param contact - The contact data to create.
   * @returns The created contact including the provider-assigned id and etag.
   */
  createContact(contact: Omit<NormalizedContact, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<ProviderContact>;

  /**
   * Update an existing contact on the provider.
   *
   * @param providerId - The provider's identifier for the contact.
   * @param contact - The updated contact data.
   * @param providerEtag - Optional current etag used for conflict detection.
   * @returns The updated contact including the new etag.
   */
  updateContact(
    providerId: string,
    contact: Omit<NormalizedContact, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    providerEtag?: string,
  ): Promise<ProviderContact>;

  /**
   * Delete a contact from the provider.
   *
   * @param providerId - The provider's identifier for the contact.
   * @param providerEtag - Optional current etag used for conflict detection.
   */
  deleteContact(providerId: string, providerEtag?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/** The field that caused two contacts to be considered potential duplicates. */
export type MatchReason = 'email' | 'phone' | 'name' | 'company';

/**
 * A single contact that is a candidate member of a duplicate group, together
 * with scoring information explaining why it was included.
 */
export interface DuplicateCandidate {
  /** The normalized contact. */
  contact: NormalizedContact;
  /**
   * Composite confidence score (0–100) based on weighted contributions from
   * email address match, phone number match, name similarity, and company
   * match signals.
   */
  score: number;
  /** The individual signals that contributed to the score. */
  matchReasons: MatchReason[];
}

/**
 * A set of contacts identified as likely duplicates of each other.
 */
export interface DuplicateGroup {
  /** Stable identifier for the group (e.g. UUID derived from member ids). */
  groupId: string;
  /**
   * The candidate with the highest score is treated as the suggested
   * primary; remaining candidates are listed as potential duplicates.
   */
  candidates: DuplicateCandidate[];
  /**
   * Overall confidence for the group (typically the highest individual
   * candidate score).
   */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Payload for `POST /api/contacts/merge`.
 *
 * The primary contact is kept; data from secondary contacts is merged into
 * it and the secondaries are soft-deleted.
 */
export interface MergeRequest {
  /** Id of the contact to treat as the merge target (kept). */
  primaryContactId: string;
  /** Ids of the contacts to merge into the primary (soft-deleted after merge). */
  secondaryContactIds: string[];
  /**
   * Optional per-field overrides.  Keys are field names of
   * {@link NormalizedContact}; values are the desired final values.
   * Use this when the user explicitly selects which version of a field to keep.
   */
  fieldOverrides?: Partial<Omit<NormalizedContact, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;
}

/**
 * Result returned after a successful merge operation.
 */
export interface MergeResult {
  /** The merged contact in its final state. */
  mergedContact: NormalizedContact;
  /** Ids of the contacts that were soft-deleted during the merge. */
  deletedContactIds: string[];
  /**
   * Indicates whether an outbound sync to providers was queued.
   * The sync itself happens asynchronously.
   */
  syncQueued: boolean;
}
