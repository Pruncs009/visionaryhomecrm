-- Title company as a collaborator on a deal (People panel → Add collaborator).
-- One per deal: the existing deal_parties_client_slot_idx (every role except
-- buyer_agent / seller_agent) already keeps it to one.
alter type public.deal_party_role add value if not exists 'title_company';
