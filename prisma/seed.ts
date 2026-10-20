import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sifr.in';
  const rawPassword = process.env.ADMIN_PASSWORD;

  if (!rawPassword) {
    throw new Error('[SIFR Seed Error]: ADMIN_PASSWORD environment variable is required but not set.');
  }

  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
    },
    create: {
      email: adminEmail,
      name: 'SIFR Owner',
      passwordHash,
    },
  });

  console.log(`[SIFR Seed] Admin user ready: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('[SIFR Seed Error]:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
