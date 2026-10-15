-- Vérifie que la mise à jour Vainc+ est bien dans la base, et rafraîchit l'API.
-- Supabase → SQL Editor → + → colle tout → Run.
-- Résultat attendu : une ligne avec  badge_color = oui  et  title = oui.
-- Si c'est « non », la mise à jour (mise-a-jour-tout.sql) ne s'est pas faite : relance-la et regarde le message en rouge.
notify pgrst, 'reload schema';

select
  case when exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'badge_color')
       then 'oui' else 'non' end as badge_color,
  case when exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'title')
       then 'oui' else 'non' end as title;
