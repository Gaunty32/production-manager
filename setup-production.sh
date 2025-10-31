#!/bin/bash

echo "🚀 Production Database Setup Script"
echo "===================================="
echo ""
echo "This script will:"
echo "1. Create all database tables in production"
echo "2. Import your 29 customers"
echo ""
echo "📋 First, get your production DATABASE_URL:"
echo "   1. Go to Publishing tool (left sidebar)"
echo "   2. Click 'Manage' tab"
echo "   3. Find DATABASE_URL in secrets/environment variables"
echo "   4. Copy the entire value"
echo ""
read -p "Paste your production DATABASE_URL here: " PROD_DB_URL

if [ -z "$PROD_DB_URL" ]; then
    echo "❌ Error: DATABASE_URL cannot be empty"
    exit 1
fi

echo ""
echo "✅ DATABASE_URL received"
echo ""
echo "📊 Step 1: Creating database tables..."
echo "----------------------------------------"

# Temporarily use production database
export DATABASE_URL="$PROD_DB_URL"

# Create tables
npm run db:push

if [ $? -ne 0 ]; then
    echo "❌ Error creating database tables"
    exit 1
fi

echo ""
echo "✅ Database tables created successfully!"
echo ""
echo "📊 Step 2: Importing 29 customers..."
echo "----------------------------------------"

# Import customers
npx tsx scripts/seed-customers.ts

if [ $? -ne 0 ]; then
    echo "❌ Error importing customers"
    exit 1
fi

echo ""
echo "🎉 Production setup complete!"
echo "=============================="
echo ""
echo "✅ Database tables created"
echo "✅ 29 customers imported"
echo ""
echo "Your production app is ready to use!"
echo ""
echo "Next steps:"
echo "1. Visit your production URL"
echo "2. Log in with Replit Auth"
echo "3. Set your user role to 'super_admin' if needed"
echo "4. Update Xero redirect URL at: https://developer.xero.com/app/manage"
echo ""
