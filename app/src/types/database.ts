export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      claims: {
        Row: {
          created_at: string
          id: string
          item_id: string
          note: string | null
          share: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          note?: string | null
          share?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          note?: string | null
          share?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_circles: {
        Row: {
          event_id: string
          group_id: string
        }
        Insert: {
          event_id: string
          group_id: string
        }
        Update: {
          event_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_circles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_circles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_items: {
        Row: {
          added_at: string
          event_id: string
          item_id: string
          position: number | null
        }
        Insert: {
          added_at?: string
          event_id: string
          item_id: string
          position?: number | null
        }
        Update: {
          added_at?: string
          event_id?: string
          item_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          honoree_id: string
          id: string
          kind: string
          note: string | null
          occurs_on: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          honoree_id: string
          id?: string
          kind?: string
          note?: string | null
          occurs_on?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          honoree_id?: string
          id?: string
          kind?: string
          note?: string | null
          occurs_on?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_honoree_id_fkey"
            columns: ["honoree_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          emoji?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          note: string | null
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_groups: {
        Row: {
          group_id: string
          item_id: string
        }
        Insert: {
          group_id: string
          item_id: string
        }
        Update: {
          group_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_photos: {
        Row: {
          created_at: string
          id: string
          item_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          maker: string | null
          note: string | null
          occasion: string
          owner_id: string
          price_text: string | null
          priority: number
          status: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          maker?: string | null
          note?: string | null
          occasion?: string
          owner_id: string
          price_text?: string | null
          priority?: number
          status?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          maker?: string | null
          note?: string | null
          occasion?: string
          owner_id?: string
          price_text?: string | null
          priority?: number
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          disabled_at: string | null
          display_name: string
          handle: string | null
          id: string
          onboarded_at: string | null
          share_token: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          disabled_at?: string | null
          display_name: string
          handle?: string | null
          id: string
          onboarded_at?: string | null
          share_token?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          disabled_at?: string | null
          display_name?: string
          handle?: string | null
          id?: string
          onboarded_at?: string | null
          share_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          note: string | null
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      santa_assignments: {
        Row: {
          created_at: string
          event_id: string
          giver_id: string
          receiver_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          giver_id: string
          receiver_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          giver_id?: string
          receiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "santa_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "santa_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_assignments_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_assignments_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      santa_events: {
        Row: {
          budget_text: string | null
          created_at: string
          created_by: string
          draw_deadline: string | null
          draw_emailed_at: string | null
          gift_date: string | null
          group_id: string
          id: string
          name: string
          start_emailed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_text?: string | null
          created_at?: string
          created_by: string
          draw_deadline?: string | null
          draw_emailed_at?: string | null
          gift_date?: string | null
          group_id: string
          id?: string
          name: string
          start_emailed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_text?: string | null
          created_at?: string
          created_by?: string
          draw_deadline?: string | null
          draw_emailed_at?: string | null
          gift_date?: string | null
          group_id?: string
          id?: string
          name?: string
          start_emailed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "santa_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      santa_exclusions: {
        Row: {
          event_id: string
          user_a: string
          user_b: string
        }
        Insert: {
          event_id: string
          user_a: string
          user_b: string
        }
        Update: {
          event_id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "santa_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "santa_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_exclusions_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_exclusions_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      santa_participants: {
        Row: {
          event_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "santa_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "santa_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "santa_participants_user_id_fkey"
            columns: ["user_id"]
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
      can_see_event: { Args: { _event_id: string }; Returns: boolean }
      can_see_item: { Args: { _item_id: string }; Returns: boolean }
      complete_onboarding: {
        Args: { _display_name: string; _handle?: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          disabled_at: string | null
          display_name: string
          handle: string | null
          id: string
          onboarded_at: string | null
          share_token: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group: {
        Args: { _description?: string; _emoji?: string; _name: string }
        Returns: {
          created_at: string
          created_by: string
          description: string | null
          emoji: string | null
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      get_my_events: {
        Args: never
        Returns: {
          audience_circle_count: number
          created_at: string
          honoree_avatar_url: string
          honoree_display_name: string
          honoree_handle: string
          honoree_id: string
          id: string
          is_honoree: boolean
          item_count: number
          kind: string
          note: string
          occurs_on: string
          title: string
          updated_at: string
        }[]
      }
      get_my_groups: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          description: string
          emoji: string
          id: string
          member_count: number
          name: string
          role: string
          updated_at: string
        }[]
      }
      get_my_santa_events: {
        Args: never
        Returns: {
          budget_text: string
          created_at: string
          created_by: string
          draw_deadline: string
          gift_date: string
          group_id: string
          group_name: string
          id: string
          is_organiser: boolean
          is_participant: boolean
          name: string
          participant_count: number
          status: string
        }[]
      }
      get_people: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
          item_count: number
          latest_at: string
          preview_titles: string[]
          shared_group_count: number
        }[]
      }
      get_public_list: {
        Args: { _token: string }
        Returns: {
          items: Database["public"]["CompositeTypes"]["public_item"][]
          owner: Database["public"]["CompositeTypes"]["public_owner"]
        }[]
      }
      group_admin_count: { Args: { _group_id: string }; Returns: number }
      is_group_admin: { Args: { _group_id: string }; Returns: boolean }
      is_group_member: { Args: { _group_id: string }; Returns: boolean }
      is_santa_organiser: { Args: { _event_id: string }; Returns: boolean }
      is_santa_participant: { Args: { _event_id: string }; Returns: boolean }
      owns_event: { Args: { _event_id: string }; Returns: boolean }
      owns_item: { Args: { _item_id: string }; Returns: boolean }
      redeem_invite: {
        Args: { _token: string }
        Returns: {
          group_emoji: string
          group_id: string
          group_name: string
        }[]
      }
      reveal_santa_event: { Args: { _event_id: string }; Returns: undefined }
      run_santa_draw: { Args: { _event_id: string }; Returns: undefined }
      set_share_token: { Args: { _enabled: boolean }; Returns: string }
      shares_group_with: { Args: { _other_user: string }; Returns: boolean }
      truncate_test_state: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      public_item: {
        id: string | null
        title: string | null
        maker: string | null
        url: string | null
        price_text: string | null
        occasion: string | null
        note: string | null
        cover_url: string | null
        created_at: string | null
      }
      public_owner: {
        display_name: string | null
        handle: string | null
        avatar_url: string | null
      }
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

