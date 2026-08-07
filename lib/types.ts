export type Category = {
  id: string;
  name: string;
  discord_webhook_url: string;
  color: string;
  created_at: string;
};

export type Feed = {
  id: string;
  category_id: string;
  name: string;
  url: string;
  active: boolean;
  keywords: string | null;
  created_at: string;
};
