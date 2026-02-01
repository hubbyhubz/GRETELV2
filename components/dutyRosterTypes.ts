export type DutyRosterEntry = {
  id: string;
  duty_date: string;
  week_start_sunday: string;
  slot_key: string;
  assignee_user_id: string | null;
  notes: string | null;
  sort_order: number;
  updated_at?: string;
  updated_by?: string | null;
};

export type DutyRosterWeek = {
  week_start_sunday: string;
  department_id: string;
  can_edit: boolean;
  entries: DutyRosterEntry[];
};

export type DutyRosterUpsertEntryInput = {
  duty_date: string;
  slot_key: string;
  assignee_user_id?: string | null;
  notes?: string | null;
  sort_order?: number;
};

