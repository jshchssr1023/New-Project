/**
 * Migration Script: Populate Customer records from Car.customer strings
 * and link cars to Customer via customerId FK
 *
 * Run: npx tsx prisma/migrations/migrate-customer-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateCustomerData() {
  console.log('Starting Customer data migration...\n');

  // Get all unique customer names from cars, grouped by company
  const companies = await prisma.company.findMany();

  for (const company of companies) {
    console.log(`\nProcessing company: ${company.name} (${company.code})`);

    // Get unique customer names for this company
    const cars = await prisma.car.findMany({
      where: { companyId: company.id },
      select: { id: true, customer: true, customerId: true },
    });

    // Get unique customer names that don't already have a customerId
    const customerNames = [...new Set(
      cars
        .filter(car => car.customer && !car.customerId)
        .map(car => car.customer)
    )];

    console.log(`  Found ${customerNames.length} unique customer names to process`);

    for (const customerName of customerNames) {
      if (!customerName.trim()) continue;

      // Check if customer already exists
      let customer = await prisma.customer.findFirst({
        where: {
          companyId: company.id,
          name: customerName,
        },
      });

      if (!customer) {
        // Generate a unique code from the customer name
        const baseCode = customerName
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 4)
          .toUpperCase() || 'CUST';

        // Find a unique code
        let code = baseCode;
        let counter = 1;
        while (await prisma.customer.findFirst({
          where: { companyId: company.id, code },
        })) {
          code = `${baseCode}${counter}`;
          counter++;
        }

        // Create the customer
        customer = await prisma.customer.create({
          data: {
            name: customerName,
            code,
            companyId: company.id,
            isActive: true,
            notes: 'Auto-created from car data migration',
          },
        });

        console.log(`  Created customer: ${customer.name} (${customer.code})`);
      }

      // Update all cars with this customer name to use the customerId
      const updateResult = await prisma.car.updateMany({
        where: {
          companyId: company.id,
          customer: customerName,
          customerId: null,
        },
        data: {
          customerId: customer.id,
        },
      });

      if (updateResult.count > 0) {
        console.log(`  Linked ${updateResult.count} cars to customer: ${customerName}`);
      }
    }
  }

  // Also migrate reasonShopped string to reasonsShopped JSON array
  console.log('\n\nMigrating reasonShopped to reasonsShopped JSON array...');

  const carsWithReasonShopped = await prisma.car.findMany({
    where: {
      NOT: { reasonShopped: '' },
    },
    select: { id: true, reasonShopped: true, reasonsShopped: true },
  });

  for (const car of carsWithReasonShopped) {
    // Skip if already has reasonsShopped data
    if (car.reasonsShopped && car.reasonsShopped !== '[]') {
      continue;
    }

    // Convert string to JSON array
    const reasons = car.reasonShopped
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    if (reasons.length > 0) {
      await prisma.car.update({
        where: { id: car.id },
        data: { reasonsShopped: JSON.stringify(reasons) },
      });
    }
  }

  console.log(`  Migrated ${carsWithReasonShopped.length} cars' reasonShopped data`);

  console.log('\n\nMigration complete!');
}

migrateCustomerData()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
