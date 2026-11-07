-- A stale contact revision is a permanent conflict. PostgREST retries SQLSTATE
-- 40001 as a transient transaction failure, so return HTTP 409 instead.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.save_player_profile_contact(text,text,boolean,uuid)'::regprocedure
  );
  old_code constant text := 'using errcode = ''40001''';
  new_code constant text := 'using errcode = ''PT409''';
begin
  if strpos(definition, old_code) = 0 and
    length(definition) - length(replace(definition, new_code, '')) = 2 * length(new_code) then
    return;
  end if;
  if length(definition) - length(replace(definition, old_code, '')) <> 2 * length(old_code) then
    raise exception 'Unexpected profile contact conflict definition. Inspect the deployed function.';
  end if;
  execute replace(definition, old_code, new_code);
end;
$migration$;
