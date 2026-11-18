-- As the other fp_ tables: no table privileges for clients at all (row level
-- security with no policies already kept every row out of reach); access is
-- only through the fp_*_asset functions.
revoke all on public.fp_project_assets from anon, authenticated;
