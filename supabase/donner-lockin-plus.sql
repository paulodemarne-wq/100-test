-- Donner Lockin+ à quelqu'un, comme s'il avait payé (pour tester ; ça déclenche aussi le parrainage).
-- Remplace PSEUDO par son pseudo (et 30 par le nombre de jours). Supabase → SQL Editor → + → colle → Run.
select public.grant_plus(id, 30, 'paid') from public.profiles where username = 'PSEUDO';

-- Pour enlever Lockin+ à quelqu'un, mets plutôt :
-- update public.profiles set premium_until = null where username = 'PSEUDO';
