import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Clock,
  Download,
  Edit2,
  FileUp,
  History,
  LayoutDashboard,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  UserRoundCog,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import type { AuditEvent, Department, DepartmentMembership, DepartmentRole, UserProfile } from './types';
import { supabase } from './supabaseClient';
import {
  DASHBOARD_COMPONENT_KEYS,
  DEFAULT_DASHBOARD_VISIBILITY,
  coerceDashboardVisibilityMap,
  type DashboardVisibilityMap,
} from '../lib/dashboardVisibility';

type SuperUserConsoleProps = {
  userProfile: UserProfile;
};

const ROLE_OPTIONS: Array<{ value: DepartmentRole; label: string }> = [
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'assistant_manager', label: 'Assistant Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'rank_and_file', label: 'Rank and File' },
];

type ProfileDirectoryRow = { 
  id: string; 
  full_name: string | null; 
  email: string | null; 
  company_id: string | null;
  created_at: string;
  last_login_at: string | null;
  account_status: string;
};

type AdminSection = 'control' | 'employees' | 'departments' | 'attendance' | 'permissions' | 'audit';

type EmployeeTab = 'overview' | 'department' | 'audit' | 'raw';

type BulkImportRow = {
  email: string;
  department_code: string;
  role: DepartmentRole;
};

type BulkImportResult = { row: BulkImportRow; status: 'ok' | 'error'; message: string };

const toRoleLabel = (role: DepartmentRole) => {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
};

const normalizeHeaderKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');

const parseBulkImportRows = async (file: File): Promise<BulkImportRow[]> => {
  const ext = file.name.split('.').pop()?.toLowerCase();

  const getCell = (row: Record<string, any>, key: string): string => {
    const k = normalizeHeaderKey(key);
    for (const [rawKey, rawValue] of Object.entries(row)) {
      if (normalizeHeaderKey(rawKey) === k) return String(rawValue ?? '').trim();
    }
    return '';
  };

  if (ext === 'xlsx' || ext === 'xls') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    return json
      .map((r) => {
        const email = getCell(r, 'email');
        const department_code = getCell(r, 'department_code');
        const roleRaw = getCell(r, 'role');
        const role = (roleRaw || '').toLowerCase().replace(/\s+/g, '_') as DepartmentRole;
        return { email, department_code, role };
      })
      .filter((r) => r.email || r.department_code || r.role);
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => normalizeHeaderKey(h));
  const rows: BulkImportRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = parts[idx] ?? '';
    });
    const email = record['email'] ?? '';
    const department_code = record['department_code'] ?? '';
    const role = ((record['role'] ?? '')
      .toLowerCase()
      .replace(/\s+/g, '_') as DepartmentRole) || 'rank_and_file';
    rows.push({ email, department_code, role });
  }
  return rows;
};

