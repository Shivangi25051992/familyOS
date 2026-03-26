# Gmail Sync Setup

You've created the OAuth client "FamilyOS Gmail Sync". Complete these steps:

## 1. Add Authorized JavaScript origin

In Google Cloud Console → APIs & Services → Credentials → **FamilyOS Gmail Sync** (edit):

- **Authorized JavaScript origins**: Add `https://familyos-e3d4b.web.app`

## 2. Enable Gmail API

- APIs & Services → Library → search "Gmail API" → Enable

## 3. Copy your Client ID

From the OAuth client, copy the full **Client ID** (e.g. `51515298953-5d1t8xxxx.apps.googleusercontent.com`).

## 4. Deploy with the Client ID

```bash
GOOGLE_GMAIL_CLIENT_ID="YOUR_FULL_CLIENT_ID" ./deploy.sh
```

Or with all keys:

```bash
OPENAI_API_KEY=sk-... GOOGLE_GMAIL_CLIENT_ID="51515298953-xxx.apps.googleusercontent.com" ./deploy.sh
```

## Usage

1. More → Gmail Sync → Connect Gmail
2. Grant access in the popup
3. Fetch recent emails
4. Tap an email → creates a task from the subject
