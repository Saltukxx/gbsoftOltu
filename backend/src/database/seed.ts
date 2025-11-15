import { PrismaClient, UserRole, VehicleType, FuelType, ShiftSlot, WarehouseItemCategory, WarehouseItemCondition, WarehouseTransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create President User (required for role management)
  const presidentPassword = await bcrypt.hash('president123', 10);
  const president = await prisma.user.upsert({
    where: { email: 'president@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'president@oltubelediyesi.gov.tr',
      password: presidentPassword,
      firstName: 'Adem',
      lastName: 'Celebi',
      role: UserRole.PRESIDENT,
    },
  });

  // Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'admin@oltubelediyesi.gov.tr',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
    },
  });

  // Create Supervisor User
  const supervisorPassword = await bcrypt.hash('supervisor123', 10);
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'supervisor@oltubelediyesi.gov.tr',
      password: supervisorPassword,
      firstName: 'Mehmet',
      lastName: 'Özkan',
      role: UserRole.SUPERVISOR,
    },
  });

  // Create Operator Users
  const operatorPassword = await bcrypt.hash('operator123', 10);
  const operator1 = await prisma.user.upsert({
    where: { email: 'ahmet.yilmaz@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'ahmet.yilmaz@oltubelediyesi.gov.tr',
      password: operatorPassword,
      firstName: 'Ahmet',
      lastName: 'Yılmaz',
      role: UserRole.OPERATOR,
    },
  });

  const operator2 = await prisma.user.upsert({
    where: { email: 'fatma.kaya@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'fatma.kaya@oltubelediyesi.gov.tr',
      password: operatorPassword,
      firstName: 'Fatma',
      lastName: 'Kaya',
      role: UserRole.OPERATOR,
    },
  });

  // Create Messenger User
  const messengerPassword = await bcrypt.hash('messenger123', 10);
  const messenger = await prisma.user.upsert({
    where: { email: 'messenger@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'messenger@oltubelediyesi.gov.tr',
      password: messengerPassword,
      firstName: 'Ali',
      lastName: 'Demir',
      role: UserRole.MESSENGER,
    },
  });

  // Create Additional Users for Testing Role Management (10-15 users)
  const additionalUsers = [
    { firstName: 'Mustafa', lastName: 'Şahin', email: 'mustafa.sahin@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Ayşe', lastName: 'Yıldız', email: 'ayse.yildiz@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Mehmet', lastName: 'Kurt', email: 'mehmet.kurt@oltubelediyesi.gov.tr', role: UserRole.SUPERVISOR },
    { firstName: 'Zeynep', lastName: 'Aydın', email: 'zeynep.aydin@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Hasan', lastName: 'Çelik', email: 'hasan.celik@oltubelediyesi.gov.tr', role: UserRole.MESSENGER },
    { firstName: 'Elif', lastName: 'Arslan', email: 'elif.arslan@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Burak', lastName: 'Özdemir', email: 'burak.ozdemir@oltubelediyesi.gov.tr', role: UserRole.SUPERVISOR },
    { firstName: 'Selin', lastName: 'Doğan', email: 'selin.dogan@oltubelediyesi.gov.tr', role: UserRole.MESSENGER },
    { firstName: 'Emre', lastName: 'Kılıç', email: 'emre.kilic@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Deniz', lastName: 'Şimşek', email: 'deniz.simsek@oltubelediyesi.gov.tr', role: UserRole.ADMIN },
    { firstName: 'Cem', lastName: 'Yılmaz', email: 'cem.yilmaz@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Gizem', lastName: 'Koç', email: 'gizem.koc@oltubelediyesi.gov.tr', role: UserRole.MESSENGER },
    { firstName: 'Onur', lastName: 'Akar', email: 'onur.akar@oltubelediyesi.gov.tr', role: UserRole.SUPERVISOR },
    { firstName: 'Seda', lastName: 'Türk', email: 'seda.turk@oltubelediyesi.gov.tr', role: UserRole.OPERATOR },
    { firstName: 'Can', lastName: 'Avcı', email: 'can.avci@oltubelediyesi.gov.tr', role: UserRole.MESSENGER },
  ];

  const commonPassword = await bcrypt.hash('user123', 10);
  const createdUsers = [];

  for (const userData of additionalUsers) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: commonPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      },
    });
    createdUsers.push(user);
  }

  // Create Employee records
  const supervisorEmployee = await prisma.employee.upsert({
    where: { userId: supervisor.id },
    update: {},
    create: {
      userId: supervisor.id,
      employeeNumber: 'EMP001',
      department: 'Operations',
      position: 'Operations Supervisor',
      skills: ['management', 'planning', 'coordination'],
      performanceScore: 4.5,
      maxHoursPerWeek: 40,
      availability: {
        monday: ['morning', 'afternoon'],
        tuesday: ['morning', 'afternoon'],
        wednesday: ['morning', 'afternoon'],
        thursday: ['morning', 'afternoon'],
        friday: ['morning', 'afternoon'],
        saturday: ['morning'],
        sunday: []
      },
    },
  });

  const operator1Employee = await prisma.employee.upsert({
    where: { userId: operator1.id },
    update: {},
    create: {
      userId: operator1.id,
      employeeNumber: 'EMP002',
      department: 'Field Operations',
      position: 'Vehicle Operator',
      skills: ['driving', 'maintenance', 'cleaning'],
      performanceScore: 4.2,
      maxHoursPerWeek: 40,
      availability: {
        monday: ['morning', 'afternoon', 'night'],
        tuesday: ['morning', 'afternoon', 'night'],
        wednesday: ['morning', 'afternoon'],
        thursday: ['morning', 'afternoon', 'night'],
        friday: ['morning', 'afternoon'],
        saturday: ['morning'],
        sunday: []
      },
    },
  });

  const operator2Employee = await prisma.employee.upsert({
    where: { userId: operator2.id },
    update: {},
    create: {
      userId: operator2.id,
      employeeNumber: 'EMP003',
      department: 'Field Operations',
      position: 'Vehicle Operator',
      skills: ['driving', 'cleaning', 'waste_management'],
      performanceScore: 4.7,
      maxHoursPerWeek: 40,
      availability: {
        monday: ['morning', 'afternoon'],
        tuesday: ['morning', 'afternoon', 'night'],
        wednesday: ['morning', 'afternoon', 'night'],
        thursday: ['morning', 'afternoon'],
        friday: ['morning', 'afternoon', 'night'],
        saturday: [],
        sunday: []
      },
    },
  });

  // Create Vehicles
  const vehicle1 = await prisma.vehicle.upsert({
    where: { plateNumber: '25 OLT 001' },
    update: {},
    create: {
      plateNumber: '25 OLT 001',
      type: VehicleType.TRUCK,
      model: 'Ford Transit',
      year: 2022,
      fuelType: FuelType.DIESEL,
      fuelCapacity: 80,
      assignedOperatorId: operator1Employee.id,
      lastMaintenanceDate: new Date('2024-01-15'),
      nextMaintenanceDate: new Date('2024-04-15'),
    },
  });

  const vehicle2 = await prisma.vehicle.upsert({
    where: { plateNumber: '25 OLT 002' },
    update: {},
    create: {
      plateNumber: '25 OLT 002',
      type: VehicleType.TRUCK,
      model: 'Mercedes Sprinter',
      year: 2021,
      fuelType: FuelType.DIESEL,
      fuelCapacity: 75,
      assignedOperatorId: operator2Employee.id,
      lastMaintenanceDate: new Date('2024-02-01'),
      nextMaintenanceDate: new Date('2024-05-01'),
    },
  });

  const vehicle3 = await prisma.vehicle.upsert({
    where: { plateNumber: '25 OLT 003' },
    update: {},
    create: {
      plateNumber: '25 OLT 003',
      type: VehicleType.CAR,
      model: 'Toyota Corolla',
      year: 2023,
      fuelType: FuelType.GASOLINE,
      fuelCapacity: 50,
      lastMaintenanceDate: new Date('2024-01-20'),
      nextMaintenanceDate: new Date('2024-04-20'),
    },
  });

  // Create Shift Constraints
  await prisma.shiftConstraint.upsert({
    where: { key: 'maxHoursPerWeek' },
    update: {},
    create: {
      key: 'maxHoursPerWeek',
      value: 40,
      notes: 'Maximum working hours per week per employee',
    },
  });

  await prisma.shiftConstraint.upsert({
    where: { key: 'minRestHours' },
    update: {},
    create: {
      key: 'minRestHours',
      value: 12,
      notes: 'Minimum rest hours between shifts',
    },
  });

  await prisma.shiftConstraint.upsert({
    where: { key: 'maxConsecutiveDays' },
    update: {},
    create: {
      key: 'maxConsecutiveDays',
      value: 6,
      notes: 'Maximum consecutive working days',
    },
  });

  // Create sample shifts for current week
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday

  for (let i = 0; i < 5; i++) { // Monday to Friday
    const shiftDate = new Date(startOfWeek);
    shiftDate.setDate(startOfWeek.getDate() + i);

    // Morning shift for operator1
    await prisma.shift.upsert({
      where: {
        employeeId_day_slot: {
          employeeId: operator1Employee.id,
          day: shiftDate,
          slot: ShiftSlot.MORNING,
        },
      },
      update: {},
      create: {
        employeeId: operator1Employee.id,
        day: shiftDate,
        slot: ShiftSlot.MORNING,
        efficiencyScore: 0.85 + Math.random() * 0.15,
      },
    });

    // Afternoon shift for operator2
    if (i < 4) { // Monday to Thursday
      await prisma.shift.upsert({
        where: {
          employeeId_day_slot: {
            employeeId: operator2Employee.id,
            day: shiftDate,
            slot: ShiftSlot.AFTERNOON,
          },
        },
        update: {},
        create: {
          employeeId: operator2Employee.id,
          day: shiftDate,
          slot: ShiftSlot.AFTERNOON,
          efficiencyScore: 0.80 + Math.random() * 0.20,
        },
      });
    }
  }

  // Create sample vehicle locations within Oltu, Erzurum
  // Oltu center coordinates: [41.987, 40.540] (longitude, latitude)
  // Creating realistic cleaning vehicle locations in different neighborhoods of Oltu
  const oltuCenter = { lat: 40.540, lng: 41.987 };
  
  // Realistic locations for cleaning vehicles within Oltu boundaries
  // Each vehicle starts from a different neighborhood/area
  const baseLocations = [
    { 
      lat: 40.540, 
      lng: 41.987,
      name: 'Oltu Merkez (City Center)',
      area: 'Main cleaning route - downtown area'
    },
    { 
      lat: 40.545, 
      lng: 41.992,
      name: 'Yeni Mahalle (New Neighborhood)',
      area: 'Residential area cleaning route'
    },
    { 
      lat: 40.535, 
      lng: 41.982,
      name: 'Eski Mahalle (Old Neighborhood)',
      area: 'Historical area cleaning route'
    },
  ];

  for (const [index, vehicle] of [vehicle1, vehicle2, vehicle3].entries()) {
    const baseLoc = baseLocations[index];
    
    // Create realistic movement patterns for cleaning vehicles
    // They move in a small radius around their assigned area
    for (let i = 0; i < 10; i++) {
      const recordedAt = new Date();
      recordedAt.setHours(recordedAt.getHours() - i);
      recordedAt.setMinutes(recordedAt.getMinutes() - Math.floor(Math.random() * 60));

      // Small random variation within Oltu boundaries (max ~500m radius)
      // This simulates vehicles moving through streets in their assigned area
      const latVariation = (Math.random() - 0.5) * 0.008; // ~500m max variation
      const lngVariation = (Math.random() - 0.5) * 0.008; // ~500m max variation
      
      // Simulate realistic cleaning vehicle speeds (5-25 km/h typical for street cleaning)
      const speed = 5 + Math.random() * 20; // 5-25 km/h
      
      // Simulate realistic heading based on movement pattern
      // Cleaning vehicles typically move in patterns, not completely random
      const baseHeading = (i * 36) % 360; // Gradual rotation
      const heading = baseHeading + (Math.random() - 0.5) * 30; // Small variation

      await prisma.vehicleLocation.create({
        data: {
          vehicleId: vehicle.id,
          latitude: baseLoc.lat + latVariation,
          longitude: baseLoc.lng + lngVariation,
          speed: Math.round(speed * 10) / 10, // Round to 1 decimal
          heading: Math.round(heading),
          recordedAt,
        },
      });
    }
    
    // Also create a current location (most recent) for each vehicle
    const now = new Date();
    await prisma.vehicleLocation.create({
      data: {
        vehicleId: vehicle.id,
        latitude: baseLoc.lat + (Math.random() - 0.5) * 0.005,
        longitude: baseLoc.lng + (Math.random() - 0.5) * 0.005,
        speed: 5 + Math.random() * 15, // Current speed
        heading: Math.random() * 360,
        recordedAt: now,
      },
    });
  }

  // Create sample fuel reports
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  await prisma.fuelReport.upsert({
    where: {
      vehicleId_period: {
        vehicleId: vehicle1.id,
        period: currentMonth,
      },
    },
    update: {},
    create: {
      vehicleId: vehicle1.id,
      period: currentMonth,
      consumptionLiters: 120.5,
      predictionLiters: 130.0,
      costPerLiter: 25.50,
      totalCost: 3072.75,
      efficiency: 12.5,
    },
  });

  await prisma.fuelReport.upsert({
    where: {
      vehicleId_period: {
        vehicleId: vehicle2.id,
        period: currentMonth,
      },
    },
    update: {},
    create: {
      vehicleId: vehicle2.id,
      period: currentMonth,
      consumptionLiters: 95.3,
      predictionLiters: 100.0,
      costPerLiter: 25.50,
      totalCost: 2430.15,
      efficiency: 14.2,
    },
  });

  // Create system configuration
  await prisma.systemConfig.upsert({
    where: { key: 'app_version' },
    update: {},
    create: {
      key: 'app_version',
      value: '1.0.0',
      notes: 'Application version',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: {
      key: 'maintenance_mode',
      value: false,
      notes: 'Application maintenance mode status',
    },
  });

  // Create DEPO_KULLANICISI User
  const depoPassword = await bcrypt.hash('depo123', 10);
  const depoUser = await prisma.user.upsert({
    where: { email: 'depo@oltubelediyesi.gov.tr' },
    update: {},
    create: {
      email: 'depo@oltubelediyesi.gov.tr',
      password: depoPassword,
      firstName: 'Depo',
      lastName: 'Kullanıcısı',
      role: UserRole.DEPO_KULLANICISI,
    },
  });

  // Create Warehouse Items
  const warehouseItems = [
    {
      name: 'Kazma',
      description: 'Çelik kazma, saplı',
      category: WarehouseItemCategory.TOOLS,
      sku: 'WH-TOOL-001',
      quantity: 15,
      location: 'Depo A - Raflar 1-3',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Kürek',
      description: 'Plastik kürek, çeşitli boyutlar',
      category: WarehouseItemCategory.TOOLS,
      sku: 'WH-TOOL-002',
      quantity: 25,
      location: 'Depo A - Raflar 1-3',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Çöp Torbası',
      description: 'Büyük boy çöp torbaları, 100 adet paket',
      category: WarehouseItemCategory.SUPPLIES,
      sku: 'WH-SUP-001',
      quantity: 50,
      location: 'Depo B - Raflar 4-6',
      condition: WarehouseItemCondition.EXCELLENT,
    },
    {
      name: 'Temizlik Malzemesi',
      description: 'Çamaşır suyu, deterjan vb.',
      category: WarehouseItemCategory.SUPPLIES,
      sku: 'WH-SUP-002',
      quantity: 30,
      location: 'Depo B - Raflar 4-6',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Traktör',
      description: 'Tarım traktörü, bakımlı',
      category: WarehouseItemCategory.VEHICLES,
      sku: 'WH-VEH-001',
      quantity: 2,
      location: 'Garaj - Park Alanı 1',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Kamyon',
      description: 'Çöp toplama kamyonu',
      category: WarehouseItemCategory.VEHICLES,
      sku: 'WH-VEH-002',
      quantity: 5,
      location: 'Garaj - Park Alanı 2',
      condition: WarehouseItemCondition.FAIR,
    },
    {
      name: 'Jeneratör',
      description: 'Dizel jeneratör, 50kW',
      category: WarehouseItemCategory.EQUIPMENT,
      sku: 'WH-EQP-001',
      quantity: 3,
      location: 'Depo C - Özel Alan',
      condition: WarehouseItemCondition.EXCELLENT,
    },
    {
      name: 'Çim Biçme Makinesi',
      description: 'Benzinli çim biçme makinesi',
      category: WarehouseItemCategory.EQUIPMENT,
      sku: 'WH-EQP-002',
      quantity: 8,
      location: 'Depo A - Raflar 7-9',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Asfalt Malzemesi',
      description: 'Asfalt yama malzemesi, ton',
      category: WarehouseItemCategory.MATERIALS,
      sku: 'WH-MAT-001',
      quantity: 20,
      location: 'Depo D - Açık Alan',
      condition: WarehouseItemCondition.GOOD,
    },
    {
      name: 'Beton Blok',
      description: 'Beton blok, çeşitli boyutlar',
      category: WarehouseItemCategory.MATERIALS,
      sku: 'WH-MAT-002',
      quantity: 100,
      location: 'Depo D - Açık Alan',
      condition: WarehouseItemCondition.GOOD,
    },
  ];

  const createdItems = [];
  for (const itemData of warehouseItems) {
    const item = await prisma.warehouseItem.create({
      data: itemData,
    });
    createdItems.push(item);

    // Create initial transaction for each item
    await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.ADJUSTMENT,
        userId: depoUser.id,
        quantity: item.quantity,
        previousQuantity: 0,
        newQuantity: item.quantity,
        notes: 'İlk kayıt - Depo sistemi kurulumu',
      },
    });
  }

  // Create some sample transactions
  if (createdItems.length > 0) {
    // Checkout transaction
    await prisma.warehouseTransaction.create({
      data: {
        itemId: createdItems[0].id,
        type: WarehouseTransactionType.CHECK_OUT,
        userId: depoUser.id,
        assignedUserId: operator1.id,
        quantity: 2,
        previousQuantity: createdItems[0].quantity,
        newQuantity: createdItems[0].quantity - 2,
        notes: 'Operatör Ahmet Yılmaz için çıkış yapıldı',
      },
    });

    // Update item quantity after checkout
    await prisma.warehouseItem.update({
      where: { id: createdItems[0].id },
      data: { quantity: createdItems[0].quantity - 2 },
    });

    // Transfer transaction
    if (createdItems.length > 1) {
      await prisma.warehouseTransaction.create({
        data: {
          itemId: createdItems[1].id,
          type: WarehouseTransactionType.TRANSFER,
          userId: depoUser.id,
          quantity: 5,
          previousQuantity: createdItems[1].quantity,
          newQuantity: createdItems[1].quantity - 5,
          transferToLocation: 'Depo B - Raflar 10-12',
          notes: 'Depo içi transfer',
        },
      });

      await prisma.warehouseItem.update({
        where: { id: createdItems[1].id },
        data: {
          quantity: createdItems[1].quantity - 5,
          location: 'Depo B - Raflar 10-12',
        },
      });
    }
  }

  console.log('✅ Database seeding completed successfully!');
  console.log('📊 Summary:');
  console.log(`👥 Users created: ${7 + additionalUsers.length} (1 president, 2 admin, 4 supervisor, 7 operators, 5 messengers, 1 depo)`);
  console.log(`👷 Employees created: 3`);
  console.log(`🚗 Vehicles created: 3`);
  console.log(`📅 Shifts created: ${5 + 4} (current week)`);
  console.log(`📍 Vehicle locations: 30 (10 per vehicle)`);
  console.log(`⛽ Fuel reports: 2`);
  console.log(`📦 Warehouse items created: ${createdItems.length}`);
  console.log(`📝 Warehouse transactions created: ${createdItems.length + 2}`);
  console.log('');
  console.log('🔐 Login credentials:');
  console.log('President: president@oltubelediyesi.gov.tr / president123');
  console.log('Admin: admin@oltubelediyesi.gov.tr / admin123');
  console.log('Supervisor: supervisor@oltubelediyesi.gov.tr / supervisor123');
  console.log('Operators: [name]@oltubelediyesi.gov.tr / operator123');
  console.log('Messenger: messenger@oltubelediyesi.gov.tr / messenger123');
  console.log('Depo Kullanıcısı: depo@oltubelediyesi.gov.tr / depo123');
  console.log('Additional Users: [email]@oltubelediyesi.gov.tr / user123');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });