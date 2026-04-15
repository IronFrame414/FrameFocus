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
    PostgrestVersion: "14.4"
  }
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
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string | null
          email: string | null
          id: string
          license_number: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          phone: string | null
          slug: string
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          subscription_tier: string
          trade_type: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          trade_type?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          trade_type?: string | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_id: string
          company_name: string | null
          contact_type: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          is_deleted: boolean | null
          last_name: string
          mobile: string | null
          notes: string | null
          phone: string | null
          source: string | null
          state: string | null
          status: string
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_deleted?: boolean | null
          last_name: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_deleted?: boolean | null
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          ai_tags: string[] | null
          category: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          is_deleted: boolean | null
          is_favorite: boolean
          markup_data: Json | null
          mime_type: string
          project_id: string | null
          supersedes_id: string | null
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          ai_tags?: string[] | null
          category: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean
          markup_data?: Json | null
          mime_type: string
          project_id?: string | null
          supersedes_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          ai_tags?: string[] | null
          category?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean
          markup_data?: Json | null
          mime_type?: string
          project_id?: string | null
          supersedes_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          is_deleted: boolean | null
          role: string
          status: string
          token: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          is_deleted?: boolean | null
          role: string
          status?: string
          token?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          is_deleted?: boolean | null
          role?: string
          status?: string
          token?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          last_name: string
          phone: string | null
          role: string
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email: string
          first_name: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          last_name: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          last_name?: string
          phone?: string | null
          role?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_id: string
          company_name: string
          contact_first_name: string | null
          contact_last_name: string | null
          created_at: string | null
          created_by: string | null
          default_hourly_rate: number | null
          default_markup_percent: number | null
          deleted_at: string | null
          ein: string | null
          email: string | null
          id: string
          insurance_expiry: string | null
          is_deleted: boolean | null
          license_number: string | null
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred: boolean | null
          rating: number | null
          rating_notes: string | null
          state: string | null
          status: string
          sub_type: string
          tags: string[] | null
          trade_type: string | null
          updated_at: string | null
          updated_by: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          company_name: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string | null
          created_by?: string | null
          default_hourly_rate?: number | null
          default_markup_percent?: number | null
          deleted_at?: string | null
          ein?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          is_deleted?: boolean | null
          license_number?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred?: boolean | null
          rating?: number | null
          rating_notes?: string | null
          state?: string | null
          status?: string
          sub_type?: string
          tags?: string[] | null
          trade_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          company_name?: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string | null
          created_by?: string | null
          default_hourly_rate?: number | null
          default_markup_percent?: number | null
          deleted_at?: string | null
          ein?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          is_deleted?: boolean | null
          license_number?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred?: boolean | null
          rating?: number | null
          rating_notes?: string | null
          state?: string | null
          status?: string
          sub_type?: string
          tags?: string[] | null
          trade_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          company_id: string
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_tier: string
          seat_limit: number
          status: string
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          company_id: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_tier?: string
          seat_limit?: number
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          company_id?: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_tier?: string
          seat_limit?: number
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_emails: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_invitation_by_token: {
        Args: { invite_token: string }
        Returns: {
          company_name: string
          email: string
          expires_at: string
          id: string
          role: string
        }[]
      }
      get_invitation_for_signup: {
        Args: { invite_token: string }
        Returns: {
          company_id: string
          id: string
          role: string
        }[]
      }
      get_my_company_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      is_platform_admin: { Args: never; Returns: boolean }
      test_invite_lookup: {
        Args: { p_token: string }
        Returns: {
          found_email: string
          found_id: string
          found_role: string
          found_status: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
