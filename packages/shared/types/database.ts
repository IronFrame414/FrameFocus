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
          co_number: string
          co_type: string
          company_id: string
          contractor_signature_mode: string | null
          contractor_signature_name: string | null
          contractor_signature_ref: string | null
          contractor_signed_at: string | null
          contractor_signed_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_deleted: boolean | null
          labor_markup_percent: number | null
          last_reminder_sent_at: string | null
          material_markup_percent: number | null
          net_delta: number
          pricing_mode: string
          project_id: string
          reason_category: string | null
          reminder_count: number
          reminder_schedule: Json | null
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
          co_number: string
          co_type?: string
          company_id?: string
          contractor_signature_mode?: string | null
          contractor_signature_name?: string | null
          contractor_signature_ref?: string | null
          contractor_signed_at?: string | null
          contractor_signed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          material_markup_percent?: number | null
          net_delta?: number
          pricing_mode?: string
          project_id: string
          reason_category?: string | null
          reminder_count?: number
          reminder_schedule?: Json | null
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
          co_number?: string
          co_type?: string
          company_id?: string
          contractor_signature_mode?: string | null
          contractor_signature_name?: string | null
          contractor_signature_ref?: string | null
          contractor_signed_at?: string | null
          contractor_signed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          material_markup_percent?: number | null
          net_delta?: number
          pricing_mode?: string
          project_id?: string
          reason_category?: string | null
          reminder_count?: number
          reminder_schedule?: Json | null
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
            foreignKeyName: "change_orders_contractor_signed_by_fkey"
            columns: ["contractor_signed_by"]
            isOneToOne: false
            referencedRelation: "company_members"
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
      client_payment_applications: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string
          is_deleted: boolean | null
          payment_id: string
        }
        Insert: {
          amount: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id: string
          is_deleted?: boolean | null
          payment_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string
          is_deleted?: boolean | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payment_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payment_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "client_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          company_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deletion_reason: string | null
          id: string
          is_deleted: boolean | null
          method: string | null
          note: string | null
          payment_date: string
          qb_payment_id: string | null
          qb_push_status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          company_id?: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          note?: string | null
          payment_date: string
          qb_payment_id?: string | null
          qb_push_status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deletion_reason?: string | null
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          note?: string | null
          payment_date?: string
          qb_payment_id?: string | null
          qb_push_status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_refunds: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          company_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          method: string | null
          project_id: string | null
          qb_push_status: string
          qb_refund_id: string | null
          reason: string | null
          refund_date: string
          source: string
          source_payment_id: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          project_id?: string | null
          qb_push_status?: string
          qb_refund_id?: string | null
          reason?: string | null
          refund_date: string
          source: string
          source_payment_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          project_id?: string | null
          qb_push_status?: string
          qb_refund_id?: string | null
          reason?: string | null
          refund_date?: string
          source?: string
          source_payment_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_refunds_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_refunds_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_refunds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_refunds_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "client_payments"
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
          breaks_paid: boolean
          city: string | null
          contractor_signature_path: string | null
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
          fixed_burden_per_hour: number | null
          gl_account_labor: string | null
          gl_account_material: string | null
          gl_account_other: string | null
          gl_account_subcontractor: string | null
          gps_clock_mode: string
          id: string
          invoice_number_prefix: string
          invoice_number_sequence: number
          license_number: string | null
          logo_url: string | null
          name: string
          ot_threshold_hours: number
          paid_break_cap_minutes: number
          phone: string | null
          project_internal_sequence: number
          slug: string
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          subscription_tier: string
          timezone: string
          trade_type: string | null
          updated_at: string | null
          website: string | null
          week_starts_on: number
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          ai_tagging_enabled?: boolean
          brand_color?: string | null
          breaks_paid?: boolean
          city?: string | null
          contractor_signature_path?: string | null
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
          fixed_burden_per_hour?: number | null
          gl_account_labor?: string | null
          gl_account_material?: string | null
          gl_account_other?: string | null
          gl_account_subcontractor?: string | null
          gps_clock_mode?: string
          id?: string
          invoice_number_prefix?: string
          invoice_number_sequence?: number
          license_number?: string | null
          logo_url?: string | null
          name: string
          ot_threshold_hours?: number
          paid_break_cap_minutes?: number
          phone?: string | null
          project_internal_sequence?: number
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string
          trade_type?: string | null
          updated_at?: string | null
          website?: string | null
          week_starts_on?: number
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          ai_tagging_enabled?: boolean
          brand_color?: string | null
          breaks_paid?: boolean
          city?: string | null
          contractor_signature_path?: string | null
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
          fixed_burden_per_hour?: number | null
          gl_account_labor?: string | null
          gl_account_material?: string | null
          gl_account_other?: string | null
          gl_account_subcontractor?: string | null
          gps_clock_mode?: string
          id?: string
          invoice_number_prefix?: string
          invoice_number_sequence?: number
          license_number?: string | null
          logo_url?: string | null
          name?: string
          ot_threshold_hours?: number
          paid_break_cap_minutes?: number
          phone?: string | null
          project_internal_sequence?: number
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string
          trade_type?: string | null
          updated_at?: string | null
          website?: string | null
          week_starts_on?: number
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
      daily_log_crew: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          daily_log_id: string
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          member_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_crew_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_crew_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_crew_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_log_sub_entries: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          daily_log_id: string
          deleted_at: string | null
          hours: number
          id: string
          is_deleted: boolean | null
          member_id: string
          note: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id: string
          deleted_at?: string | null
          hours: number
          id?: string
          is_deleted?: boolean | null
          member_id: string
          note?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string
          deleted_at?: string | null
          hours?: number
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          note?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_sub_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_sub_entries_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_sub_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          author_member_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          equipment_used: string | null
          hazard_notes: string | null
          hazards_present: boolean
          id: string
          is_deleted: boolean | null
          log_date: string
          material_needed: string | null
          material_used: string | null
          notes: string | null
          pdf_file_id: string | null
          project_id: string
          tasks_tomorrow: string | null
          updated_at: string | null
          updated_by: string | null
          weather: string | null
          work_performed: string | null
        }
        Insert: {
          author_member_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          equipment_used?: string | null
          hazard_notes?: string | null
          hazards_present?: boolean
          id?: string
          is_deleted?: boolean | null
          log_date: string
          material_needed?: string | null
          material_used?: string | null
          notes?: string | null
          pdf_file_id?: string | null
          project_id: string
          tasks_tomorrow?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weather?: string | null
          work_performed?: string | null
        }
        Update: {
          author_member_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          equipment_used?: string | null
          hazard_notes?: string | null
          hazards_present?: boolean
          id?: string
          is_deleted?: boolean | null
          log_date?: string
          material_needed?: string | null
          material_used?: string | null
          notes?: string | null
          pdf_file_id?: string | null
          project_id?: string
          tasks_tomorrow?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weather?: string | null
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_date: string
          has_exceptions: boolean
          id: string
          is_deleted: boolean | null
          notes: string | null
          pdf_file_id: string | null
          project_id: string
          purchase_order_id: string | null
          received_by: string
          updated_at: string | null
          updated_by: string | null
          vendor_name: string
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_date: string
          has_exceptions?: boolean
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          pdf_file_id?: string | null
          project_id: string
          purchase_order_id?: string | null
          received_by?: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_date?: string
          has_exceptions?: boolean
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          pdf_file_id?: string | null
          project_id?: string
          purchase_order_id?: string | null
          received_by?: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_id: string
          description: string
          id: string
          is_deleted: boolean | null
          issue_note: string | null
          po_item_id: string | null
          qty_damaged: number
          qty_received: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_id: string
          description: string
          id?: string
          is_deleted?: boolean | null
          issue_note?: string | null
          po_item_id?: string | null
          qty_damaged?: number
          qty_received?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_id?: string
          description?: string
          id?: string
          is_deleted?: boolean | null
          issue_note?: string | null
          po_item_id?: string | null
          qty_damaged?: number
          qty_received?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          bounced_at: string | null
          change_order_id: string | null
          co_signing_session_id: string | null
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
          change_order_id?: string | null
          co_signing_session_id?: string | null
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
          change_order_id?: string | null
          co_signing_session_id?: string | null
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
            foreignKeyName: "email_logs_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_co_signing_session_id_fkey"
            columns: ["co_signing_session_id"]
            isOneToOne: false
            referencedRelation: "co_signing_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_email_type_fkey"
            columns: ["email_type"]
            isOneToOne: false
            referencedRelation: "email_types"
            referencedColumns: ["email_type"]
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
      email_types: {
        Row: {
          email_type: string
        }
        Insert: {
          email_type: string
        }
        Update: {
          email_type?: string
        }
        Relationships: []
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
          override_cost: number | null
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
          override_cost?: number | null
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
          override_cost?: number | null
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
          contract_type: string
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
          projected_value: number | null
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
          contract_type?: string
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
          projected_value?: number | null
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
          contract_type?: string
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
          projected_value?: number | null
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
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      expense_allocations: {
        Row: {
          amount: number
          budget_item_id: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          expense_id: string
          id: string
          is_deleted: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          budget_item_id: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expense_id: string
          id?: string
          is_deleted?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          budget_item_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expense_id?: string
          id?: string
          is_deleted?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_allocations_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "project_budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_allocations_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          expense_id: string
          id: string
          is_deleted: boolean | null
          method: string | null
          note: string | null
          over_stage: boolean
          paid_date: string
          retainage_withheld: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expense_id: string
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          note?: string | null
          over_stage?: boolean
          paid_date: string
          retainage_withheld?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          expense_id?: string
          id?: string
          is_deleted?: boolean | null
          method?: string | null
          note?: string | null
          over_stage?: boolean
          paid_date?: string
          retainage_withheld?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          author_member_id: string
          awaiting_paper: boolean
          closed_out_at: string | null
          closed_out_by: string | null
          closeout_reason: string | null
          company_id: string
          cost_category: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          expense_date: string
          id: string
          is_deleted: boolean | null
          is_retainage: boolean
          project_id: string
          purchase_order_id: string | null
          qb_export_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_note: string | null
          source_segment_id: string | null
          stage_label: string | null
          state: string
          status: string
          sub_contract_id: string | null
          supplier: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          author_member_id?: string
          awaiting_paper?: boolean
          closed_out_at?: string | null
          closed_out_by?: string | null
          closeout_reason?: string | null
          company_id?: string
          cost_category?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          expense_date: string
          id?: string
          is_deleted?: boolean | null
          is_retainage?: boolean
          project_id: string
          purchase_order_id?: string | null
          qb_export_status?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          source_segment_id?: string | null
          stage_label?: string | null
          state?: string
          status?: string
          sub_contract_id?: string | null
          supplier: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          author_member_id?: string
          awaiting_paper?: boolean
          closed_out_at?: string | null
          closed_out_by?: string | null
          closeout_reason?: string | null
          company_id?: string
          cost_category?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          expense_date?: string
          id?: string
          is_deleted?: boolean | null
          is_retainage?: boolean
          project_id?: string
          purchase_order_id?: string | null
          qb_export_status?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          source_segment_id?: string | null
          stage_label?: string | null
          state?: string
          status?: string
          sub_contract_id?: string | null
          supplier?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_closed_out_by_fkey"
            columns: ["closed_out_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_source_segment_id_fkey"
            columns: ["source_segment_id"]
            isOneToOne: false
            referencedRelation: "time_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_sub_contract_id_fkey"
            columns: ["sub_contract_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          ai_tags: string[] | null
          category: string
          client_visible: boolean
          company_id: string
          created_at: string | null
          created_by: string | null
          daily_log_id: string | null
          deleted_at: string | null
          delivery_id: string | null
          delivery_item_id: string | null
          expense_id: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          invoice_id: string | null
          is_deleted: boolean | null
          is_favorite: boolean
          markup_data: Json | null
          mime_type: string
          project_id: string | null
          safety_incident_id: string | null
          supersedes_id: string | null
          tags: string[] | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          ai_tags?: string[] | null
          category: string
          client_visible?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string | null
          deleted_at?: string | null
          delivery_id?: string | null
          delivery_item_id?: string | null
          expense_id?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          is_favorite?: boolean
          markup_data?: Json | null
          mime_type: string
          project_id?: string | null
          safety_incident_id?: string | null
          supersedes_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          ai_tags?: string[] | null
          category?: string
          client_visible?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_log_id?: string | null
          deleted_at?: string | null
          delivery_id?: string | null
          delivery_item_id?: string | null
          expense_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          is_favorite?: boolean
          markup_data?: Json | null
          mime_type?: string
          project_id?: string | null
          safety_incident_id?: string | null
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
            foreignKeyName: "files_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_safety_incident_id_fkey"
            columns: ["safety_incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
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
      instrument_rates: {
        Row: {
          change_order_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          effective_from: string
          estimate_id: string | null
          id: string
          rate: number
          rate_type: string
          superseded_at: string | null
          superseded_by: string | null
          superseded_reason: string | null
        }
        Insert: {
          change_order_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          estimate_id?: string | null
          id?: string
          rate: number
          rate_type: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
        }
        Update: {
          change_order_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          estimate_id?: string | null
          id?: string
          rate?: number
          rate_type?: string
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instrument_rates_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_rates_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
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
      invoice_cost_claims: {
        Row: {
          claimed_amount: number
          company_id: string
          cost_category: string
          created_at: string | null
          created_by: string | null
          expense_allocation_id: string
          expense_date: string
          id: string
          invoice_id: string
          invoice_line_id: string
        }
        Insert: {
          claimed_amount: number
          company_id?: string
          cost_category: string
          created_at?: string | null
          created_by?: string | null
          expense_allocation_id: string
          expense_date: string
          id?: string
          invoice_id: string
          invoice_line_id: string
        }
        Update: {
          claimed_amount?: number
          company_id?: string
          cost_category?: string
          created_at?: string | null
          created_by?: string | null
          expense_allocation_id?: string
          expense_date?: string
          id?: string
          invoice_id?: string
          invoice_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_cost_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_cost_claims_expense_allocation_id_fkey"
            columns: ["expense_allocation_id"]
            isOneToOne: false
            referencedRelation: "expense_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_cost_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_cost_claims_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_hour_claims: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          invoice_line_id: string
          member_id: string
          raw_hours: number
          time_segment_id: string
          work_date: string
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          invoice_line_id: string
          member_id: string
          raw_hours: number
          time_segment_id: string
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          invoice_line_id?: string
          member_id?: string
          raw_hours?: number
          time_segment_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_hour_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_hour_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_hour_claims_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_hour_claims_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_hour_claims_time_segment_id_fkey"
            columns: ["time_segment_id"]
            isOneToOne: false
            referencedRelation: "time_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          billed_amount: number
          category: string | null
          company_id: string
          cost_basis: number | null
          created_at: string | null
          created_by: string | null
          derived_amount: number | null
          description: string
          id: string
          instrument_rate_id: string | null
          invoice_id: string
          line_type: string
          quantity: number | null
          sort_order: number
          source_change_order_id: string | null
          source_deposit_invoice_id: string | null
          source_estimate_id: string | null
          unit_rate: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          billed_amount?: number
          category?: string | null
          company_id?: string
          cost_basis?: number | null
          created_at?: string | null
          created_by?: string | null
          derived_amount?: number | null
          description: string
          id?: string
          instrument_rate_id?: string | null
          invoice_id: string
          line_type: string
          quantity?: number | null
          sort_order?: number
          source_change_order_id?: string | null
          source_deposit_invoice_id?: string | null
          source_estimate_id?: string | null
          unit_rate?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          billed_amount?: number
          category?: string | null
          company_id?: string
          cost_basis?: number | null
          created_at?: string | null
          created_by?: string | null
          derived_amount?: number | null
          description?: string
          id?: string
          instrument_rate_id?: string | null
          invoice_id?: string
          line_type?: string
          quantity?: number | null
          sort_order?: number
          source_change_order_id?: string | null
          source_deposit_invoice_id?: string | null
          source_estimate_id?: string | null
          unit_rate?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_instrument_rate_id_fkey"
            columns: ["instrument_rate_id"]
            isOneToOne: false
            referencedRelation: "instrument_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_source_change_order_id_fkey"
            columns: ["source_change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_source_deposit_invoice_id_fkey"
            columns: ["source_deposit_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_receivable: number
          approved_at: string | null
          approved_by: string | null
          author_member_id: string
          billed_total: number
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          derived_total: number
          due_date: string | null
          id: string
          invoice_number: string | null
          invoice_type: string
          is_deleted: boolean | null
          is_final: boolean
          issue_date: string
          notes: string | null
          presentation_level: string
          project_id: string
          retainage_percent: number | null
          retainage_withheld: number
          sent_at: string | null
          status: string
          supersedes_invoice_id: string | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_receivable?: number
          approved_at?: string | null
          approved_by?: string | null
          author_member_id?: string
          billed_total?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          derived_total?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          is_deleted?: boolean | null
          is_final?: boolean
          issue_date?: string
          notes?: string | null
          presentation_level?: string
          project_id: string
          retainage_percent?: number | null
          retainage_withheld?: number
          sent_at?: string | null
          status?: string
          supersedes_invoice_id?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_receivable?: number
          approved_at?: string | null
          approved_by?: string | null
          author_member_id?: string
          billed_total?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          derived_total?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          is_deleted?: boolean | null
          is_final?: boolean
          issue_date?: string
          notes?: string | null
          presentation_level?: string
          project_id?: string
          retainage_percent?: number | null
          retainage_withheld?: number
          sent_at?: string | null
          status?: string
          supersedes_invoice_id?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supersedes_invoice_id_fkey"
            columns: ["supersedes_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_burden_settings: {
        Row: {
          burden_multiplier: number
          burden_source: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          member_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          burden_multiplier?: number
          burden_source?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          burden_multiplier?: number
          burden_source?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_burden_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_burden_settings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_pay_rates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          effective_date: string
          hourly_rate: number
          id: string
          is_deleted: boolean | null
          member_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          effective_date: string
          hourly_rate: number
          id?: string
          is_deleted?: boolean | null
          member_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          hourly_rate?: number
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_pay_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pay_rates_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
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
          is_miscellaneous: boolean
          project_id: string
          row_type: string | null
          source_change_order_id: string | null
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
          is_miscellaneous?: boolean
          project_id: string
          row_type?: string | null
          source_change_order_id?: string | null
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
          is_miscellaneous?: boolean
          project_id?: string
          row_type?: string | null
          source_change_order_id?: string | null
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
            foreignKeyName: "project_budget_items_source_change_order_id_fkey"
            columns: ["source_change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
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
      purchase_order_items: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_deleted: boolean | null
          purchase_order_id: string
          qty_ordered: number
          sort_order: number
          unit: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          is_deleted?: boolean | null
          purchase_order_id: string
          qty_ordered: number
          sort_order?: number
          unit?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_deleted?: boolean | null
          purchase_order_id?: string
          qty_ordered?: number
          sort_order?: number
          unit?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          author_member_id: string
          closed_by: string | null
          closed_reason: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          ordered_at: string | null
          po_number: string | null
          project_id: string
          status: string
          total_amount: number | null
          updated_at: string | null
          updated_by: string | null
          vendor_name: string
        }
        Insert: {
          author_member_id?: string
          closed_by?: string | null
          closed_reason?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          ordered_at?: string | null
          po_number?: string | null
          project_id: string
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_name: string
        }
        Update: {
          author_member_id?: string
          closed_by?: string | null
          closed_reason?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          ordered_at?: string | null
          po_number?: string | null
          project_id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      retainage_releases: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          lien_release_warned: boolean
          project_id: string
          recorded_by: string
          release_invoice_id: string | null
          signed_off_on: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          lien_release_warned?: boolean
          project_id: string
          recorded_by: string
          release_invoice_id?: string | null
          signed_off_on: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          lien_release_warned?: boolean
          project_id?: string
          recorded_by?: string
          release_invoice_id?: string | null
          signed_off_on?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retainage_releases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainage_releases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainage_releases_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainage_releases_release_invoice_id_fkey"
            columns: ["release_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incident_injuries: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          incident_id: string
          injured_name: string | null
          is_deleted: boolean | null
          member_id: string | null
          treatment_notes: string | null
          treatment_sought: boolean
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          incident_id: string
          injured_name?: string | null
          is_deleted?: boolean | null
          member_id?: string | null
          treatment_notes?: string | null
          treatment_sought?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          incident_id?: string
          injured_name?: string | null
          is_deleted?: boolean | null
          member_id?: string | null
          treatment_notes?: string | null
          treatment_sought?: boolean
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incident_injuries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_injuries_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_injuries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incident_witnesses: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          incident_id: string
          is_deleted: boolean | null
          member_id: string | null
          updated_at: string | null
          updated_by: string | null
          witness_name: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          incident_id: string
          is_deleted?: boolean | null
          member_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          witness_name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          incident_id?: string
          is_deleted?: boolean | null
          member_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          witness_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incident_witnesses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_witnesses_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "safety_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incident_witnesses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_incidents: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          incident_date: string
          incident_type: string
          is_deleted: boolean | null
          outcome: string | null
          pdf_file_id: string | null
          prevention_notes: string | null
          project_id: string | null
          reported_by_member_id: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          incident_date: string
          incident_type: string
          is_deleted?: boolean | null
          outcome?: string | null
          pdf_file_id?: string | null
          prevention_notes?: string | null
          project_id?: string | null
          reported_by_member_id?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          incident_date?: string
          incident_type?: string
          is_deleted?: boolean | null
          outcome?: string | null
          pdf_file_id?: string | null
          prevention_notes?: string | null
          project_id?: string | null
          reported_by_member_id?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_incidents_reported_by_member_id_fkey"
            columns: ["reported_by_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
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
      subcontractor_compliance_documents: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          doc_type: string
          expiration_date: string | null
          file_id: string | null
          id: string
          is_deleted: boolean | null
          issued_date: string | null
          member_id: string
          notes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          doc_type: string
          expiration_date?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          issued_date?: string | null
          member_id: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string
          expiration_date?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          issued_date?: string | null
          member_id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_compliance_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_compliance_documents_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_compliance_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
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
          requires_formal_contract: boolean
          retainage_percent: number | null
          retainage_shape: string | null
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
          requires_formal_contract?: boolean
          retainage_percent?: number | null
          retainage_shape?: string | null
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
          requires_formal_contract?: boolean
          retainage_percent?: number | null
          retainage_shape?: string | null
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
          did_not_finish: boolean
          ein: string | null
          email: string | null
          id: string
          insurance_expiry: string | null
          is_deleted: boolean | null
          license_number: string | null
          member_id: string | null
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
          did_not_finish?: boolean
          ein?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          is_deleted?: boolean | null
          license_number?: string | null
          member_id?: string | null
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
          did_not_finish?: boolean
          ein?: string | null
          email?: string | null
          id?: string
          insurance_expiry?: string | null
          is_deleted?: boolean | null
          license_number?: string | null
          member_id?: string | null
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
          {
            foreignKeyName: "subcontractors_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
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
          is_scheduled?: boolean | null
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
          is_scheduled?: boolean | null
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
            foreignKeyName: "tasks_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
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
      time_clock_sessions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          clock_in: string
          clock_out: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          gps_in: Json | null
          gps_out: Json | null
          id: string
          is_deleted: boolean | null
          member_id: string
          qb_export_status: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string
          clock_out?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          gps_in?: Json | null
          gps_out?: Json | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          qb_export_status?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          clock_in?: string
          clock_out?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          gps_in?: Json | null
          gps_out?: Json | null
          id?: string
          is_deleted?: boolean | null
          member_id?: string
          qb_export_status?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_sessions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_sessions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      time_edit_logs: {
        Row: {
          changes: Json
          company_id: string
          created_at: string | null
          editor_member_id: string | null
          id: string
          segment_id: string | null
          session_id: string | null
          target_member_id: string | null
        }
        Insert: {
          changes: Json
          company_id: string
          created_at?: string | null
          editor_member_id?: string | null
          id?: string
          segment_id?: string | null
          session_id?: string | null
          target_member_id?: string | null
        }
        Update: {
          changes?: Json
          company_id?: string
          created_at?: string | null
          editor_member_id?: string | null
          id?: string
          segment_id?: string | null
          session_id?: string | null
          target_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_edit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_edit_logs_editor_member_id_fkey"
            columns: ["editor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_edit_logs_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "time_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_edit_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "time_clock_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_edit_logs_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      time_segments: {
        Row: {
          company_id: string
          completion: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          note: string | null
          project_id: string | null
          segment_end: string | null
          segment_start: string
          segment_type: string
          session_id: string
          task_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          completion?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          note?: string | null
          project_id?: string | null
          segment_end?: string | null
          segment_start?: string
          segment_type: string
          session_id: string
          task_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          completion?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          note?: string | null
          project_id?: string | null
          segment_end?: string | null
          segment_start?: string
          segment_type?: string
          session_id?: string
          task_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_segments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "time_clock_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_segments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_session_rate_snapshots: {
        Row: {
          burden_multiplier: number | null
          burden_source: string | null
          company_id: string
          created_at: string | null
          fixed_burden_per_hour: number | null
          hourly_rate: number | null
          id: string
          member_id: string | null
          rate_effective_date: string | null
          session_id: string
        }
        Insert: {
          burden_multiplier?: number | null
          burden_source?: string | null
          company_id: string
          created_at?: string | null
          fixed_burden_per_hour?: number | null
          hourly_rate?: number | null
          id?: string
          member_id?: string | null
          rate_effective_date?: string | null
          session_id: string
        }
        Update: {
          burden_multiplier?: number | null
          burden_source?: string | null
          company_id?: string
          created_at?: string | null
          fixed_burden_per_hour?: number | null
          hourly_rate?: number | null
          id?: string
          member_id?: string | null
          rate_effective_date?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_session_rate_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_session_rate_snapshots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_session_rate_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "time_clock_sessions"
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
      allocate_invoice_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      apply_change_order_budget: {
        Args: { p_change_order_id: string }
        Returns: number
      }
      apply_client_credit: {
        Args: { p_amount: number; p_invoice_id: string; p_payment_id: string }
        Returns: string
      }
      approve_expense: {
        Args: { p_allocations?: Json; p_expense_id: string }
        Returns: undefined
      }
      approve_member_week: {
        Args: { p_member_id: string; p_week_end: string; p_week_start: string }
        Returns: number
      }
      can_approve_member: {
        Args: { p_target_member_id: string }
        Returns: boolean
      }
      can_view_project: { Args: { p_project_id: string }; Returns: boolean }
      can_view_time_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
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
      convert_estimate_to_project: {
        Args: { p_estimate_id: string }
        Returns: string
      }
      create_budget_line_at_capture: {
        Args: {
          p_cost_code?: string
          p_description: string
          p_project_id: string
        }
        Returns: string
      }
      create_safety_incident:
        | {
            Args: {
              p_description: string
              p_incident_date: string
              p_incident_type: string
              p_injuries?: Json
              p_project_id: string
              p_witnesses?: Json
            }
            Returns: string
          }
        | {
            Args: {
              p_description: string
              p_incident_date: string
              p_incident_type: string
              p_injuries: Json
              p_prevention_notes: string
              p_project_id: string
              p_witnesses: Json
            }
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
      get_or_create_misc_budget_item: {
        Args: { p_project_id: string }
        Returns: string
      }
      get_project_day_presence: {
        Args: { p_date: string; p_project_id: string }
        Returns: {
          hours: number
          member_id: string
          warranty_only: boolean
        }[]
      }
      get_project_day_segments: {
        Args: { p_log_date: string; p_project_id: string }
        Returns: {
          display_name: string
          member_id: string
          member_type: string
          segment_end: string
          segment_start: string
          segment_type: string
        }[]
      }
      is_assigned_to_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_my_recent_segment: { Args: { p_segment_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_project_creator: { Args: { p_project_id: string }; Returns: boolean }
      next_co_number: { Args: { p_project_id: string }; Returns: string }
      next_estimate_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_project_internal_seq: { Args: never; Returns: number }
      next_project_number: { Args: never; Returns: string }
      owns_open_session: { Args: { p_session_id: string }; Returns: boolean }
      recompute_budget_item: {
        Args: { p_budget_item_id: string }
        Returns: undefined
      }
      recompute_budget_item_actual: {
        Args: { p_budget_item_id: string }
        Returns: undefined
      }
      recompute_budget_item_committed: {
        Args: { p_budget_item_id: string }
        Returns: undefined
      }
      recompute_delivery_exceptions: {
        Args: { p_delivery_id: string }
        Returns: undefined
      }
      recompute_po_status: { Args: { p_po_id: string }; Returns: undefined }
      record_client_payment: {
        Args: {
          p_amount: number
          p_applications?: Json
          p_contact_id: string
          p_method?: string
          p_note?: string
          p_payment_date?: string
        }
        Returns: string
      }
      record_expense_payment: {
        Args: {
          p_amount: number
          p_expense_id: string
          p_method?: string
          p_note?: string
          p_override_over_stage?: boolean
          p_paid_date: string
        }
        Returns: Json
      }
      revise_sub_contract_schedule: {
        Args: {
          p_contract_value?: number
          p_retainage_percent?: number
          p_retainage_shape?: string
          p_stages: Json
          p_sub_contract_id: string
        }
        Returns: Json
      }
      seed_default_tags: { Args: { p_company_id: string }; Returns: undefined }
      set_line_override_cost: {
        Args: { p_cost: number; p_line_id: string }
        Returns: undefined
      }
      set_po_total_amount: {
        Args: { p_amount: number; p_budget_item_id?: string; p_po_id: string }
        Returns: string
      }
      set_winning_bid: {
        Args: { p_line_item_id: string; p_sub_bid_id: string }
        Returns: undefined
      }
      setup_payment_schedule: {
        Args: {
          p_retainage_percent?: number
          p_retainage_shape?: string
          p_stages: Json
          p_sub_contract_id: string
        }
        Returns: Json
      }
      supersede_instrument_rate: {
        Args: {
          p_rate_id: string
          p_reason: string
          p_replacement_effective_from?: string
          p_replacement_rate?: number
        }
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
      time_member_rank: { Args: { p_member_id: string }; Returns: number }
      time_role_rank: { Args: { p_role: string }; Returns: number }
      time_session_member: { Args: { p_session_id: string }; Returns: string }
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
