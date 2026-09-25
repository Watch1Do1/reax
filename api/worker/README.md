# Reax FFmpeg Worker (Google Cloud Run)

This service offloads video trimming from Vercel to Google Cloud Run, completely bypassing serverless body limits.

## Deployment to Google Cloud Run

Deploy as an authenticated internal service (or protected by `WORKER_SECRET` header):

```bash
gcloud run deploy reax-ffmpeg-worker \
  --source . \
  --region us-central1 \
  --platform managed \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --concurrency 1 \
  --timeout 120s \
  --set-env-vars SUPABASE_URL="https://your-project.supabase.co",SUPABASE_SERVICE_ROLE_KEY="your-service-role-key",WORKER_SECRET="generate-a-strong-random-secret"
```

> **Security Note**: `WORKER_SECRET` is strictly enforced. The worker immediately rejects any requests without a valid `x-worker-secret` header.

## Environment Variables on Vercel

In your Vercel project settings, configure:

```env
CLOUD_RUN_WORKER_URL=https://reax-ffmpeg-worker-xxxx-uc.a.run.app
WORKER_SECRET=generate-a-strong-random-secret
```
