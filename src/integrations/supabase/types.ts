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
      assets: {
        Row: {
          category: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          quantity_available: number
          quantity_total: number
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          quantity_available?: number
          quantity_total?: number
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          quantity_available?: number
          quantity_total?: number
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Relationships: []
      }
      certificate_download_logs: {
        Row: {
          cedula: string | null
          certificate_id: string
          downloaded_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          cedula?: string | null
          certificate_id: string
          downloaded_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          cedula?: string | null
          certificate_id?: string
          downloaded_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_download_logs_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_email_logs: {
        Row: {
          certificate_id: string
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          sent_at: string | null
          status: Database["public"]["Enums"]["certificate_email_status"]
          subject: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["certificate_email_status"]
          subject: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["certificate_email_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_email_logs_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_types: {
        Row: {
          background_url: string | null
          code: string
          created_at: string
          description: string | null
          fields: Json
          generator_key: string
          id: string
          is_active: boolean
          name: string
          orientation: Database["public"]["Enums"]["certificate_orientation"]
          updated_at: string
        }
        Insert: {
          background_url?: string | null
          code: string
          created_at?: string
          description?: string | null
          fields?: Json
          generator_key: string
          id?: string
          is_active?: boolean
          name: string
          orientation?: Database["public"]["Enums"]["certificate_orientation"]
          updated_at?: string
        }
        Update: {
          background_url?: string | null
          code?: string
          created_at?: string
          description?: string | null
          fields?: Json
          generator_key?: string
          id?: string
          is_active?: boolean
          name?: string
          orientation?: Database["public"]["Enums"]["certificate_orientation"]
          updated_at?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cedula: string
          certificate_kind: string
          certificate_name: string
          certificate_number: string
          certificate_type_id: string
          created_at: string
          email: string | null
          end_date: string | null
          full_name: string
          generated_at: string
          hours: number | null
          id: string
          issued_at: string
          issued_by: string | null
          metadata: Json
          pdf_path: string | null
          pdf_url: string | null
          profile_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          updated_at: string
          verification_code: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cedula: string
          certificate_kind: string
          certificate_name: string
          certificate_number: string
          certificate_type_id: string
          created_at?: string
          email?: string | null
          end_date?: string | null
          full_name: string
          generated_at?: string
          hours?: number | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json
          pdf_path?: string | null
          pdf_url?: string | null
          profile_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          updated_at?: string
          verification_code: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cedula?: string
          certificate_kind?: string
          certificate_name?: string
          certificate_number?: string
          certificate_type_id?: string
          created_at?: string
          email?: string | null
          end_date?: string | null
          full_name?: string
          generated_at?: string
          hours?: number | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          metadata?: Json
          pdf_path?: string | null
          pdf_url?: string | null
          profile_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          updated_at?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_certificate_type_id_fkey"
            columns: ["certificate_type_id"]
            isOneToOne: false
            referencedRelation: "certificate_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      computer_loan_items: {
        Row: {
          computer_id: string | null
          created_at: string
          delivered_condition: Database["public"]["Enums"]["computer_condition"]
          id: string
          item_type: Database["public"]["Enums"]["computer_loan_item_type"]
          loan_id: string
          notes: string | null
          quantity: number
          rack_id: string | null
          returned_at: string | null
          returned_condition:
            | Database["public"]["Enums"]["computer_condition"]
            | null
        }
        Insert: {
          computer_id?: string | null
          created_at?: string
          delivered_condition?: Database["public"]["Enums"]["computer_condition"]
          id?: string
          item_type: Database["public"]["Enums"]["computer_loan_item_type"]
          loan_id: string
          notes?: string | null
          quantity?: number
          rack_id?: string | null
          returned_at?: string | null
          returned_condition?:
            | Database["public"]["Enums"]["computer_condition"]
            | null
        }
        Update: {
          computer_id?: string | null
          created_at?: string
          delivered_condition?: Database["public"]["Enums"]["computer_condition"]
          id?: string
          item_type?: Database["public"]["Enums"]["computer_loan_item_type"]
          loan_id?: string
          notes?: string | null
          quantity?: number
          rack_id?: string | null
          returned_at?: string | null
          returned_condition?:
            | Database["public"]["Enums"]["computer_condition"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "computer_loan_items_computer_id_fkey"
            columns: ["computer_id"]
            isOneToOne: false
            referencedRelation: "computers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loan_items_computer_id_fkey"
            columns: ["computer_id"]
            isOneToOne: false
            referencedRelation: "v_available_computers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loan_items_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "computer_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loan_items_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "computer_racks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loan_items_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "v_available_computers"
            referencedColumns: ["rack_id"]
          },
          {
            foreignKeyName: "computer_loan_items_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "v_computer_racks_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      computer_loans: {
        Row: {
          borrowed_at: string
          borrower_id: string
          created_at: string
          delivered_by: string | null
          expected_return_at: string | null
          id: string
          notes: string | null
          purpose: string | null
          received_back_by: string | null
          registered_by: string
          returned_at: string | null
          status: Database["public"]["Enums"]["computer_loan_status"]
          updated_at: string
        }
        Insert: {
          borrowed_at?: string
          borrower_id: string
          created_at?: string
          delivered_by?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          purpose?: string | null
          received_back_by?: string | null
          registered_by: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["computer_loan_status"]
          updated_at?: string
        }
        Update: {
          borrowed_at?: string
          borrower_id?: string
          created_at?: string
          delivered_by?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          purpose?: string | null
          received_back_by?: string | null
          registered_by?: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["computer_loan_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "computer_loans_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loans_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loans_received_back_by_fkey"
            columns: ["received_back_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computer_loans_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      computer_racks: {
        Row: {
          barcode: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          qr_code: string
          status: Database["public"]["Enums"]["rack_status"]
          updated_at: string
        }
        Insert: {
          barcode: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          qr_code?: string
          status?: Database["public"]["Enums"]["rack_status"]
          updated_at?: string
        }
        Update: {
          barcode?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          qr_code?: string
          status?: Database["public"]["Enums"]["rack_status"]
          updated_at?: string
        }
        Relationships: []
      }
      computers: {
        Row: {
          barcode: string
          brand: string | null
          characteristics: string | null
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          name: string
          operating_system: string | null
          processor: string | null
          rack_id: string | null
          ram: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["computer_status"]
          storage: string | null
          updated_at: string
        }
        Insert: {
          barcode: string
          brand?: string | null
          characteristics?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          name: string
          operating_system?: string | null
          processor?: string | null
          rack_id?: string | null
          ram?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["computer_status"]
          storage?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string
          brand?: string | null
          characteristics?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          name?: string
          operating_system?: string | null
          processor?: string | null
          rack_id?: string | null
          ram?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["computer_status"]
          storage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "computers_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "computer_racks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "computers_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "v_available_computers"
            referencedColumns: ["rack_id"]
          },
          {
            foreignKeyName: "computers_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "v_computer_racks_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          api_hora_actual: string | null
          api_siguiente_hora: string | null
          created_at: string
          id: number
        }
        Insert: {
          api_hora_actual?: string | null
          api_siguiente_hora?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          api_hora_actual?: string | null
          api_siguiente_hora?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      court_reservations: {
        Row: {
          approved_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          court_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          finalized_by: string | null
          id: string
          notes: string | null
          operator_id: string | null
          people_count: number
          purpose: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reservation_date: string | null
          slot_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["court_reservation_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          court_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          finalized_by?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          people_count?: number
          purpose?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reservation_date?: string | null
          slot_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["court_reservation_status"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          court_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          finalized_by?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          people_count?: number
          purpose?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reservation_date?: string | null
          slot_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["court_reservation_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_reservations_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_reservations_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_reservations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_reservations_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "court_time_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_time_slots: {
        Row: {
          court_id: string
          created_at: string
          day_of_week: number
          ends_at: string
          id: string
          is_active: boolean
          starts_at: string
          updated_at: string
        }
        Insert: {
          court_id: string
          created_at?: string
          day_of_week: number
          ends_at: string
          id?: string
          is_active?: boolean
          starts_at: string
          updated_at?: string
        }
        Update: {
          court_id?: string
          created_at?: string
          day_of_week?: number
          ends_at?: string
          id?: string
          is_active?: boolean
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_time_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          asset_id: string | null
          capacity: number | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          location: string | null
          name: string
          requires_approval: boolean
          status: Database["public"]["Enums"]["court_status"]
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          capacity?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location?: string | null
          name: string
          requires_approval?: boolean
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          capacity?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          location?: string | null
          name?: string
          requires_approval?: boolean
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          error_message: string | null
          id: string
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          template: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          recipient_email: string
          sent_at?: string
          status: string
          subject: string
          template: string
        }
        Update: {
          error_message?: string | null
          id?: string
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          template?: string
        }
        Relationships: []
      }
      home_media: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["home_media_kind"]
          storage_path: string | null
          title: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["home_media_kind"]
          storage_path?: string | null
          title?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["home_media_kind"]
          storage_path?: string | null
          title?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          asset_id: string
          borrowed_at: string
          created_at: string
          devolution_at: string | null
          expected_return_at: string | null
          followup_email_sent_at: string | null
          id: string
          notes: string | null
          operator_id: string
          operator_return_id: string | null
          quantity: number
          sanction_applied_at: string | null
          sanction_due_at: string | null
          sanction_email_sent_at: string | null
          sanction_push_sent_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          user_id: string
          warning_due_at: string | null
          warning_email_sent_at: string | null
          warning_push_sent_at: string | null
        }
        Insert: {
          asset_id: string
          borrowed_at?: string
          created_at?: string
          devolution_at?: string | null
          expected_return_at?: string | null
          followup_email_sent_at?: string | null
          id?: string
          notes?: string | null
          operator_id: string
          operator_return_id?: string | null
          quantity?: number
          sanction_applied_at?: string | null
          sanction_due_at?: string | null
          sanction_email_sent_at?: string | null
          sanction_push_sent_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          user_id: string
          warning_due_at?: string | null
          warning_email_sent_at?: string | null
          warning_push_sent_at?: string | null
        }
        Update: {
          asset_id?: string
          borrowed_at?: string
          created_at?: string
          devolution_at?: string | null
          expected_return_at?: string | null
          followup_email_sent_at?: string | null
          id?: string
          notes?: string | null
          operator_id?: string
          operator_return_id?: string | null
          quantity?: number
          sanction_applied_at?: string | null
          sanction_due_at?: string | null
          sanction_email_sent_at?: string | null
          sanction_push_sent_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          user_id?: string
          warning_due_at?: string | null
          warning_email_sent_at?: string | null
          warning_push_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_operator_return_id_fkey"
            columns: ["operator_return_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_buildings: {
        Row: {
          centroid_lat: number
          centroid_lng: number
          code: string | null
          created_at: string
          description: string | null
          faculty: string | null
          floors_count: number
          geom: Json
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          status: Database["public"]["Enums"]["map_feature_status"]
          target_audience: Database["public"]["Enums"]["map_target_audience"]
          updated_at: string
        }
        Insert: {
          centroid_lat: number
          centroid_lng: number
          code?: string | null
          created_at?: string
          description?: string | null
          faculty?: string | null
          floors_count?: number
          geom: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          updated_at?: string
        }
        Update: {
          centroid_lat?: number
          centroid_lng?: number
          code?: string | null
          created_at?: string
          description?: string | null
          faculty?: string | null
          floors_count?: number
          geom?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          updated_at?: string
        }
        Relationships: []
      }
      map_campus_entrances: {
        Row: {
          created_at: string
          description: string | null
          direction: Database["public"]["Enums"]["map_campus_direction"]
          entry_type: Database["public"]["Enums"]["map_campus_entry_type"]
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          status: Database["public"]["Enums"]["map_feature_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["map_campus_direction"]
          entry_type?: Database["public"]["Enums"]["map_campus_entry_type"]
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["map_campus_direction"]
          entry_type?: Database["public"]["Enums"]["map_campus_entry_type"]
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          updated_at?: string
        }
        Relationships: []
      }
      map_entrances: {
        Row: {
          access_modes: Database["public"]["Enums"]["map_access_mode"][]
          building_id: string
          created_at: string
          id: string
          is_active: boolean
          is_main: boolean
          lat: number
          lng: number
          name: string | null
          status: Database["public"]["Enums"]["map_feature_status"]
        }
        Insert: {
          access_modes?: Database["public"]["Enums"]["map_access_mode"][]
          building_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          lat: number
          lng: number
          name?: string | null
          status?: Database["public"]["Enums"]["map_feature_status"]
        }
        Update: {
          access_modes?: Database["public"]["Enums"]["map_access_mode"][]
          building_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          lat?: number
          lng?: number
          name?: string | null
          status?: Database["public"]["Enums"]["map_feature_status"]
        }
        Relationships: [
          {
            foreignKeyName: "map_entrances_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "map_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      map_floors: {
        Row: {
          building_id: string
          created_at: string
          id: string
          is_active: boolean
          level: number
          map_image_url: string | null
          name: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          level: number
          map_image_url?: string | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          level?: number
          map_image_url?: string | null
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "map_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      map_landmarks: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["map_landmark_kind"]
          lat: number
          lng: number
          name: string
          status: Database["public"]["Enums"]["map_feature_status"]
          target_audience: Database["public"]["Enums"]["map_target_audience"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["map_landmark_kind"]
          lat: number
          lng: number
          name: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["map_landmark_kind"]
          lat?: number
          lng?: number
          name?: string
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
        }
        Relationships: []
      }
      map_notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          data: Json | null
          id: string
          sent_at: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json | null
          id?: string
          sent_at?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json | null
          id?: string
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      map_parkings: {
        Row: {
          capacity: number | null
          centroid_lat: number
          centroid_lng: number
          created_at: string
          geom: Json
          id: string
          is_active: boolean
          name: string | null
          status: Database["public"]["Enums"]["map_feature_status"]
          target_audience: Database["public"]["Enums"]["map_target_audience"]
          type: Database["public"]["Enums"]["map_parking_type"]
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          centroid_lat: number
          centroid_lng: number
          created_at?: string
          geom: Json
          id?: string
          is_active?: boolean
          name?: string | null
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          type: Database["public"]["Enums"]["map_parking_type"]
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          centroid_lat?: number
          centroid_lng?: number
          created_at?: string
          geom?: Json
          id?: string
          is_active?: boolean
          name?: string | null
          status?: Database["public"]["Enums"]["map_feature_status"]
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          type?: Database["public"]["Enums"]["map_parking_type"]
          updated_at?: string
        }
        Relationships: []
      }
      map_paths: {
        Row: {
          access_modes: Database["public"]["Enums"]["map_access_mode"][]
          bidirectional: boolean
          created_at: string
          geom: Json
          id: string
          is_active: boolean
          name: string | null
          speed_kmh: number | null
          status: Database["public"]["Enums"]["map_feature_status"]
          updated_at: string
        }
        Insert: {
          access_modes?: Database["public"]["Enums"]["map_access_mode"][]
          bidirectional?: boolean
          created_at?: string
          geom: Json
          id?: string
          is_active?: boolean
          name?: string | null
          speed_kmh?: number | null
          status?: Database["public"]["Enums"]["map_feature_status"]
          updated_at?: string
        }
        Update: {
          access_modes?: Database["public"]["Enums"]["map_access_mode"][]
          bidirectional?: boolean
          created_at?: string
          geom?: Json
          id?: string
          is_active?: boolean
          name?: string | null
          speed_kmh?: number | null
          status?: Database["public"]["Enums"]["map_feature_status"]
          updated_at?: string
        }
        Relationships: []
      }
      map_room_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      map_rooms: {
        Row: {
          building_id: string
          code: string | null
          created_at: string
          description: string | null
          directions: string | null
          floor_id: string | null
          id: string
          image_url: string | null
          is_active: boolean
          keywords: string[] | null
          name: string
          room_type_id: string | null
          target_audience: Database["public"]["Enums"]["map_target_audience"]
          updated_at: string
        }
        Insert: {
          building_id: string
          code?: string | null
          created_at?: string
          description?: string | null
          directions?: string | null
          floor_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          keywords?: string[] | null
          name: string
          room_type_id?: string | null
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          updated_at?: string
        }
        Update: {
          building_id?: string
          code?: string | null
          created_at?: string
          description?: string | null
          directions?: string | null
          floor_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          keywords?: string[] | null
          name?: string
          room_type_id?: string | null
          target_audience?: Database["public"]["Enums"]["map_target_audience"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_rooms_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "map_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "map_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "map_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      map_route_steps: {
        Row: {
          distance_meters: number | null
          id: string
          instruction: string
          lat: number | null
          lng: number | null
          route_id: string
          step_order: number
        }
        Insert: {
          distance_meters?: number | null
          id?: string
          instruction: string
          lat?: number | null
          lng?: number | null
          route_id: string
          step_order: number
        }
        Update: {
          distance_meters?: number | null
          id?: string
          instruction?: string
          lat?: number | null
          lng?: number | null
          route_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_route_steps_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "map_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      map_routes: {
        Row: {
          access_mode: Database["public"]["Enums"]["map_access_mode"]
          created_at: string
          destination_building_id: string | null
          destination_room_id: string | null
          distance_meters: number | null
          duration_seconds: number | null
          geometry: Json | null
          id: string
          origin_lat: number
          origin_lng: number
          user_id: string | null
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["map_access_mode"]
          created_at?: string
          destination_building_id?: string | null
          destination_room_id?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          geometry?: Json | null
          id?: string
          origin_lat: number
          origin_lng: number
          user_id?: string | null
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["map_access_mode"]
          created_at?: string
          destination_building_id?: string | null
          destination_room_id?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          geometry?: Json | null
          id?: string
          origin_lat?: number
          origin_lng?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_routes_destination_building_id_fkey"
            columns: ["destination_building_id"]
            isOneToOne: false
            referencedRelation: "map_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_routes_destination_room_id_fkey"
            columns: ["destination_room_id"]
            isOneToOne: false
            referencedRelation: "map_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          acceso_app_name: string | null
          avatar_url: string | null
          career: string | null
          cedula: string
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          email: string
          faculty: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          qr_code: string
          semester: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          acceso_app_name?: string | null
          avatar_url?: string | null
          career?: string | null
          cedula: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          email: string
          faculty?: string | null
          first_name: string
          id: string
          last_name: string
          phone?: string | null
          qr_code?: string
          semester?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          acceso_app_name?: string | null
          avatar_url?: string | null
          career?: string | null
          cedula?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          email?: string
          faculty?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          qr_code?: string
          semester?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          app_name: string
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_name?: string
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_name?: string
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          condition: string
          created_at: string
          evidence_url: string | null
          id: string
          loan_id: string
          notes: string | null
          operator_id: string
          returned_at: string
        }
        Insert: {
          condition: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          loan_id: string
          notes?: string | null
          operator_id: string
          returned_at?: string
        }
        Update: {
          condition?: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          loan_id?: string
          notes?: string | null
          operator_id?: string
          returned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sanction_reports: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string
          id: string
          loan_id: string | null
          reason: string
          resolved: boolean
          resolved_at: string | null
          severity: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          loan_id?: string | null
          reason: string
          resolved?: boolean
          resolved_at?: string | null
          severity: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          loan_id?: string | null
          reason?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanction_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanction_reports_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanction_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_ratings: {
        Row: {
          created_at: string
          id: string
          observations: string | null
          operator_id: string | null
          rating: number
          target_id: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observations?: string | null
          operator_id?: string | null
          rating: number
          target_id: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observations?: string | null
          operator_id?: string | null
          rating?: number
          target_id?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_ratings_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          type: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          type: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          type?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_available_computers: {
        Row: {
          barcode: string | null
          brand: string | null
          characteristics: string | null
          id: string | null
          model: string | null
          name: string | null
          operating_system: string | null
          processor: string | null
          rack_code: string | null
          rack_id: string | null
          rack_name: string | null
          rack_status: Database["public"]["Enums"]["rack_status"] | null
          ram: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["computer_status"] | null
          storage: string | null
        }
        Relationships: []
      }
      v_computer_racks_availability: {
        Row: {
          available_computers: number | null
          barcode: string | null
          can_be_loaned_as_full_rack: boolean | null
          code: string | null
          has_available_individual_computers: boolean | null
          id: string | null
          loaned_computers: number | null
          location: string | null
          name: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["rack_status"] | null
          total_computers: number | null
          unavailable_computers: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_business_hours: {
        Args: { p_hours: number; p_start: string }
        Returns: string
      }
      check_overdue_loans: { Args: never; Returns: undefined }
      create_loan: {
        Args: {
          p_asset_id: string
          p_notes?: string
          p_operator_id: string
          p_quantity: number
          p_user_id: string
        }
        Returns: string
      }
      generate_certificate_number: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_accessible_rooms: {
        Args: { _user_id?: string }
        Returns: {
          building_id: string
          code: string | null
          created_at: string
          description: string | null
          directions: string | null
          floor_id: string | null
          id: string
          image_url: string | null
          is_active: boolean
          keywords: string[] | null
          name: string
          room_type_id: string | null
          target_audience: Database["public"]["Enums"]["map_target_audience"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "map_rooms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_users: {
        Args: never
        Returns: {
          email: string
          first_name: string
          last_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_available_paths: {
        Args: { _mode: Database["public"]["Enums"]["map_access_mode"] }
        Returns: {
          access_modes: Database["public"]["Enums"]["map_access_mode"][]
          bidirectional: boolean
          created_at: string
          geom: Json
          id: string
          is_active: boolean
          name: string | null
          speed_kmh: number | null
          status: Database["public"]["Enums"]["map_feature_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "map_paths"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_court_available_slots: {
        Args: { p_court_id: string; p_date: string }
        Returns: {
          court_id: string
          day_of_week: number
          ends_at: string
          is_available: boolean
          slot_id: string
          starts_at: string
        }[]
      }
      get_my_cedula: { Args: never; Returns: string }
      get_user_by_qr: {
        Args: { p_qr_code: string }
        Returns: {
          career: string
          cedula: string
          email: string
          faculty: string
          first_name: string
          has_active_loan: boolean
          id: string
          last_name: string
          status: string
        }[]
      }
      get_user_effective_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_profile: { Args: never; Returns: boolean }
      is_admin_or_operator: { Args: never; Returns: boolean }
      is_computer_module_admin: { Args: never; Returns: boolean }
      is_docente_or_admin_profile: { Args: never; Returns: boolean }
      log_map_notification: {
        Args: {
          _body: string
          _channel?: string
          _data?: Json
          _title: string
          _user_id: string
        }
        Returns: string
      }
      map_audience_visible: {
        Args: {
          _audience: Database["public"]["Enums"]["map_target_audience"]
          _user_id: string
        }
        Returns: boolean
      }
      map_is_admin: { Args: { _user_id: string }; Returns: boolean }
      next_business_datetime: { Args: { p_date: string }; Returns: string }
      refresh_computer_rack_status: {
        Args: { _rack_id: string }
        Returns: undefined
      }
      register_return: {
        Args: {
          p_condition: string
          p_evidence_url: string
          p_loan_id: string
          p_notes: string
          p_operator_id: string
        }
        Returns: string
      }
      reset_password_with_otp: {
        Args: { p_code: string; p_email: string }
        Returns: boolean
      }
      return_computer_loan_item: {
        Args: {
          _item_id: string
          _notes?: string
          _received_back_by: string
          _returned_condition?: Database["public"]["Enums"]["computer_condition"]
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_has_active_loan: { Args: { p_user_id: string }; Returns: boolean }
      validate_ecuadorian_cedula: {
        Args: { p_cedula: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "user"
      asset_status: "available" | "loaned" | "maintenance" | "retired"
      certificate_email_status: "pending" | "sent" | "failed"
      certificate_orientation: "portrait" | "landscape"
      certificate_status: "issued" | "sent" | "cancelled"
      computer_condition: "good" | "regular" | "damaged" | "lost"
      computer_loan_item_type: "rack" | "computer"
      computer_loan_status:
        | "active"
        | "returned"
        | "partial_returned"
        | "cancelled"
      computer_status:
        | "available"
        | "loaned"
        | "maintenance"
        | "damaged"
        | "lost"
        | "disabled"
      court_reservation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "completed"
      court_status: "available" | "maintenance" | "disabled"
      doc_type: "cedula" | "pasaporte"
      home_media_kind: "image" | "video"
      loan_status: "active" | "returned" | "overdue" | "sanction"
      map_access_mode: "pedestrian" | "vehicle"
      map_campus_direction: "entry" | "exit" | "both"
      map_campus_entry_type: "pedestrian" | "vehicle" | "mixed"
      map_feature_status:
        | "active"
        | "maintenance"
        | "closed"
        | "temporary_closed"
      map_landmark_kind:
        | "entrance"
        | "exit"
        | "gate"
        | "reference"
        | "emergency"
        | "restroom"
        | "cafeteria"
        | "atm"
        | "other"
        | "plaza"
        | "corridor"
        | "bar"
      map_parking_type:
        | "car"
        | "motorcycle"
        | "bicycle"
        | "bus"
        | "authority"
        | "disabled"
      map_target_audience:
        | "public"
        | "student"
        | "teacher"
        | "staff"
        | "admin"
        | "superadmin"
      rack_status:
        | "available"
        | "partial"
        | "loaned"
        | "maintenance"
        | "disabled"
      user_status: "pending" | "active" | "suspended" | "inactive"
      user_type: "estudiante" | "docente" | "administrativo"
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
    Enums: {
      app_role: ["admin", "operator", "user"],
      asset_status: ["available", "loaned", "maintenance", "retired"],
      certificate_email_status: ["pending", "sent", "failed"],
      certificate_orientation: ["portrait", "landscape"],
      certificate_status: ["issued", "sent", "cancelled"],
      computer_condition: ["good", "regular", "damaged", "lost"],
      computer_loan_item_type: ["rack", "computer"],
      computer_loan_status: [
        "active",
        "returned",
        "partial_returned",
        "cancelled",
      ],
      computer_status: [
        "available",
        "loaned",
        "maintenance",
        "damaged",
        "lost",
        "disabled",
      ],
      court_reservation_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "completed",
      ],
      court_status: ["available", "maintenance", "disabled"],
      doc_type: ["cedula", "pasaporte"],
      home_media_kind: ["image", "video"],
      loan_status: ["active", "returned", "overdue", "sanction"],
      map_access_mode: ["pedestrian", "vehicle"],
      map_campus_direction: ["entry", "exit", "both"],
      map_campus_entry_type: ["pedestrian", "vehicle", "mixed"],
      map_feature_status: [
        "active",
        "maintenance",
        "closed",
        "temporary_closed",
      ],
      map_landmark_kind: [
        "entrance",
        "exit",
        "gate",
        "reference",
        "emergency",
        "restroom",
        "cafeteria",
        "atm",
        "other",
        "plaza",
        "corridor",
        "bar",
      ],
      map_parking_type: [
        "car",
        "motorcycle",
        "bicycle",
        "bus",
        "authority",
        "disabled",
      ],
      map_target_audience: [
        "public",
        "student",
        "teacher",
        "staff",
        "admin",
        "superadmin",
      ],
      rack_status: [
        "available",
        "partial",
        "loaned",
        "maintenance",
        "disabled",
      ],
      user_status: ["pending", "active", "suspended", "inactive"],
      user_type: ["estudiante", "docente", "administrativo"],
    },
  },
} as const
