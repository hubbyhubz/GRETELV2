-- Seed standard departments for company CRM00000
INSERT INTO public.departments (company_id, code, name, is_active)
VALUES 
  ('CRM00000', 'STEW', 'Stewarding', true),
  ('CRM00000', 'SRVC', 'Service', true),
  ('CRM00000', 'KTCH', 'Kitchen', true),
  ('CRM00000', 'HR', 'HR', true),
  ('CRM00000', 'SECR', 'Security', true),
  ('CRM00000', 'FINN', 'Finance', true),
  ('CRM00000', 'PURC', 'Purchasing', true)
ON CONFLICT (company_id, code) 
DO UPDATE SET 
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- Log the action
INSERT INTO public.audit_events (
    action_type,
    actor_user_id,
    target_user_id,
    source_department_id,
    destination_department_id,
    before_state,
    after_state,
    reason
)
SELECT 
    'department_seeded',
    (SELECT id FROM public.profiles WHERE company_id = 'CRM00000' LIMIT 1), -- Use an existing admin in that company
    NULL,
    NULL,
    NULL,
    '{}'::jsonb,
    '{"seeded_count": 7}'::jsonb,
    'Initial seed of standard departments'
WHERE EXISTS (SELECT 1 FROM public.profiles WHERE company_id = 'CRM00000');
