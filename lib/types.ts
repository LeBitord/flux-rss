export type Category = {
  id: string;
  name: string;
  discord_webhook_url: string;
  discord_channel_id: string | null;
  color: string;
  relevance_context: string | null;
  last_relevance_suggestion_at: string | null;
  pending_relevance_suggestion: string | null;
  frequent_polling: boolean;
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

export type PositionTransactionRow = {
  id: string;
  position_id: string;
  transaction_date: string;
  shares: number;
  price_per_share: number;
  created_at: string;
};

export type StockPosition = {
  id: string;
  ticker: string;
  label: string;
  shares: number | null;
  cost_basis: number | null;
  purchase_date: string | null;
  target_above: number | null;
  target_below: number | null;
  dividends_total: number;
  category_id: string;
  created_at: string;
};

export type PositionDividendRow = {
  id: string;
  position_id: string;
  payment_date: string;
  amount: number;
  created_at: string;
};

export type SportsTeam = {
  id: string;
  category_id: string;
  thesportsdb_id: string;
  name: string;
  emoji: string;
  last_notified_event_id: string | null;
  created_at: string;
};
