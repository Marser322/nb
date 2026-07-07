-- Permite que scripts locales con service_role actualicen profiles via Data API.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO service_role;
