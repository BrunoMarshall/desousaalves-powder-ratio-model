# Complete Deployment Guide
## De Sousa Alves Powder Ratio Model Website

This guide provides ALL commands needed to deploy your website from scratch.

---

## Part 1: Local Setup and GitHub Repository

### Step 1: Prepare Local Files

Open Command Prompt (Windows) or Terminal and navigate to your working folder:

```cmd
cd C:\Users\User\OneDrive\Área de Trabalho\Staffordshire\website_desousaalves
```

### Step 2: Download Files from Claude

Save these 5 files to your working folder:
1. `index.html` - Main webpage
2. `styles.css` - Stylesheet
3. `markov-model.js` - Mathematical model
4. `calculator.js` - Calculator interface
5. `README.md` - Documentation

**Files are available in this conversation - copy and save each one.**

### Step 3: Initialize Git Repository

```cmd
# Initialize git repository
git init

# Configure git (use your information)
git config user.name "Bruno Alexandre de Sousa Alves"
git config user.email "your.email@example.com"

# Create .gitignore file
echo .DS_Store > .gitignore
echo Thumbs.db >> .gitignore
echo *.log >> .gitignore

# Add all files
git add .

# Make first commit
git commit -m "Initial commit: Powder Refresh Ratio Optimization Model website"
```

### Step 4: Connect to GitHub Repository

```cmd
# Add remote repository
git remote add origin https://github.com/BrunoMarshall/desousaalves-powder-ratio-model.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Note:** You may be prompted to authenticate with GitHub. Use a Personal Access Token if password authentication fails.

---

## Part 2: GitHub Pages Setup

### Step 5: Enable GitHub Pages

1. Go to: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model
2. Click **Settings** (top menu)
3. Scroll down to **Pages** (left sidebar)
4. Under "Source", select:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Click **Save**
6. Wait 2-3 minutes for deployment

Your site will be available at:
```
https://brunomarshall.github.io/desousaalves-powder-ratio-model/
```

Test this URL before proceeding to custom domain setup.

---

## Part 3: Namecheap DNS Configuration

### Step 6: Configure DNS Records in Namecheap

1. **Login to Namecheap:**
   - Go to: https://www.namecheap.com
   - Login to your account
   - Go to **Domain List**
   - Click **Manage** next to `desousaalves-powder-ratio-model.com`

2. **Navigate to Advanced DNS:**
   - Click the **Advanced DNS** tab

3. **Delete Existing Records** (if any):
   - Remove all existing A Records, CNAME Records
   - Keep only the essential records

4. **Add New DNS Records:**

**Record 1 - Root Domain (A Record):**
```
Type: A Record
Host: @
Value: 185.199.108.153
TTL: Automatic
```

**Record 2 - Root Domain (A Record):**
```
Type: A Record
Host: @
Value: 185.199.109.153
TTL: Automatic
```

**Record 3 - Root Domain (A Record):**
```
Type: A Record
Host: @
Value: 185.199.110.153
TTL: Automatic
```

**Record 4 - Root Domain (A Record):**
```
Type: A Record
Host: @
Value: 185.199.111.153
TTL: Automatic
```

**Record 5 - WWW Subdomain (CNAME):**
```
Type: CNAME Record
Host: www
Value: brunomarshall.github.io.
TTL: Automatic
```

**Important Notes:**
- The dot (.) at the end of `brunomarshall.github.io.` is required
- TTL can be set to "Automatic" or "1 min" for faster propagation
- All 4 A records are required for redundancy and load balancing

5. **Save Changes:**
   - Click **Save All Changes**

### Step 7: Add Custom Domain in GitHub

1. Go to: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model/settings/pages

2. Under "Custom domain", enter:
   ```
   desousaalves-powder-ratio-model.com
   ```

3. Click **Save**

4. Wait for DNS check (may take 24-48 hours, but usually 10-30 minutes)

5. **Once DNS is verified**, check the box:
   - ✅ **Enforce HTTPS**

This enables automatic HTTPS certificate from Let's Encrypt.

---

## Part 4: Verification and Testing

### Step 8: Verify DNS Propagation

Use online tools to check DNS propagation:

**Tool 1: whatsmydns.net**
```
https://www.whatsmydns.net/#A/desousaalves-powder-ratio-model.com
```
You should see all 4 GitHub IP addresses (185.199.108-111.153)

**Tool 2: Command Line**
```cmd
# Windows (Command Prompt)
nslookup desousaalves-powder-ratio-model.com

# Expected output:
# Addresses:
#   185.199.108.153
#   185.199.109.153
#   185.199.110.153
#   185.199.111.153
```

**Tool 3: Check WWW subdomain**
```cmd
nslookup www.desousaalves-powder-ratio-model.com

