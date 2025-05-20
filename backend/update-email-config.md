# Email Configuration Update

To fix the email deliverability issues with Outlook and other non-Gmail providers, please update your `.env.local` file with the following change:

## Current Configuration
```
FROM_EMAIL=gekuke1@ritt.ai
```

## Updated Configuration
```
FROM_EMAIL=noreply@sendgrid.net
```

This change will use SendGrid's default email domain which has better deliverability across all email providers.

## Steps to Apply the Change:
1. Open the file: `/Users/gie/Desktop/ritt-drive-thru/backend/.env.local`
2. Find the line with `FROM_EMAIL=gekuke1@ritt.ai`
3. Change it to `FROM_EMAIL=noreply@sendgrid.net`
4. Save the file
5. Restart the backend server:
   ```
   pnpm build
   node dist/agent.js dev
   ```

After making this change, emails should be properly delivered to Outlook and other email providers.
