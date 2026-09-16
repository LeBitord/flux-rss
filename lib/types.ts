export type Category = {
  id: string;
  name: string;
  discord_webhook_url: string;
  discord_channel_id: string | null;
  color: string;
  relevance_context: string | null;
  last_relevance_suggestion_at: string | null;
  pending_relevance_suggestion: string | null;
  created_at: string;
};

export type Feed = {
  id: string;
  category_id: string;
  name: string;
  url: string;
  active: boolean;
  keywords: string | null;
  exclude_keywords: string | null;
  consecutive_errors: number;
  last_success_at: string | null;
  last_new_item_at: string | null;
  last_health_alert_at: string | null;
  created_at: string;
};

export type StockPosition = {
  id: string;
  ticker: string;
  label: string;
  category_id: string;
  created_at: string;
};
