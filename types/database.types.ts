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
      contributions: {
        Row: {
          amount_usdc: number
          created_at: string
          id: string
          project_id: string | null
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          amount_usdc: number
          created_at?: string
          id?: string
          project_id?: string | null
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          amount_usdc?: number
          created_at?: string
          id?: string
          project_id?: string | null
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      curator_pitches: {
        Row: {
          curator_id: string | null
          id: string
          project_id: string | null
        }
        Insert: {
          curator_id?: string | null
          id?: string
          project_id?: string | null
        }
        Update: {
          curator_id?: string | null
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curator_pitches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      curators: {
        Row: {
          active_projects: number | null
          backed_projects: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          members_count: number | null
          name: string
          total_raised: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active_projects?: number | null
          backed_projects?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          members_count?: number | null
          name: string
          total_raised?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active_projects?: number | null
          backed_projects?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          members_count?: number | null
          name?: string
          total_raised?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      demo_tracks: {
        Row: {
          created_at: string
          id: string
          project_id: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      financing: {
        Row: {
          enabled: boolean | null
          end_date: string | null
          id: string
          max_contribution: number | null
          min_contribution: number | null
          project_id: string | null
          start_date: string | null
          target_raise: number | null
        }
        Insert: {
          enabled?: boolean | null
          end_date?: string | null
          id?: string
          max_contribution?: number | null
          min_contribution?: number | null
          project_id?: string | null
          start_date?: string | null
          target_raise?: number | null
        }
        Update: {
          enabled?: boolean | null
          end_date?: string | null
          id?: string
          max_contribution?: number | null
          min_contribution?: number | null
          project_id?: string | null
          start_date?: string | null
          target_raise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          description: string | null
          due_date: string | null
          id: string
          project_id: string | null
          requires_approval: boolean | null
          title: string | null
        }
        Insert: {
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          requires_approval?: boolean | null
          title?: string | null
        }
        Update: {
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          requires_approval?: boolean | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          artist_name: string
          content: string | null
          cover_art_url: string | null
          created_at: string | null
          creator_id: string | null
          creatorwalletaddress: string | null
          deal_type: string | null
          description: string | null
          early_curator_shares: boolean | null
          id: string
          platform_fee_pct: number | null
          presale_id: string | null
          splits_contract_address: string | null
          splits_tx_hash: string | null
          status: string | null
          title: string
          track_demo_url: string | null
          voice_intro_url: string | null
        }
        Insert: {
          artist_name: string
          content?: string | null
          cover_art_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          creatorwalletaddress?: string | null
          deal_type?: string | null
          description?: string | null
          early_curator_shares?: boolean | null
          id?: string
          platform_fee_pct?: number | null
          presale_id?: string | null
          splits_contract_address?: string | null
          splits_tx_hash?: string | null
          status?: string | null
          title: string
          track_demo_url?: string | null
          voice_intro_url?: string | null
        }
        Update: {
          artist_name?: string
          content?: string | null
          cover_art_url?: string | null
          created_at?: string | null
          creator_id?: string | null
          creatorwalletaddress?: string | null
          deal_type?: string | null
          description?: string | null
          early_curator_shares?: boolean | null
          id?: string
          platform_fee_pct?: number | null
          presale_id?: string | null
          splits_contract_address?: string | null
          splits_tx_hash?: string | null
          status?: string | null
          title?: string
          track_demo_url?: string | null
          voice_intro_url?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          backend_percentage: number | null
          composition_percentage: number | null
          copyright_type: string | null
          deal_type: string | null
          email: string | null
          flat_fee: number | null
          id: string
          invite_token: string | null
          ipi_number: string | null
          name: string | null
          pro_affiliation: string | null
          producer_points: number | null
          project_id: string | null
          publisher: string | null
          recording_percentage: number | null
          revenue_share_pct: number | null
          role: string | null
          status: Database["public"]["Enums"]["team_member_status"] | null
          wallet_address: string | null
        }
        Insert: {
          backend_percentage?: number | null
          composition_percentage?: number | null
          copyright_type?: string | null
          deal_type?: string | null
          email?: string | null
          flat_fee?: number | null
          id?: string
          invite_token?: string | null
          ipi_number?: string | null
          name?: string | null
          pro_affiliation?: string | null
          producer_points?: number | null
          project_id?: string | null
          publisher?: string | null
          recording_percentage?: number | null
          revenue_share_pct?: number | null
          role?: string | null
          status?: Database["public"]["Enums"]["team_member_status"] | null
          wallet_address?: string | null
        }
        Update: {
          backend_percentage?: number | null
          composition_percentage?: number | null
          copyright_type?: string | null
          deal_type?: string | null
          email?: string | null
          flat_fee?: number | null
          id?: string
          invite_token?: string | null
          ipi_number?: string | null
          name?: string | null
          pro_affiliation?: string | null
          producer_points?: number | null
          project_id?: string | null
          publisher?: string | null
          recording_percentage?: number | null
          revenue_share_pct?: number | null
          role?: string | null
          status?: Database["public"]["Enums"]["team_member_status"] | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          privy_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          privy_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          privy_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      team_member_role:
        | "Producer"
        | "Arranger"
        | "Songwriter"
        | "Musician"
        | "Vocalist"
        | "Engineer"
        | "Mixer"
        | "Mastering"
        | "Assistant"
        | "Tech"
        | "Artist"
        | "Curator"
        | "Manager"
        | "Label"
        | "Publisher"
        | "Composer"
        | "Lyricist"
        | "Performer"
        | "Featured Artist"
        | "Backing Vocalist"
        | "Session Musician"
        | "Sound Designer"
        | "Studio Manager"
        | "A&R"
        | "Marketing"
        | "Legal"
        | "Business Manager"
        | "Tour Manager"
        | "Merchandise Manager"
        | "Social Media Manager"
      team_member_status: "pending" | "invited" | "accepted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      team_member_role: [
        "Producer",
        "Arranger",
        "Songwriter",
        "Musician",
        "Vocalist",
        "Engineer",
        "Mixer",
        "Mastering",
        "Assistant",
        "Tech",
        "Artist",
        "Curator",
        "Manager",
        "Label",
        "Publisher",
        "Composer",
        "Lyricist",
        "Performer",
        "Featured Artist",
        "Backing Vocalist",
        "Session Musician",
        "Sound Designer",
        "Studio Manager",
        "A&R",
        "Marketing",
        "Legal",
        "Business Manager",
        "Tour Manager",
        "Merchandise Manager",
        "Social Media Manager",
      ],
      team_member_status: ["pending", "invited", "accepted"],
    },
  },
} as const
