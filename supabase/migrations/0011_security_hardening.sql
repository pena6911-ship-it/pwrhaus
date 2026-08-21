-- Keep the callable sequence wrapper from resolving objects through a
-- caller-controlled search_path. The sequence is explicitly schema-qualified.
create or replace function public.next_event_order_seq() returns bigint
  language sql volatile
  set search_path = ''
  as $$ select nextval('public.event_order_seq') $$;
