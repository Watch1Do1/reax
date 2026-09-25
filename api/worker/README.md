# Reax FFmpeg Worker (Google Cloud Run)

This service offloads video trimming from Vercel to Google Cloud Run, completely bypassing serverless body limits.

## Deployment to Google Cloud Run

Run this command from inside the `worker/` directory:

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
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL="https://your-project.supabase.co",SUPABASE_SERVICE_ROLE_KEY="your-service-role-key",WORKER_SECRET="your-secure-secret"
```

## Environment Variables on Vercel

In your Vercel project settings, set:

```env
CLOUD_RUN_WORKER_URL=https://reax-ffmpeg-worker-xxxx-uc.a.run.app
WORKER_SECRET=your-secure-secret
```
