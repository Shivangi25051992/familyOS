# Phase 12: API Key Security (Cloud Functions)

## CRITICAL: Before Public Launch

**Status**: ⚠️ PENDING IMPLEMENTATION  
**Priority**: 🔴 CRITICAL  
**Risk**: Exposed Anthropic API key in `public/config.js`

---

## Current State

### Exposed API Keys
- **File**: `public/config.js`
- **Key**: Anthropic API key (`sk-ant-api03-...`)
- **Risk**: Public access, potential abuse, billing fraud

### Client-Side AI Calls
All AI calls currently use `callClaudeHealth()` which directly calls Anthropic API from the browser:

1. **Medical Report Analysis** (`handleHealthReport`)
2. **Care Chat** (`sendCareChatQuery`)
3. **Doctor Summary** (`generateDoctorSummary`)
4. **Audio Health Brief** (`playHealthBrief`)
5. **Prescription Parsing** (`handleMedPhoto`)
6. **Bill OCR** (`handleBillPhoto`)
7. **AI Summary Generation** (`generateAISummary`)

---

## Implementation Plan

### Step 1: Create Cloud Functions

Create `/functions/src/health-ai.ts`:

```typescript
import * as functions from 'firebase-functions';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: functions.config().anthropic.key
});

export const healthAI = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { prompt, context: aiContext, persona, model, maxTokens } = data;

  try {
    const response = await anthropic.messages.create({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 800,
      system: persona ? HEALTH_PERSONA : undefined,
      messages: [
        {
          role: 'user',
          content: `${aiContext}\n\n${prompt}`
        }
      ]
    });

    return {
      text: response.content[0].text,
      usage: response.usage
    };
  } catch (error) {
    console.error('AI call failed:', error);
    throw new functions.https.HttpsError('internal', 'AI processing failed');
  }
});

export const healthAnalyzeImage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { imageBase64, prompt, model, maxTokens } = data;

  try {
    const response = await anthropic.messages.create({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 1200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    });

    return {
      text: response.content[0].text,
      usage: response.usage
    };
  } catch (error) {
    console.error('Image analysis failed:', error);
    throw new functions.https.HttpsError('internal', 'Image analysis failed');
  }
});

const HEALTH_PERSONA = `You are a medical AI assistant helping family caregivers track and understand health information. Be warm, clear, and accurate. Use simple language. When discussing medical findings, explain what they mean in plain terms. Always encourage consulting doctors for medical decisions.`;
```

### Step 2: Deploy Functions

```bash
# Set API key
firebase functions:config:set anthropic.key="sk-ant-api03-..."

# Install dependencies
cd functions
npm install @anthropic-ai/sdk

# Deploy
firebase deploy --only functions
```

### Step 3: Update Client-Side Calls

Replace `callClaudeHealth()` with Cloud Function calls:

```javascript
async function callClaudeHealth(prompt, context, persona, model, maxTokens) {
  try {
    const healthAI = httpsCallable(functions, 'healthAI');
    const result = await healthAI({
      prompt,
      context,
      persona,
      model,
      maxTokens
    });
    return result.data.text;
  } catch (error) {
    console.error('AI call failed:', error);
    throw new Error('AI processing failed. Please try again.');
  }
}

async function analyzeHealthImage(imageBase64, prompt, model, maxTokens) {
  try {
    const analyzeImage = httpsCallable(functions, 'healthAnalyzeImage');
    const result = await analyzeImage({
      imageBase64,
      prompt,
      model,
      maxTokens
    });
    return result.data.text;
  } catch (error) {
    console.error('Image analysis failed:', error);
    throw new Error('Image analysis failed. Please try again.');
  }
}
```

### Step 4: Remove Exposed Keys

1. Delete `public/config.js` entirely
2. Add to `.gitignore`:
   ```
   public/config.js
   .env
   functions/.env
   ```
3. Remove all references to `window.FAMILYOS_OCR_CONFIG`

### Step 5: Update All AI Calls

Search and replace in `public/index.html`:

1. **Report Analysis** (line ~8000):
   ```javascript
   // OLD: const analysis = await callClaudeHealth(...)
   // NEW: const analysis = await callClaudeHealth(...)
   // (No change needed if using same function name)
   ```

2. **Image Analysis** (line ~8100):
   ```javascript
   // OLD: Direct Anthropic API call with base64
   // NEW: const analysis = await analyzeHealthImage(base64, prompt, model, maxTokens)
   ```

### Step 6: Testing Checklist

- [ ] Medical report upload and analysis
- [ ] Care Chat queries
- [ ] Doctor summary generation
- [ ] Audio health brief
- [ ] Prescription photo parsing
- [ ] Bill OCR
- [ ] AI summary generation
- [ ] Error handling (network failures, auth errors)
- [ ] Rate limiting (prevent abuse)

---

## Security Enhancements

### Rate Limiting
Add to Cloud Functions:

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: 50, // 50 requests
  duration: 3600 // per hour
});

export const healthAI = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  try {
    await rateLimiter.consume(context.auth.uid);
  } catch {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
  }

  // ... rest of function
});
```

### Usage Tracking
Log AI usage for billing and monitoring:

```typescript
await admin.firestore()
  .collection('aiUsage')
  .add({
    uid: context.auth.uid,
    function: 'healthAI',
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
```

---

## Cost Estimation

### Current Risk
- Exposed API key = unlimited potential cost
- No rate limiting = vulnerable to abuse

### After Implementation
- Rate limited: 50 requests/hour/user
- Average cost: ~$0.01 per AI call
- Monthly estimate (100 active users): ~$150-300

---

## Deployment Steps

1. **Backup current code**:
   ```bash
   git commit -am "Pre-Phase-12 backup"
   git push
   ```

2. **Create functions directory** (if not exists):
   ```bash
   firebase init functions
   ```

3. **Implement Cloud Functions**:
   - Create `functions/src/health-ai.ts`
   - Install dependencies
   - Set config

4. **Deploy functions**:
   ```bash
   firebase deploy --only functions
   ```

5. **Update client code**:
   - Modify `callClaudeHealth()` to use Cloud Functions
   - Test thoroughly

6. **Remove exposed keys**:
   - Delete `public/config.js`
   - Commit and push

7. **Verify**:
   - Test all AI features
   - Check Cloud Functions logs
   - Monitor usage

---

## Timeline

- **Setup**: 2 hours
- **Implementation**: 4 hours
- **Testing**: 2 hours
- **Deployment**: 1 hour
- **Total**: ~1 day

---

## Notes

- This is a **BLOCKING** issue for public launch
- Current exposed key should be **rotated immediately**
- All existing AI features will continue to work after migration
- Cloud Functions add ~200-500ms latency (acceptable for AI calls)

---

## Status: READY FOR IMPLEMENTATION

All other phases (1-11) are complete. Phase 12 is the final critical step before public launch.
