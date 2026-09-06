insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "Authenticated users can read invoices"
on storage.objects for select
to authenticated
using ( bucket_id = 'invoices' );

create policy "Authenticated users can insert invoices"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'invoices' );

create policy "Authenticated users can update invoices"
on storage.objects for update
to authenticated
using ( bucket_id = 'invoices' );

create policy "Authenticated users can delete invoices"
on storage.objects for delete
to authenticated
using ( bucket_id = 'invoices' );
