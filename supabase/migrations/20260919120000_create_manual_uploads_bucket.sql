-- Osobny bucket na ręcznie wgrywane pliki (zakładka "Wgrane pliki") —
-- celowo oddzielony od bucketa "invoices", w którym leżą pliki z AI/faktury.
insert into storage.buckets (id, name, public)
values ('manual-uploads', 'manual-uploads', false)
on conflict (id) do nothing;
