import { db } from "../server/db.js";
import { users } from "../shared/schema.js";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@selectuniforms.co.uk";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const firstName = process.env.ADMIN_FIRST_NAME || "Admin";
  const lastName = process.env.ADMIN_LAST_NAME || "User";

  console.log(`Creating admin user with email: ${email}`);

  // Check if user already exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  
  if (existingUser) {
    if (!existingUser.password) {
      // Update existing user with password
      const passwordHash = await bcrypt.hash(password, 10);
      await db.update(users)
        .set({ 
          password: passwordHash,
          role: "super_admin",
          firstName,
          lastName
        })
        .where(eq(users.email, email));
      console.log(`✓ Updated existing user ${email} with password and super_admin role`);
    } else {
      console.log(`User ${email} already exists with password`);
    }
  } else {
    // Create new admin user
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      email,
      password: passwordHash,
      firstName,
      lastName,
      role: "super_admin",
      profileImageUrl: null,
    });
    console.log(`✓ Created new admin user: ${email}`);
  }

  console.log(`\nYou can now log in with:`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`\n⚠️ IMPORTANT: Change this password after logging in!`);

  process.exit(0);
}

createAdmin().catch((error) => {
  console.error("Error creating admin:", error);
  process.exit(1);
});
