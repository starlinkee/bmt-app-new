// Plik generowany automatycznie przez Supabase CLI.
// Uruchom: npm run db:types po połączeniu z bazą.
// Ręcznie uzupełniony o tabele BMT.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: number;
          name: string;
          address1: string;
          address2: string | null;
          type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          address1: string;
          address2?: string | null;
          type: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          address1?: string;
          address2?: string | null;
          type?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          id: number;
          tenant_type: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          bank_accounts_as_text: string;
          nip: string | null;
          address1: string | null;
          address2: string | null;
          property_id: number;
        };
        Insert: {
          id?: number;
          tenant_type?: string;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          bank_accounts_as_text?: string;
          nip?: string | null;
          address1?: string | null;
          address2?: string | null;
          property_id: number;
        };
        Update: {
          id?: number;
          tenant_type?: string;
          first_name?: string;
          last_name?: string;
          email?: string | null;
          phone?: string | null;
          bank_accounts_as_text?: string;
          nip?: string | null;
          address1?: string | null;
          address2?: string | null;
          property_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };
      contracts: {
        Row: {
          id: number;
          contract_type: string;
          rent_amount: number;
          invoice_seq_number: number;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          tenant_id: number;
        };
        Insert: {
          id?: number;
          contract_type?: string;
          rent_amount: number;
          invoice_seq_number?: number;
          start_date: string;
          end_date?: string | null;
          is_active?: boolean;
          tenant_id: number;
        };
        Update: {
          id?: number;
          contract_type?: string;
          rent_amount?: number;
          invoice_seq_number?: number;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      invoices: {
        Row: {
          id: number;
          type: string;
          number: string;
          amount: number;
          month: number;
          year: number;
          tenant_id: number;
        };
        Insert: {
          id?: number;
          type: string;
          number: string;
          amount: number;
          month: number;
          year: number;
          tenant_id: number;
        };
        Update: {
          id?: number;
          type?: string;
          number?: string;
          amount?: number;
          month?: number;
          year?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      transactions: {
        Row: {
          id: number;
          type: string;
          status: string;
          amount: number;
          date: string;
          title: string;
          bank_account: string | null;
          description: string | null;
          tenant_id: number | null;
        };
        Insert: {
          id?: number;
          type?: string;
          status?: string;
          amount: number;
          date: string;
          title?: string;
          bank_account?: string | null;
          description?: string | null;
          tenant_id?: number | null;
        };
        Update: {
          id?: number;
          type?: string;
          status?: string;
          amount?: number;
          date?: string;
          title?: string;
          bank_account?: string | null;
          description?: string | null;
          tenant_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      settlement_groups: {
        Row: {
          id: number;
          name: string;
          spreadsheet_id: string;
          input_mapping_json: Json;
          output_mapping_json: Json;
        };
        Insert: {
          id?: number;
          name: string;
          spreadsheet_id?: string;
          input_mapping_json?: Json;
          output_mapping_json?: Json;
        };
        Update: {
          id?: number;
          name?: string;
          spreadsheet_id?: string;
          input_mapping_json?: Json;
          output_mapping_json?: Json;
        };
        Relationships: [];
      };
      settlement_group_properties: {
        Row: {
          settlement_group_id: number;
          property_id: number;
        };
        Insert: {
          settlement_group_id: number;
          property_id: number;
        };
        Update: {
          settlement_group_id?: number;
          property_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "settlement_group_properties_settlement_group_id_fkey";
            columns: ["settlement_group_id"];
            isOneToOne: false;
            referencedRelation: "settlement_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlement_group_properties_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };
      app_config: {
        Row: {
          id: number;
          rent_invoice_spreadsheet_id: string;
          rent_invoice_input_mapping_json: Json;
          rent_invoice_pdf_gid: string;
          drive_invoices_folder_id: string;
        };
        Insert: {
          id?: number;
          rent_invoice_spreadsheet_id?: string;
          rent_invoice_input_mapping_json?: Json;
          rent_invoice_pdf_gid?: string;
          drive_invoices_folder_id?: string;
        };
        Update: {
          id?: number;
          rent_invoice_spreadsheet_id?: string;
          rent_invoice_input_mapping_json?: Json;
          rent_invoice_pdf_gid?: string;
          drive_invoices_folder_id?: string;
        };
        Relationships: [];
      };
      reminder_schedules: {
        Row: {
          id: number;
          name: string;
          day_of_month: number;
          hour: number;
          subject: string;
          body: string;
          is_active: boolean;
          last_sent_at: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          day_of_month: number;
          hour: number;
          subject?: string;
          body?: string;
          is_active?: boolean;
          last_sent_at?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          day_of_month?: number;
          hour?: number;
          subject?: string;
          body?: string;
          is_active?: boolean;
          last_sent_at?: string | null;
        };
        Relationships: [];
      };
      reminder_tenants: {
        Row: {
          reminder_id: number;
          tenant_id: number;
        };
        Insert: {
          reminder_id: number;
          tenant_id: number;
        };
        Update: {
          reminder_id?: number;
          tenant_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_tenants_reminder_id_fkey";
            columns: ["reminder_id"];
            isOneToOne: false;
            referencedRelation: "reminder_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminder_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          }
        ];
      };
      monthly_tasks: {
        Row: {
          id: number;
          type: string;
          month: number;
          year: number;
          status: string;
          completed_at: string | null;
        };
        Insert: {
          id?: number;
          type: string;
          month: number;
          year: number;
          status?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: number;
          type?: string;
          month?: number;
          year?: number;
          status?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
