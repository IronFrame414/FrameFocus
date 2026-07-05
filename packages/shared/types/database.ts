// STOPGAP — Module 5 build (Session 57): the company_members / Module 5 table
// entries below were hand-authored in generator format because migrations are
// written to disk but NOT yet applied (no db push this session). Run
// `npm run db:types` after the supervised migration apply to regenerate this
// file and confirm parity.
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
      ai_tag_logs: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          file_id: string | null
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          success: boolean
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          file_id?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          success?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          file_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_tag_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tag_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_line_items: {
        Row: {
          change_order_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
          total_price: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          change_order_id: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order: number
          total_price?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          change_order_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          total_price?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_order_line_items_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_line_rows: {
        Row: {
          amount: number | null
          apply_tax: boolean
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          labor_unit: string | null
          line_item_id: string
          markup_percent: number | null
          name: string
          quantity: number | null
          rate: number | null
          row_type: string
          sort_order: number
          subcontractor_id: string | null
          total: number
          unit_cost: number | null
          unit_of_measure: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          apply_tax?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          labor_unit?: string | null
          line_item_id: string
          markup_percent?: number | null
          name: string
          quantity?: number | null
          rate?: number | null
          row_type: string
          sort_order: number
          subcontractor_id?: string | null
          total?: number
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          apply_tax?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          labor_unit?: string | null
          line_item_id?: string
          markup_percent?: number | null
          name?: string
          quantity?: number | null
          rate?: number | null
          row_type?: string
          sort_order?: number
          subcontractor_id?: string | null
          total?: number
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_order_line_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_line_rows_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "change_order_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_line_rows_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          author_member_id: string
          co_type: string
          company_id: string
          co_number: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean | null
          labor_markup_percent: number | null
          material_markup_percent: number | null
          net_delta: number
          pricing_mode: string
          project_id: string
          reason_category: string | null
          requires_client_signature: boolean | null
          schedule_impact_days: number | null
          sent_at: string | null
          signed_at: string | null
          status: string
          subcontractor_markup_percent: number | null
          tax_rate: number | null
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          author_member_id?: string
          co_type?: string
          company_id?: string
          co_number: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          material_markup_percent?: number | null
          net_delta?: number
          pricing_mode?: string
          project_id: string
          reason_category?: string | null
          requires_client_signature?: boolean | null
          schedule_impact_days?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          tax_rate?: number | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          author_member_id?: string
          co_type?: string
          company_id?: string
          co_number?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          material_markup_percent?: number | null
          net_delta?: number
          pricing_mode?: string
          project_id?: string
          reason_category?: string | null
          requires_client_signature?: boolean | null
          schedule_impact_days?: number | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          tax_rate?: number | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          company_id: string
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          executed_date: string | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          project_id: string
          signed_proposal_file_id: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          executed_date?: string | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          project_id: string
          signed_proposal_file_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          executed_date?: string | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          project_id?: string
          signed_proposal_file_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_signed_proposal_file_id_fkey"
            columns: ["signed_proposal_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      co_signing_sessions: {
        Row: {
          change_order_id: string
          company_id: string
          consent_given: boolean
          consent_text: string | null
          created_at: string
          decline_notes: string | null
          declined_at: string | null
          expires_at: string
          id: string
          recipient_email: string | null
          recipient_name: string | null
          signature_data: string | null
          signature_type: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_user_agent: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          change_order_id: string
          company_id: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          declined_at?: string | null
          expires_at: string
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          change_order_id?: string
          company_id?: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          declined_at?: string | null
          expires_at?: string
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "co_signing_sessions_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_signing_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          ai_tagging_enabled: boolean
          brand_color: string | null
          city: string | null
          created_at: string | null
          default_expiration_days: number
          default_labor_margin_percent: number | null
          default_labor_markup_percent: number | null
          default_labor_rate: number | null
          default_material_margin_percent: number | null
          default_material_markup_percent: number | null
          default_pricing_mode: string
          default_proposal_email_body: string | null
          default_proposal_email_subject: string | null
          default_proposal_pricing_level: string
          default_reminder_email_body: string | null
          default_reminder_email_subject: string | null
          default_reminder_schedule: Json | null
          default_subcontractor_margin_percent: number | null
          default_subcontractor_markup_percent: number | null
          default_tax_rate: number | null
          default_terms_sections: Json | null
          email: string | null
          estimate_number_prefix: string
          estimate_number_sequence: number
          id: string
          license_number: string | null
          logo_url: string | null
          name: string
          phone: string | null
          project_internal_sequence: number
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
          ai_tagging_enabled?: boolean
          brand_color?: string | null
          city?: string | null
          created_at?: string | null
          default_expiration_days?: number
          default_labor_margin_percent?: number | null
          default_labor_markup_percent?: number | null
          default_labor_rate?: number | null
          default_material_margin_percent?: number | null
          default_material_markup_percent?: number | null
          default_pricing_mode?: string
          default_proposal_email_body?: string | null
          default_proposal_email_subject?: string | null
          default_proposal_pricing_level?: string
          default_reminder_email_body?: string | null
          default_reminder_email_subject?: string | null
          default_reminder_schedule?: Json | null
          default_subcontractor_margin_percent?: number | null
          default_subcontractor_markup_percent?: number | null
          default_tax_rate?: number | null
          default_terms_sections?: Json | null
          email?: string | null
          estimate_number_prefix?: string
          estimate_number_sequence?: number
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          project_internal_sequence?: number
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
          ai_tagging_enabled?: boolean
          brand_color?: string | null
          city?: string | null
          created_at?: string | null
          default_expiration_days?: number
          default_labor_margin_percent?: number | null
          default_labor_markup_percent?: number | null
          default_labor_rate?: number | null
          default_material_margin_percent?: number | null
          default_material_markup_percent?: number | null
          default_pricing_mode?: string
          default_proposal_email_body?: string | null
          default_proposal_email_subject?: string | null
          default_proposal_pricing_level?: string
          default_reminder_email_body?: string | null
          default_reminder_email_subject?: string | null
          default_reminder_schedule?: Json | null
          default_subcontractor_margin_percent?: number | null
          default_subcontractor_markup_percent?: number | null
          default_tax_rate?: number | null
          default_terms_sections?: Json | null
          email?: string | null
          estimate_number_prefix?: string
          estimate_number_sequence?: number
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          project_internal_sequence?: number
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
      company_members: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          display_name: string
          id: string
          is_deleted: boolean | null
          member_type: string
          profile_id: string | null
          schedule_color: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          id?: string
          is_deleted?: boolean | null
          member_type: string
          profile_id?: string | null
          schedule_color?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          id?: string
          is_deleted?: boolean | null
          member_type?: string
          profile_id?: string | null
          schedule_color?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          company_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          is_primary: boolean
          label: string | null
          state: string
          updated_at: string | null
          updated_by: string | null
          zip: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          company_id?: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_primary?: boolean
          label?: string | null
          state: string
          updated_at?: string | null
          updated_by?: string | null
          zip: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          company_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_primary?: boolean
          label?: string | null
          state?: string
          updated_at?: string | null
          updated_by?: string | null
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_addresses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
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
          status: string
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
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
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
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
          status?: string
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
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
      cost_catalog: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          created_by: string | null
          default_vendor_id: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          last_verified_at: string | null
          name: string
          notes: string | null
          product_url: string | null
          unit_cost: number
          unit_of_measure: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_vendor_id?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          last_verified_at?: string | null
          name: string
          notes?: string | null
          product_url?: string | null
          unit_cost: number
          unit_of_measure: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_vendor_id?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          last_verified_at?: string | null
          name?: string
          notes?: string | null
          product_url?: string | null
          unit_cost?: number
          unit_of_measure?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_catalog_default_vendor_id_fkey"
            columns: ["default_vendor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          bounced_at: string | null
          company_id: string
          created_at: string
          delivered_at: string | null
          email_type: string
          estimate_id: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          recipient_email: string
          resend_message_id: string | null
          sender_email: string
          sent_at: string
          signing_session_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          bounced_at?: string | null
          company_id: string
          created_at?: string
          delivered_at?: string | null
          email_type: string
          estimate_id?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email: string
          resend_message_id?: string | null
          sender_email: string
          sent_at?: string
          signing_session_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          bounced_at?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          email_type?: string
          estimate_id?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email?: string
          resend_message_id?: string | null
          sender_email?: string
          sent_at?: string
          signing_session_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_signing_session_id_fkey"
            columns: ["signing_session_id"]
            isOneToOne: false
            referencedRelation: "signing_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_categories: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          estimate_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id: string
          id?: string
          name: string
          sort_order: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_categories_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_files: {
        Row: {
          attachment_type: string
          company_id: string
          created_at: string | null
          created_by: string | null
          estimate_id: string
          file_id: string
          id: string
          notes: string | null
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          attachment_type: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id: string
          file_id: string
          id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          attachment_type?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id?: string
          file_id?: string
          id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_files_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          category_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_amount: number | null
          discount_type: string | null
          estimate_id: string
          id: string
          name: string
          notes: string | null
          sort_order: number
          subcategory_id: string | null
          total_price: number
          total_price_override: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category_id: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          estimate_id: string
          id?: string
          name: string
          notes?: string | null
          sort_order: number
          subcategory_id?: string | null
          total_price?: number
          total_price_override?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          estimate_id?: string
          id?: string
          name?: string
          notes?: string | null
          sort_order?: number
          subcategory_id?: string | null
          total_price?: number
          total_price_override?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "estimate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "estimate_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_rows: {
        Row: {
          amount: number | null
          apply_tax: boolean
          catalog_item_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          labor_unit: string | null
          line_item_id: string
          markup_percent: number | null
          name: string
          quantity: number | null
          rate: number | null
          row_type: string
          sort_order: number
          subcontractor_id: string | null
          total: number
          unit_cost: number | null
          unit_of_measure: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          apply_tax?: boolean
          catalog_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          labor_unit?: string | null
          line_item_id: string
          markup_percent?: number | null
          name: string
          quantity?: number | null
          rate?: number | null
          row_type: string
          sort_order: number
          subcontractor_id?: string | null
          total?: number
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          apply_tax?: boolean
          catalog_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          labor_unit?: string | null
          line_item_id?: string
          markup_percent?: number | null
          name?: string
          quantity?: number | null
          rate?: number | null
          row_type?: string
          sort_order?: number
          subcontractor_id?: string | null
          total?: number
          unit_cost?: number | null
          unit_of_measure?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_rows_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "cost_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_rows_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_rows_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_sub_bids: {
        Row: {
          bid_amount: number
          bid_document_file_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          estimate_id: string
          id: string
          is_deleted: boolean | null
          is_winner: boolean
          line_item_id: string
          notes: string | null
          received_at: string | null
          subcontractor_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          bid_amount: number
          bid_document_file_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          estimate_id: string
          id?: string
          is_deleted?: boolean | null
          is_winner?: boolean
          line_item_id: string
          notes?: string | null
          received_at?: string | null
          subcontractor_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          bid_amount?: number
          bid_document_file_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          estimate_id?: string
          id?: string
          is_deleted?: boolean | null
          is_winner?: boolean
          line_item_id?: string
          notes?: string | null
          received_at?: string | null
          subcontractor_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_sub_bids_bid_document_file_id_fkey"
            columns: ["bid_document_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sub_bids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sub_bids_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sub_bids_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_sub_bids_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_subcategories: {
        Row: {
          category_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          estimate_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category_id: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id: string
          id?: string
          name: string
          sort_order: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          estimate_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "estimate_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_subcategories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_subcategories_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          accepted_at: string | null
          client_unsubscribed_at: string | null
          cloned_from_estimate_id: string | null
          company_id: string
          contact_address_id: string | null
          contact_id: string
          cover_letter: string | null
          created_at: string | null
          created_by: string | null
          created_by_role: string
          decline_reason_code: string | null
          decline_reason_notes: string | null
          declined_at: string | null
          deleted_at: string | null
          discount_amount: number | null
          discount_total: number
          discount_type: string | null
          estimate_number: string
          expiration_days: number
          expires_at: string | null
          grand_total: number
          id: string
          internal_notes: string | null
          is_deleted: boolean | null
          labor_markup_percent: number | null
          last_reminder_sent_at: string | null
          material_markup_percent: number | null
          name: string
          parent_estimate_id: string | null
          pricing_mode: string
          project_id: string | null
          proposal_pricing_level: string
          reminder_count: number
          reminder_schedule: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope_sections: Json | null
          scope_summary: string | null
          sent_at: string | null
          signed_proposal_file_id: string | null
          status: string
          subcontractor_markup_percent: number | null
          subtotal: number
          tax_rate: number | null
          tax_total: number
          terms_sections: Json | null
          updated_at: string | null
          updated_by: string | null
          version_number: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_unsubscribed_at?: string | null
          cloned_from_estimate_id?: string | null
          company_id?: string
          contact_address_id?: string | null
          contact_id: string
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_role?: string
          decline_reason_code?: string | null
          decline_reason_notes?: string | null
          declined_at?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_total?: number
          discount_type?: string | null
          estimate_number?: string
          expiration_days?: number
          expires_at?: string | null
          grand_total?: number
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          material_markup_percent?: number | null
          name: string
          parent_estimate_id?: string | null
          pricing_mode?: string
          project_id?: string | null
          proposal_pricing_level?: string
          reminder_count?: number
          reminder_schedule?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_sections?: Json | null
          scope_summary?: string | null
          sent_at?: string | null
          signed_proposal_file_id?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          subtotal?: number
          tax_rate?: number | null
          tax_total?: number
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_unsubscribed_at?: string | null
          cloned_from_estimate_id?: string | null
          company_id?: string
          contact_address_id?: string | null
          contact_id?: string
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_role?: string
          decline_reason_code?: string | null
          decline_reason_notes?: string | null
          declined_at?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          discount_total?: number
          discount_type?: string | null
          estimate_number?: string
          expiration_days?: number
          expires_at?: string | null
          grand_total?: number
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          material_markup_percent?: number | null
          name?: string
          parent_estimate_id?: string | null
          pricing_mode?: string
          project_id?: string | null
          proposal_pricing_level?: string
          reminder_count?: number
          reminder_schedule?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_sections?: Json | null
          scope_summary?: string | null
          sent_at?: string | null
          signed_proposal_file_id?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          subtotal?: number
          tax_rate?: number | null
          tax_total?: number
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_cloned_from_estimate_id_fkey"
            columns: ["cloned_from_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_contact_address_id_fkey"
            columns: ["contact_address_id"]
            isOneToOne: false
            referencedRelation: "contact_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_parent_estimate_id_fkey"
            columns: ["parent_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_signed_proposal_file_id_fkey"
            columns: ["signed_proposal_file_id"]
            isOneToOne: false
            referencedRelation: "files"
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
      inspections: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          inspection_type: string
          inspector: string | null
          is_deleted: boolean | null
          notes: string | null
          permit_file_id: string | null
          project_id: string
          result: string
          scheduled_date: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_type: string
          inspector?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          permit_file_id?: string | null
          project_id: string
          result?: string
          scheduled_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          inspection_type?: string
          inspector?: string | null
          is_deleted?: boolean | null
          notes?: string | null
          permit_file_id?: string | null
          project_id?: string
          result?: string
          scheduled_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_permit_file_id_fkey"
            columns: ["permit_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          member_id: string | null
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
          member_id?: string | null
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
          member_id?: string | null
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
          {
            foreignKeyName: "invitations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
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
      phases: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          name: string
          project_id: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name: string
          project_id: string
          sort_order: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name?: string
          project_id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          is_deleted: boolean | null
          last_name: string
          notes: string | null
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
          is_deleted?: boolean | null
          last_name: string
          notes?: string | null
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
          is_deleted?: boolean | null
          last_name?: string
          notes?: string | null
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
      project_assignments: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          member_id: string
          project_id: string
          role_on_project: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id: string
          project_id: string
          role_on_project?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          project_id?: string
          role_on_project?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budget_items: {
        Row: {
          actual_amount: number | null
          budgeted_amount: number
          committed_amount: number | null
          company_id: string
          cost_code: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_deleted: boolean | null
          project_id: string
          row_type: string | null
          source_line_item_id: string | null
          source_line_row_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          actual_amount?: number | null
          budgeted_amount?: number
          committed_amount?: number | null
          company_id?: string
          cost_code?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_deleted?: boolean | null
          project_id: string
          row_type?: string | null
          source_line_item_id?: string | null
          source_line_row_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          actual_amount?: number | null
          budgeted_amount?: number
          committed_amount?: number | null
          company_id?: string
          cost_code?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_deleted?: boolean | null
          project_id?: string
          row_type?: string | null
          source_line_item_id?: string | null
          source_line_row_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budget_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budget_items_source_line_item_id_fkey"
            columns: ["source_line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budget_items_source_line_row_id_fkey"
            columns: ["source_line_row_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          project_id: string
          role: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          project_id: string
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          project_id?: string
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          change_order_sequence: number
          company_id: string
          contact_address_id: string | null
          contact_id: string
          contract_value: number | null
          cover_letter: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          internal_notes: string | null
          is_deleted: boolean | null
          name: string
          project_internal_seq: number
          project_number: string
          project_type: string
          retainage_percent: number | null
          scope_sections: Json | null
          scope_summary: string | null
          source_estimate_id: string | null
          start_date: string | null
          status: string
          target_end_date: string | null
          tax_rate: number | null
          terms_sections: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          actual_end_date?: string | null
          change_order_sequence?: number
          company_id?: string
          contact_address_id?: string | null
          contact_id: string
          contract_value?: number | null
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          name: string
          project_internal_seq?: number
          project_number?: string
          project_type?: string
          retainage_percent?: number | null
          scope_sections?: Json | null
          scope_summary?: string | null
          source_estimate_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          tax_rate?: number | null
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          actual_end_date?: string | null
          change_order_sequence?: number
          company_id?: string
          contact_address_id?: string | null
          contact_id?: string
          contract_value?: number | null
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          name?: string
          project_internal_seq?: number
          project_number?: string
          project_type?: string
          retainage_percent?: number | null
          scope_sections?: Json | null
          scope_summary?: string | null
          source_estimate_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          tax_rate?: number | null
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contact_address_id_fkey"
            columns: ["contact_address_id"]
            isOneToOne: false
            referencedRelation: "contact_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_list_items: {
        Row: {
          assignee_id: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          completion_photo_file_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_client_visible: boolean | null
          is_deleted: boolean | null
          location: string | null
          priority: string | null
          project_id: string
          punch_list_id: string
          reference_photo_file_id: string | null
          requires_completion_photo: boolean
          requires_verification: boolean
          status: string
          title: string
          trade: string | null
          updated_at: string | null
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_photo_file_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_client_visible?: boolean | null
          is_deleted?: boolean | null
          location?: string | null
          priority?: string | null
          project_id: string
          punch_list_id: string
          reference_photo_file_id?: string | null
          requires_completion_photo?: boolean
          requires_verification?: boolean
          status?: string
          title: string
          trade?: string | null
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_photo_file_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_client_visible?: boolean | null
          is_deleted?: boolean | null
          location?: string | null
          priority?: string | null
          project_id?: string
          punch_list_id?: string
          reference_photo_file_id?: string | null
          requires_completion_photo?: boolean
          requires_verification?: boolean
          status?: string
          title?: string
          trade?: string | null
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_list_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_completion_photo_file_id_fkey"
            columns: ["completion_photo_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_punch_list_id_fkey"
            columns: ["punch_list_id"]
            isOneToOne: false
            referencedRelation: "punch_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_reference_photo_file_id_fkey"
            columns: ["reference_photo_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_lists: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          name: string
          project_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name: string
          project_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          name?: string
          project_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_lists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          end_date: string | null
          entry_date: string
          general_kind: string
          id: string
          is_deleted: boolean | null
          member_id: string
          notes: string | null
          project_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          entry_date: string
          general_kind?: string
          id?: string
          is_deleted?: boolean | null
          member_id: string
          notes?: string | null
          project_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string | null
          entry_date?: string
          general_kind?: string
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          notes?: string | null
          project_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      signing_sessions: {
        Row: {
          company_id: string
          consent_given: boolean
          consent_text: string | null
          created_at: string
          decline_notes: string | null
          decline_reason: string | null
          declined_at: string | null
          estimate_id: string
          expires_at: string
          id: string
          recipient_email: string
          recipient_name: string | null
          signature_data: string | null
          signature_type: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_user_agent: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          company_id: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          estimate_id: string
          expires_at: string
          id?: string
          recipient_email: string
          recipient_name?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          estimate_id?: string
          expires_at?: string
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signing_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signing_sessions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_contracts: {
        Row: {
          company_id: string
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          executed_date: string | null
          id: string
          is_deleted: boolean | null
          member_id: string
          notes: string | null
          project_id: string
          scope_of_work: string | null
          signed_doc_file_id: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          executed_date?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id: string
          notes?: string | null
          project_id: string
          scope_of_work?: string | null
          signed_doc_file_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          executed_date?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          notes?: string | null
          project_id?: string
          scope_of_work?: string | null
          signed_doc_file_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contracts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contracts_signed_doc_file_id_fkey"
            columns: ["signed_doc_file_id"]
            isOneToOne: false
            referencedRelation: "files"
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
      tag_options: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          dependency_type: string
          id: string
          is_deleted: boolean | null
          predecessor_id: string
          successor_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dependency_type?: string
          id?: string
          is_deleted?: boolean | null
          predecessor_id: string
          successor_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          dependency_type?: string
          id?: string
          is_deleted?: boolean | null
          predecessor_id?: string
          successor_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          change_order_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_deleted: boolean | null
          is_scheduled: boolean | null
          percent_complete: number | null
          phase_id: string | null
          priority: string | null
          project_id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          change_order_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_deleted?: boolean | null
          percent_complete?: number | null
          phase_id?: string | null
          priority?: string | null
          project_id: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          change_order_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_deleted?: boolean | null
          percent_complete?: number | null
          phase_id?: string | null
          priority?: string | null
          project_id?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      clone_estimate: {
        Args: {
          p_contact_address_id: string
          p_contact_id: string
          p_name: string
          p_source_id: string
        }
        Returns: {
          new_estimate_id: string
          new_estimate_number: string
        }[]
      }
      clone_estimate_line: {
        Args: {
          p_company_id: string
          p_line: Database["public"]["Tables"]["estimate_line_items"]["Row"]
          p_new_category_id: string
          p_new_estimate_id: string
          p_new_subcategory_id: string
        }
        Returns: string
      }
      can_view_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      convert_estimate_to_project: {
        Args: { p_estimate_id: string }
        Returns: string
      }
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
          member_id: string
          role: string
        }[]
      }
      get_my_company_id: { Args: never; Returns: string }
      get_my_member_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      is_assigned_to_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      next_co_number: {
        Args: { p_project_id: string }
        Returns: string
      }
      next_estimate_number: { Args: never; Returns: string }
      next_project_internal_seq: { Args: never; Returns: number }
      next_project_number: { Args: never; Returns: string }
      seed_default_tags: { Args: { p_company_id: string }; Returns: undefined }
      set_winning_bid: {
        Args: { p_line_item_id: string; p_sub_bid_id: string }
        Returns: undefined
      }
      switch_pricing_mode: {
        Args: { p_estimate_id: string; p_new_mode: string }
        Returns: undefined
      }
      test_invite_lookup: {
        Args: { p_token: string }
        Returns: {
          found_email: string
          found_id: string
          found_role: string
          found_status: string
        }[]
      }
      transfer_ownership: {
        Args: { p_new_owner_id: string }
        Returns: undefined
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
