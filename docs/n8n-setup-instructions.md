# N8N Personalized Video Outreach — Setup Instructions

## Overview

This workflow automates the full 5-touch outreach sequence:
1. Fetches contacts from Apollo.io
2. Runs AI visibility scans via Rankall.io
3. Generates personalized video emails
4. Sends via Resend
5. Tracks opens and video views
6. Sends follow-up touches automatically

## Prerequisites

- N8N instance (self-hosted or cloud at n8n.io)
- Apollo.io API key
- Resend API key
- Rankall.io running at https://www.rankall.io

## Step 1: Import the Workflow

1. Open your N8N instance
2. Go to **Workflows** → **Import from File**
3. Upload `docs/n8n-personalized-video-outreach.json`
4. Click **Import**

## Step 2: Configure Credentials

### Apollo.io (HTTP Header Auth)
1. Go to **Credentials** → **New**
2. Select **HTTP Header Auth**
3. Name: `Apollo API`
4. Header Name: `x-api-key`
5. Header Value: your Apollo.io API key

### Resend (HTTP Header Auth)
1. Go to **Credentials** → **New**
2. Select **HTTP Header Auth**
3. Name: `Resend API`
4. Header Name: `Authorization`
5. Header Value: `Bearer re_YOUR_RESEND_API_KEY`

## Step 3: Assign Credentials to Nodes

1. Click on **Get Apollo Contacts** node → select `Apollo API` credential
2. Click on **Send Email via Resend** node → select `Resend API` credential
3. Click on **Send Touch 5 Final** node → select `Resend API` credential

## Step 4: Configure Apollo Search Parameters

Edit the **Get Apollo Contacts** node to customize:
- `person_titles`: Target job titles (default: owner, founder, CEO)
- `person_locations`: Target cities/countries
- `per_page`: Contacts per run (default: 25, max: 100)

Add any industry-specific filters using Apollo's search API parameters.

## Step 5: Test the Workflow

1. Click **Execute Workflow** in the top right
2. Watch each node execute
3. Check the output of **Run AI Scan** — verify it returns score and competitor data
4. Check **Send Email via Resend** — confirm email is sent
5. Check Rankall.io database for logged outreach

## Step 6: Activate

1. Toggle **Active** switch in the top right
2. The workflow will now run daily at 8:00 AM UTC

## Node Reference

| # | Node | Purpose |
|---|------|---------|
| 1 | Schedule Trigger | Fires daily at 08:00 UTC |
| 2 | Get Apollo Contacts | Fetches 25 new prospects from Apollo |
| 3 | Filter Already Contacted | Removes contacts already in outreach_intelligence |
| 4 | Run AI Scan | Scans business across 12 AI platforms |
| 5 | Skip Zero Score | Skips businesses with no AI presence or no competitor |
| 6 | Generate Video Email | Creates personalized video script + email HTML |
| 7 | Send Email via Resend | Sends touch 1 email |
| 8 | Log Send | Records send in outreach_intelligence table |
| 9 | Wait 3 Days | Waits 3 days before checking engagement |
| 10 | Check Email Opened | Queries outreach_intelligence for open event |
| 11 | Not Opened? | Branches: not opened → send touch 2 |
| 12 | Wait 4 More Days | Waits 4 more days |
| 13 | Check Video Viewed | Queries outreach_intelligence for video_viewed |
| 14 | Not Viewed? | Branches: not viewed → send touch 3 |
| 15 | Wait 7 Days Final | Waits 7 days before final touch |
| 16 | Send Touch 5 Final | Sends closing email (touch 5) |

## Troubleshooting

**Workflow not triggering**: Check that the workflow is Active and N8N's timezone is set correctly.

**Apollo returning no results**: Verify your API key and check your Apollo credit balance.

**Scan returning score=0**: The business may not have an online presence. The `Skip Zero Score` node handles this — these contacts are dropped.

**Emails not sending**: Verify your Resend API key and check that your sending domain is verified in Resend.

**Wait nodes not resuming**: Ensure N8N is running continuously (not restarting between waits). For production, use N8N cloud or a persistent server.
