# N8N Outreach Workflow — Rankall.io

## Overview
Automated daily outreach: Apollo contacts → Rankall scan → video email → tracking → hot lead alerts.

## Workflow Nodes

### Node 1: Schedule Trigger
- Type: Schedule
- Time: 8:00 AM daily
- Timezone: America/Chicago

### Node 2: Apollo Contact Fetch
- Type: HTTP Request
- Method: GET
- URL: https://api.apollo.io/v1/contacts/search
- Headers: { "Cache-Control": "no-cache", "Content-Type": "application/json", "X-Api-Key": "{{$env.APOLLO_API_KEY}}" }
- Body: { "q_keywords": "dentist hvac lawyer", "person_locations": ["United States"], "page": 1, "per_page": 25 }

### Node 3: Rankall Apollo Webhook
- Type: HTTP Request
- Method: POST
- URL: https://rankall.io/api/webhooks/apollo
- Headers: { "Content-Type": "application/json", "x-apollo-secret": "{{$env.APOLLO_WEBHOOK_SECRET}}" }
- Body: { "name": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['organization_name']}}", "first_name": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['first_name']}}", "last_name": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['last_name']}}", "email": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['email']}}", "city": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['city']}}", "state": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['state']}}", "industry": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['industry']}}", "id": "{{$node['Apollo Contact Fetch'].json['contacts'][0]['id']}}" }

### Node 4: Send Email via Resend
- Type: HTTP Request
- Method: POST
- URL: https://api.resend.com/emails
- Headers: { "Authorization": "Bearer {{$env.RESEND_API_KEY}}", "Content-Type": "application/json" }
- Body: { "from": "Nandish at Rankall <nandish@rankall.io>", "to": "{{$node['Rankall Apollo Webhook'].json['email']}}", "subject": "I scanned {{$node['Rankall Apollo Webhook'].json['business_name']}} — AI score is {{$node['Rankall Apollo Webhook'].json['rankall_score']}}/100", "html": "<p>Hi {{$node['Rankall Apollo Webhook'].json['owner_name']}}, ...</p><a href='{{$node['Rankall Apollo Webhook'].json['video_url']}}'>Watch your 60-sec report</a>" }

### Node 5: Track Send
- Type: HTTP Request
- Method: POST
- URL: https://rankall.io/api/outreach/track
- Body: { "event": "email_sent", "scan_id": "{{$node['Rankall Apollo Webhook'].json['scan_id']}}" }

## Environment Variables Required
- APOLLO_API_KEY — from Apollo.io settings
- APOLLO_WEBHOOK_SECRET — matches APOLLO_WEBHOOK_SECRET in Vercel
- RESEND_API_KEY — from resend.com
- SLACK_WEBHOOK_URL — from Slack app settings

## Import Instructions
1. Go to N8N → Workflows → Import from JSON
2. Paste each node configuration above
3. Set credentials for Apollo, Resend, Slack
4. Activate workflow
5. Test with one contact before enabling daily schedule
