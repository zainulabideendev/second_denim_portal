export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: "admin" | "manager" | "salesman";
          country: "FR" | "BE" | "UK" | "DE" | null;
          pool_countries: ("FR" | "BE" | "UK" | "DE")[];
          active_proxy_limit: number;
          status: "active" | "disabled";
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          role?: "admin" | "manager" | "salesman";
          country?: "FR" | "BE" | "UK" | "DE" | null;
          pool_countries?: ("FR" | "BE" | "UK" | "DE")[];
          active_proxy_limit?: number;
          status?: "active" | "disabled";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      proxies: {
        Row: {
          id: string;
          country: "FR" | "BE" | "UK" | "DE";
          host: string;
          port: string;
          username: string;
          password: string;
          provider: string;
          purchased_at: string;
          expires_at: string;
          status:
            | "fresh"
            | "available"
            | "active"
            | "assigned"
            | "expired"
            | "flagged"
            | "retired";
          assigned_to: string | null;
          assigned_at: string | null;
          batch_id: string | null;
          notes: string;
          proxy_cheap_id: string | null;
          lane: "backup" | "active" | null;
          accounts_created: boolean;
          staging_done: boolean;
          restricted: boolean;
          synced_email_id: string | null;
          synced_at: string | null;
          synced_email_email: string | null;
          synced_email_password: string | null;
          vinted_username: string;
          vinted_password: string;
          phone_id: string | null;
          phone_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          country: "FR" | "BE" | "UK" | "DE";
          host: string;
          port: string;
          username?: string;
          password?: string;
          provider?: string;
          purchased_at?: string;
          expires_at: string;
          status?: Database["public"]["Tables"]["proxies"]["Row"]["status"];
          assigned_to?: string | null;
          assigned_at?: string | null;
          batch_id?: string | null;
          notes?: string;
          proxy_cheap_id?: string | null;
          lane?: "backup" | "active" | null;
          accounts_created?: boolean;
          staging_done?: boolean;
          restricted?: boolean;
          synced_email_id?: string | null;
          synced_at?: string | null;
          synced_email_email?: string | null;
          synced_email_password?: string | null;
          vinted_username?: string;
          vinted_password?: string;
          phone_id?: string | null;
          phone_number?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["proxies"]["Insert"]>;
        Relationships: [];
      };
      emails: {
        Row: {
          id: string;
          email: string;
          password: string;
          status: "fresh" | "available" | "assigned" | "flagged" | "retired";
          assigned_to: string | null;
          assigned_at: string | null;
          notes: string;
          created_at: string;
          synced_proxy_id: string | null;
          synced_at: string | null;
          synced_proxy_host: string | null;
          synced_proxy_port: string | null;
          synced_proxy_country: "FR" | "BE" | "UK" | "DE" | null;
        };
        Insert: {
          id?: string;
          email: string;
          password?: string;
          status?: Database["public"]["Tables"]["emails"]["Row"]["status"];
          assigned_to?: string | null;
          assigned_at?: string | null;
          notes?: string;
          created_at?: string;
          synced_proxy_id?: string | null;
          synced_at?: string | null;
          synced_proxy_host?: string | null;
          synced_proxy_port?: string | null;
          synced_proxy_country?: "FR" | "BE" | "UK" | "DE" | null;
        };
        Update: Partial<Database["public"]["Tables"]["emails"]["Insert"]>;
        Relationships: [];
      };
      phone_numbers: {
        Row: {
          id: string;
          country: "FR" | "BE" | "UK" | "DE";
          number: string;
          provider: string;
          purchased_at: string;
          expires_at: string;
          status:
            | "available"
            | "active"
            | "inactive"
            | "expired"
            | "retired"
            | "assigned"
            | "flagged"
            | "banned"
            | "banned_with_balance";
          number_type: "temporary" | "permanent";
          assigned_to: string | null;
          assigned_at: string | null;
          batch_id: string | null;
          notes: string;
          lane: "backup" | "active" | null;
          proxy_id: string | null;
          proxy_host: string | null;
          proxy_port: string | null;
          proxy_country: "FR" | "BE" | "UK" | "DE" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          country: "FR" | "BE" | "UK" | "DE";
          number: string;
          provider?: string;
          purchased_at?: string;
          expires_at: string;
          status?: Database["public"]["Tables"]["phone_numbers"]["Row"]["status"];
          number_type?: "temporary" | "permanent";
          assigned_to?: string | null;
          assigned_at?: string | null;
          batch_id?: string | null;
          notes?: string;
          lane?: "backup" | "active" | null;
          proxy_id?: string | null;
          proxy_host?: string | null;
          proxy_port?: string | null;
          proxy_country?: "FR" | "BE" | "UK" | "DE" | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["phone_numbers"]["Insert"]>;
        Relationships: [];
      };
      user_pools: {
        Row: {
          id: string;
          user_id: string;
          user_name: string;
          user_email: string;
          country: "FR" | "BE" | "UK" | "DE";
          size_per_lane: number;
          backup_limit: number | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          user_name?: string;
          user_email?: string;
          country: "FR" | "BE" | "UK" | "DE";
          size_per_lane?: number;
          backup_limit?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_pools"]["Insert"]>;
        Relationships: [];
      };
      requests: {
        Row: {
          id: string;
          type: "proxy" | "phone";
          requested_by: string;
          requested_by_name: string;
          requested_by_email: string;
          country: "FR" | "BE" | "UK" | "DE";
          reason: string;
          status: "pending" | "approved" | "rejected" | "fulfilled";
          reviewed_by: string | null;
          reviewed_by_name: string | null;
          reviewed_by_email: string | null;
          reviewed_at: string | null;
          fulfilled_item_id: string | null;
          rejection_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: "proxy" | "phone";
          requested_by: string;
          requested_by_name?: string;
          requested_by_email?: string;
          country: "FR" | "BE" | "UK" | "DE";
          reason?: string;
          status?: "pending" | "approved" | "rejected" | "fulfilled";
          reviewed_by?: string | null;
          reviewed_by_name?: string | null;
          reviewed_by_email?: string | null;
          reviewed_at?: string | null;
          fulfilled_item_id?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["requests"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          uid: string;
          type: string;
          message: string;
          read: boolean;
          related_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          type: string;
          message: string;
          read?: boolean;
          related_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_uid: string | null;
          action: string;
          target_type: string;
          target_id: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_uid?: string | null;
          action: string;
          target_type: string;
          target_id: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          type: "proxy" | "phone" | "email";
          imported_by: string | null;
          imported_at: string;
          country: "FR" | "BE" | "UK" | "DE" | null;
          count: number;
          raw_file_name: string;
        };
        Insert: {
          id?: string;
          type: "proxy" | "phone" | "email";
          imported_by?: string | null;
          imported_at?: string;
          country?: "FR" | "BE" | "UK" | "DE" | null;
          count?: number;
          raw_file_name?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
      pool_config: {
        Row: {
          id: string;
          default_size_per_lane: number;
          by_country: Json;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          default_size_per_lane?: number;
          by_country?: Json;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pool_config"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "admin" | "manager" | "salesman";
      user_status: "active" | "disabled";
      country_code: "FR" | "BE" | "UK" | "DE";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProxyRow = Database["public"]["Tables"]["proxies"]["Row"];
export type EmailRow = Database["public"]["Tables"]["emails"]["Row"];
export type PhoneRow = Database["public"]["Tables"]["phone_numbers"]["Row"];
