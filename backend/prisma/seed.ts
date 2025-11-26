import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Railcar types and data
const carTypes = ['Tank Car', 'Covered Hopper', 'Open Hopper', 'Boxcar', 'Gondola', 'Flatcar', 'Intermodal'];
const commodities = ['Crude Oil', 'Ethanol', 'Corn', 'Wheat', 'Coal', 'Lumber', 'Steel', 'Chemicals', 'Fertilizer', 'Plastics'];
const customers = ['Shell', 'Cargill', 'ADM', 'Koch Industries', 'ExxonMobil', 'Chevron', 'BNSF Logistics', 'UP Fleet', 'CSX Transport', 'CN Rail'];
const reasonsShopped = ['release', 'assignment', 'qualification', 'project', 'repair', 'maintenance'];
const carStatuses = ['available', 'in_service', 'scheduled', 'retired'];

// Shop locations - actual shop data
const shopData = [
  // Midwest Region
  { name: 'AITX Maumee', code: 'MAUM', city: 'Maumee', state: 'OH', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1200, turnTime: 85, contact: 'Mike Thompson (419) 555-1234', notes: 'Primary Midwest hub' },
  { name: 'AITX East Chicago', code: 'ECHI', city: 'East Chicago', state: 'IN', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1400, turnTime: 80, contact: 'Dave Wilson (219) 555-2345', notes: 'Full service facility' },
  { name: 'AITX Coffeyville', code: 'COFF', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Jim Baker (620) 555-3456', notes: '' },
  { name: 'Watco Coffeyville', code: 'WATC', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 800, turnTime: 95, contact: 'Steve Morris (620) 555-4567', notes: 'Watco partnership' },
  { name: 'Mid-America Railcar', code: 'MARC', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tom Anderson (816) 555-5678', notes: '' },
  { name: 'GATX Danville', code: 'GATX', city: 'Danville', state: 'IL', region: 'Midwest', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1600, turnTime: 75, contact: 'Robert Lee (217) 555-6789', notes: 'High capacity facility' },

  // South Region
  { name: 'AITX Texarkana', code: 'TXRK', city: 'Texarkana', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1100, turnTime: 85, contact: 'Carlos Rodriguez (903) 555-7890', notes: '' },
  { name: 'AITX Longview', code: 'LONG', city: 'Longview', state: 'TX', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Lining', annualCapacity: 950, turnTime: 90, contact: 'Mark Johnson (903) 555-8901', notes: 'Lining specialist' },
  { name: 'AITX Bossier City', code: 'BOSS', city: 'Bossier City', state: 'LA', region: 'South', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Paul Davis (318) 555-9012', notes: '' },
  { name: 'Ennis Railcar', code: 'ENNS', city: 'Ennis', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 700, turnTime: 95, contact: 'John Smith (972) 555-0123', notes: '' },
  { name: 'RSI Rail Group', code: 'RSI', city: 'Longview', state: 'TX', region: 'South', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1300, turnTime: 82, contact: 'Brian Taylor (903) 555-1235', notes: 'Full fabrication capabilities' },

  // Gulf Region
  { name: 'AITX Eagle', code: 'EAGL', city: 'Eagle Pass', state: 'TX', region: 'Gulf', network: 'AITX-Own', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Miguel Santos (830) 555-2346', notes: 'Border location' },
  { name: 'Rescar Houston', code: 'RHOU', city: 'Houston', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1500, turnTime: 78, contact: 'Greg Harris (713) 555-3457', notes: 'Major Gulf hub' },
  { name: 'TankCar Services', code: 'TANK', city: 'Beaumont', state: 'TX', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Lining', annualCapacity: 1100, turnTime: 85, contact: 'Larry White (409) 555-4568', notes: 'Tank car specialist' },
  { name: 'Union Tank Repair', code: 'UTCR', city: 'Lake Charles', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 900, turnTime: 90, contact: 'Chris Martin (337) 555-5679', notes: '' },
  { name: 'UTLX Alexandria', code: 'UTLX', city: 'Alexandria', state: 'LA', region: 'Gulf', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1200, turnTime: 82, contact: 'James Brown (318) 555-6780', notes: '' },

  // Northeast Region
  { name: 'Midland Rail Services', code: 'MDLD', city: 'Midland', state: 'PA', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Frank Miller (412) 555-7891', notes: '' },
  { name: 'GBW Rail Services', code: 'GBW', city: 'Hornell', state: 'NY', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1100, turnTime: 85, contact: 'Dan Clark (607) 555-8902', notes: '' },
  { name: 'National Steel Car', code: 'NSC', city: 'Hamilton', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair, Fabrication', annualCapacity: 1400, turnTime: 80, contact: 'Andrew Scott (905) 555-9013', notes: 'Canada location' },
  { name: 'Procor Sarnia', code: 'PROC', city: 'Sarnia', state: 'ON', region: 'Northeast', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 950, turnTime: 90, contact: 'Kevin Moore (519) 555-0124', notes: 'Canada location' },

  // West Region
  { name: 'Vulcan Rail Services', code: 'VULC', city: 'Los Angeles', state: 'CA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 1000, turnTime: 88, contact: 'Tony Garcia (213) 555-1236', notes: 'West coast hub' },
  { name: 'Frontier Railcar', code: 'FRNT', city: 'Salt Lake City', state: 'UT', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 750, turnTime: 95, contact: 'Bill Jackson (801) 555-2347', notes: '' },
  { name: 'CF Rail', code: 'CFR', city: 'Denver', state: 'CO', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 850, turnTime: 92, contact: 'Rick Nelson (303) 555-3458', notes: '' },
  { name: 'Apex Rail', code: 'APEX', city: 'Phoenix', state: 'AZ', region: 'West', network: '3rd Party', certifications: 'Heavy Repair', annualCapacity: 600, turnTime: 100, contact: 'Sam Adams (602) 555-4569', notes: '' },
  { name: 'Nortrak Services', code: 'NORT', city: 'Seattle', state: 'WA', region: 'West', network: '3rd Party', certifications: 'Qualification, Heavy Repair', annualCapacity: 800, turnTime: 92, contact: 'Eric Young (206) 555-5670', notes: 'Pacific Northwest' },
];

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.scenarioModification.deleteMany();
  await prisma.scenarioCar.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.planAssignment.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.car.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.shopRule.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('✓ Cleared existing data');

  // Create company
  const company = await prisma.company.create({
    data: {
      id: uuidv4(),
      name: 'AITX Rail Services',
      code: 'AITX',
    },
  });

  console.log('✓ Created company:', company.name);

  // Create users
  const adminPassword = await bcrypt.hash('password123', 10);
  const userPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@aitx.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      companyId: company.id,
    },
  });

  const planner = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'planner@aitx.com',
      password: userPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'planner',
      companyId: company.id,
    },
  });

  const viewer = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'viewer@aitx.com',
      password: userPassword,
      firstName: 'Mike',
      lastName: 'Williams',
      role: 'viewer',
      companyId: company.id,
    },
  });

  console.log('✓ Created users: admin, planner, viewer');

  // Create 25 shops with actual data
  const shops = await Promise.all(
    shopData.map(async (shop) => {
      // Convert annual capacity to monthly (divide by 12)
      const monthlyCapacity = Math.ceil(shop.annualCapacity / 12);

      return prisma.shop.create({
        data: {
          id: uuidv4(),
          name: shop.name,
          code: shop.code,
          location: `${shop.city}, ${shop.state}`,
          city: shop.city,
          state: shop.state,
          region: shop.region,
          network: shop.network,
          capacity: monthlyCapacity,
          baseTurnTime: shop.turnTime,
          certifications: JSON.stringify(shop.certifications.split(', ')),
          contactName: shop.contact.split(' (')[0],
          contactPhone: shop.contact.includes('(') ? shop.contact.match(/\([\d\)\s-]+/)?.[0]?.replace(/[()]/g, '') || '' : '',
          notes: shop.notes,
          isActive: true,
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${shops.length} shops`);

  // Create 200 railcars
  const cars = await Promise.all(
    Array.from({ length: 200 }, (_, i) => {
      const carType = carTypes[Math.floor(Math.random() * carTypes.length)];
      const commodity = commodities[Math.floor(Math.random() * commodities.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const reasonShopped = reasonsShopped[Math.floor(Math.random() * reasonsShopped.length)];
      const statusWeights = [0.6, 0.15, 0.2, 0.05]; // available, in_service, scheduled, retired
      const rand = Math.random();
      let statusIndex = 0;
      let cumulative = 0;
      for (let j = 0; j < statusWeights.length; j++) {
        cumulative += statusWeights[j];
        if (rand < cumulative) {
          statusIndex = j;
          break;
        }
      }

      return prisma.car.create({
        data: {
          id: uuidv4(),
          vehicleNumber: `AITX${String(100000 + i).slice(1)}`,
          carType,
          commodity,
          customer,
          projectNumber: `PRJ-${2024}-${String(1000 + Math.floor(Math.random() * 9000))}`,
          reasonShopped,
          status: carStatuses[statusIndex],
          lastServiceDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          nextServiceDue: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000),
          notes: Math.random() > 0.7 ? 'Priority service required' : '',
          companyId: company.id,
        },
      });
    })
  );

  console.log(`✓ Created ${cars.length} railcars`);

  // Create 2 plans
  const plan2024 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2024 Service Plan',
      description: 'Annual service schedule for 2024 fleet maintenance',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      status: 'active',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  const plan2025 = await prisma.plan.create({
    data: {
      id: uuidv4(),
      name: '2025 Service Plan',
      description: 'Projected service schedule for 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      status: 'draft',
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created 2 plans');

  // Create assignments for 2024 plan
  const activeShops = shops.filter((s) => s.isActive);
  const months2024 = [
    '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
    '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'
  ];
  const months2025 = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'
  ];

  // Distribute cars across shops and months for 2024
  let assignmentCount = 0;
  const usedCarMonths2024 = new Set<string>();

  for (const month of months2024) {
    for (const shop of activeShops) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.8) + 2;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2024.has(key)) {
          usedCarMonths2024.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2024.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: month < '2024-11' ? 'completed' : month === '2024-11' ? 'in_progress' : 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2024 plan`);

  // Create fewer assignments for 2025 draft plan
  assignmentCount = 0;
  const usedCarMonths2025 = new Set<string>();

  for (const month of months2025.slice(0, 6)) {
    for (const shop of activeShops.slice(0, 10)) {
      const carsForShop = Math.floor(Math.random() * shop.capacity * 0.5) + 1;
      for (let i = 0; i < carsForShop; i++) {
        const car = cars[Math.floor(Math.random() * cars.length)];
        const key = `${car.id}-${month}`;

        if (!usedCarMonths2025.has(key)) {
          usedCarMonths2025.add(key);
          await prisma.planAssignment.create({
            data: {
              id: uuidv4(),
              planId: plan2025.id,
              carId: car.id,
              shopId: shop.id,
              scheduledMonth: month,
              estimatedCost: 15000 + Math.floor(Math.random() * 20000),
              estimatedDuration: 10 + Math.floor(Math.random() * 10),
              status: 'pending',
            },
          });
          assignmentCount++;
        }
      }
    }
  }

  console.log(`✓ Created ${assignmentCount} assignments for 2025 plan`);

  // Create a sample scenario
  const scenario = await prisma.scenario.create({
    data: {
      id: uuidv4(),
      name: 'High Volume Q2 2025',
      description: 'What-if analysis for increased service volume in Q2 2025',
      basePlanId: plan2025.id,
      status: 'completed',
      results: JSON.stringify({
        totalCost: 2850000,
        costDelta: 5.2,
        averageTurnTime: 14.3,
        turnTimeDelta: -2.1,
        shopUtilization: {
          'Houston Rail Center': 85,
          'Chicago Yards': 78,
          'Los Angeles Terminal': 92,
          'Atlanta Service Hub': 65,
          'Dallas Maintenance': 88,
        },
        monthlyDistribution: {
          '2025-01': 45,
          '2025-02': 52,
          '2025-03': 48,
          '2025-04': 65,
          '2025-05': 72,
          '2025-06': 58,
        },
      }),
      companyId: company.id,
      createdBy: planner.id,
    },
  });

  console.log('✓ Created sample scenario');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nLogin credentials:');
  console.log('  Admin: admin@aitx.com / password123');
  console.log('  Planner: planner@aitx.com / password123');
  console.log('  Viewer: viewer@aitx.com / password123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
