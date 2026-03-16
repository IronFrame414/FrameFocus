# FrameFocus — Setup Instructions

You need 3 websites: Supabase, GitHub, and Netlify.
No coding tools need to be installed on your computer.

Total time: about 20 minutes.

---

## STEP 1: Supabase (your database)

Skip this if you already did it. Go to Step 1F if your database is already set up.

### 1A. Go to supabase.com and log in

### 1B. Click "New Project"
- Name it: framefocus
- Set a database password (save it somewhere)
- Pick a region close to you
- Click "Create New Project"
- Wait 2 minutes

### 1C. Create the database tables
- In the left sidebar, click "SQL Editor"
- Click "New Query"
- Open the file sql/supabase-schema.sql on your computer
- Select all the text (Ctrl+A or Cmd+A), copy it (Ctrl+C or Cmd+C)
- Paste it into the Supabase SQL editor
- Click the green "Run" button
- You should see "Success"

### 1D. Run the security file
- Click "New Query" again
- Open sql/supabase-rls.sql, copy all the text
- Paste into Supabase, click "Run"

### 1E. Run the sample data file
- Click "New Query" one more time
- Open sql/supabase-seed.sql, copy all the text
- Paste into Supabase, click "Run"

### 1F. Turn off email confirmation
- In the left sidebar, click "Authentication"
- On the left side under CONFIGURATION, click "Sign In / Providers"
- Click "Email" to expand it
- Find "Confirm email" and turn it OFF
- Click "Save"

