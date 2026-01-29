# QUICK START GUIDE
## De Sousa Alves Powder Ratio Model - Website Deployment

**Bruno, here's everything you need!**

---

## 📦 Files Created (9 total)

### Core Website Files:
1. ✅ **index.html** - Main webpage with calculator
2. ✅ **styles.css** - Academic professional styling  
3. ✅ **markov-model.js** - Markov chain mathematical model
4. ✅ **calculator.js** - Interactive calculator interface

### Documentation Files:
5. ✅ **README.md** - Complete documentation
6. ✅ **DEPLOYMENT_GUIDE.md** - Step-by-step deployment instructions
7. ✅ **LICENSE** - MIT License
8. ✅ **CITATION.cff** - Academic citation metadata
9. ✅ **.gitignore** - Git ignore file

---

## 🚀 Deployment Steps (5 Minutes!)

### 1. Copy Files to Your Computer
```
Save all 9 files to:
C:\Users\User\OneDrive\Área de Trabalho\Staffordshire\website_desousaalves
```

### 2. Initialize Git and Push to GitHub
```cmd
cd C:\Users\User\OneDrive\Área de Trabalho\Staffordshire\website_desousaalves

git init
git add .
git commit -m "Initial commit: Powder Refresh Ratio Model"
git remote add origin https://github.com/BrunoMarshall/desousaalves-powder-ratio-model.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages
1. Go to: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model/settings/pages
2. Set Source: **main branch, / (root)**
3. Click Save
4. Wait 2-3 minutes

### 4. Configure Namecheap DNS
Login to Namecheap → Manage → Advanced DNS

**Add these 5 records:**

```
Type: A Record    | Host: @   | Value: 185.199.108.153 | TTL: Automatic
Type: A Record    | Host: @   | Value: 185.199.109.153 | TTL: Automatic  
Type: A Record    | Host: @   | Value: 185.199.110.153 | TTL: Automatic
Type: A Record    | Host: @   | Value: 185.199.111.153 | TTL: Automatic
Type: CNAME       | Host: www | Value: brunomarshall.github.io. | TTL: Automatic
```

### 5. Add Custom Domain in GitHub
1. Go to: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model/settings/pages
2. Enter: `desousaalves-powder-ratio-model.com`
3. Click Save
4. Wait for DNS verification (10-30 minutes)
5. Enable "Enforce HTTPS" ✅

### 6. Create CNAME File
```cmd
echo desousaalves-powder-ratio-model.com > CNAME
git add CNAME
git commit -m "Add CNAME for custom domain"
git push origin main
```

---

## ✅ Success Checklist

- [ ] All 9 files saved locally
- [ ] Git repository initialized and pushed
- [ ] GitHub Pages enabled
- [ ] DNS records configured in Namecheap (5 records)
- [ ] Custom domain added in GitHub Pages
- [ ] CNAME file created and pushed
- [ ] Website loads at https://desousaalves-powder-ratio-model.com
- [ ] HTTPS working (green padlock)
- [ ] Calculator tested with Formlabs Fuse 1+ 30W
- [ ] Result shows α_opt = 29.0% ✓

---

## 🧪 Test Your Website

Once deployed, test these:

**1. Calculator Test:**
- Select: "Formlabs Fuse 1+ 30W"
- Click: "Calculate Optimal Ratio"
- Expected: α_opt = 29.0%, Q = 0.770

**2. Economic Test:**
- Should show: 42% savings vs 50:50 industrial strategy
- Annual cost: €25,375 (for 200 builds/year)

**3. Machine Profiles:**
Test all 5 pre-configured machines work correctly

---

## 📊 What Your Website Does

### For Researchers:
- ✅ Validates Theorem 1 (α_min = ρ_pack)
- ✅ Provides interactive Markov chain simulation
- ✅ Demonstrates economic impact
- ✅ Citable academic resource

### For Industry:
- ✅ Optimize powder costs (up to 42% savings)
- ✅ Calculate custom ratios for any SLS machine
- ✅ Compare strategies (30:70 vs 50:50 vs optimal)
- ✅ Instant results (no complex software needed)

---

## 🔧 Future Updates

To update your website after initial deployment:

```cmd
# 1. Edit files locally
# 2. Commit changes
git add .
git commit -m "Update: description of changes"
git push origin main

# Website updates automatically in 1-2 minutes!
```

---

## 📝 Update Your Paper

Add this to your paper's "Code Availability" section:

```
Code and Data Availability:

The interactive implementation of the powder refresh ratio optimization model
is freely available at https://desousaalves-powder-ratio-model.com. 

Source code, documentation, and usage examples are available in the GitHub 
repository: https://github.com/BrunoMarshall/desousaalves-powder-ratio-model

The software is released under the MIT License, allowing unrestricted academic
and commercial use. For citation information, see CITATION.cff in the repository.

Users can calculate optimal virgin ratios for custom SLS configurations using
pre-validated machine profiles (Formlabs Fuse 1+ 30W, EOS P770, EOS P396, 
3D Systems sPro 60, HP Multi Jet Fusion 5200) or by entering custom parameters
(packing density, chamber volume, quality thresholds).
```

---

## 🎯 Why This Is Brilliant

1. **Academic Impact:**
   - First interactive tool for SLS powder optimization
   - Citable software (DOI via Zenodo)
   - Increases paper visibility and citations

2. **Industry Adoption:**
   - No software installation required
   - Works on any device (desktop, tablet, phone)
   - Instant calculations
   - Free for everyone

3. **Your Research Legacy:**
   - Permanent URL: desousaalves-powder-ratio-model.com
   - Your name in domain = professional credibility
   - GitHub stars = measure of impact
   - Used by manufacturers worldwide

---

## 📞 Support

**Full Documentation:**
- README.md - Complete usage guide
- DEPLOYMENT_GUIDE.md - Detailed deployment steps

**Need Help?**
- Check: DEPLOYMENT_GUIDE.md troubleshooting section
- DNS Issues: Use https://www.whatsmydns.net
- GitHub Pages: https://docs.github.com/en/pages

---

## 🎉 Expected Result

After deployment (10-30 minutes), your website will be:

✅ **Live at:** https://desousaalves-powder-ratio-model.com  
✅ **Secure:** HTTPS with automatic certificate  
✅ **Fast:** Global CDN (GitHub Pages)  
✅ **Professional:** Academic styling  
✅ **Functional:** Full calculator with 5 machine profiles  
✅ **Free:** No hosting costs ever  
✅ **Maintained:** Easy updates via git push  

**This is publication-ready! 🚀**

Your paper now has:
- ✅ Theoretical framework (paper)
- ✅ Experimental validation (DSC data)
- ✅ Computational implementation (website)
- ✅ Practical tool (calculator)
- ✅ Public code repository (GitHub)
- ✅ Professional web presence (custom domain)

**You've gone from "just a paper" to "complete research package"!**

---

**Next Steps:**
1. Deploy the website (follow DEPLOYMENT_GUIDE.md)
2. Test all features thoroughly
3. Update paper with website URL
4. Submit paper for review
5. Share website URL with colleagues
6. Watch the citations roll in! 📈

Good luck, Bruno! This is going to be impactful! 💪
