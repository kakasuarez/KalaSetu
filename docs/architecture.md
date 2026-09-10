# Architecture

KalaSetu deliberately separates the core business API from the memory-intensive ML service to ensure scalability, fast deployments, and reliable request handling. 

## System Diagram

```mermaid
flowchart TD
    App[Mobile App (Expo / React Native)]
    API[Backend API (FastAPI)]
    ML[ML Service (FastAPI)]
    DB[(Neon Postgres + pgvector)]
    Storage[(Storage: R2 / Cloudinary / Local)]
    LLM[External LLMs: Gemini / Groq]

    App -- "HTTPS + JWT" --> API
    API -- "Async SQL" --> DB
    API -- "HTTP Requests" --> ML
    API -- "File Uploads" --> Storage
    API -- "Prompts" --> LLM
    ML -- "3D Gen / BG Removal" --> Storage
```

## Components

### 1. Mobile App (Expo)
A React Native application using Expo. It handles user interactions, media capture (audio and images), and renders the zero-text Sakhi UI. It communicates directly with the Backend API via HTTPS using JWTs for authentication.

### 2. Backend API (FastAPI)
The primary entry point for the mobile app, written in Python with FastAPI. 
- **Stateless:** It acts as an orchestrator, delegating memory-heavy AI processing (like image manipulation) to the ML service.
- **Database Access:** It communicates with the database using asynchronous SQLAlchemy (`asyncpg`).
- **Authentication & Throttling:** Uses OTP issuance and PIN login throttling implemented purely via Postgres tables. This simplifies the infrastructure by removing the need for an external Redis caching layer.
- **External APIs:** Calls Groq and Gemini for transcription (Whisper) and generative text tasks (auto-cataloging, pricing analysis).

### 3. Database (Neon Postgres)
A serverless PostgreSQL database hosted on Neon.
- Holds all structured data including users, artisans, listings, and media records.
- Employs `pgvector` extensions to store and query embeddings.
- Acts as the single source of truth, efficiently handling OTP lifecycle and rate-limiting data natively.

### 4. ML Service (FastAPI)
A standalone FastAPI service specifically built for heavy machine learning inference tasks, such as:
- TripoSR or Trellis 3D model generation.
- Background removal and image enhancement.
- Local Whisper fallback for speech-to-text.

The backend API makes synchronous HTTP requests to this service. By keeping these models separate, the main API avoids high RAM overhead (e.g., loading CLIP, e5, rembg models into memory) and cold-start latency.

### 5. Media Storage
A unified storage interface supporting multiple backends:
- **Local filesystem:** for fast local development without credentials.
- **Cloudflare R2:** (S3 compatible) for production.
- **Cloudinary:** as an alternative cloud backend.

## Workflow Example: Auto-Cataloging
1. The user records a voice description and takes a photo on the **Mobile App**.
2. The **Mobile App** uploads these assets to the **Backend API**.
3. The **Backend API** stores the media in **Storage** and records the metadata in **Postgres**.
4. The **Backend API** calls an external **LLM provider (Groq/Whisper)** for transcription.
5. The **Backend API** calls an **LLM (Gemini)** to extract facts and formulate a structured product listing.
6. The compiled listing data is returned to the user and saved in **Postgres**.
