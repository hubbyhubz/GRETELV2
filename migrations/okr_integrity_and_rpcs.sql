DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'okr_objectives_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.okr_objectives
      ADD CONSTRAINT okr_objectives_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.okr_cycles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'okr_key_results_objective_id_fkey'
  ) THEN
    ALTER TABLE public.okr_key_results
      ADD CONSTRAINT okr_key_results_objective_id_fkey
      FOREIGN KEY (objective_id) REFERENCES public.okr_objectives(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'okr_checkins_key_result_id_fkey'
  ) THEN
    ALTER TABLE public.okr_checkins
      ADD CONSTRAINT okr_checkins_key_result_id_fkey
      FOREIGN KEY (key_result_id) REFERENCES public.okr_key_results(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.okr_latest_checkins(p_user_id uuid, p_kr_ids uuid[])
RETURNS SETOF public.okr_checkins
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (key_result_id) *
  FROM public.okr_checkins
  WHERE user_id = p_user_id
    AND key_result_id = ANY(p_kr_ids)
  ORDER BY key_result_id, created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.okr_log_checkin(
  p_user_id uuid,
  p_key_result_id uuid,
  p_value numeric,
  p_confidence int,
  p_health text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  updated_kr public.okr_key_results;
  new_checkin public.okr_checkins;
BEGIN
  UPDATE public.okr_key_results
  SET current_value = p_value,
      updated_at = now()
  WHERE id = p_key_result_id
    AND user_id = p_user_id
  RETURNING * INTO updated_kr;

  IF updated_kr.id IS NULL THEN
    RAISE EXCEPTION 'Key result not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.okr_checkins(user_id, key_result_id, value, confidence, health, note)
  VALUES (p_user_id, p_key_result_id, p_value, p_confidence, p_health, NULLIF(TRIM(p_note), ''))
  RETURNING * INTO new_checkin;

  RETURN jsonb_build_object(
    'kr', row_to_json(updated_kr),
    'checkin', row_to_json(new_checkin)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_objective(p_user_id uuid, p_objective_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_obj_ids uuid[];
  deleted_kr_ids uuid[];
BEGIN
  WITH kr AS (
    SELECT id FROM public.okr_key_results WHERE user_id = p_user_id AND objective_id = p_objective_id
  ),
  del_chk AS (
    DELETE FROM public.okr_checkins
    WHERE user_id = p_user_id AND key_result_id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_kr AS (
    DELETE FROM public.okr_key_results
    WHERE user_id = p_user_id AND id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_obj AS (
    DELETE FROM public.okr_objectives
    WHERE user_id = p_user_id AND id = p_objective_id
    RETURNING id
  )
  SELECT
    COALESCE((SELECT array_agg(id) FROM del_obj), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(id) FROM del_kr), ARRAY[]::uuid[])
  INTO deleted_obj_ids, deleted_kr_ids;

  RETURN jsonb_build_object(
    'deletedObjectiveIds', deleted_obj_ids,
    'deletedKrIds', deleted_kr_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_cycle(p_user_id uuid, p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_obj_ids uuid[];
  deleted_kr_ids uuid[];
BEGIN
  WITH obj AS (
    SELECT id FROM public.okr_objectives WHERE user_id = p_user_id AND cycle_id = p_cycle_id
  ),
  kr AS (
    SELECT id FROM public.okr_key_results WHERE user_id = p_user_id AND objective_id IN (SELECT id FROM obj)
  ),
  del_chk AS (
    DELETE FROM public.okr_checkins
    WHERE user_id = p_user_id AND key_result_id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_kr AS (
    DELETE FROM public.okr_key_results
    WHERE user_id = p_user_id AND id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_obj AS (
    DELETE FROM public.okr_objectives
    WHERE user_id = p_user_id AND id IN (SELECT id FROM obj)
    RETURNING id
  ),
  del_cycle AS (
    DELETE FROM public.okr_cycles
    WHERE user_id = p_user_id AND id = p_cycle_id
    RETURNING id
  )
  SELECT
    COALESCE((SELECT array_agg(id) FROM del_obj), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(id) FROM del_kr), ARRAY[]::uuid[])
  INTO deleted_obj_ids, deleted_kr_ids;

  RETURN jsonb_build_object(
    'deletedObjectiveIds', deleted_obj_ids,
    'deletedKrIds', deleted_kr_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_objectives_by_component(
  p_user_id uuid,
  p_cycle_id uuid,
  p_objective_component text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_obj_ids uuid[];
  deleted_kr_ids uuid[];
BEGIN
  WITH obj AS (
    SELECT id FROM public.okr_objectives
    WHERE user_id = p_user_id AND cycle_id = p_cycle_id AND objective_component = p_objective_component
  ),
  kr AS (
    SELECT id FROM public.okr_key_results WHERE user_id = p_user_id AND objective_id IN (SELECT id FROM obj)
  ),
  del_chk AS (
    DELETE FROM public.okr_checkins
    WHERE user_id = p_user_id AND key_result_id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_kr AS (
    DELETE FROM public.okr_key_results
    WHERE user_id = p_user_id AND id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_obj AS (
    DELETE FROM public.okr_objectives
    WHERE user_id = p_user_id AND id IN (SELECT id FROM obj)
    RETURNING id
  )
  SELECT
    COALESCE((SELECT array_agg(id) FROM del_obj), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(id) FROM del_kr), ARRAY[]::uuid[])
  INTO deleted_obj_ids, deleted_kr_ids;

  RETURN jsonb_build_object(
    'deletedObjectiveIds', deleted_obj_ids,
    'deletedKrIds', deleted_kr_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.okr_delete_all_objectives_in_cycle(
  p_user_id uuid,
  p_cycle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_obj_ids uuid[];
  deleted_kr_ids uuid[];
BEGIN
  WITH obj AS (
    SELECT id FROM public.okr_objectives WHERE user_id = p_user_id AND cycle_id = p_cycle_id
  ),
  kr AS (
    SELECT id FROM public.okr_key_results WHERE user_id = p_user_id AND objective_id IN (SELECT id FROM obj)
  ),
  del_chk AS (
    DELETE FROM public.okr_checkins
    WHERE user_id = p_user_id AND key_result_id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_kr AS (
    DELETE FROM public.okr_key_results
    WHERE user_id = p_user_id AND id IN (SELECT id FROM kr)
    RETURNING id
  ),
  del_obj AS (
    DELETE FROM public.okr_objectives
    WHERE user_id = p_user_id AND id IN (SELECT id FROM obj)
    RETURNING id
  )
  SELECT
    COALESCE((SELECT array_agg(id) FROM del_obj), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(id) FROM del_kr), ARRAY[]::uuid[])
  INTO deleted_obj_ids, deleted_kr_ids;

  RETURN jsonb_build_object(
    'deletedObjectiveIds', deleted_obj_ids,
    'deletedKrIds', deleted_kr_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.okr_latest_checkins(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.okr_log_checkin(uuid, uuid, numeric, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.okr_delete_objective(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.okr_delete_cycle(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.okr_delete_objectives_by_component(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.okr_delete_all_objectives_in_cycle(uuid, uuid) TO authenticated;

