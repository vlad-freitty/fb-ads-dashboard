export type Preset = '7' | '14' | '30' | '90' | 'month' | 'year' | 'all' | 'custom';
export type Dim = 'age_gender' | 'placement' | 'device' | 'region';

export type Totals = {
  spend: number; impressions: number; link_clicks: number; leads: number;
  cpl: number | null; ctr: number | null; cpm: number | null; hook: number | null;
};

export type TrendRow = { bucket: string; spend: number; leads: number; impressions: number; link_clicks: number; cpl: number | null; ctr: number | null };
export type PositionRow = { position: string; spend: number; leads: number; impressions: number; link_clicks: number; cpl: number | null; ctr: number | null; share: number };
export type CampaignRow = { campaign_id: string; campaign: string; brand: string; position: string; status: string | null;
  spend: number; leads: number; impressions: number; link_clicks: number; cpl: number | null; ctr: number | null; cpm: number | null };
export type AdRow = { ad_id: string; ad: string; campaign: string; status: string | null;
  spend: number; leads: number; impressions: number; link_clicks: number; cpl: number | null; ctr: number | null; hook: number | null };
export type AlertRow = { id: string; severity: 'bad' | 'warn'; level: 'campaign' | 'ad'; name: string; spend: number; leads: number; cpl: number | null; ratio: number | null };
export type SegmentRow = { segment: string; spend: number; leads: number; cpl: number | null };

export type DashboardData = {
  client: string;
  clientName: string;
  bounds: { min: string; max: string } | null;
  period: { preset: Preset; from: string; to: string; days: number; prevFrom: string | null; prevTo: string | null; granularity: 'day' | 'month' } | null;
  lastSync: string | null;
  kpi: { cur: Totals; prev: Totals | null } | null;
  trend: TrendRow[];
  positions: PositionRow[];
  campaigns: CampaignRow[];
  ads: AdRow[];
  alerts: { from: string; to: string; avgCpl: number | null; rows: AlertRow[] } | null;
  segments: { dim: Dim; fromMonth: string; toMonth: string; avgCpl: number | null; rows: SegmentRow[] };
};

// ---------------------------------------------------------------- organic
export type Platform = 'facebook' | 'instagram' | 'threads';
export type OrgTotals = {
  followers: number | null; new_followers: number | null; unfollows: number | null; views: number | null;
  reach: number | null; interactions: number | null; profile_views: number | null; posts: number; er: number | null;
};
export type OrgTrendRow = { bucket: string; platform: Platform; views: number | null; reach: number | null;
  interactions: number | null; new_followers: number | null; followers: number | null };
export type OrgAccountRow = { platform: Platform; id: string; name: string; username: string | null; brand: string;
  picture: string | null; followers: number | null; views: number | null; reach: number | null; interactions: number | null;
  new_followers: number | null; posts: number; er: number | null };
export type OrgPost = { platform: Platform; id: string; account: string; brand: string; created_at: string; type: string;
  text: string | null; permalink: string | null; thumb: string | null; views: number | null; reach: number | null;
  likes: number | null; comments: number | null; shares: number | null; saves: number | null; interactions: number | null };
export type OrganicData = {
  brands: { brand: string; platforms: Platform[] }[];
  brand: string;
  platform: Platform | 'all';
  platforms: Platform[];
  bounds: { min: string; max: string } | null;
  period: DashboardData['period'];
  lastSync: string | null;
  kpi: { cur: OrgTotals; prev: OrgTotals | null } | null;
  trend: OrgTrendRow[];
  accounts: OrgAccountRow[];
  posts: OrgPost[];
};