# Expected output:
# Non-authoritative answer:
# www.desousaalves-powder-ratio-model.com  canonical name = brunomarshall.github.io
```

### Step 9: Test Your Website

Try these URLs (all should work after DNS propagation):

1. **Without WWW:**
   ```
   http://desousaalves-powder-ratio-model.com
   https://desousaalves-powder-ratio-model.com
   ```

2. **With WWW:**
   ```
   http://www.desousaalves-powder-ratio-model.com
   https://www.desousaalves-powder-ratio-model.com
   ```

3. **Test Calculator:**
   - Select "Formlabs Fuse 1+ 30W"
   - Click "Calculate Optimal Ratio"
   - Verify results show α_opt = 29.0%

---

## Part 5: Future Updates

### Step 10: How to Update Website Content

Whenever you need to update the website:

```cmd
# 1. Make changes to files locally (edit index.html, etc.)

# 2. Check what changed
git status

# 3. Add changes
git add .

# 4. Commit with descriptive message
git commit -m "Update: Add new machine profile for EOS P800"

# 5. Push to GitHub
git push origin main

# 6. Wait 1-2 minutes for GitHub Pages to rebuild
```

Your website will update automatically!

---

## Part 6: Adding CNAME File (Important!)

### Step 11: Create CNAME File for GitHub Pages

This prevents GitHub from removing your custom domain configuration.

**Option A: Create via Command Line**
```cmd
cd C:\Users\User\OneDrive\Área de Trabalho\Staffordshire\website_desousaalves

# Create CNAME file
echo desousaalves-powder-ratio-model.com > CNAME

# Commit and push
git add CNAME
git commit -m "Add CNAME file for custom domain"
git push origin main
```

**Option B: Create Manually**
1. Create a new file named `CNAME` (no extension!)
2. Add one line: `desousaalves-powder-ratio-model.com`
3. Save in root directory
4. Commit and push as shown above

---

## Troubleshooting

### DNS Not Propagating (After 24 Hours)

**Check Namecheap Nameservers:**
1. Go to: Domain List → Manage → Domain
2. Under "Nameservers", ensure it shows:
   ```
   BasicDNS (Namecheap)
   ```
3. If using custom nameservers, switch back to Namecheap BasicDNS

### Website Shows 404 Error

**Check GitHub Pages Status:**
1. Go to: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model/settings/pages
2. Verify "Your site is published at" shows green checkmark
3. If not, try:
   ```cmd
   # Make a small change and push
   git commit --allow-empty -m "Trigger rebuild"
   git push origin main
   ```

### HTTPS Not Available

**Wait for Certificate:**
- Let's Encrypt certificate can take 30-60 minutes
- Check back after waiting
- If still not working after 24 hours, try:
  1. Uncheck "Enforce HTTPS"
  2. Remove custom domain
  3. Wait 5 minutes
  4. Re-add custom domain
  5. Wait for verification
  6. Re-enable "Enforce HTTPS"

### Calculator Not Working

**Check Browser Console:**
1. Press F12 in browser
2. Go to "Console" tab
3. Look for JavaScript errors
4. Most common issues:
   - File paths incorrect
   - JavaScript files not loaded
   - Syntax errors in code

**Test locally first:**
```cmd
cd C:\Users\User\OneDrive\Área de Trabalho\Staffordshire\website_desousaalves
python -m http.server 8000
# Open http://localhost:8000 in browser
```

---

## Complete Checklist

- [ ] 1. Files saved to local folder
- [ ] 2. Git initialized and files committed
- [ ] 3. Pushed to GitHub repository
- [ ] 4. GitHub Pages enabled (branch: main, folder: /)
- [ ] 5. Test GitHub Pages URL works
- [ ] 6. DNS A records added (4 records)
- [ ] 7. DNS CNAME record added (www subdomain)
- [ ] 8. Custom domain added in GitHub Pages
- [ ] 9. CNAME file created and pushed
- [ ] 10. DNS propagation verified
- [ ] 11. Custom domain accessible
- [ ] 12. HTTPS enforced and working
- [ ] 13. Calculator tested and functional
- [ ] 14. All machine profiles tested

---

## Quick Reference: All DNS Records

Copy this table for easy reference:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 185.199.108.153 | Automatic |
| A | @ | 185.199.109.153 | Automatic |
| A | @ | 185.199.110.153 | Automatic |
| A | @ | 185.199.111.153 | Automatic |
| CNAME | www | brunomarshall.github.io. | Automatic |

---

## Expected Timeline

- **Immediate:** GitHub Pages builds (2-3 minutes)
- **10-30 minutes:** DNS propagation starts working
- **30-60 minutes:** HTTPS certificate issued
- **Up to 48 hours:** Full global DNS propagation (but usually much faster)

---

## Support and Issues

If you encounter problems:

1. **Check GitHub Pages deployment:**
   - Repository → Actions → View workflow runs
   - Look for green checkmarks

2. **Use DNS diagnostic tools:**
   - https://www.whatsmydns.net
   - https://dnschecker.org

3. **GitHub Pages Documentation:**
   - https://docs.github.com/en/pages

4. **Open an issue:**
   - https://github.com/BrunoMarshall/desousaalves-powder-ratio-model/issues

---

## Success Indicators

Your deployment is successful when:

✅ https://desousaalves-powder-ratio-model.com loads  
✅ Shows green padlock (HTTPS)  
✅ Calculator runs and produces results  
✅ All navigation links work  
✅ Mobile responsive (test on phone)  
✅ Academic styling displays correctly  

**Congratulations! Your website is live!** 🎉
