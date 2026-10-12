-- Donner Lockin+ à quelqu'un (pour tester, ou offrir un mois à un ami).
-- Remplace PSEUDO par son pseudo, et la durée si tu veux. Supabase → SQL Editor → + → colle → Run.
update public.profiles
set premium_until = greatest(coalesce(premium_until, now()), now()) + interval '1 month'
where username = 'PSEUDO';

-- Pour enlever Lockin+ à quelqu'un, mets plutôt :
-- update public.profiles set premium_until = null where username = 'PSEUDO';