export function SuperUserConsole({ userProfile }: SuperUserConsoleProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('control');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [directory, setDirectory] = useState<ProfileDirectoryRow[]>([]);
  const [memberships, setMemberships] = useState<Record<string, DepartmentMembership>>({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [employeeTab, setEmployeeTab] = useState<EmployeeTab>('overview');
  const [selectedUserAudit, setSelectedUserAudit] = useState<AuditEvent[]>([]);
  const [isLoadingSelectedAudit, setIsLoadingSelectedAudit] = useState(false);

  const [dashboardVisibilityDraft, setDashboardVisibilityDraft] = useState<DashboardVisibilityMap | null>(null);
  const [isLoadingDashboardVisibility, setIsLoadingDashboardVisibility] = useState(false);
  const [isSavingDashboardVisibility, setIsSavingDashboardVisibility] = useState(false);
  const [dashboardVisibilityError, setDashboardVisibilityError] = useState<string | null>(null);
  const [dashboardVisibilitySuccess, setDashboardVisibilitySuccess] = useState<string | null>(null);

  const [dutyRosterCanEditDraft, setDutyRosterCanEditDraft] = useState<boolean>(false);
  const [isLoadingDutyRosterPermission, setIsLoadingDutyRosterPermission] = useState(false);
  const [isSavingDutyRosterPermission, setIsSavingDutyRosterPermission] = useState(false);
  const [dutyRosterPermissionError, setDutyRosterPermissionError] = useState<string | null>(null);
  const [dutyRosterPermissionSuccess, setDutyRosterPermissionSuccess] = useState<string | null>(null);

  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [deptActionError, setDeptActionError] = useState<string | null>(null);

  const [destinationDepartmentId, setDestinationDepartmentId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<DepartmentRole>('rank_and_file');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [bulkReason, setBulkReason] = useState('Bulk import');
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkImportRow[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkImportResult[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const myCompanyId = userProfile.companyId;

  const filteredDirectory = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [directory, globalSearch]);

  const selectedMembership = selectedUserId ? memberships[selectedUserId] : undefined;

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return directory.find((u) => u.id === selectedUserId) || null;
  }, [directory, selectedUserId]);

  useEffect(() => {
    let mounted = true;

    if (!selectedUserId) {
      setDashboardVisibilityDraft(null);
      setIsLoadingDashboardVisibility(false);
      setIsSavingDashboardVisibility(false);
      setDashboardVisibilityError(null);
      setDashboardVisibilitySuccess(null);
      setDutyRosterCanEditDraft(false);
      setIsLoadingDutyRosterPermission(false);
      setIsSavingDutyRosterPermission(false);
      setDutyRosterPermissionError(null);
      setDutyRosterPermissionSuccess(null);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      setIsLoadingDashboardVisibility(true);
      setDashboardVisibilityError(null);
      setDashboardVisibilitySuccess(null);
      try {
        const { data, error: rpcError } = await supabase.rpc('get_dashboard_visibility', {
          p_user_id: selectedUserId,
        });
        if (rpcError) throw rpcError;

        const result = (data ?? {}) as any;
        const map = typeof result?.visibility === 'object' ? result.visibility : result;
        const nextDraft = coerceDashboardVisibilityMap(map);

        if (!mounted) return;
        setDashboardVisibilityDraft(nextDraft);
      } catch (e: any) {
        if (!mounted) return;
        setDashboardVisibilityDraft({ ...DEFAULT_DASHBOARD_VISIBILITY });
        setDashboardVisibilityError(e?.message || 'Failed to load dashboard visibility for this user.');
      } finally {
        if (!mounted) return;
        setIsLoadingDashboardVisibility(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    let mounted = true;

    if (!selectedUserId) {
      setDutyRosterCanEditDraft(false);
      setIsLoadingDutyRosterPermission(false);
      setIsSavingDutyRosterPermission(false);
      setDutyRosterPermissionError(null);
      setDutyRosterPermissionSuccess(null);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      setIsLoadingDutyRosterPermission(true);
      setDutyRosterPermissionError(null);
      setDutyRosterPermissionSuccess(null);
      try {
        const { data, error: rpcError } = await supabase.rpc('get_duty_roster_permission', { p_user_id: selectedUserId });
        if (rpcError) throw rpcError;
        const canEdit = Boolean((data as any)?.can_edit);
        if (!mounted) return;
        setDutyRosterCanEditDraft(canEdit);
      } catch (e: any) {
        if (!mounted) return;
        setDutyRosterCanEditDraft(false);
        setDutyRosterPermissionError(e?.message || 'Failed to load duty roster permission for this user.');
      } finally {
        if (!mounted) return;
        setIsLoadingDutyRosterPermission(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedUserId]);

  const handleSaveDutyRosterPermission = async () => {
    if (!selectedUserId) return;
    setIsSavingDutyRosterPermission(true);
    setDutyRosterPermissionError(null);
    setDutyRosterPermissionSuccess(null);
    try {
      const { error: rpcError } = await supabase.rpc('set_duty_roster_permission', {
        p_target_user_id: selectedUserId,
        p_can_edit: dutyRosterCanEditDraft,
      });
      if (rpcError) throw rpcError;
      setDutyRosterPermissionSuccess('Saved.');
    } catch (e: any) {
      setDutyRosterPermissionError(e?.message || 'Failed to save duty roster permission.');
    } finally {
      setIsSavingDutyRosterPermission(false);
    }
  };

  const handleSaveDashboardVisibility = async () => {
    if (!selectedUserId) return;
    if (!dashboardVisibilityDraft) return;
    setIsSavingDashboardVisibility(true);
    setDashboardVisibilityError(null);
    setDashboardVisibilitySuccess(null);
    try {
      const { error: rpcError } = await supabase.rpc('set_user_dashboard_visibility_map', {
        p_target_user_id: selectedUserId,
        p_visibility: dashboardVisibilityDraft,
      });
      if (rpcError) throw rpcError;
      setDashboardVisibilitySuccess('Saved.');
    } catch (e: any) {
      setDashboardVisibilityError(e?.message || 'Failed to save dashboard visibility.');
    } finally {
      setIsSavingDashboardVisibility(false);
    }
  };

  const setAllDashboardVisibility = (value: boolean) => {
    if (!dashboardVisibilityDraft) return;
    const next: DashboardVisibilityMap = { ...dashboardVisibilityDraft };
    DASHBOARD_COMPONENT_KEYS.forEach((k) => {
      next[k] = value;
    });
    setDashboardVisibilityDraft(next);
  };

  const refreshDepartments = async () => {
    const { data, error: deptError } = await supabase
      .from('departments')
      .select('id, company_id, code, name, is_active, created_at')
      .order('name', { ascending: true });

    if (deptError) throw deptError;
    setDepartments((data || []) as Department[]);
  };

  const refreshDirectory = async (): Promise<ProfileDirectoryRow[]> => {
    const { data, error: dirError } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_id, created_at, last_login_at, account_status')
      .order('full_name', { ascending: true });

    if (dirError) throw dirError;
    const rows = (data || []) as ProfileDirectoryRow[];
    setDirectory(rows);
    
    // Audit log for comprehensive access
    await supabase.rpc('log_admin_action', {
      p_action_type: 'directory_access',
      p_target_resource: 'profiles',
      p_details: { count: rows.length }
    });

    return rows;
  };

  const refreshMemberships = async (userIds: string[]) => {
    if (userIds.length === 0) {
      setMemberships({});
      return;
    }

    const { data, error: memError } = await supabase
      .from('department_memberships')
      .select('id, user_id, department_id, role, created_at, updated_at')
      .in('user_id', userIds);

    if (memError) throw memError;

    const map: Record<string, DepartmentMembership> = {};
    for (const m of (data || []) as DepartmentMembership[]) {
      map[m.user_id] = m;
    }
    setMemberships(map);
  };

  const refreshAuditEvents = async () => {
    const { data, error: auditError } = await supabase
      .from('audit_events')
      .select('id, action_type, actor_user_id, target_user_id, source_department_id, destination_department_id, before_state, after_state, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (auditError) throw auditError;
    setAuditEvents((data || []) as AuditEvent[]);
  };

  const refreshUserAuditEvents = async (targetUserId: string) => {
    setIsLoadingSelectedAudit(true);
    try {
      const { data, error: auditError } = await supabase
        .from('audit_events')
        .select('id, action_type, actor_user_id, target_user_id, source_department_id, destination_department_id, before_state, after_state, reason, created_at')
        .eq('target_user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (auditError) throw auditError;
      setSelectedUserAudit((data || []) as AuditEvent[]);
    } catch {
      setSelectedUserAudit([]);
    } finally {
      setIsLoadingSelectedAudit(false);
    }
  };

  const refreshAll = async (section: AdminSection) => {
    setLoading(true);
    setError(null);
    try {
      await refreshDepartments();

      if (section === 'employees' || section === 'control') {
        const rows = await refreshDirectory();
        await refreshMemberships(rows.map((u) => u.id));
      }

      if (section === 'audit') {
        await refreshAuditEvents();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load Super User data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshDepartments();
        await refreshDirectory();
        
        // Real-time synchronization: Subscribe to profile changes
        const channel = supabase
          .channel('public:profiles')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
            console.log('Real-time update received:', payload);
            refreshDirectory().catch(() => {});
          })
          .subscribe();

        if (!mounted) {
          supabase.removeChannel(channel);
          return;
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load Super User console.');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      supabase.channel('public:profiles').unsubscribe();
    };
  }, [myCompanyId]);

  useEffect(() => {
    if (!directory.length) return;
    refreshMemberships(directory.map((u) => u.id)).catch(() => { });
  }, [directory]);

  useEffect(() => {
    if (!selectedUserId) return;
    setEmployeeTab('overview');
    const m = memberships[selectedUserId];
    if (m) {
      setDestinationDepartmentId(m.department_id);
      setSelectedRole(m.role);
    } else {
      setDestinationDepartmentId('');
      setSelectedRole('rank_and_file');
    }
    setReason('');
    setActionError(null);
    setActionSuccess(null);
  }, [selectedUserId, memberships]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUserAudit([]);
      return;
    }
    if (employeeTab !== 'audit') return;
    refreshUserAuditEvents(selectedUserId);
  }, [employeeTab, selectedUserId]);

  const handleCreateDepartment = async () => {
    setDeptActionError(null);
    setActionSuccess(null);
    const code = newDeptCode.trim();
    const name = newDeptName.trim();
    if (!code || !name) {
      setDeptActionError('Department code and name are required.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: insertError } = await supabase
        .from('departments')
        .insert({ company_id: myCompanyId, code, name, is_active: true })
        .select('id')
        .single();

      if (insertError) throw insertError;

      await supabase.from('audit_events').insert({
        action_type: 'department_created',
        actor_user_id: userProfile.id,
        target_user_id: null,
        source_department_id: null,
        destination_department_id: data?.id ?? null,
        before_state: {},
        after_state: { code, name },
        reason: 'Created department',
      });

      setNewDeptCode('');
      setNewDeptName('');
      await refreshDepartments();
      setActionSuccess('Department created.');
    } catch (e: any) {
      setDeptActionError(e?.message || 'Failed to create department.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDepartmentActive = async (dept: Department) => {
    setDeptActionError(null);
    setActionSuccess(null);
    setLoading(true);
    try {
      if (dept.is_active) {
        const { count, error: countError } = await supabase
          .from('department_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', dept.id);

        if (countError) throw countError;
        if ((count || 0) > 0) {
          throw new Error('This department still has members. Transfer users out before disabling.');
        }
      }

      const { error: updateError } = await supabase
        .from('departments')
        .update({ is_active: !dept.is_active })
        .eq('id', dept.id);

      if (updateError) throw updateError;

      await supabase.from('audit_events').insert({
        action_type: dept.is_active ? 'department_disabled' : 'department_updated',
        actor_user_id: userProfile.id,
        target_user_id: null,
        source_department_id: null,
        destination_department_id: dept.id,
        before_state: { is_active: dept.is_active },
        after_state: { is_active: !dept.is_active },
        reason: dept.is_active ? 'Disabled department' : 'Enabled department',
      });

      await refreshDepartments();
      setActionSuccess('Department updated.');
    } catch (e: any) {
      setDeptActionError(e?.message || 'Failed to update department.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyUserChange = async () => {
    setActionError(null);
    setActionSuccess(null);

    if (!selectedUserId) {
      setActionError('Select a user first.');
      return;
    }
    if (!destinationDepartmentId) {
      setActionError('Destination department is required.');
      return;
    }

    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('super_set_user_membership', {
        p_target_user_id: selectedUserId,
        p_destination_department_id: destinationDepartmentId,
        p_role: selectedRole,
        p_reason: reason.trim(),
      });

      if (rpcError) throw rpcError;

      const rows = await refreshDirectory();
      await refreshMemberships(rows.map((u) => u.id));
      setReason('');
      setActionSuccess('User updated.');
    } catch (e: any) {
      setActionError(e?.message || 'Failed to update user membership.');
    } finally {
      setLoading(false);
    }
  };

  const exportAuditJson = () => {
    const content = JSON.stringify(auditEvents, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_events.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDirectoryCsv = () => {
    const lines: string[] = [];
    lines.push(['email', 'full_name', 'department_code', 'department_name', 'role'].join(','));
    for (const u of directory) {
      const m = memberships[u.id];
      const dept = m ? departments.find((d) => d.id === m.department_id) : null;
      const cols = [
        u.email || '',
        (u.full_name || '').replace(/\s+/g, ' ').trim(),
        dept?.code || '',
        dept?.name || '',
        m?.role || '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cols.join(','));
    }
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_directory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBulkTemplate = () => {
    const content = ['email,department_code,role', 'person@example.com,EVOPS,manager'].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleChooseBulkFile = async (file: File) => {
    setBulkFileName(file.name);
    setBulkResults([]);
    const rows = await parseBulkImportRows(file);
    const normalized: BulkImportRow[] = rows
      .map((r) => ({
        email: (r.email || '').trim().toLowerCase(),
        department_code: (r.department_code || '').trim().toUpperCase(),
        role: r.role || 'rank_and_file',
      }))
      .filter((r) => r.email && r.department_code);
    setBulkRows(normalized);
  };

  const handleRunBulkImport = async () => {
    setBulkResults([]);
    if (bulkRows.length === 0) {
      setBulkResults([{ row: { email: '', department_code: '', role: 'rank_and_file' }, status: 'error', message: 'No rows loaded.' }]);
      return;
    }
    const reasonText = bulkReason.trim() || 'Bulk import';

    setBulkRunning(true);
    try {
      const emailToUserId = new Map(directory.filter((d) => d.email).map((d) => [String(d.email).toLowerCase(), d.id]));
      const codeToDeptId = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
      const nextResults: BulkImportResult[] = [];

      for (const row of bulkRows) {
        const userId = emailToUserId.get(row.email.toLowerCase());
        if (!userId) {
          nextResults.push({ row, status: 'error', message: `User not found for email: ${row.email}` });
          continue;
        }

        const deptId = codeToDeptId.get(row.department_code.toUpperCase());
        if (!deptId) {
          nextResults.push({ row, status: 'error', message: `Department not found for code: ${row.department_code}` });
          continue;
        }

        if (!ROLE_OPTIONS.some((r) => r.value === row.role)) {
          nextResults.push({ row, status: 'error', message: `Invalid role: ${row.role}` });
          continue;
        }

        const { error: rpcError } = await supabase.rpc('super_set_user_membership', {
          p_target_user_id: userId,
          p_destination_department_id: deptId,
          p_role: row.role,
          p_reason: reasonText,
        });

        if (rpcError) {
          nextResults.push({ row, status: 'error', message: rpcError.message });
          continue;
        }
        nextResults.push({ row, status: 'ok', message: 'Updated' });
      }

      setBulkResults(nextResults);
      const rows = await refreshDirectory();
      await refreshMemberships(rows.map((u) => u.id));
    } finally {
      setBulkRunning(false);
    }
  };

  const handleImpersonate = async (userId: string) => {
    try {
      // Audit log for starting impersonation
      await supabase.rpc('log_admin_action', {
        p_action_type: 'impersonation_start',
        p_target_resource: 'profiles',
        p_details: { target_user_id: userId }
      });
      
      sessionStorage.setItem('impersonating_user_id', userId);
      window.location.reload();
    } catch (e) {
      console.error('Failed to log impersonation start:', e);
      // Still proceed with impersonation even if logging fails
      sessionStorage.setItem('impersonating_user_id', userId);
      window.location.reload();
    }
  };

  const totalEmployees = directory.length;
  const unassignedEmployees = useMemo(() => {
    if (directory.length === 0) return 0;
    let count = 0;
    for (const u of directory) {
      if (!memberships[u.id]) count += 1;
    }
    return count;
  }, [directory, memberships]);

  const missingFullName = useMemo(() => directory.filter((u) => !(u.full_name || '').trim()).length, [directory]);

  const departmentsActiveCount = useMemo(() => departments.filter((d) => d.is_active).length, [departments]);

  const employeesByDepartment = useMemo(() => {
    const counts: Array<{ dept: Department; count: number }> = [];
    const byId: Record<string, number> = {};
    for (const m of Object.values(memberships)) {
      byId[m.department_id] = (byId[m.department_id] || 0) + 1;
    }
    for (const d of departments) {
      counts.push({ dept: d, count: byId[d.id] || 0 });
    }
    counts.sort((a, b) => b.count - a.count);
    return counts;
  }, [departments, memberships]);

  const navItems: Array<{ key: AdminSection; label: string; icon: React.ReactNode }> = [
    { key: 'control', label: 'Control Center', icon: <LayoutDashboard size={18} className="text-primary-600 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" /> },
    { key: 'employees', label: 'Employee Records', icon: <Users size={18} className="text-primary-600 transition-transform duration-200 group-hover:scale-110" /> },
    { key: 'departments', label: 'Departments', icon: <Building2 size={18} className="text-primary-600 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-110" /> },
    { key: 'attendance', label: 'Attendance Settings', icon: <Clock size={18} className="text-primary-600 transition-transform duration-200 group-hover:rotate-6 group-hover:scale-110" /> },
    { key: 'permissions', label: 'User Roles', icon: <Shield size={18} className="text-primary-600 transition-transform duration-200 group-hover:scale-110" /> },
    { key: 'audit', label: 'Audit Logs', icon: <History size={18} className="text-primary-600 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" /> },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg sm:rounded-xl shadow-sm sm:shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Admin</p>
                <p className="text-sm font-bold">{myCompanyId || '—'}</p>
              </div>
              <button
                onClick={() => refreshAll(activeSection)}
                className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Refresh
              </button>
            </div>
          </div>

          <nav className="px-2 pb-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {navItems.map((it) => {
              const active = it.key === activeSection;
              return (
                <button
                  key={it.key}
                  onClick={() => {
                    setActiveSection(it.key);
                    refreshAll(it.key);
                  }}
                  className={
                    'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ' +
                    (active
                      ? 'bg-primary-50 dark:bg-primary-950/30 border-primary-600 text-primary-700 dark:text-primary-300'
                      : 'bg-transparent border-transparent hover:bg-white/70 dark:hover:bg-gray-900/60 text-gray-700 dark:text-gray-200')
                  }
                >
                  <span className="shrink-0">{it.icon}</span>
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-black tracking-wide text-gray-900 dark:text-gray-100">Admin Console</h3>

              <div className="flex items-center gap-2">
                <div className="relative w-[360px]">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Search size={16} />
                  </div>
                  <input
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    placeholder="God Mode search (name / email)"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                  />
                  {globalSearch.trim() && filteredDirectory.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full max-h-[320px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm">
                      {filteredDirectory.slice(0, 12).map((u) => {
                        const m = memberships[u.id];
                        const dept = m ? departments.find((d) => d.id === m.department_id) : null;
                        return (
                          <button
                            key={u.id}
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setEmployeeTab('overview');
                              setActiveSection('employees');
                              setGlobalSearch('');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{u.full_name || 'Unnamed User'}</p>
                                <p className="text-xs text-gray-500 truncate">{u.email || '—'}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-gray-500">{dept?.code || 'No dept'}</p>
                                <p className="text-xs text-gray-500">{m ? toRoleLabel(m.role) : 'Unassigned'}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={exportDirectoryCsv}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>

            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Organization-wide configuration and oversight</p>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
            {loading && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
            {actionSuccess && <p className="mt-3 text-sm text-green-600">{actionSuccess}</p>}
          </div>

          {activeSection === 'control' && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Employees</p>
                  <p className="text-4xl font-bold mt-2">{totalEmployees}</p>
                </div>
                <div className="p-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Active Departments</p>
                  <p className="text-4xl font-bold mt-2">{departmentsActiveCount}</p>
                </div>
                <div className="p-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Unassigned Dept</p>
                  <p className="text-4xl font-bold mt-2">{unassignedEmployees}</p>
                </div>
                <div className="p-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Missing Name</p>
                  <p className="text-4xl font-bold mt-2">{missingFullName}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-bold">System Usage Stats</p>
                    <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-1.5 py-0.5 rounded font-bold uppercase">Live</span>
                  </div>
                  <div className="flex-1 min-h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employeesByDepartment.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="dept.code" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 600 }}
                        />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '8px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            fontSize: '12px'
                          }}
                          formatter={(value?: number) => [`${value ?? 0} Users`, 'Count']}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {employeesByDepartment.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#818cf8'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    <span>Department Activity</span>
                    <span>N={totalEmployees}</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-sm font-bold mb-3">Workflow Bottlenecks</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Leave Request', count: '14 Pending', time: '5+ days', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
                      { label: 'Roster Approval', count: '3 Delayed', time: '24h late', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
                      { label: 'Asset Requisition', count: '8 Waiting', time: '2 days', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs font-bold">{item.label}</p>
                          <p className="text-[10px] text-gray-500">{item.count}</p>
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${item.color}`}>
                          {item.time}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <p className="text-sm font-bold">Data Integrity Alerts</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Employees without department</span>
                      <span className="font-semibold">{unassignedEmployees}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Employees missing name</span>
                      <span className="font-semibold">{missingFullName}</span>
                    </div>
                    <div className="text-xs text-gray-500">Add additional field checks as new HR fields are modeled.</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <p className="text-sm font-bold">Quick Actions</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button onClick={() => setActiveSection('employees')} className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">Open Employee Records</button>
                  <button onClick={() => setActiveSection('departments')} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold">Manage Departments</button>
                  <button onClick={() => setActiveSection('audit')} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold">View Audit Logs</button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'departments' && (
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold">Core Data: Departments</h4>
                    <p className="text-xs text-gray-500">Create/enable/disable departments (disabling requires zero members)</p>
                  </div>
                  <button
                    onClick={() => setActiveSection('employees')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <UserRoundCog size={16} />
                    Assign Users
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value)} placeholder="Code (e.g., EVOPS)" className="w-full p-2 bg-white dark:bg-gray-800 border rounded-md" />
                  <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} placeholder="Name (e.g., Event Ops)" className="w-full p-2 bg-white dark:bg-gray-800 border rounded-md" />
                  <button disabled={loading} onClick={handleCreateDepartment} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">Create</button>
                </div>
                {deptActionError && <p className="mt-2 text-sm text-red-600">{deptActionError}</p>}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-gray-500">Existing Departments</h4>
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 font-medium">
                    Total: {departments.length}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Code</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-center">Members</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {departments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 italic">
                            No departments found. Create one above to get started.
                          </td>
                        </tr>
                      ) : (
                        departments.map((d) => {
                          const memberCount = Object.values(memberships).filter(m => m.department_id === d.id).length;
                          return (
                            <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                              <td className="px-4 py-3">
                                <span className="font-mono text-xs font-bold bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">
                                  {d.code}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-sm font-semibold">{d.name}</p>
                                <p className="text-[10px] text-gray-500">{d.is_active ? 'Active' : 'Disabled'}</p>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-sm font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 rounded-full border border-primary-100 dark:border-primary-800">
                                  {memberCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setNewDeptCode(d.code);
                                      setNewDeptName(d.name);
                                      // Scroll to top or show edit indicator
                                    }}
                                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                                    title="Edit Details"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    disabled={loading}
                                    onClick={() => handleToggleDepartmentActive(d)}
                                    className={`p-2 rounded-lg transition-colors ${d.is_active ? 'text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                                    title={d.is_active ? 'Disable Department' : 'Enable Department'}
                                  >
                                    {d.is_active ? <AlertTriangle size={14} /> : <Check size={14} />}
                                  </button>
                                  <button
                                    disabled={loading || memberCount > 0}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                    title={memberCount > 0 ? "Cannot delete department with members" : "Delete Department"}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'employees' && (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">Quick Tools</p>
                        <p className="text-xs text-gray-500">Bulk management & export</p>
                      </div>
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
                      >
                        <FileUp size={16} />
                        Import Users
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <p className="font-semibold">Directory</p>
                    <div className="mt-3 space-y-4 max-h-[420px] overflow-y-auto pr-1">
                      {directory.map((u) => {
                        const m = memberships[u.id];
                        const dept = m ? departments.find((d) => d.id === m.department_id) : null;
                        const isSelected = selectedUserId === u.id;
                        const initials = (u.full_name || '??')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <button
                            key={u.id}
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setEmployeeTab('overview');
                            }}
                            className={`w-full text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm transition-all ${isSelected ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0 border border-primary-200 dark:border-primary-800">
                                <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{initials}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <p className="font-semibold truncate text-sm">{u.full_name || 'Unnamed User'}</p>
                                  <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 uppercase">ID: {u.id.slice(0, 8)}</span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">{u.email || '—'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">{dept ? dept.code : 'No Dept'}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">{m ? toRoleLabel(m.role) : 'Unassigned'}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">Master Employee Record</h4>
                      <p className="text-xs text-gray-500">Extra tabs visible to Super User</p>
                    </div>
                    <button
                      onClick={() => selectedUser && handleImpersonate(selectedUser.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors border border-primary-200 dark:border-primary-800"
                    >
                      <UserRoundCog size={16} />
                      Impersonate
                    </button>
                  </div>

                  {!selectedUser ? (
                    <p className="mt-3 text-sm text-gray-500">Select an employee from the left (or use God Mode search) to inspect and change department role.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600">
                        <p className="font-semibold">{selectedUser.full_name || 'Unnamed User'}</p>
                        <p className="text-xs text-gray-500">{selectedUser.email || '—'}</p>
                        <p className="text-xs text-gray-500">User ID: {selectedUser.id}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {([
                          { key: 'overview', label: 'Overview' },
                          { key: 'department', label: 'Department & Role' },
                          { key: 'audit', label: 'Audit Logs' },
                          { key: 'raw', label: 'Raw Data' },
                        ] as Array<{ key: EmployeeTab; label: string }>).map((t) => (
                          <button
                            key={t.key}
                            onClick={() => setEmployeeTab(t.key)}
                            className={
                              'px-3 py-2 rounded-lg text-sm font-semibold ' +
                              (employeeTab === t.key
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600')
                            }
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {employeeTab === 'overview' && (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span>Status</span>
                            <span className={`font-bold ${selectedUser.account_status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                              {selectedUser.account_status.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Registered</span>
                            <span className="font-semibold">{new Date(selectedUser.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Last Login</span>
                            <span className="font-semibold">{selectedUser.last_login_at ? new Date(selectedUser.last_login_at).toLocaleString() : 'Never'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Department</span>
                            <span className="font-semibold">
                              {selectedMembership
                                ? departments.find((d) => d.id === selectedMembership.department_id)?.name || '—'
                                : 'Unassigned'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Role</span>
                            <span className="font-semibold">{selectedMembership ? toRoleLabel(selectedMembership.role) : '—'}</span>
                          </div>
                          <div className="pt-2 border-t mt-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">Dashboard Visibility</p>
                                <p className="text-xs text-gray-500">
                                  Configure which dashboard modules are visible for this specific user.
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAllDashboardVisibility(true)}
                                  disabled={isSavingDashboardVisibility || isLoadingDashboardVisibility || !dashboardVisibilityDraft}
                                  className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                >
                                  Enable All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAllDashboardVisibility(false)}
                                  disabled={isSavingDashboardVisibility || isLoadingDashboardVisibility || !dashboardVisibilityDraft}
                                  className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                >
                                  Disable All
                                </button>
                              </div>
                              <button
                                onClick={handleSaveDashboardVisibility}
                                disabled={isSavingDashboardVisibility || isLoadingDashboardVisibility || !dashboardVisibilityDraft}
                                className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold disabled:bg-gray-400"
                              >
                                {isSavingDashboardVisibility ? 'Saving…' : 'Save'}
                              </button>
                            </div>

                            <div className="mt-3">
                              {isLoadingDashboardVisibility ? (
                                <p className="text-xs text-gray-500">Loading…</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {DASHBOARD_COMPONENT_KEYS.map((key) => (
                                    <label
                                      key={key}
                                      className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                    >
                                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{key}</span>
                                      <input
                                        type="checkbox"
                                        checked={Boolean(dashboardVisibilityDraft?.[key])}
                                        onChange={(e) => {
                                          if (!dashboardVisibilityDraft) return;
                                          setDashboardVisibilityDraft({ ...dashboardVisibilityDraft, [key]: e.target.checked });
                                        }}
                                        disabled={isSavingDashboardVisibility || !dashboardVisibilityDraft}
                                        className="h-5 w-5"
                                        aria-label={`Dashboard Visibility ${key}`}
                                      />
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="mt-2 text-xs">
                              {dashboardVisibilityError ? <span className="text-red-600">{dashboardVisibilityError}</span> : null}
                              {!dashboardVisibilityError && dashboardVisibilitySuccess ? (
                                <span className="text-green-600">{dashboardVisibilitySuccess}</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="pt-2 border-t mt-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">Duty Roster Editing</p>
                                <p className="text-xs text-gray-500">
                                  Grant or revoke duty roster edit permission for this user. Editing still requires an eligible role (Director/Manager/Assistant Manager/Supervisor).
                                </p>
                              </div>
                              <button
                                onClick={handleSaveDutyRosterPermission}
                                disabled={isSavingDutyRosterPermission || isLoadingDutyRosterPermission}
                                className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold disabled:bg-gray-400"
                              >
                                {isSavingDutyRosterPermission ? 'Saving…' : 'Save'}
                              </button>
                            </div>

                            <div className="mt-3">
                              {isLoadingDutyRosterPermission ? (
                                <p className="text-xs text-gray-500">Loading…</p>
                              ) : (
                                <label className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Can edit duty roster</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(dutyRosterCanEditDraft)}
                                    onChange={(e) => setDutyRosterCanEditDraft(e.target.checked)}
                                    disabled={isSavingDutyRosterPermission}
                                    className="h-5 w-5"
                                    aria-label="Duty roster edit permission"
                                  />
                                </label>
                              )}
                            </div>

                            <div className="mt-2 text-xs">
                              {dutyRosterPermissionError ? <span className="text-red-600">{dutyRosterPermissionError}</span> : null}
                              {!dutyRosterPermissionError && dutyRosterPermissionSuccess ? (
                                <span className="text-green-600">{dutyRosterPermissionSuccess}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 pt-2 border-t mt-2">Use the Department & Role tab to apply changes (Super User only).</div>
                        </div>
                      )}

                      {employeeTab === 'department' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-bold">Department</label>
                              <select value={destinationDepartmentId} onChange={(e) => setDestinationDepartmentId(e.target.value)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md">
                                <option value="">Select department…</option>
                                {departments.filter((d) => d.is_active).map((d) => (
                                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-sm font-bold">Role</label>
                              <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as DepartmentRole)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md">
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-bold">Reason (optional)</label>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md" placeholder="Why are you changing this user’s role/department?" />
                          </div>

                          {selectedMembership && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Current: {departments.find((d) => d.id === selectedMembership.department_id)?.name || '—'} / {toRoleLabel(selectedMembership.role)}
                            </div>
                          )}

                          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

                          <button disabled={loading} onClick={handleApplyUserChange} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                            Apply Change
                          </button>
                        </div>
                      )}

                      {employeeTab === 'audit' && (
                        <div className="space-y-2">
                          {isLoadingSelectedAudit && <p className="text-sm text-gray-500">Loading audit…</p>}
                          {!isLoadingSelectedAudit && selectedUserAudit.length === 0 && (
                            <p className="text-sm text-gray-500">No audit events found for this user.</p>
                          )}
                          {selectedUserAudit.map((e) => (
                            <div key={e.id} className="p-3 border rounded-lg border-gray-200 dark:border-gray-700">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm">{e.action_type}</p>
                                <p className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</p>
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Reason: {e.reason}</p>
                              <p className="text-xs text-gray-500 mt-1">Actor: {e.actor_user_id}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {employeeTab === 'raw' && (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Profile</p>
                            <pre className="text-xs p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 overflow-auto max-h-[220px]">{JSON.stringify(selectedUser, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Membership</p>
                            <pre className="text-xs p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 overflow-auto max-h-[220px]">{JSON.stringify(selectedMembership || null, null, 2)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'attendance' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Shift Tolerance */}
                <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                      <Clock size={20} />
                    </div>
                    <h4 className="font-bold">Shift Tolerance</h4>
                  </div>
                  <p className="text-xs text-gray-500">Grace period for late arrivals or early departures before flagging.</p>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Tolerance Window</label>
                    <select className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">
                      <option value="5">5 minutes</option>
                      <option value="15" selected>15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">60 minutes</option>
                    </select>
                  </div>
                </div>

                {/* Geofencing */}
                <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                        <Building2 size={20} />
                      </div>
                      <h4 className="font-bold">Geofencing</h4>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">Restricts clock-ins to specific physical locations.</p>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Radius (meters)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        defaultValue={100} 
                        className="w-full pl-3 pr-12 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" 
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* IP Restrictions Placeholder */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-400">
                    <Shield size={20} />
                  </div>
                  <h4 className="font-bold">IP Restrictions</h4>
                </div>
                <div className="p-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-center">
                  <p className="text-sm text-gray-500 italic">Whitelisted office IPs will be configured here in the next update.</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'permissions' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-lg">Role Permission Matrix</h4>
                  <p className="text-xs text-gray-500 italic">Configure granular access for each department role level.</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded border border-orange-200 dark:border-orange-800">
                  Read Only in Preview
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-500">Role</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-500 text-center">Approve Leave</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-500 text-center">View Payroll</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-500 text-center">Edit Roster</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(['director', 'manager', 'supervisor', 'rank_and_file'] as DepartmentRole[]).map((role) => (
                      <tr key={role} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{toRoleLabel(role)}</p>
                          <p className="text-[10px] text-gray-500 font-mono uppercase">{role}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input type="checkbox" checked={role !== 'rank_and_file'} readOnly className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-not-allowed" />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input type="checkbox" checked={role === 'director' || role === 'manager'} readOnly className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-not-allowed" />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input type="checkbox" checked={role !== 'rank_and_file'} readOnly className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-not-allowed" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex gap-3">
                <Shield size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-200">Security Architecture</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    Permissions shown above are currently mapped to Row Level Security (RLS) policies in the database. 
                    Changes to this matrix will be linked to a new `role_permissions` table in the next deployment phase.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Recent Events</h4>
                <button onClick={exportAuditJson} className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold py-2 px-3 rounded-lg text-sm">Export JSON</button>
              </div>

              <div className="space-y-2">
                {auditEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">No audit events found.</p>
                ) : (
                  auditEvents.map((e) => (
                    <div key={e.id} className="p-3 border rounded-lg border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm">{e.action_type}</p>
                        <p className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</p>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Reason: {e.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">Actor: {e.actor_user_id} • Target: {e.target_user_id || '—'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Bulk Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
              <div>
                <h3 className="text-lg font-bold">Bulk Import Users</h3>
                <p className="text-xs text-gray-500">Upload CSV or Excel files to update memberships</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Plus size={20} className="rotate-45" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">1. Get Template</label>
                  <button
                    onClick={downloadBulkTemplate}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all group"
                  >
                    <Download size={20} className="text-gray-400 group-hover:text-primary-500" />
                    <span className="text-sm font-medium">Download CSV Template</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">2. Upload File</label>
                  <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-all cursor-pointer shadow-md">
                    <FileUp size={20} />
                    <span className="text-sm font-medium">{bulkFileName || 'Choose CSV/Excel'}</span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        handleChooseBulkFile(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {bulkRows.length > 0 && (
                <div className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-600 p-2 rounded-lg text-white">
                        <Check size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-primary-900 dark:text-primary-100">{bulkRows.length} Rows Loaded</p>
                        <p className="text-xs text-primary-700 dark:text-primary-300">File: {bulkFileName}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBulkRows([]);
                        setBulkFileName(null);
                        setBulkResults([]);
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">3. Audit Details</label>
                    <input
                      value={bulkReason}
                      onChange={(e) => setBulkReason(e.target.value)}
                      placeholder="Reason for this bulk update (e.g., Annual Review)"
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                    />
                  </div>

                  {bulkResults.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Results</label>
                      <div className="max-h-[200px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                        {bulkResults.map((r, idx) => (
                          <div key={idx} className="p-3 text-xs flex items-center justify-between bg-white dark:bg-gray-900">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{r.row.email}</p>
                              <p className="text-gray-500 mt-0.5">{r.row.department_code} • {toRoleLabel(r.row.role)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${r.status === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                {r.status}
                              </span>
                              <p className="text-gray-400 italic max-w-[120px] truncate">{r.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={bulkRunning || bulkRows.length === 0}
                onClick={handleRunBulkImport}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                {bulkRunning ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Execute Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
