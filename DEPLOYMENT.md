# Production Deployment Guide

This guide walks you through deploying your Select Uniforms production management system to Replit.

## 📋 Pre-Deployment Checklist

### ✅ Development Database Cleaned
- All test orders deleted
- All schedules cleared
- Leaderboard reset
- **29 customers preserved** and ready to import to production

---

## 🚀 Deployment Steps

### Step 1: Click Deploy Button

Click the **Deploy** button in Replit (you should see it at the top of the interface).

---

### Step 2: Configure Production Environment Variables

When the deployment dialog opens, add these **production secrets**:

#### Required Environment Variables:

1. **`NODE_ENV`**
   ```
   production
   ```

2. **`SESSION_SECRET`**
   ```
   prod_selectuniforms_2025_a8f4e9c2d1b3e7f6
   ```
   ⚠️ This is different from your development secret!

3. **`DATABASE_URL`**
   - ✅ Select "Add PostgreSQL database" in the deployment dialog
   - Replit will automatically provision a production database
   - This will be separate from your development database

4. **Xero API Credentials** (same as development):
   - `XERO_CLIENT_ID` = [your Xero client ID]
   - `XERO_CLIENT_SECRET` = [your Xero client secret]
   - `XERO_TENANT_ID` = [your Xero tenant ID]

---

### Step 3: Deploy!

Click **Deploy** and wait for the build to complete.

Your production URL will be: `https://[deployment-name].replit.app`

---

## 🗄️ Production Database Setup

After deployment completes, access the deployment console/shell and run these commands **IN ORDER**:

### 1. Create Database Schema

```bash
npm run db:push
```

This creates all tables in your production database.

### 2. Import Customer Data

```bash
npx tsx scripts/seed-customers.ts
```

This imports all 29 customers into production.

Expected output:
```
🌱 Starting customer data seeding...
📊 Found 29 customers to import
✅ Imported: 41 Prints
✅ Imported: Aspect
...
🎉 Customer seeding complete!
```

---

## 🔐 Update Xero OAuth Configuration

⚠️ **CRITICAL:** Update your Xero app to allow production OAuth:

1. Go to: https://developer.xero.com/app/manage
2. Click your app
3. Add new **Redirect URI**:
   ```
   https://[your-deployment-name].replit.app/api/xero/callback
   ```
4. Save changes

---

## 👤 Create Your First Admin User

### Method 1: Automatic (Recommended)

1. Visit your production URL: `https://[deployment-name].replit.app`
2. Click "Login with Replit"
3. You'll be created as a user automatically
4. Access the deployment database console and run:

```sql
UPDATE users 
SET role = 'super_admin' 
WHERE email = 'your@email.com';
```

### Method 2: Pre-create in Database

Access the deployment database and run:

```sql
INSERT INTO users (id, email, first_name, last_name, role)
VALUES (
  gen_random_uuid(),
  'your@email.com',
  'Your',
  'Name',
  'super_admin'
);
```

---

## ✅ Post-Deployment Checklist

After deployment, verify:

- [ ] Production URL is accessible
- [ ] Staff login works (Replit Auth)
- [ ] Dashboard loads without errors
- [ ] All 29 customers are visible in Customers page
- [ ] You can create a test job
- [ ] Xero integration works (try Disconnect/Reconnect OAuth)
- [ ] Customer portal login works at `/customer/login`

---

## 🔄 Development Workflow (After Deployment)

### How to Update Production:

1. **Make changes in Replit** (your development environment)
2. **Test in development** (current Repl)
3. **Click "Redeploy"** in Replit deployments
4. Changes automatically go live!

### Two Separate Environments:

- **Development**: This Repl (with test data)
- **Production**: Deployment (with real customer data)

Each has its own database - they don't affect each other.

---

## 📝 Production Data Management

### Adding New Customers to Production:

Use the Customers page UI - no scripts needed.

### Backing Up Production Database:

Replit automatically backs up your production database. You can restore from the Replit deployments interface.

---

## 🌐 Custom Domain (Optional)

To use your own domain (e.g., `app.selectuniforms.com`):

1. Go to Replit deployment settings
2. Click "Add custom domain"
3. Follow DNS configuration instructions
4. Update Xero redirect URI to use custom domain

---

## 🆘 Troubleshooting

### Database Connection Errors:
- Verify `DATABASE_URL` is set in production environment variables
- Run `npm run db:push` to ensure schema is created

### Xero OAuth Fails:
- Check Xero redirect URI matches your production URL exactly
- Verify all three Xero secrets are set correctly

### Can't Log In:
- Ensure you've set your user role to `super_admin` in the database
- Check that Replit Auth is working (try logging into Replit itself)

### Customers Missing After Seed:
- Re-run: `npx tsx scripts/seed-customers.ts`
- Check database: `SELECT COUNT(*) FROM customers;`

---

## 📊 Customer Data Included

The seed script will import these 29 customers:

1. 41 Prints (2026 pricing)
2. Aspect (2025 pricing)
3. Branding Inc (2026 pricing)
4. Creations 4 You (2026 pricing)
5. Customised Prints (2026 pricing)
6. East Point Sports (2026 pricing)
7. East Yorkshire Worwear (2025 pricing)
8. Hartland Hoodies (2025 pricing)
9. Hazzad Embroidery
10. JK Prints
11. JS Branded (2025 pricing)
12. Kit Room (2026 pricing)
13. Liverpool Store
14. Logo Farm (2025 pricing)
15. Logos On (2025 pricing)
16. Mad For It (2026 pricing)
17. Mantis (2026 pricing)
18. Needhams
19. PC Sports
20. PWS
21. Positive Branding (2025 pricing)
22. Print Matters (2026 pricing)
23. Purple Workwear
24. Rutland Merchandise (2025 pricing)
25. Shirtworks (2025 pricing)
26. Twenty Two Shop (2025 pricing)
27. Unifab (2026 pricing)
28. WCS
29. Wearwork

---

## 🎉 You're Live!

Once deployed, your production system will be accessible to your staff and customers 24/7.

**Next Steps:**
- Share production URL with staff members
- Create customer portal accounts for customers
- Start creating real production orders
- Monitor the leaderboard as your team completes jobs!
