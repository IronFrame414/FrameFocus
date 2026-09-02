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
      ai_tag_logs: {
        Row: {
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
      archived_documents: {
        Row: {
          amounts: Json | null
          archived_at: string
          company_id: string
          company_name: string
          document: Json
          id: string
          pdf_paths: Json
          project_name: string | null
          source_id: string
          source_table: string
        }
        Insert: {
          amounts?: Json | null
          archived_at?: string
          company_id: string
          company_name: string
          document: Json
          id?: string
          pdf_paths?: Json
          project_name?: string | null
          source_id: string
          source_table: string
        }
        Update: {
          amounts?: Json | null
          archived_at?: string
          company_id?: string
          company_name?: string
          document?: Json
          id?: string
          pdf_paths?: Json
          project_name?: string | null
          source_id?: string
          source_table?: string
        }
        Relationships: []
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
          supersedes_change_order_id: string | null
          tax_rate: number | null
          title: string
          updated_at: string | null
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
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
          supersedes_change_order_id?: string | null
          tax_rate?: number | null
          title: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          supersedes_change_order_id?: string | null
          tax_rate?: number | null
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
          {
            foreignKeyName: "change_orders_supersedes_fkey"
            columns: ["supersedes_change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_mentions: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          mentioned_profile_id: string
          message_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          id?: string
          mentioned_profile_id: string
          message_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          mentioned_profile_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_mentions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_mentions_mentioned_profile_id_fkey"
            columns: ["mentioned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_photos: {
        Row: {
          company_id: string
          created_at: string | null
          file_id: string
          id: string
          message_id: string
          sort_order: number
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          file_id: string
          id?: string
          message_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          file_id?: string
          id?: string
          message_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_photos_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_photos_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          author_profile_id: string
          body: string
          company_id: string
          created_at: string | null
          id: string
          thread_id: string
        }
        Insert: {
          author_profile_id: string
          body: string
          company_id?: string
          created_at?: string | null
          id?: string
          thread_id: string
        }
        Update: {
          author_profile_id?: string
          body?: string
          company_id?: string
          created_at?: string | null
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          last_read_at: string
          profile_id: string
          thread_id: string
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
          last_read_at?: string
          profile_id: string
          thread_id: string
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
          last_read_at?: string
          profile_id?: string
          thread_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          kind: string
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
          kind: string
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
          kind?: string
          project_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access_events: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string | null
          from_state: string
          id: string
          profile_id: string
          reason: string | null
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          company_id?: string
          created_at?: string | null
          from_state: string
          id?: string
          profile_id: string
          reason?: string | null
          to_state: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string | null
          from_state?: string
          id?: string
          profile_id?: string
          reason?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_amounts: {
        Row: {
          client_contract_id: string
          company_id: string
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_contract_id: string
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_contract_id?: string
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_amounts_client_contract_id_fkey"
            columns: ["client_contract_id"]
            isOneToOne: true
            referencedRelation: "client_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_amounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          company_id: string
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
          qb_synced_at: string | null
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
          qb_synced_at?: string | null
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
          qb_synced_at?: string | null
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
          qb_object_type: string | null
          qb_push_status: string
          qb_refund_id: string | null
          qb_synced_at: string | null
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
          qb_object_type?: string | null
          qb_push_status?: string
          qb_refund_id?: string | null
          qb_synced_at?: string | null
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
          qb_object_type?: string | null
          qb_push_status?: string
          qb_refund_id?: string | null
          qb_synced_at?: string | null
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
      client_reminder_settings: {
        Row: {
          body: string | null
          company_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          enabled: boolean
          id: string
          schedule: Json | null
          subject: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          schedule?: Json | null
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          schedule?: Json | null
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_reminder_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reminder_settings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
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
          signer_channel: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_profile_id: string | null
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
          signer_channel?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_profile_id?: string | null
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
          signer_channel?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_profile_id?: string | null
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
          {
            foreignKeyName: "co_signing_sessions_signer_profile_id_fkey"
            columns: ["signer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          client_contracts_enabled: boolean
          contractor_signature_path: string | null
          created_at: string | null
          default_deposit_percent: number | null
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
          default_retainage_percent: number | null
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
          margin_target_percent: number | null
          name: string
          notify_hours_end: string
          notify_hours_start: string
          ot_threshold_hours: number
          paid_break_cap_minutes: number
          payment_method_on_file: boolean
          phone: string | null
          project_internal_sequence: number
          qb_connected_at: string | null
          qb_connection_state: string
          qb_income_item_id: string | null
          qb_income_item_name: string | null
          qb_last_refresh_at: string | null
          qb_payments_enabled: boolean
          qb_realm_id: string | null
          qb_reauth_required_after: string | null
          qb_refresh_rotated_at: string | null
          qb_token_secret_id: string | null
          signatory_name: string | null
          signatory_title: string | null
          slug: string
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          subscription_tier: string
          timezone: string
          trade_type: string | null
          updated_at: string | null
          updated_by: string | null
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
          client_contracts_enabled?: boolean
          contractor_signature_path?: string | null
          created_at?: string | null
          default_deposit_percent?: number | null
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
          default_retainage_percent?: number | null
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
          margin_target_percent?: number | null
          name: string
          notify_hours_end?: string
          notify_hours_start?: string
          ot_threshold_hours?: number
          paid_break_cap_minutes?: number
          payment_method_on_file?: boolean
          phone?: string | null
          project_internal_sequence?: number
          qb_connected_at?: string | null
          qb_connection_state?: string
          qb_income_item_id?: string | null
          qb_income_item_name?: string | null
          qb_last_refresh_at?: string | null
          qb_payments_enabled?: boolean
          qb_realm_id?: string | null
          qb_reauth_required_after?: string | null
          qb_refresh_rotated_at?: string | null
          qb_token_secret_id?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string
          trade_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
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
          client_contracts_enabled?: boolean
          contractor_signature_path?: string | null
          created_at?: string | null
          default_deposit_percent?: number | null
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
          default_retainage_percent?: number | null
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
          margin_target_percent?: number | null
          name?: string
          notify_hours_end?: string
          notify_hours_start?: string
          ot_threshold_hours?: number
          paid_break_cap_minutes?: number
          payment_method_on_file?: boolean
          phone?: string | null
          project_internal_sequence?: number
          qb_connected_at?: string | null
          qb_connection_state?: string
          qb_income_item_id?: string | null
          qb_income_item_name?: string | null
          qb_last_refresh_at?: string | null
          qb_payments_enabled?: boolean
          qb_realm_id?: string | null
          qb_reauth_required_after?: string | null
          qb_refresh_rotated_at?: string | null
          qb_token_secret_id?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          timezone?: string
          trade_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
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
          qb_customer_id: string | null
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
          qb_customer_id?: string | null
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
          qb_customer_id?: string | null
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
      contract_document_attachments: {
        Row: {
          attached_after_execution: boolean
          company_id: string
          contract_document_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          file_id: string | null
          id: string
          is_deleted: boolean | null
          label: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          attached_after_execution?: boolean
          company_id?: string
          contract_document_id: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          label: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          attached_after_execution?: boolean
          company_id?: string
          contract_document_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          label?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_document_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_document_attachments_document_fkey"
            columns: ["contract_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_document_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_documents: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          delivery_mode: string
          document_kind: string
          estimate_id: string | null
          executed_pdf_file_id: string | null
          filled_values: Json
          generated_pdf_file_id: string | null
          id: string
          is_deleted: boolean | null
          project_id: string | null
          sent_at: string | null
          status: string
          sub_contract_id: string | null
          supersedes_document_id: string | null
          template_id: string
          updated_at: string | null
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_mode: string
          document_kind: string
          estimate_id?: string | null
          executed_pdf_file_id?: string | null
          filled_values?: Json
          generated_pdf_file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          sub_contract_id?: string | null
          supersedes_document_id?: string | null
          template_id: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          delivery_mode?: string
          document_kind?: string
          estimate_id?: string | null
          executed_pdf_file_id?: string | null
          filled_values?: Json
          generated_pdf_file_id?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          sub_contract_id?: string | null
          supersedes_document_id?: string | null
          template_id?: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_executed_pdf_file_id_fkey"
            columns: ["executed_pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_generated_pdf_file_id_fkey"
            columns: ["generated_pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_sub_contract_id_fkey"
            columns: ["sub_contract_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_supersedes_fkey"
            columns: ["supersedes_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signing_sessions: {
        Row: {
          company_id: string
          consent_given: boolean
          consent_text: string | null
          contract_document_id: string
          created_at: string | null
          decline_notes: string | null
          declined_at: string | null
          expires_at: string
          id: string
          initial_data: string | null
          initial_type: string | null
          recipient_email: string | null
          signature_data: string | null
          signature_type: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_user_agent: string | null
          status: string
          token: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string
          consent_given?: boolean
          consent_text?: string | null
          contract_document_id: string
          created_at?: string | null
          decline_notes?: string | null
          declined_at?: string | null
          expires_at: string
          id?: string
          initial_data?: string | null
          initial_type?: string | null
          recipient_email?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          consent_given?: boolean
          consent_text?: string | null
          contract_document_id?: string
          created_at?: string | null
          decline_notes?: string | null
          declined_at?: string | null
          expires_at?: string
          id?: string
          initial_data?: string | null
          initial_type?: string | null
          recipient_email?: string | null
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signing_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signing_sessions_document_fkey"
            columns: ["contract_document_id"]
            isOneToOne: false
            referencedRelation: "contract_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_template_boxes: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          custom_label: string | null
          deleted_at: string | null
          height: number
          id: string
          is_deleted: boolean | null
          kind: string
          page: number
          party: string | null
          template_id: string
          updated_at: string | null
          updated_by: string | null
          value_key: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          deleted_at?: string | null
          height: number
          id?: string
          is_deleted?: boolean | null
          kind: string
          page?: number
          party?: string | null
          template_id: string
          updated_at?: string | null
          updated_by?: string | null
          value_key?: string | null
          width: number
          x: number
          y: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          deleted_at?: string | null
          height?: number
          id?: string
          is_deleted?: boolean | null
          kind?: string
          page?: number
          party?: string | null
          template_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value_key?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_template_boxes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_template_boxes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          document_kind: string
          id: string
          is_default: boolean
          is_deleted: boolean | null
          name: string
          pdf_file_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_kind: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean | null
          name: string
          pdf_file_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          document_kind?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean | null
          name?: string
          pdf_file_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_catalog: {
        Row: {
          category: string
          company_id: string
          cost_code: string | null
          created_at: string | null
          created_by: string | null
          default_vendor_id: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          is_favorite: boolean
          item_type: string
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
          cost_code?: string | null
          created_at?: string | null
          created_by?: string | null
          default_vendor_id?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean
          item_type?: string
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
          cost_code?: string | null
          created_at?: string | null
          created_by?: string | null
          default_vendor_id?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_favorite?: boolean
          item_type?: string
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
      deletion_jobs: {
        Row: {
          attempts: number
          auth_done: boolean
          company_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          started_at: string | null
          state: string
          storage_done: boolean
          tables_done: string[]
          updated_at: string
        }
        Insert: {
          attempts?: number
          auth_done?: boolean
          company_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          state?: string
          storage_done?: boolean
          tables_done?: string[]
          updated_at?: string
        }
        Update: {
          attempts?: number
          auth_done?: boolean
          company_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          started_at?: string | null
          state?: string
          storage_done?: boolean
          tables_done?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
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
          checked_in_at?: string | null
          checked_in_by?: string | null
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
          checked_in_at?: string | null
          checked_in_by?: string | null
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
            foreignKeyName: "deliveries_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
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
          company_id: string | null
          created_at: string
          delivered_at: string | null
          email_type: string
          estimate_id: string | null
          id: string
          invoice_id: string | null
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
          company_id?: string | null
          created_at?: string
          delivered_at?: string | null
          email_type: string
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
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
          company_id?: string | null
          created_at?: string
          delivered_at?: string | null
          email_type?: string
          estimate_id?: string | null
          id?: string
          invoice_id?: string | null
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
            foreignKeyName: "email_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
      email_unsubscribes: {
        Row: {
          company_id: string
          created_at: string | null
          email: string
          id: string
          scope: string
          source: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          email: string
          id?: string
          scope?: string
          source?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          email?: string
          id?: string
          scope?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_award_bases: {
        Row: {
          awarded_at: string
          company_id: string
          created_at: string
          id: string
          labor_amount: number | null
          line_row_id: string
          material_amount: number | null
          scope_coverage_percent: number | null
          sub_bid_id: string | null
        }
        Insert: {
          awarded_at?: string
          company_id?: string
          created_at?: string
          id?: string
          labor_amount?: number | null
          line_row_id: string
          material_amount?: number | null
          scope_coverage_percent?: number | null
          sub_bid_id?: string | null
        }
        Update: {
          awarded_at?: string
          company_id?: string
          created_at?: string
          id?: string
          labor_amount?: number | null
          line_row_id?: string
          material_amount?: number | null
          scope_coverage_percent?: number | null
          sub_bid_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_award_bases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_award_bases_line_row_id_fkey"
            columns: ["line_row_id"]
            isOneToOne: true
            referencedRelation: "estimate_line_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_award_bases_sub_bid_id_fkey"
            columns: ["sub_bid_id"]
            isOneToOne: false
            referencedRelation: "estimate_sub_bids"
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
      estimate_events: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          kind: string
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          estimate_id: string
          id?: string
          kind: string
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          estimate_id?: string
          id?: string
          kind?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_events_estimate_id_fkey"
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
          vendor_id: string | null
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
          vendor_id?: string | null
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
          vendor_id?: string | null
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
          {
            foreignKeyName: "estimate_line_rows_vendor_id_fkey"
            columns: ["vendor_id"]
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
          bid_holds_until: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          estimate_id: string
          exclusions: string | null
          id: string
          is_deleted: boolean | null
          is_winner: boolean
          labor_amount: number | null
          line_item_id: string
          material_amount: number | null
          notes: string | null
          received_at: string | null
          scope_coverage_percent: number | null
          subcontractor_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          bid_amount: number
          bid_document_file_id?: string | null
          bid_holds_until?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          estimate_id: string
          exclusions?: string | null
          id?: string
          is_deleted?: boolean | null
          is_winner?: boolean
          labor_amount?: number | null
          line_item_id: string
          material_amount?: number | null
          notes?: string | null
          received_at?: string | null
          scope_coverage_percent?: number | null
          subcontractor_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          bid_amount?: number
          bid_document_file_id?: string | null
          bid_holds_until?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          estimate_id?: string
          exclusions?: string | null
          id?: string
          is_deleted?: boolean | null
          is_winner?: boolean
          labor_amount?: number | null
          line_item_id?: string
          material_amount?: number | null
          notes?: string | null
          received_at?: string | null
          scope_coverage_percent?: number | null
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
          also_send_to: Json
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
          deposit_percent: number | null
          discount_amount: number | null
          discount_total: number
          discount_type: string | null
          estimate_number: string
          expiration_days: number
          expires_at: string | null
          grand_total: number
          id: string
          include_client_contract: boolean
          internal_notes: string | null
          invoice_due_days: number | null
          is_deleted: boolean | null
          labor_markup_percent: number | null
          last_reminder_sent_at: string | null
          legal_description: string | null
          lost_reason_code: string | null
          material_markup_percent: number | null
          name: string
          parent_estimate_id: string | null
          pricing_mode: string
          project_id: string | null
          projected_value: number | null
          proposal_pricing_level: string
          reminder_count: number
          reminder_schedule: Json | null
          retainage_percent: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope_sections: Json | null
          scope_summary: string | null
          sent_at: string | null
          signed_contract_file_id: string | null
          signed_proposal_file_id: string | null
          start_date: string | null
          status: string
          subcontractor_markup_percent: number | null
          substantial_completion_days: number | null
          subtotal: number
          supersedes_estimate_id: string | null
          target_end_date: string | null
          tax_rate: number | null
          tax_total: number
          terms_sections: Json | null
          updated_at: string | null
          updated_by: string | null
          version_number: string
          viewed_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          also_send_to?: Json
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
          deposit_percent?: number | null
          discount_amount?: number | null
          discount_total?: number
          discount_type?: string | null
          estimate_number?: string
          expiration_days?: number
          expires_at?: string | null
          grand_total?: number
          id?: string
          include_client_contract?: boolean
          internal_notes?: string | null
          invoice_due_days?: number | null
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          legal_description?: string | null
          lost_reason_code?: string | null
          material_markup_percent?: number | null
          name: string
          parent_estimate_id?: string | null
          pricing_mode?: string
          project_id?: string | null
          projected_value?: number | null
          proposal_pricing_level?: string
          reminder_count?: number
          reminder_schedule?: Json | null
          retainage_percent?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_sections?: Json | null
          scope_summary?: string | null
          sent_at?: string | null
          signed_contract_file_id?: string | null
          signed_proposal_file_id?: string | null
          start_date?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          substantial_completion_days?: number | null
          subtotal?: number
          supersedes_estimate_id?: string | null
          target_end_date?: string | null
          tax_rate?: number | null
          tax_total?: number
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: string
          viewed_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          also_send_to?: Json
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
          deposit_percent?: number | null
          discount_amount?: number | null
          discount_total?: number
          discount_type?: string | null
          estimate_number?: string
          expiration_days?: number
          expires_at?: string | null
          grand_total?: number
          id?: string
          include_client_contract?: boolean
          internal_notes?: string | null
          invoice_due_days?: number | null
          is_deleted?: boolean | null
          labor_markup_percent?: number | null
          last_reminder_sent_at?: string | null
          legal_description?: string | null
          lost_reason_code?: string | null
          material_markup_percent?: number | null
          name?: string
          parent_estimate_id?: string | null
          pricing_mode?: string
          project_id?: string | null
          projected_value?: number | null
          proposal_pricing_level?: string
          reminder_count?: number
          reminder_schedule?: Json | null
          retainage_percent?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_sections?: Json | null
          scope_summary?: string | null
          sent_at?: string | null
          signed_contract_file_id?: string | null
          signed_proposal_file_id?: string | null
          start_date?: string | null
          status?: string
          subcontractor_markup_percent?: number | null
          substantial_completion_days?: number | null
          subtotal?: number
          supersedes_estimate_id?: string | null
          target_end_date?: string | null
          tax_rate?: number | null
          tax_total?: number
          terms_sections?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          version_number?: string
          viewed_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
            foreignKeyName: "estimates_signed_contract_file_id_fkey"
            columns: ["signed_contract_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_signed_proposal_file_id_fkey"
            columns: ["signed_proposal_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_supersedes_estimate_id_fkey"
            columns: ["supersedes_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
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
          source_selection_id: string | null
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
          source_selection_id?: string | null
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
          source_selection_id?: string | null
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
          {
            foreignKeyName: "expense_allocations_source_selection_id_fkey"
            columns: ["source_selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
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
          retainage_percent_applied: number | null
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
          retainage_percent_applied?: number | null
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
          retainage_percent_applied?: number | null
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
          qb_bill_id: string | null
          qb_push_status: string
          qb_synced_at: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_note: string | null
          source_po_id: string | null
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
          qb_bill_id?: string | null
          qb_push_status?: string
          qb_synced_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          source_po_id?: string | null
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
          qb_bill_id?: string | null
          qb_push_status?: string
          qb_synced_at?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_note?: string | null
          source_po_id?: string | null
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
            foreignKeyName: "expenses_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
      export_jobs: {
        Row: {
          bytes_written: number
          categories: string[]
          company_id: string | null
          created_at: string
          cursor: Json
          expires_at: string | null
          format: string
          id: string
          kind: string
          last_error: string | null
          object_path: string | null
          project_id: string | null
          requested_by: string | null
          state: string
          updated_at: string
        }
        Insert: {
          bytes_written?: number
          categories?: string[]
          company_id?: string | null
          created_at?: string
          cursor?: Json
          expires_at?: string | null
          format?: string
          id?: string
          kind?: string
          last_error?: string | null
          object_path?: string | null
          project_id?: string | null
          requested_by?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          bytes_written?: number
          categories?: string[]
          company_id?: string | null
          created_at?: string
          cursor?: Json
          expires_at?: string | null
          format?: string
          id?: string
          kind?: string
          last_error?: string | null
          object_path?: string | null
          project_id?: string | null
          requested_by?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_categories: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          is_system: boolean
          key: string
          label: string
          project_id: string | null
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
          is_deleted?: boolean
          is_system?: boolean
          key: string
          label: string
          project_id?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          is_system?: boolean
          key?: string
          label?: string
          project_id?: string | null
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            foreignKeyName: "files_category_fkey"
            columns: ["company_id", "category"]
            isOneToOne: false
            referencedRelation: "file_categories"
            referencedColumns: ["company_id", "key"]
          },
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
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          is_deleted: boolean | null
          member_id: string | null
          project_id: string | null
          role: string
          status: string
          token: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          is_deleted?: boolean | null
          member_id?: string | null
          project_id?: string | null
          role: string
          status?: string
          token?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          is_deleted?: boolean | null
          member_id?: string | null
          project_id?: string | null
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
            foreignKeyName: "invitations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          source_estimate_line_item_id: string | null
          source_selection_id: string | null
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
          source_estimate_line_item_id?: string | null
          source_selection_id?: string | null
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
          source_estimate_line_item_id?: string | null
          source_selection_id?: string | null
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
          {
            foreignKeyName: "invoice_lines_source_estimate_line_item_id_fkey"
            columns: ["source_estimate_line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_source_selection_id_fkey"
            columns: ["source_selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
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
          last_reminder_sent_at: string | null
          notes: string | null
          presentation_level: string
          project_id: string
          qb_invoice_id: string | null
          qb_push_status: string
          qb_synced_at: string | null
          qb_void_memo: string | null
          reminder_count: number
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
          last_reminder_sent_at?: string | null
          notes?: string | null
          presentation_level?: string
          project_id: string
          qb_invoice_id?: string | null
          qb_push_status?: string
          qb_synced_at?: string | null
          qb_void_memo?: string | null
          reminder_count?: number
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
          last_reminder_sent_at?: string | null
          notes?: string | null
          presentation_level?: string
          project_id?: string
          qb_invoice_id?: string | null
          qb_push_status?: string
          qb_synced_at?: string | null
          qb_void_memo?: string | null
          reminder_count?: number
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
      lien_release_template_boxes: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          custom_label: string | null
          deleted_at: string | null
          height: number
          id: string
          is_deleted: boolean | null
          kind: string
          page: number
          template_id: string
          updated_at: string | null
          updated_by: string | null
          value_key: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          deleted_at?: string | null
          height: number
          id?: string
          is_deleted?: boolean | null
          kind: string
          page?: number
          template_id: string
          updated_at?: string | null
          updated_by?: string | null
          value_key?: string | null
          width: number
          x: number
          y: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          custom_label?: string | null
          deleted_at?: string | null
          height?: number
          id?: string
          is_deleted?: boolean | null
          kind?: string
          page?: number
          template_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value_key?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "lien_release_template_boxes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_release_template_boxes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "lien_release_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      lien_release_templates: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          direction: string
          id: string
          is_default: boolean
          is_deleted: boolean | null
          is_final: boolean
          jurisdiction_state: string | null
          name: string
          pdf_file_id: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean | null
          is_final?: boolean
          jurisdiction_state?: string | null
          name: string
          pdf_file_id?: string | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean | null
          is_final?: boolean
          jurisdiction_state?: string | null
          name?: string
          pdf_file_id?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lien_release_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_release_templates_pdf_file_id_fkey"
            columns: ["pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      lien_releases: {
        Row: {
          amount: number | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          direction: string
          expense_id: string | null
          filled_values: Json
          generated_pdf_file_id: string | null
          id: string
          invoice_id: string | null
          is_deleted: boolean | null
          is_final: boolean
          notarized_pdf_file_id: string | null
          notary_required: boolean
          status: string
          sub_contract_id: string | null
          supersedes_release_id: string | null
          template_id: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          expense_id?: string | null
          filled_values?: Json
          generated_pdf_file_id?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          is_final?: boolean
          notarized_pdf_file_id?: string | null
          notary_required?: boolean
          status?: string
          sub_contract_id?: string | null
          supersedes_release_id?: string | null
          template_id?: string | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          expense_id?: string | null
          filled_values?: Json
          generated_pdf_file_id?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          is_final?: boolean
          notarized_pdf_file_id?: string | null
          notary_required?: boolean
          status?: string
          sub_contract_id?: string | null
          supersedes_release_id?: string | null
          template_id?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lien_releases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_generated_pdf_file_id_fkey"
            columns: ["generated_pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_notarized_pdf_file_id_fkey"
            columns: ["notarized_pdf_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_sub_contract_id_fkey"
            columns: ["sub_contract_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_supersedes_release_id_fkey"
            columns: ["supersedes_release_id"]
            isOneToOne: false
            referencedRelation: "lien_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lien_releases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "lien_release_templates"
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
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          link_key: string | null
          link_params: Json
          project_id: string | null
          read_at: string | null
          recipient_profile_id: string
          source_id: string | null
          source_table: string | null
          starred: boolean
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          link_key?: string | null
          link_params?: Json
          project_id?: string | null
          read_at?: string | null
          recipient_profile_id: string
          source_id?: string | null
          source_table?: string | null
          starred?: boolean
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          link_key?: string | null
          link_params?: Json
          project_id?: string | null
          read_at?: string | null
          recipient_profile_id?: string
          source_id?: string | null
          source_table?: string | null
          starred?: boolean
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          client_access_state: string
          company_id: string
          contact_id: string | null
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
          client_access_state?: string
          company_id: string
          contact_id?: string | null
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
          client_access_state?: string
          company_id?: string
          contact_id?: string | null
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
          {
            foreignKeyName: "profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      project_budget_amounts: {
        Row: {
          budget_item_id: string
          budgeted_amount: number
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          budget_item_id: string
          budgeted_amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          budget_item_id?: string
          budgeted_amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_amounts_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: true
            referencedRelation: "project_budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budget_amounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budget_items: {
        Row: {
          actual_amount: number | null
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
      project_financials: {
        Row: {
          company_id: string
          contract_value: number | null
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          contract_value?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_financials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_financials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          cancelled_at: string | null
          change_order_sequence: number
          company_id: string
          contact_address_id: string | null
          contact_id: string
          cover_letter: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          internal_notes: string | null
          is_deleted: boolean | null
          legal_description: string | null
          name: string
          po_sequence: number
          project_internal_seq: number
          project_number: string
          project_type: string
          qb_sub_customer_id: string | null
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
          cancelled_at?: string | null
          change_order_sequence?: number
          company_id?: string
          contact_address_id?: string | null
          contact_id: string
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          legal_description?: string | null
          name: string
          po_sequence?: number
          project_internal_seq?: number
          project_number?: string
          project_type?: string
          qb_sub_customer_id?: string | null
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
          cancelled_at?: string | null
          change_order_sequence?: number
          company_id?: string
          contact_address_id?: string | null
          contact_id?: string
          cover_letter?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean | null
          legal_description?: string | null
          name?: string
          po_sequence?: number
          project_internal_seq?: number
          project_number?: string
          project_type?: string
          qb_sub_customer_id?: string | null
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
      proposal_views: {
        Row: {
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          user_agent: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          estimate_id: string
          id?: string
          user_agent?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          estimate_id?: string
          id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_views_estimate_id_fkey"
            columns: ["estimate_id"]
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
      purchase_order_item_assignments: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          member_id: string
          po_item_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          member_id: string
          po_item_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          member_id?: string
          po_item_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_item_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_item_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_item_assignments_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          budget_item_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string
          flag_note: string | null
          flagged_at: string | null
          flagged_by: string | null
          id: string
          is_deleted: boolean | null
          line_status: string
          purchase_order_id: string
          qty_ordered: number
          sort_order: number
          source_line_row_id: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          budget_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description: string
          flag_note?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          is_deleted?: boolean | null
          line_status?: string
          purchase_order_id: string
          qty_ordered: number
          sort_order?: number
          source_line_row_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          budget_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          flag_note?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          id?: string
          is_deleted?: boolean | null
          line_status?: string
          purchase_order_id?: string
          qty_ordered?: number
          sort_order?: number
          source_line_row_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_budget_item_id_fkey"
            columns: ["budget_item_id"]
            isOneToOne: false
            referencedRelation: "project_budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_source_line_row_id_fkey"
            columns: ["source_line_row_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_rows"
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
          deliver_to: string | null
          id: string
          is_deleted: boolean | null
          need_by: string | null
          ordered_at: string | null
          po_number: string | null
          project_id: string
          source_estimate_id: string | null
          status: string
          total_amount: number | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
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
          deliver_to?: string | null
          id?: string
          is_deleted?: boolean | null
          need_by?: string | null
          ordered_at?: string | null
          po_number?: string | null
          project_id: string
          source_estimate_id?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
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
          deliver_to?: string | null
          id?: string
          is_deleted?: boolean | null
          need_by?: string | null
          ordered_at?: string | null
          po_number?: string | null
          project_id?: string
          source_estimate_id?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
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
          {
            foreignKeyName: "purchase_orders_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          device_label: string | null
          endpoint: string
          id: string
          is_deleted: boolean | null
          last_seen_at: string | null
          p256dh: string
          profile_id: string
          surface: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          auth: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          device_label?: string | null
          endpoint: string
          id?: string
          is_deleted?: boolean | null
          last_seen_at?: string | null
          p256dh: string
          profile_id: string
          surface: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          device_label?: string | null
          endpoint?: string
          id?: string
          is_deleted?: boolean | null
          last_seen_at?: string | null
          p256dh?: string
          profile_id?: string
          surface?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_read_budget: {
        Row: {
          company_id: string
          coreplus_reads: number
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          last_read_at: string | null
          period_month: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          coreplus_reads?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          last_read_at?: string | null
          period_month: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          coreplus_reads?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          last_read_at?: string | null
          period_month?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_read_budget_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_sync_queue: {
        Row: {
          attempts: number
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          depends_on_id: string | null
          entity_id: string
          entity_type: string
          id: string
          is_deleted: boolean | null
          last_error: string | null
          next_attempt_at: string | null
          operation: string
          realm_id: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          attempts?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          depends_on_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_deleted?: boolean | null
          last_error?: string | null
          next_attempt_at?: string | null
          operation: string
          realm_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          depends_on_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_deleted?: boolean | null
          last_error?: string | null
          next_attempt_at?: string | null
          operation?: string
          realm_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_sync_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_sync_queue_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "qb_sync_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_webhook_events: {
        Row: {
          company_id: string | null
          created_at: string | null
          entity_id: string
          entity_last_updated: string | null
          entity_name: string
          id: string
          intuit_event_id: string
          operation: string
          realm_id: string
          received_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          entity_id: string
          entity_last_updated?: string | null
          entity_name: string
          id?: string
          intuit_event_id: string
          operation: string
          realm_id: string
          received_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          entity_id?: string
          entity_last_updated?: string | null
          entity_name?: string
          id?: string
          intuit_event_id?: string
          operation?: string
          realm_id?: string
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      scope_library: {
        Row: {
          bullets: Json
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          section_kind: string
          sort_order: number
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          bullets?: Json
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          section_kind?: string
          sort_order?: number
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          bullets?: Json
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          section_kind?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_library_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_amounts: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          inherited_markup_percent: number | null
          selection_id: string
          snapshot_at: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          inherited_markup_percent?: number | null
          selection_id: string
          snapshot_at?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          inherited_markup_percent?: number | null
          selection_id?: string
          snapshot_at?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selection_amounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_amounts_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_areas: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
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
          is_deleted?: boolean
          name: string
          project_id: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          project_id?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selection_areas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_areas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_message_photos: {
        Row: {
          company_id: string
          created_at: string
          file_id: string
          id: string
          message_id: string
          sort_order: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          file_id: string
          id?: string
          message_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          file_id?: string
          id?: string
          message_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "selection_message_photos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_message_photos_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_message_photos_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "selection_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_messages: {
        Row: {
          author_profile_id: string
          body: string
          company_id: string
          created_at: string
          id: string
          link_url: string | null
          thread_id: string
        }
        Insert: {
          author_profile_id: string
          body: string
          company_id?: string
          created_at?: string
          id?: string
          link_url?: string | null
          thread_id: string
        }
        Update: {
          author_profile_id?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          link_url?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selection_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "selection_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_notes: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          internal_notes: string
          selection_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          internal_notes?: string
          selection_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          internal_notes?: string
          selection_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selection_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_notes_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_option_amounts: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          markup_percent: number | null
          option_id: string
          quantity: number
          unit_cost: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          markup_percent?: number | null
          option_id: string
          quantity?: number
          unit_cost?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          markup_percent?: number | null
          option_id?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selection_option_amounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_option_amounts_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: true
            referencedRelation: "selection_options"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_options: {
        Row: {
          catalog_item_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          image_file_id: string | null
          is_chosen: boolean
          is_deleted: boolean
          link_thumbnail_file_id: string | null
          link_url: string | null
          name: string
          selection_id: string
          sort_order: number
          source: string
          source_budget_item_id: string | null
          spec_detail: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          catalog_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_file_id?: string | null
          is_chosen?: boolean
          is_deleted?: boolean
          link_thumbnail_file_id?: string | null
          link_url?: string | null
          name: string
          selection_id: string
          sort_order?: number
          source?: string
          source_budget_item_id?: string | null
          spec_detail?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          catalog_item_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_file_id?: string | null
          is_chosen?: boolean
          is_deleted?: boolean
          link_thumbnail_file_id?: string | null
          link_url?: string | null
          name?: string
          selection_id?: string
          sort_order?: number
          source?: string
          source_budget_item_id?: string | null
          spec_detail?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selection_options_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "cost_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_options_image_file_id_fkey"
            columns: ["image_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_options_link_thumbnail_file_id_fkey"
            columns: ["link_thumbnail_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_options_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_options_source_budget_item_id_fkey"
            columns: ["source_budget_item_id"]
            isOneToOne: false
            referencedRelation: "project_budget_items"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_signing_sessions: {
        Row: {
          company_id: string
          consent_given: boolean
          consent_text: string | null
          created_at: string
          decline_notes: string | null
          declined_at: string | null
          id: string
          selection_id: string
          signature_data: string | null
          signature_type: string | null
          signed_at: string | null
          signer_channel: string
          signer_ip: string | null
          signer_name: string | null
          signer_profile_id: string | null
          signer_user_agent: string | null
          snapshot: Json | null
          status: string
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          declined_at?: string | null
          id?: string
          selection_id: string
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_channel?: string
          signer_ip?: string | null
          signer_name?: string | null
          signer_profile_id?: string | null
          signer_user_agent?: string | null
          snapshot?: Json | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          consent_given?: boolean
          consent_text?: string | null
          created_at?: string
          decline_notes?: string | null
          declined_at?: string | null
          id?: string
          selection_id?: string
          signature_data?: string | null
          signature_type?: string | null
          signed_at?: string | null
          signer_channel?: string
          signer_ip?: string | null
          signer_name?: string | null
          signer_profile_id?: string | null
          signer_user_agent?: string | null
          snapshot?: Json | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "selection_signing_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_signing_sessions_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_signing_sessions_signer_profile_id_fkey"
            columns: ["signer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_threads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          selection_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          selection_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          selection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selection_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_threads_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: true
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      selections: {
        Row: {
          allow_multiple: boolean
          allowance_budget_item_id: string | null
          area_id: string | null
          client_supplied: boolean
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_deleted: boolean
          mode: string
          name: string
          offered_allowance_deduction: number | null
          offered_at: string | null
          offered_sell_amount: number | null
          offered_variance: number | null
          project_id: string
          show_differences: boolean
          signed_allowance_deduction: number | null
          signed_at: string | null
          signed_sell_amount: number | null
          signed_session_id: string | null
          signed_variance: number | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allow_multiple?: boolean
          allowance_budget_item_id?: string | null
          area_id?: string | null
          client_supplied?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_deleted?: boolean
          mode?: string
          name: string
          offered_allowance_deduction?: number | null
          offered_at?: string | null
          offered_sell_amount?: number | null
          offered_variance?: number | null
          project_id: string
          show_differences?: boolean
          signed_allowance_deduction?: number | null
          signed_at?: string | null
          signed_sell_amount?: number | null
          signed_session_id?: string | null
          signed_variance?: number | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allow_multiple?: boolean
          allowance_budget_item_id?: string | null
          area_id?: string | null
          client_supplied?: boolean
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_deleted?: boolean
          mode?: string
          name?: string
          offered_allowance_deduction?: number | null
          offered_at?: string | null
          offered_sell_amount?: number | null
          offered_variance?: number | null
          project_id?: string
          show_differences?: boolean
          signed_allowance_deduction?: number | null
          signed_at?: string | null
          signed_sell_amount?: number | null
          signed_session_id?: string | null
          signed_variance?: number | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selections_allowance_budget_item_id_fkey"
            columns: ["allowance_budget_item_id"]
            isOneToOne: false
            referencedRelation: "project_budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "selection_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_signed_session_id_fkey"
            columns: ["signed_session_id"]
            isOneToOne: false
            referencedRelation: "selection_signing_sessions"
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
          completed_at: string | null
          completed_by: string | null
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
          completed_at?: string | null
          completed_by?: string | null
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
          completed_at?: string | null
          completed_by?: string | null
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
      subcontractor_financials: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          default_hourly_rate: number | null
          default_markup_percent: number | null
          ein: string | null
          id: string
          subcontractor_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_hourly_rate?: number | null
          default_markup_percent?: number | null
          ein?: string | null
          id?: string
          subcontractor_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_hourly_rate?: number | null
          default_markup_percent?: number | null
          ein?: string | null
          id?: string
          subcontractor_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_financials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_financials_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: true
            referencedRelation: "subcontractors"
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
          deleted_at: string | null
          did_not_finish: boolean
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
          deleted_at?: string | null
          did_not_finish?: boolean
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
          deleted_at?: string | null
          did_not_finish?: boolean
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
      sync_conflicts: {
        Row: {
          author_member_id: string
          captured_at: string
          company_id: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          project_id: string | null
          rejected_body: Json
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          server_updated_at: string
          status: string
          target_row_id: string
          target_table: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          author_member_id: string
          captured_at: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          rejected_body: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_updated_at: string
          status?: string
          target_row_id: string
          target_table: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          author_member_id?: string
          captured_at?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          project_id?: string | null
          rejected_body?: Json
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          server_updated_at?: string
          status?: string
          target_row_id?: string
          target_table?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_author_member_id_fkey"
            columns: ["author_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "company_members"
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
          qb_push_status: string
          qb_synced_at: string | null
          qb_time_activity_id: string | null
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
          qb_push_status?: string
          qb_synced_at?: string | null
          qb_time_activity_id?: string | null
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
          qb_push_status?: string
          qb_synced_at?: string | null
          qb_time_activity_id?: string | null
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
          company_id: string | null
          created_at: string | null
          email: string
          id: string
          trial_number: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          trial_number?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          trial_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "trial_emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_lifecycle: {
        Row: {
          company_id: string
          created_at: string
          delete_after: string | null
          deleted_at: string | null
          locked_at: string | null
          postponed_by: string | null
          postponed_reason: string | null
          postponed_until: string | null
          reason: string
          resubscribe_token: string
          retention_warned_1_at: string | null
          retention_warned_2_at: string | null
          trial_end: string
          updated_at: string
          warned_3_at: string | null
          warned_7_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          delete_after?: string | null
          deleted_at?: string | null
          locked_at?: string | null
          postponed_by?: string | null
          postponed_reason?: string | null
          postponed_until?: string | null
          reason?: string
          resubscribe_token?: string
          retention_warned_1_at?: string | null
          retention_warned_2_at?: string | null
          trial_end: string
          updated_at?: string
          warned_3_at?: string | null
          warned_7_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          delete_after?: string | null
          deleted_at?: string | null
          locked_at?: string | null
          postponed_by?: string | null
          postponed_reason?: string | null
          postponed_until?: string | null
          reason?: string
          resubscribe_token?: string
          retention_warned_1_at?: string | null
          retention_warned_2_at?: string | null
          trial_end?: string
          updated_at?: string
          warned_3_at?: string | null
          warned_7_at?: string | null
        }
        Relationships: []
      }
      trial_warning_acknowledgements: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          profile_id: string | null
          warning_kind: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string | null
          warning_kind: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string | null
          warning_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_warning_acknowledgements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_warning_acknowledgements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      allowance_effective_markup_percent: {
        Args: { p_budget_item_id: string }
        Returns: number
      }
      allowance_sell_amount: {
        Args: { p_budget_item_id: string }
        Returns: number
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
      budget_line_policy_digest: {
        Args: never
        Returns: {
          policy_cmd: string
          policy_name: string
        }[]
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
      chat_can_post: { Args: { p_thread_id: string }; Returns: boolean }
      chat_mark_read: { Args: { p_thread_id: string }; Returns: string }
      chat_sub_thread_exists: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      chat_sub_thread_projects: {
        Args: never
        Returns: {
          project_id: string
        }[]
      }
      chat_switcher_threads: {
        Args: never
        Returns: {
          kind: string
          last_message_at: string
          project_id: string
          project_name: string
          thread_id: string
          unread_count: number
        }[]
      }
      client_document_visible: { Args: { p_status: string }; Returns: boolean }
      client_has_full_access: { Args: never; Returns: boolean }
      client_invoice_sections: {
        Args: { p_invoice_id: string }
        Returns: {
          billed_subtotal: number
          category: string
          invoice_id: string
        }[]
      }
      client_proposals: {
        Args: { p_project_id: string }
        Returns: {
          accepted_at: string
          contract_type: string
          declined_at: string
          estimate_number: string
          expires_at: string
          grand_total: number
          id: string
          name: string
          sent_at: string
          status: string
          viewed_at: string
        }[]
      }
      client_schedule: {
        Args: { p_project_id: string }
        Returns: {
          due_date: string
          id: string
          phase_name: string
          project_id: string
          start_date: string
          status: string
          title: string
        }[]
      }
      client_window_open: {
        Args: { p_actual_end: string; p_cancelled_at: string; p_status: string }
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
      company_ai_tags_this_month: { Args: never; Returns: number }
      company_storage_used_bytes: { Args: never; Returns: number }
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
      email_has_account: { Args: { p_email: string }; Returns: boolean }
      flag_po_item_missing: {
        Args: { p_item_id: string; p_note: string }
        Returns: undefined
      }
      generate_company_slug: {
        Args: { p_company_name: string; p_exclude_company_id?: string }
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
          contact_id: string
          id: string
          member_id: string
          role: string
        }[]
      }
      get_invitation_status: { Args: { invite_token: string }; Returns: string }
      get_my_company_id: { Args: never; Returns: string }
      get_my_contact_id: { Args: never; Returns: string }
      get_my_member_id: { Args: never; Returns: string }
      get_my_profile_id: { Args: never; Returns: string }
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
      is_client_of_project: { Args: { p_project_id: string }; Returns: boolean }
      is_my_company_locked: { Args: never; Returns: boolean }
      is_my_recent_segment: { Args: { p_segment_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_project_creator: { Args: { p_project_id: string }; Returns: boolean }
      issue_po_lines: {
        Args: { p_item_ids: string[]; p_po_id: string }
        Returns: undefined
      }
      mark_estimate_lost: {
        Args: { p_estimate_id: string; p_reason_code: string }
        Returns: undefined
      }
      mark_po_lines_purchased: {
        Args: { p_item_ids: string[]; p_po_id: string }
        Returns: undefined
      }
      may_enter_client_thread: { Args: never; Returns: boolean }
      member_profile_role: { Args: { p_member_id: string }; Returns: string }
      my_assigned_site_address_ids: { Args: never; Returns: string[] }
      my_client_access_level: { Args: never; Returns: string }
      my_client_site_address_ids: { Args: never; Returns: string[] }
      my_company_id_flat: { Args: never; Returns: string }
      my_company_lock_reason: { Args: never; Returns: string }
      next_co_number: { Args: { p_project_id: string }; Returns: string }
      next_estimate_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_po_number: { Args: { p_project_id: string }; Returns: string }
      next_project_internal_seq: { Args: never; Returns: number }
      next_project_number: { Args: never; Returns: string }
      owns_open_session: { Args: { p_session_id: string }; Returns: boolean }
      project_has_unsigned_contract: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      prune_proposal_views: { Args: never; Returns: number }
      qb_vault_forget: { Args: { p_secret_id: string }; Returns: undefined }
      qb_vault_get: { Args: { p_secret_id: string }; Returns: string }
      qb_vault_put: {
        Args: { p_company_id: string; p_payload: string; p_secret_id?: string }
        Returns: string
      }
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
      revert_invoice_settlement: {
        Args: { p_invoice_id: string }
        Returns: undefined
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
      seed_file_categories: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      selection_client_allowance_deduction: {
        Args: { p_selection_id: string }
        Returns: number
      }
      selection_client_option_sell: {
        Args: { p_selection_id: string }
        Returns: {
          option_id: string
          sell: number
        }[]
      }
      selection_client_pick: {
        Args: { p_option_ids: string[]; p_selection_id: string }
        Returns: number
      }
      selection_inherited_markup_percent: {
        Args: { p_selection_id: string }
        Returns: number
      }
      selection_option_images: {
        Args: { p_selection_id: string }
        Returns: {
          file_id: string
          file_path: string
          kind: string
          mime_type: string
          option_id: string
        }[]
      }
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
      shares_assigned_project_with_me: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      submit_delivery_check_in: {
        Args: { p_delivery_id: string }
        Returns: undefined
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
      sync_po_commitment: { Args: { p_po_id: string }; Returns: undefined }
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
      unlock_trial_company: { Args: { p_company_id: string }; Returns: number }
      void_estimate: {
        Args: { p_estimate_id: string; p_reason: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
