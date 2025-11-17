import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function seedDemoData() {
  console.log('Starting demo data seed...');
  
  const JK_PRINTS_CUSTOMER_ID = '3818c869-f54d-4d10-b966-d9708db79adf';
  
  try {
    // Check if demo jobs already exist
    const existingJobs = await sql`
      SELECT id FROM jobs WHERE id LIKE 'demo%' LIMIT 1
    `;
    
    if (existingJobs.length > 0) {
      console.log('Demo jobs already exist. Skipping seed.');
      return;
    }
    
    console.log('Creating demo jobs...');
    
    // Insert demo jobs
    await sql`
      INSERT INTO jobs (id, customer_id, job_name, po_number, quantity, goods_received, required_dispatch_date, completed, status, notes, invoice_status)
      VALUES 
        ('demo-job-1', ${JK_PRINTS_CUSTOMER_ID}, 'Corporate Polo Shirts', 'PO-2024-1456', 150, NOW() - INTERVAL '5 days', NOW() + INTERVAL '3 days', false, 'production', 'Customer logo files approved. Navy and white mix.', 'not_ready'),
        ('demo-job-2', ${JK_PRINTS_CUSTOMER_ID}, 'Team Hoodies - Winter Range', 'PO-2024-1489', 75, NOW() - INTERVAL '5 days', NOW() + INTERVAL '7 days', false, 'production', 'Large logo on back, small logo on front chest.', 'not_ready'),
        ('demo-job-3', ${JK_PRINTS_CUSTOMER_ID}, 'Trade Show T-Shirts', 'PO-2024-1512', 200, NOW() - INTERVAL '3 days', NOW() + INTERVAL '5 days', false, 'production', 'Urgent for upcoming trade show event.', 'not_ready'),
        ('demo-job-4', ${JK_PRINTS_CUSTOMER_ID}, 'Safety Vests', 'PO-2024-1534', 100, NOW() - INTERVAL '4 days', NOW() + INTERVAL '6 days', false, 'production', 'Hi-vis yellow with company name on back.', 'not_ready'),
        ('demo-job-5', ${JK_PRINTS_CUSTOMER_ID}, 'Promotional Caps', 'PO-2024-1567', 250, NOW() - INTERVAL '2 days', NOW() + INTERVAL '10 days', false, 'production', 'Embroidered logo on front panel.', 'not_ready'),
        ('demo-job-6', ${JK_PRINTS_CUSTOMER_ID}, 'Staff Uniforms Q4', 'PO-2024-1590', 120, NOW() - INTERVAL '6 days', NOW() + INTERVAL '4 days', false, 'production', 'Multiple positions - see line items.', 'not_ready'),
        ('demo-job-7', ${JK_PRINTS_CUSTOMER_ID}, 'Conference Bags', 'PO-2024-1623', 180, NOW() - INTERVAL '1 day', NOW() + INTERVAL '8 days', false, 'production', 'Print transfer method for logo.', 'not_ready'),
        ('demo-job-8', ${JK_PRINTS_CUSTOMER_ID}, 'Branded Workwear', 'PO-2024-1645', 90, NOW() - INTERVAL '7 days', NOW() + INTERVAL '2 days', false, 'production', 'Mixed embroidery and print work.', 'not_ready')
    `;
    
    console.log('Demo jobs created. Creating line items...');
    
    // Insert line items for demo jobs
    await sql`
      INSERT INTO line_items (id, job_id, job_type, quantity, description, stitch_count, logo_approved, completed, machine_id)
      VALUES 
        -- Job 1: Corporate Polo Shirts
        ('demo-line-1-1', 'demo-job-1', 'embroidery', 80, 'Navy polos - chest logo', 8500, true, false, 1),
        ('demo-line-1-2', 'demo-job-1', 'embroidery', 70, 'White polos - chest logo', 8500, true, false, 2),
        
        -- Job 2: Team Hoodies
        ('demo-line-2-1', 'demo-job-2', 'embroidery', 40, 'Large back logo', 25000, true, false, 1),
        ('demo-line-2-2', 'demo-job-2', 'embroidery', 35, 'Front chest logo', 6500, true, false, 3),
        
        -- Job 3: Trade Show T-Shirts
        ('demo-line-3-1', 'demo-job-3', 'print', 200, 'DTF print - full color logo', NULL, true, false, NULL),
        
        -- Job 4: Safety Vests
        ('demo-line-4-1', 'demo-job-4', 'embroidery', 100, 'Back text embroidery', 12000, true, false, 2),
        
        -- Job 5: Promotional Caps
        ('demo-line-5-1', 'demo-job-5', 'embroidery', 250, 'Front panel logo', 7200, true, false, 3),
        
        -- Job 6: Staff Uniforms
        ('demo-line-6-1', 'demo-job-6', 'embroidery', 60, 'Shirts - left chest', 5500, true, false, 1),
        ('demo-line-6-2', 'demo-job-6', 'embroidery', 60, 'Jackets - left chest', 5500, true, false, 2),
        
        -- Job 7: Conference Bags
        ('demo-line-7-1', 'demo-job-7', 'print', 180, 'DTF logo print', NULL, true, false, NULL),
        
        -- Job 8: Branded Workwear
        ('demo-line-8-1', 'demo-job-8', 'embroidery', 50, 'Shirts - chest logo', 9000, true, false, 1),
        ('demo-line-8-2', 'demo-job-8', 'print', 40, 'Hoodies - back print', NULL, true, false, NULL)
    `;
    
    console.log('✅ Demo data seed completed successfully!');
    console.log('Created 8 demo jobs with line items for JK Prints customer.');
    
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    throw error;
  }
}

// Run the seed
seedDemoData()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
