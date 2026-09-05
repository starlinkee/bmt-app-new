<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:bmt-billing-rules -->
# BMT Billing & Invoicing Rules

1. **Czynsze (Rents)**: We DO NOT generate formal invoices (PDFs) or send emails for rent in this system. The `generateRents` cron job should ONLY create a database record in the `invoices` table (with `number: null`) to track the liability/debt for the tenant's balance. Formal invoicing is handled in an external accounting system.

2. **Media (Noty obciążeniowe)**: Media generation DOES use Google Sheets to calculate amounts and export a PDF. We use this mechanism to generate "Noty obciążeniowe". The visual layout of the "Nota obciążeniowa" is entirely managed in the Google Sheets template linked in the App Settings. The codebase simply copies the sheet, fills the values, and emails the PDF. Do not write custom PDF generation code for Media. (NOTE: This template design is temporary and needs to be completed/updated soon, as soon as the exact requirements for its layout are known).
<!-- END:bmt-billing-rules -->