### 1G. Get your connection info
- Click the "Connect" button at the top of the page
- Copy your Project URL (looks like https://abcxyz.supabase.co)
- Copy your API Key (long string starting with eyJ...)
- Save both somewhere — you need them in Step 2

---

## STEP 2: Edit one file with your Supabase info

Before uploading to GitHub, you need to put your Supabase connection
info into one file.

### 2A. Find the file
In the files you downloaded, go to:
   lib → config → supabase_config.dart

### 2B. Open it in any text editor
Notepad (Windows) or TextEdit (Mac) works fine.

### 2C. You will see this:
   static const String url = 'https://YOUR-PROJECT-ID.supabase.co';
   static const String anonKey = 'YOUR-ANON-PUBLIC-KEY';

### 2D. Replace the placeholder values
- Replace https://YOUR-PROJECT-ID.supabase.co with your Project URL
- Replace YOUR-ANON-PUBLIC-KEY with your API Key
- Keep the quote marks — your values go BETWEEN them

### 2E. Save the file

---

## STEP 3: Create a NEW GitHub repository

You need a fresh repo for this. Don't use the old Iron-Frame one.

### 3A. Go to github.com
### 3B. Click the + icon in the top right, then "New repository"
### 3C. Fill in:
- Repository name: framefocus
- Visibility: Private
- Do NOT check "Add a README"
- Do NOT add .gitignore
- Do NOT add a license
- Click "Create Repository"

---

## STEP 4: Upload your files to GitHub

### 4A. On your new empty repo page, click "uploading an existing file"

### 4B. Upload the files
You need to upload these files and folders. Do them in this order:

FIRST — Upload the loose files:
- pubspec.yaml
- analysis_options.yaml
- README.md
- SETUP.md

Drag them in and click "Commit changes"

### 4C. Create the lib folder and its files
GitHub can't upload folders by drag-and-drop easily.
Instead, for each file inside lib, do this:

1. Click "Add file" → "Create new file"
2. In the filename box, type the FULL path including folders.
   GitHub creates the folders automatically when you type a slash.

Here are the exact filenames to type (one file at a time):

   lib/main.dart
   lib/config/theme.dart
   lib/config/supabase_config.dart
   lib/models/models.dart
   lib/services/auth_service.dart
   lib/services/database_service.dart
   lib/screens/app_shell.dart
   lib/screens/auth_screen.dart
   lib/screens/dashboard_screen.dart
   lib/screens/projects_screen.dart
   lib/screens/change_orders_screen.dart
   lib/screens/catalog_screen.dart
   lib/screens/time_tracking_screen.dart
   lib/screens/bid_requests_screen.dart
   lib/screens/daily_log_screen.dart
   lib/screens/estimating_screen.dart
   lib/widgets/common.dart

For each one:
   a. Click "Add file" → "Create new file"
   b. Type the filename (like lib/main.dart)
   c. Open that file from your downloaded files in Notepad/TextEdit
   d. Copy ALL the text
   e. Paste it into the big editor box on GitHub
   f. Click "Commit changes"

### 4D. Create the web files (same process)

   web/index.html
   web/manifest.json

### 4E. Create the GitHub Actions file

   .github/workflows/deploy.yml

IMPORTANT: the filename starts with a dot. Type it exactly:
   .github/workflows/deploy.yml

---

## STEP 5: Connect Netlify

### 5A. Go to netlify.com and log in

### 5B. Create a new site
- Click "Add new site" → "Import an existing project"
- Choose GitHub
- Select the "framefocus" repository
- For build settings, leave everything blank/default
- Click "Deploy site"
- It will create a site (it won't work yet — that's fine)

### 5C. Get your Netlify Site ID
- On your new site's page, click "Site configuration" (or "Site settings")
- Look for "Site ID" — it's a long string like "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
- Copy it and save it

### 5D. Get your Netlify Auth Token
- Click your profile picture (top right) → "User settings"
- Click "Applications"
- Under "Personal access tokens", click "New access token"
- Give it a name like "framefocus-deploy"
- Click "Generate token"
- COPY THE TOKEN NOW — you won't see it again
- Save it somewhere

---

## STEP 6: Add secrets to GitHub

This connects GitHub to Netlify so it can auto-deploy.

### 6A. Go to your framefocus repo on GitHub

### 6B. Click "Settings" (the tab at the top of the repo page)

### 6C. In the left sidebar, click "Secrets and variables" → "Actions"

### 6D. Click "New repository secret"
- Name: NETLIFY_AUTH_TOKEN
- Secret: paste the token from Step 5D
- Click "Add secret"

### 6E. Click "New repository secret" again
- Name: NETLIFY_SITE_ID
- Secret: paste the Site ID from Step 5C
- Click "Add secret"

---

## STEP 7: Trigger the first build

### 7A. Go to your repo on GitHub
### 7B. Make any tiny change to any file
- Click on README.md
- Click the pencil icon to edit
- Add a space or a period at the end
- Click "Commit changes"

### 7C. Click the "Actions" tab at the top of your repo
- You should see "Build and Deploy" running
- It takes about 3-5 minutes the first time
- When it shows a green checkmark, your site is live

### 7D. Go to your Netlify site URL
- Go back to netlify.com → your site
- Click the URL at the top (something like random-name-12345.netlify.app)
- You should see the FrameFocus login screen

---

## STEP 8: Create your account

1. On the login screen, click "No account? Register"
2. Enter your name, email, and a password
3. Select "Owner" as your role
4. Click "Create Account"
5. You should see the dashboard with sample projects

---

## Sharing with testers

Send them your Netlify URL. Tell them to:
1. Open the link
2. Click "Register"
3. Pick their role (Owner, Foreman, Employee, or Viewer)
4. Start using the app

---

## Making changes later

To update anything:
1. Edit the file on GitHub (click the file, click the pencil icon)
2. Save/commit
3. GitHub automatically rebuilds and deploys in 3-5 minutes

---

## If something goes wrong

BUILD FAILS (red X in GitHub Actions tab):
→ Click on the failed run to see the error message
→ Most likely a typo in one of the files

SITE LOADS BUT SHOWS BLANK SCREEN:
→ Check supabase_config.dart has the right URL and key
→ Make sure you didn't delete the quote marks

"Invalid login credentials" WHEN REGISTERING:
→ Go to Supabase → Authentication → Sign In / Providers → Email
→ Turn OFF "Confirm email"

NOTHING HAPPENS AFTER COMMIT:
→ Go to GitHub → your repo → Actions tab
→ Check if the workflow is running
→ If no workflow exists, make sure .github/workflows/deploy.yml was created correctly
