alter type public.payment_method add value if not exists 'INSTAPAY';

-- Update existing databases without copying the full sale transaction function.
do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.create_sale(uuid,jsonb,text,text,numeric,uuid,uuid)'::regprocedure
  ) into v_definition;

  if position('''INSTAPAY''' in v_definition) = 0 then
    v_updated := replace(
      v_definition,
      'p_payment_method not in (''CASH'', ''CARD'')',
      'p_payment_method not in (''CASH'', ''CARD'', ''INSTAPAY'')'
    );
    v_updated := replace(
      v_updated,
      'Payment method must be CASH or CARD',
      'Payment method must be CASH, CARD, or INSTAPAY'
    );
    if v_updated = v_definition then
      raise exception 'Could not update create_sale payment method validation';
    end if;
    execute v_updated;
  end if;
end;
$$;
