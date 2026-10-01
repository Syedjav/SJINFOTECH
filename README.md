# SJ Infotech — Local Dev Server

This workspace includes a simple Express server providing a development API for the contact form.

Prerequisites:
- Node.js (16+ recommended)

Install and run:

```bash
npm install
npm start
```

Open the site in your browser:

http://localhost:3000/Untitled-1.html

Notes:
- The contact form posts JSON to `/api/contact`; configure SMTP delivery before using it in production.
- Access and application logs are written to the `logs/` directory. Contact message contents are not logged or stored.
- Log files rotate automatically by date and size; archived files are kept for a limited retention window.
- If the app hits `ERROR_ALERT_THRESHOLD` or more errors within `ERROR_ALERT_WINDOW_MS`, it sends an alert email using the configured SMTP settings.
- Do not open the HTML via `file://` — use the server so the API works.

## Production deployment

The included `render.yaml` describes a Render Node web service. Connect this repository to Render and deploy the blueprint, then add the custom domain in the Render service settings and apply the DNS records Render provides at your domain registrar.

Configure these environment variables in Render before relying on the contact form:

```text
CONTACT_EMAIL_TO=company inbox that receives submissions
SMTP_HOST=your SMTP server
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your SMTP username
SMTP_PASS=your SMTP password or app password
```

`SMTP_FROM` is optional and defaults to `SMTP_USER`. Set `ALERT_EMAIL_TO` if error-spike email alerts are also wanted. Do not commit `.env` files or credentials. Contact submissions are emailed and are not stored by the application; if SMTP or the recipient is not configured, the API returns an error instead of claiming delivery.

The free Render plan may spin down after inactivity. Choose a paid plan if consistent availability is required.

Environment variables for email alerts:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
ALERT_EMAIL_TO=admin@example.com
ERROR_ALERT_THRESHOLD=5
ERROR_ALERT_WINDOW_MS=60000
```

> If these are not configured, the app will log a warning instead of sending mail.
