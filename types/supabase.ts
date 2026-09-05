export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          drive_invoices_folder_id: string
          email_provider: string
          email_provider_2: string
          gmail_app_password: string | null
          gmail_app_password_2: string | null
          gmail_user: string | null
          gmail_user_2: string | null
          id: number
          reminder_body: string
          reminder_subject: string
          rent_email_subject: string | null
          rent_email_body: string | null
          rent_invoice_input_mapping_json: Json
          rent_invoice_pdf_gid: string
          rent_invoice_spreadsheet_id: string
            tenant_reading_keys: Json
          }
          Insert: {
          drive_invoices_folder_id?: string
          email_provider?: string
          email_provider_2?: string
          gmail_app_password?: string | null
          gmail_app_password_2?: string | null
          gmail_user?: string | null
          gmail_user_2?: string | null
          id?: number
          reminder_body?: string
          reminder_subject?: string
          rent_email_subject?: string | null
          rent_email_body?: string | null
          rent_invoice_input_mapping_json?: Json
          rent_invoice_pdf_gid?: string
          rent_invoice_spreadsheet_id?: string
            tenant_reading_keys?: Json
          }
          Update: {
          drive_invoices_folder_id?: string
          email_provider?: string
          email_provider_2?: string
          gmail_app_password?: string | null
          gmail_app_password_2?: string | null
          gmail_user?: string | null
          gmail_user_2?: string | null
          id?: number
          reminder_body?: string
          reminder_subject?: string
          rent_email_subject?: string | null
          rent_email_body?: string | null
          rent_invoice_input_mapping_json?: Json
          rent_invoice_pdf_gid?: string
          rent_invoice_spreadsheet_id?: string
            tenant_reading_keys?: Json
          }
          Relationships: []
      }
      contracts: {
        Row: {
          contract_type: string
          end_date: string | null
          has_media_invoice: boolean
          id: number
          invoice_seq_number: number
          is_active: boolean
          media_invoice_seq_number: number | null
          opis_rachunku: string
          opis_rachunku_media: string
          reminder_last_sent_at: string | null
          rent_amount: number
          start_date: string
          tenant_id: number
        }
        Insert: {
          contract_type?: string
          end_date?: string | null
          has_media_invoice?: boolean
          id?: never
          invoice_seq_number?: number
          is_active?: boolean
          media_invoice_seq_number?: number | null
          opis_rachunku?: string
          opis_rachunku_media?: string
          reminder_last_sent_at?: string | null
          rent_amount: number
          start_date: string
          tenant_id: number
        }
        Update: {
          contract_type?: string
          end_date?: string | null
          has_media_invoice?: boolean
          id?: never
          invoice_seq_number?: number
          is_active?: boolean
          media_invoice_seq_number?: number | null
          opis_rachunku?: string
          opis_rachunku_media?: string
          reminder_last_sent_at?: string | null
          rent_amount?: number
          start_date?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          contract_id: number | null
          id: number
          media_settlement_id: number | null
          month: number
          number: string | null
          tenant_id: number
          type: string
          year: number
        }
        Insert: {
          amount: number
          contract_id?: number | null
          id?: never
          media_settlement_id?: number | null
          month: number
          number?: string | null
          tenant_id: number
          type: string
          year: number
        }
        Update: {
          amount?: number
          contract_id?: number | null
          id?: never
          media_settlement_id?: number | null
          month?: number
          number?: string | null
          tenant_id?: number
          type?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_media_settlement_id_fkey"
            columns: ["media_settlement_id"]
            isOneToOne: false
            referencedRelation: "media_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_meter_readings: {
        Row: {
          created_at: string
          group_id: number
          id: number
          key: string
          month: number
          value: number
          year: number
        }
        Insert: {
          created_at?: string
          group_id: number
          id?: never
          key: string
          month: number
          value: number
          year: number
        }
        Update: {
          created_at?: string
          group_id?: number
          id?: never
          key?: string
          month?: number
          value?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_meter_readings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      media_settlements: {
        Row: {
          created_at: string
          drive_pdf_id: string | null
          drive_pdf_ids: Json
          group_id: number
          id: number
          month: number
          spreadsheet_id: string
          year: number
        }
        Insert: {
          created_at?: string
          drive_pdf_id?: string | null
          drive_pdf_ids?: Json
          group_id: number
          id?: never
          month: number
          spreadsheet_id: string
          year: number
        }
        Update: {
          created_at?: string
          drive_pdf_id?: string | null
          drive_pdf_ids?: Json
          group_id?: number
          id?: never
          month?: number
          spreadsheet_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address1: string
          address2: string | null
          created_at: string
          id: number
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          address1: string
          address2?: string | null
          created_at?: string
          id?: never
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          address1?: string
          address2?: string | null
          created_at?: string
          id?: never
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      settlement_group_properties: {
        Row: {
          property_id: number
          settlement_group_id: number
        }
        Insert: {
          property_id: number
          settlement_group_id: number
        }
        Update: {
          property_id?: number
          settlement_group_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlement_group_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_group_properties_settlement_group_id_fkey"
            columns: ["settlement_group_id"]
            isOneToOne: false
            referencedRelation: "settlement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_groups: {
        Row: {
          id: number
          email_body_template: string | null
          email_subject_template: string | null
          input_mapping_json: Json
          media_invoice_input_mapping_json: Json
          media_invoice_spreadsheet_id: string
          name: string
          output_mapping_json: Json
          pdf_sheets_json: Json
          spreadsheet_id: string
            tenant_reading_keys: Json
          }
          Insert: {
          id?: never
          email_body_template?: string | null
          email_subject_template?: string | null
          input_mapping_json?: Json
          media_invoice_input_mapping_json?: Json
          media_invoice_spreadsheet_id?: string
          name: string
          output_mapping_json?: Json
          pdf_sheets_json?: Json
          spreadsheet_id?: string
            tenant_reading_keys?: Json
          }
          Update: {
          id?: never
          email_body_template?: string | null
          email_subject_template?: string | null
          input_mapping_json?: Json
          media_invoice_input_mapping_json?: Json
          media_invoice_spreadsheet_id?: string
          name?: string
          output_mapping_json?: Json
          pdf_sheets_json?: Json
          spreadsheet_id?: string
            tenant_reading_keys?: Json
          }
          Relationships: []
      }
      tenants: {
        Row: {
          address1: string | null
          address2: string | null
          bank_accounts_as_text: string
          company_name: string | null
          email: string | null
          email2: string | null
          first_name: string
          id: number
          last_name: string
          nip: string | null
          phone: string | null
          property_id: number
          sender_account: number
          tenant_type: string
        }
        Insert: {
          address1?: string | null
          address2?: string | null
          bank_accounts_as_text?: string
          company_name?: string | null
          email?: string | null
          email2?: string | null
          first_name: string
          id?: never
          last_name: string
          nip?: string | null
          phone?: string | null
          property_id: number
          sender_account?: number
          tenant_type?: string
        }
        Update: {
          address1?: string | null
          address2?: string | null
          bank_accounts_as_text?: string
          company_name?: string | null
          email?: string | null
          email2?: string | null
          first_name?: string
          id?: never
          last_name?: string
          nip?: string | null
          phone?: string | null
          property_id?: number
          sender_account?: number
          tenant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_staging: {
        Row: {
          amount: number
          bank_account: string | null
          category: string | null
          created_at: string
          date: string
          id: number
          is_duplicate: boolean
          raw_data: Json | null
          suggested_tenant_id: number | null
          title: string
        }
        Insert: {
          amount: number
          bank_account?: string | null
          category?: string | null
          created_at?: string
          date: string
          id?: never
          is_duplicate?: boolean
          raw_data?: Json | null
          suggested_tenant_id?: number | null
          title?: string
        }
        Update: {
          amount?: number
          bank_account?: string | null
          category?: string | null
          created_at?: string
          date?: string
          id?: never
          is_duplicate?: boolean
          raw_data?: Json | null
          suggested_tenant_id?: number | null
          title?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_account: string | null
          category: string | null
          created_at: string
          date: string
          description: string | null
          id: number
          raw_data: Json | null
          status: string
          tenant_id: number | null
          title: string
          type: string
        }
        Insert: {
          amount: number
          bank_account?: string | null
          category?: string | null
          created_at?: string
          date: string
          description?: string | null
          id?: never
          raw_data?: Json | null
          status?: string
          tenant_id?: number | null
          title?: string
          type?: string
        }
        Update: {
          amount?: number
          bank_account?: string | null
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: never
          raw_data?: Json | null
          status?: string
          tenant_id?: number | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_log: {
        Row: {
          id: number
          operation: string
          result: Json | null
          called_at: string
        }
        Insert: {
          id?: never
          operation: string
          result?: Json | null
          called_at?: string
        }
        Update: {
          id?: never
          operation?: string
          result?: Json | null
          called_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          action_name: string
          table_name: string | null
          operation: string
          record_id: string | null
          before_data: Json | null
          after_data: Json | null
          error_data: Json | null
          created_at: string
        }
        Insert: {
          id?: never
          action_name: string
          table_name?: string | null
          operation: string
          record_id?: string | null
          before_data?: Json | null
          after_data?: Json | null
          error_data?: Json | null
          created_at?: string
        }
        Update: {
          id?: never
          action_name?: string
          table_name?: string | null
          operation?: string
          record_id?: string | null
          before_data?: Json | null
          after_data?: Json | null
          error_data?: Json | null
          created_at?: string
        }
        Relationships: []
      }
        email_logs: {
          Row: {
            id: number
            to_email: string
            subject: string
            body: string | null
            sent_at: string
          }
          Insert: {
            id?: never
            to_email: string
            subject: string
            body?: string | null
            sent_at?: string
          }
          Update: {
            id?: never
            to_email?: string
            subject?: string
            body?: string | null
            sent_at?: string
          }
          Relationships: []
        }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_previous_meter_readings: {
        Args: { p_group_id: number; p_month: number; p_year: number }
        Returns: {
          key: string
          value: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
