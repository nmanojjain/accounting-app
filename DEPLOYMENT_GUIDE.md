# Deployment Guide for Accounting App

This guide will help you deploy your Next.js Accounting App to **Vercel**, which is the recommended hosting platform for Next.js applications.

## Prerequisites

1.  **GitHub Account**: You need a GitHub account to host your code repository.
2.  **Vercel Account**: Sign up at [vercel.com](https://vercel.com) using your GitHub account.

## Step 1: Push Code to GitHub

Since you are working locally, you need to push your code to a GitHub repository.

1.  **Initialize Git** (if not already done):
    Open your terminal in the project folder (`e:\accounting-app`) and run:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```

2.  **Create a Repository on GitHub**:
    - Go to GitHub and create a new repository (e.g., `accounting-app`).
    - **Do not** initialize with README, .gitignore, or License (you already have them).

3.  **Push to GitHub**:
    Follow the instructions shown on GitHub after creating the repo:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/accounting-app.git
    git branch -M main
    git push -u origin main
    ```

## Step 2: Deploy to Vercel

1.  **Import Project**:
    - Go to your Vercel Dashboard.
    - Click **"Add New..."** -> **"Project"**.
    - Select your `accounting-app` repository from the list.

2.  **Configure Project**:
    - **Framework Preset**: It should automatically detect `Next.js`.
    - **Root Directory**: Leave as `./`.

3.  **Environment Variables (CRITICAL)**:
    Expand the **"Environment Variables"** section. You MUST add the following keys exactly as they appear in your local `.env.local` file.

    | Key | Value |
    | --- | --- |
    | `NEXT_PUBLIC_SUPABASE_URL` | *Your Supabase URL* |
    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Your Supabase Anon Key* |
    | `SUPABASE_SERVICE_ROLE_KEY` | *Your Supabase Service Role Key* |

    *Note: You can copy these values from your `e:\accounting-app\.env.local` file.*

4.  **Deploy**:
    - Click **"Deploy"**.
    - Vercel will build your application. This might take a minute or two.

## Step 3: Access on Mobile

Once deployment is complete, Vercel will give you a **Domain** (e.g., `accounting-app-xyz.vercel.app`).

1.  **Open Browser on Mobile**: Open Chrome or Safari on your phone.
2.  **Visit URL**: Type in the domain provided by Vercel.
3.  **Login**: Log in with your existing credentials.

## Important Notes

*   **Supabase Backend**: Your database is already in the cloud (Supabase). You **do not** need to change anything in Supabase. The deployed app connects to the same database as your local app.
*   **Data Sync**: Any data you add via the mobile app will instantly appear on your local version (and vice versa) because they share the same backend.
*   **Updates**: To update the live app, simply make changes locally, commit, and push to GitHub (`git push`). Vercel will automatically redeploy.
