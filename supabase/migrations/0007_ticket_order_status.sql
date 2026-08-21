-- Event ticketing needs a status for "paid but unfulfillable" (capacity was
-- exhausted between checkout and the webhook). The 0001 vocabulary had no such
-- value, so the oversell guard could not record its result.
alter table orders drop constraint if exists orders_current_status_check;
alter table orders add constraint orders_current_status_check
  check (current_status in ('created','paid','refunded','failed','needs_attention'));
