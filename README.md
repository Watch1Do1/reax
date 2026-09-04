# Reax

> **Built for reactions, not comments.**

Reax is a reaction-first social app where people reply with content instead of comments.

Post a photo or short video. Add a caption and optional voice.

Instead of typing a reply, people respond with their own loop:

- 📷 Photo or short video
- ✏️ Caption
- 🎙️ Optional voice clip

The result is a chain of visual and audio reactions where the conversation becomes the content.

🌐 **Live Demo:** https://reax-black.vercel.app

---

## Why Reax

Typical social apps:

```text
Post
├─ Comment
├─ Comment
└─ Comment
```

Reax:

```text
Post
└─ Reaction
   └─ Reaction
      └─ Reaction
         └─ Reaction
```

Instead of scrolling through text, you watch and hear how people respond.

Think:

- GIF wars
- Meme replies
- Reaction videos
- Visual conversations

The unit of conversation is a **loop**, not a paragraph.

---

## Features

### 🎬 Create Reactions

Create a root post with:

- Photo
- Short video
- Caption
- Optional voice recording

### ⚡ Fast Reax

Mobile-first quick responses:

1. Tap React
2. Choose a tone
3. Publish

Designed to make reacting faster than typing.

### 🧵 Reaction Threads

Every reaction can receive reactions.

Threads naturally grow into visual conversation chains.

### 🎙️ Voice Responses

Attach short voice clips to reactions and let people hear your response, not just read it.

### 📦 Reaction Vault

Save reactions and reuse them later.

Build your own collection of go-to responses.

### 👤 Guest Posting

No account required to get started.

Sign up later to claim a permanent username and profile.

### 📱 Mobile First

Runs directly in the browser on phones, tablets, and desktop.

No app download required.

---

## What Reax Is

✅ A reaction platform

✅ A visual conversation platform

✅ A place for GIF-war style interaction

✅ A new way to respond to content

---

## What Reax Is Not

❌ A traditional comment section

❌ A chat app

❌ A TikTok clone

❌ A generic photo feed

The goal is not posting.

The goal is reacting.

---

## Example

### Traditional Comment Section

```text
Looks good.
Nice work.
Too expensive.
Love it.
```

### Reax

```text
😲 "WAIT WHAT?!"
   └─ 😂 "BRO TAKE MY MONEY"
      └─ 🤔 "How much is it?"
         └─ 😱 "I NEED THIS"
```

Every response becomes content.

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Express
- TypeScript

### Infrastructure

- Vercel
- Supabase

### Storage

- Supabase Storage
- Image uploads
- Video uploads
- Audio uploads

### Authentication

- Email & Password
- Guest Accounts
- Anonymous Posting

---

## Local Development

### Requirements

- Node.js
- Supabase project

### Install

```bash
npm install
```

### Configure Environment Variables

Copy `.env.example` and configure:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional:

```env
GEMINI_API_KEY=
```

For local development only:

```env
DEV_MEMORY_STORE=true
```

Do not use `DEV_MEMORY_STORE` in production.

### Run Development Server

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

---

## Deployment Notes

### Vercel

The serverless entry point expects:

```text
dist/server.cjs
```

The deployment bundle must generate this file.

### Supabase

Required:

```text
clips
user_profiles
```

Optional:

```text
likes
laughs
reports
```

### Storage

Bucket:

```text
media
```

Recommended configuration:

- Public read access
- Authenticated uploads

### Authentication

- Email & Password
- Guest posting supported

For production email flows:

```text
Site URL = Vercel domain
Redirect URL = Vercel domain
```

Do not use localhost redirect URLs in production.

---

## Product Evolution

### Phase 0

- Environment configuration
- Production fail-closed behavior

### Phase 1

- Bearer-token authentication
- Secure write operations

### Phase 2

- Supabase-backed clips schema

### Phase 3

- Storage uploads
- No base64 media in database rows
- HEIC → JPEG conversion on-device

### Phase 4

- Email/password identity
- User profiles

### Phase 5

- Fast Reax mobile workflow

### Phase 6

- Watch and react directly from the feed

---

## Vision

The internet learned how to post.

Reax is about learning how to react.

We believe some of the most entertaining content online isn't the original post.

It's the response.

---

## Tagline

> **The comment section has never been this fun.**

---

## License

Private project.

All rights reserved unless a license is added in the future.
