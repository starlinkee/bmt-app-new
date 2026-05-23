export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          drive_invoices_folder_id: string
          id: number
          reminder_body: string
          reminder_subject: string
          rent_invoice_input_mapping_json: Json
          rent_invoice_pdf_gid: string
          rent_invoice_spreadsheet_id: string
        }
        Insert: {
          drive_invoices_folder_id?: string
          id?: number
          reminder_body?: string
          reminder_subject?: string
          rent_invoice_input_mapping_json?: Json
          rent_invoice_pdf_gid?: string
          rent_invoice_spreadsheet_id?: string
        }
        Update: {
          drive_invoices_folder_id?: string
          id?: number
          reminder_body?: string
          reminder_subject?: string
          rent_invoice_input_mapping_json?: Json
          rent_invoice_pdf_gid?: string
          rent_invoice_spreadsheet_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          contract_type: string
          end_date: string | null
          id: number
          invoice_seq_number: number
          is_active: boolean
          reminder_last_sent_at: string | null
          rent_amount: number
          start_date: string
          tenant_id: number
        }
        Insert: {
          contract_type?: string
          end_date?: string | null
          id?: never
          invoice_seq_number?: number
          is_active?: boolean
          reminder_last_sent_at?: string | null
          rent_amount: number
          start_date: string
          tenant_id: number
        }
        Update: {
          contract_type?: string
          end_date?: string | null
          id?: never
          invoice_seq_number?: number
          is_active?: boolean
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
          id: number
          month: number
          number: string
          tenant_id: number
          type: string
          year: number
        }
        Insert: {
          amount: number
          id?: never
          month: number
          number: string
          tenant_id: number
          type: string
          year: number
        }
        Update: {
          amount?: number
          id?: never
          month?: number
          number?: string
          tenant_id?: number
          type?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_tasks: {
        Row: {
          completed_at: string | null
          id: number
          month: number
          status: string
          type: string
          year: number
        }
        Insert: {
          completed_at?: string | null
          id?: never
          month: number
          status?: string
          type: string
          year: number
        }
        Update: {
          completed_at?: string | null
          id?: never
          month?: number
          status?: string
          type?: string
          year?: number
        }
        Relationships: []
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
          input_mapping_json: Json
          name: string
          output_mapping_json: Json
          spreadsheet_id: string
        }
        Insert: {
          id?: never
          input_mapping_json?: Json
          name: string
          output_mapping_json?: Json
          spreadsheet_id?: string
        }
        Update: {
          id?: never
          input_mapping_json?: Json
          name?: string
          output_mapping_json?: Json
          spreadsheet_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          address1: string | null
          address2: string | null
          bank_accounts_as_text: string
          email: string | null
          first_name: string
          id: number
          last_name: string
          nip: string | null
          phone: string | null
          property_id: number
          tenant_type: string
        }
        Insert: {
          address1?: string | null
          address2?: string | null
          bank_accounts_as_text?: string
          email?: string | null
          first_name: string
          id?: never
          last_name: string
          nip?: string | null
          phone?: string | null
          property_id: number
          tenant_type?: string
        }
        Update: {
          address1?: string | null
          address2?: string | null
          bank_accounts_as_text?: string
          email?: string | null
          first_name?: string
          id?: never
          last_name?: string
          nip?: string | null
          phone?: string | null
          property_id?: number
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
      transactions: {
        Row: {
          amount: number
          bank_account: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

