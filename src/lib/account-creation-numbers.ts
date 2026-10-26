export type AccountCreationNumberStatus =
  | "available"
  | "assigned"
  | "changed"
  | "retired";

export type AccountCreationNumberRow = {
  id: string;
  country: "FR" | "BE" | "UK" | "DE";
  number: string;
  provider: string;
  status: AccountCreationNumberStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  notes: string;
  proxy_id: string | null;
  proxy_host: string | null;
  proxy_port: string | null;
  proxy_country: "FR" | "BE" | "UK" | "DE" | null;
  created_at: string;
  updated_at: string;
};

export type AccountCreationNumber = {
  id: string;
  country: "FR" | "BE" | "UK" | "DE";
  number: string;
  provider: string;
  status: AccountCreationNumberStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  notes: string;
  proxyId: string | null;
  proxyHost: string | null;
  proxyPort: string | null;
  proxyCountry: "FR" | "BE" | "UK" | "DE" | null;
  createdAt: string;
  updatedAt: string;
};

export function mapAccountCreationNumber(
  row: AccountCreationNumberRow
): AccountCreationNumber {
  return {
    id: row.id,
    country: row.country,
    number: row.number,
    provider: row.provider,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    notes: row.notes,
    proxyId: row.proxy_id ?? null,
    proxyHost: row.proxy_host ?? null,
    proxyPort: row.proxy_port ?? null,
    proxyCountry: row.proxy_country ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
