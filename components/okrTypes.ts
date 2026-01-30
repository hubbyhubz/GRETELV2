export type OKRCadence = 'quarterly' | 'annual' | 'custom';
export type OKRStatus = 'draft' | 'active' | 'closed';

export type OKRMetricType = 'number' | 'percent' | 'currency' | 'count' | 'milestone';
export type OKRDirection = 'increase_to' | 'decrease_to' | 'maintain_at' | 'complete';
export type OKRCheckinFrequency = 'daily' | 'weekly';
export type OKRHealth = 'on_track' | 'at_risk' | 'off_track';

export type OKRCycleRow = {
  id: string;
  user_id: string;
  name: string;
  cadence: OKRCadence;
  start_date: string;
  end_date: string;
  status: OKRStatus;
  reminder_time: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OKRObjectiveRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  title: string;
  description?: string | null;
  status: OKRStatus;
  priority: number;
  aligned_to_objective_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OKRKeyResultRow = {
  id: string;
  user_id: string;
  objective_id: string;
  title: string;
  metric_type: OKRMetricType;
  unit?: string | null;
  direction: OKRDirection;
  start_value: number;
  target_value: number;
  current_value: number;
  due_date: string;
  weight: number;
  status: OKRStatus;
  checkin_frequency: OKRCheckinFrequency;
  reminder_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OKRCheckinRow = {
  id: string;
  user_id: string;
  key_result_id: string;
  created_at: string;
  value: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  health: OKRHealth;
  note?: string | null;
};

