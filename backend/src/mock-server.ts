import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Mock data
const mockCompany = {
  id: 'company-1',
  name: 'AITX Corporation',
  code: 'AITX',
};

const mockUser = {
  id: 'user-1',
  email: 'admin@aitx.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  companyId: 'company-1',
};

let mockCars = [
  // BASF cars
  { id: 'car-1', railcarNumber: 'AITX10001', carType: 'Covered Hopper', isTankCar: false, commodity: 'Chemicals', customer: 'BASF', projectNumber: 'PRJ-BASF-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 4046.86, daysInShop: 87, notes: '', companyId: 'company-1' },
  { id: 'car-2', railcarNumber: 'AITX10007', carType: 'Tank', isTankCar: true, commodity: 'Chemicals', customer: 'BASF', projectNumber: 'PRJ-BASF-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 5221.45, daysInShop: 62, notes: 'Tank car requires lining inspection', companyId: 'company-1' },
  { id: 'car-3', railcarNumber: 'AITX10013', carType: 'Tank', isTankCar: true, commodity: 'Sulfuric Acid', customer: 'BASF', projectNumber: 'PRJ-BASF-003', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Freeport, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 18500.00, daysInShop: 45, notes: 'Hazmat - special handling required', companyId: 'company-1' },
  { id: 'car-4', railcarNumber: 'AITX10019', carType: 'Covered Hopper', isTankCar: false, commodity: 'Plastics', customer: 'BASF', projectNumber: 'PRJ-BASF-004', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Port Arthur, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 3890.22, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-5', railcarNumber: 'AITX10025', carType: 'Tank', isTankCar: true, commodity: 'Methanol', customer: 'BASF', projectNumber: 'PRJ-BASF-005', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Houston, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 12450.00, daysInShop: 28, notes: '', companyId: 'company-1' },
  { id: 'car-6', railcarNumber: 'AITX10031', carType: 'Tank', isTankCar: true, commodity: 'Chemicals', customer: 'BASF', projectNumber: 'PRJ-BASF-006', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 5100.00, daysInShop: 55, notes: '', companyId: 'company-1' },
  { id: 'car-7', railcarNumber: 'AITX10037', carType: 'Covered Hopper', isTankCar: false, commodity: 'Resins', customer: 'BASF', projectNumber: 'PRJ-BASF-007', reasonShopped: 'Wheel Repair', status: 'in_service', currentLocation: 'Baton Rouge, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 6750.00, daysInShop: 12, notes: '', companyId: 'company-1' },
  { id: 'car-8', railcarNumber: 'AITX10043', carType: 'Tank', isTankCar: true, commodity: 'Ammonia', customer: 'BASF', projectNumber: 'PRJ-BASF-008', reasonShopped: 'Heavy Repair', status: 'scheduled', currentLocation: 'Freeport, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 22000.00, daysInShop: 0, notes: 'Priority - customer deadline', companyId: 'company-1' },

  // Koch Industries cars
  { id: 'car-9', railcarNumber: 'AITX10002', carType: 'Box', isTankCar: false, commodity: 'Paper Products', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-001', reasonShopped: 'Assigned', status: 'scheduled', currentLocation: 'Wichita, KS', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 19046.17, daysInShop: 97, notes: '', companyId: 'company-1' },
  { id: 'car-10', railcarNumber: 'AITX10008', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-002', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Corpus Christi, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 24500.00, daysInShop: 35, notes: '', companyId: 'company-1' },
  { id: 'car-11', railcarNumber: 'AITX10014', carType: 'Gondola', isTankCar: false, commodity: 'Aggregates', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-003', reasonShopped: 'Frame Repair', status: 'available', currentLocation: 'Oklahoma City, OK', homeRegion: 'South', originRegion: 'South', projectedCost: 8900.00, daysInShop: 78, notes: '', companyId: 'company-1' },
  { id: 'car-12', railcarNumber: 'AITX10020', carType: 'Tank', isTankCar: true, commodity: 'Fertilizer', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-004', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Tulsa, OK', homeRegion: 'South', originRegion: 'South', projectedCost: 5800.00, daysInShop: 52, notes: '', companyId: 'company-1' },
  { id: 'car-13', railcarNumber: 'AITX10026', carType: 'Covered Hopper', isTankCar: false, commodity: 'Fertilizer', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-005', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Wichita, KS', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-14', railcarNumber: 'AITX10032', carType: 'Tank', isTankCar: true, commodity: 'LPG', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-006', reasonShopped: 'Valve Replacement', status: 'in_service', currentLocation: 'Houston, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 15600.00, daysInShop: 18, notes: '', companyId: 'company-1' },
  { id: 'car-15', railcarNumber: 'AITX10038', carType: 'Box', isTankCar: false, commodity: 'Building Materials', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-007', reasonShopped: 'DOT Compliance', status: 'available', currentLocation: 'Dallas, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 7200.00, daysInShop: 65, notes: '', companyId: 'company-1' },
  { id: 'car-16', railcarNumber: 'AITX10044', carType: 'Tank', isTankCar: true, commodity: 'Asphalt', customer: 'Koch Industries', projectNumber: 'PRJ-KOCH-008', reasonShopped: 'Heavy Repair', status: 'scheduled', currentLocation: 'Corpus Christi, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 21000.00, daysInShop: 0, notes: '', companyId: 'company-1' },

  // Cargill cars
  { id: 'car-17', railcarNumber: 'AITX10003', carType: 'Covered Hopper', isTankCar: false, commodity: 'Grain', customer: 'Cargill', projectNumber: 'PRJ-CARG-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Minneapolis, MN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 3850.00, daysInShop: 72, notes: '', companyId: 'company-1' },
  { id: 'car-18', railcarNumber: 'AITX10009', carType: 'Covered Hopper', isTankCar: false, commodity: 'Corn', customer: 'Cargill', projectNumber: 'PRJ-CARG-002', reasonShopped: 'Corrosion Repair', status: 'in_service', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 9500.00, daysInShop: 25, notes: '', companyId: 'company-1' },
  { id: 'car-19', railcarNumber: 'AITX10015', carType: 'Tank', isTankCar: true, commodity: 'Vegetable Oil', customer: 'Cargill', projectNumber: 'PRJ-CARG-003', reasonShopped: 'Tank Cleaning', status: 'available', currentLocation: 'Kansas City, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 8200.00, daysInShop: 48, notes: '', companyId: 'company-1' },
  { id: 'car-20', railcarNumber: 'AITX10021', carType: 'Covered Hopper', isTankCar: false, commodity: 'Soybeans', customer: 'Cargill', projectNumber: 'PRJ-CARG-004', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Omaha, NE', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4100.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-21', railcarNumber: 'AITX10027', carType: 'Tank', isTankCar: true, commodity: 'Corn Syrup', customer: 'Cargill', projectNumber: 'PRJ-CARG-005', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Cedar Rapids, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 11800.00, daysInShop: 32, notes: '', companyId: 'company-1' },
  { id: 'car-22', railcarNumber: 'AITX10033', carType: 'Covered Hopper', isTankCar: false, commodity: 'Wheat', customer: 'Cargill', projectNumber: 'PRJ-CARG-006', reasonShopped: 'Wheel Repair', status: 'available', currentLocation: 'Wichita, KS', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 6800.00, daysInShop: 58, notes: '', companyId: 'company-1' },
  { id: 'car-23', railcarNumber: 'AITX10039', carType: 'Tank', isTankCar: true, commodity: 'Ethanol', customer: 'Cargill', projectNumber: 'PRJ-CARG-007', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Des Moines, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 5500.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-24', railcarNumber: 'AITX10045', carType: 'Covered Hopper', isTankCar: false, commodity: 'Sugar', customer: 'Cargill', projectNumber: 'PRJ-CARG-008', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'New Orleans, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 14200.00, daysInShop: 22, notes: '', companyId: 'company-1' },
  { id: 'car-25', railcarNumber: 'AITX10051', carType: 'Covered Hopper', isTankCar: false, commodity: 'Barley', customer: 'Cargill', projectNumber: 'PRJ-CARG-009', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Fargo, ND', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 3950.00, daysInShop: 82, notes: '', companyId: 'company-1' },
  { id: 'car-26', railcarNumber: 'AITX10057', carType: 'Tank', isTankCar: true, commodity: 'Molasses', customer: 'Cargill', projectNumber: 'PRJ-CARG-010', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Minneapolis, MN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 7900.00, daysInShop: 15, notes: '', companyId: 'company-1' },

  // Bunge cars
  { id: 'car-27', railcarNumber: 'AITX10004', carType: 'Covered Hopper', isTankCar: false, commodity: 'Grain', customer: 'Bunge', projectNumber: 'PRJ-BUNG-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'St. Louis, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4250.00, daysInShop: 68, notes: '', companyId: 'company-1' },
  { id: 'car-28', railcarNumber: 'AITX10010', carType: 'Tank', isTankCar: true, commodity: 'Vegetable Oil', customer: 'Bunge', projectNumber: 'PRJ-BUNG-002', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Council Bluffs, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 10500.00, daysInShop: 28, notes: '', companyId: 'company-1' },
  { id: 'car-29', railcarNumber: 'AITX10016', carType: 'Covered Hopper', isTankCar: false, commodity: 'Soybeans', customer: 'Bunge', projectNumber: 'PRJ-BUNG-003', reasonShopped: 'Corrosion Repair', status: 'available', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 8800.00, daysInShop: 45, notes: '', companyId: 'company-1' },
  { id: 'car-30', railcarNumber: 'AITX10022', carType: 'Tank', isTankCar: true, commodity: 'Biodiesel', customer: 'Bunge', projectNumber: 'PRJ-BUNG-004', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Kansas City, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 5200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-31', railcarNumber: 'AITX10028', carType: 'Covered Hopper', isTankCar: false, commodity: 'Corn', customer: 'Bunge', projectNumber: 'PRJ-BUNG-005', reasonShopped: 'Wheel Repair', status: 'in_service', currentLocation: 'Omaha, NE', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 6500.00, daysInShop: 18, notes: '', companyId: 'company-1' },
  { id: 'car-32', railcarNumber: 'AITX10034', carType: 'Tank', isTankCar: true, commodity: 'Soybean Oil', customer: 'Bunge', projectNumber: 'PRJ-BUNG-006', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'St. Louis, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 16800.00, daysInShop: 72, notes: '', companyId: 'company-1' },
  { id: 'car-33', railcarNumber: 'AITX10040', carType: 'Covered Hopper', isTankCar: false, commodity: 'Wheat', customer: 'Bunge', projectNumber: 'PRJ-BUNG-007', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Minneapolis, MN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4000.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-34', railcarNumber: 'AITX10046', carType: 'Tank', isTankCar: true, commodity: 'Lecithin', customer: 'Bunge', projectNumber: 'PRJ-BUNG-008', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 7400.00, daysInShop: 12, notes: '', companyId: 'company-1' },

  // ADM cars
  { id: 'car-35', railcarNumber: 'AITX10005', carType: 'Covered Hopper', isTankCar: false, commodity: 'Corn', customer: 'ADM', projectNumber: 'PRJ-ADM-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 3980.00, daysInShop: 75, notes: '', companyId: 'company-1' },
  { id: 'car-36', railcarNumber: 'AITX10011', carType: 'Tank', isTankCar: true, commodity: 'Ethanol', customer: 'ADM', projectNumber: 'PRJ-ADM-002', reasonShopped: 'Qualification', status: 'in_service', currentLocation: 'Cedar Rapids, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 5400.00, daysInShop: 38, notes: '', companyId: 'company-1' },
  { id: 'car-37', railcarNumber: 'AITX10017', carType: 'Covered Hopper', isTankCar: false, commodity: 'Soybeans', customer: 'ADM', projectNumber: 'PRJ-ADM-003', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Clinton, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 12500.00, daysInShop: 52, notes: '', companyId: 'company-1' },
  { id: 'car-38', railcarNumber: 'AITX10023', carType: 'Tank', isTankCar: true, commodity: 'Corn Oil', customer: 'ADM', projectNumber: 'PRJ-ADM-004', reasonShopped: 'Lining', status: 'scheduled', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 9800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-39', railcarNumber: 'AITX10029', carType: 'Covered Hopper', isTankCar: false, commodity: 'Flour', customer: 'ADM', projectNumber: 'PRJ-ADM-005', reasonShopped: 'Corrosion Repair', status: 'in_service', currentLocation: 'Kansas City, MO', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 8200.00, daysInShop: 22, notes: '', companyId: 'company-1' },
  { id: 'car-40', railcarNumber: 'AITX10035', carType: 'Tank', isTankCar: true, commodity: 'Biodiesel', customer: 'ADM', projectNumber: 'PRJ-ADM-006', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Des Moines, IA', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 5100.00, daysInShop: 65, notes: '', companyId: 'company-1' },
  { id: 'car-41', railcarNumber: 'AITX10041', carType: 'Covered Hopper', isTankCar: false, commodity: 'Wheat', customer: 'ADM', projectNumber: 'PRJ-ADM-007', reasonShopped: 'Wheel Repair', status: 'scheduled', currentLocation: 'Topeka, KS', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 6200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-42', railcarNumber: 'AITX10047', carType: 'Tank', isTankCar: true, commodity: 'Glycerin', customer: 'ADM', projectNumber: 'PRJ-ADM-008', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Decatur, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 7800.00, daysInShop: 15, notes: '', companyId: 'company-1' },
  { id: 'car-43', railcarNumber: 'AITX10053', carType: 'Covered Hopper', isTankCar: false, commodity: 'Animal Feed', customer: 'ADM', projectNumber: 'PRJ-ADM-009', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Columbus, OH', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4050.00, daysInShop: 88, notes: '', companyId: 'company-1' },
  { id: 'car-44', railcarNumber: 'AITX10059', carType: 'Tank', isTankCar: true, commodity: 'Ethanol', customer: 'ADM', projectNumber: 'PRJ-ADM-010', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Peoria, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 18200.00, daysInShop: 42, notes: '', companyId: 'company-1' },

  // Dow Chemical cars
  { id: 'car-45', railcarNumber: 'AITX10006', carType: 'Tank', isTankCar: true, commodity: 'Ethylene', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-001', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Freeport, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 22500.00, daysInShop: 48, notes: 'Hazmat - pressure vessel inspection', companyId: 'company-1' },
  { id: 'car-46', railcarNumber: 'AITX10012', carType: 'Tank', isTankCar: true, commodity: 'Polyethylene', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Midland, MI', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 5600.00, daysInShop: 62, notes: '', companyId: 'company-1' },
  { id: 'car-47', railcarNumber: 'AITX10018', carType: 'Covered Hopper', isTankCar: false, commodity: 'Plastic Pellets', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-003', reasonShopped: 'Corrosion Repair', status: 'scheduled', currentLocation: 'Plaquemine, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 9200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-48', railcarNumber: 'AITX10024', carType: 'Tank', isTankCar: true, commodity: 'Propylene', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-004', reasonShopped: 'Valve Replacement', status: 'in_service', currentLocation: 'Texas City, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 14500.00, daysInShop: 25, notes: '', companyId: 'company-1' },
  { id: 'car-49', railcarNumber: 'AITX10030', carType: 'Tank', isTankCar: true, commodity: 'Styrene', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-005', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Freeport, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 19800.00, daysInShop: 78, notes: '', companyId: 'company-1' },
  { id: 'car-50', railcarNumber: 'AITX10036', carType: 'Tank', isTankCar: true, commodity: 'Caustic Soda', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-006', reasonShopped: 'Lining', status: 'scheduled', currentLocation: 'Plaquemine, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 11200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-51', railcarNumber: 'AITX10042', carType: 'Covered Hopper', isTankCar: false, commodity: 'Resins', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-007', reasonShopped: 'Qualification', status: 'in_service', currentLocation: 'Midland, MI', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 4800.00, daysInShop: 18, notes: '', companyId: 'company-1' },
  { id: 'car-52', railcarNumber: 'AITX10048', carType: 'Tank', isTankCar: true, commodity: 'Chlorine', customer: 'Dow Chemical', projectNumber: 'PRJ-DOW-008', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Freeport, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 25000.00, daysInShop: 92, notes: 'Hazmat - specialized handling', companyId: 'company-1' },

  // ExxonMobil cars
  { id: 'car-53', railcarNumber: 'AITX10054', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Baytown, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 5800.00, daysInShop: 58, notes: '', companyId: 'company-1' },
  { id: 'car-54', railcarNumber: 'AITX10055', carType: 'Tank', isTankCar: true, commodity: 'Diesel', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-002', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Beaumont, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 8500.00, daysInShop: 22, notes: '', companyId: 'company-1' },
  { id: 'car-55', railcarNumber: 'AITX10056', carType: 'Tank', isTankCar: true, commodity: 'Gasoline', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-003', reasonShopped: 'Heavy Repair', status: 'scheduled', currentLocation: 'Baton Rouge, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 17500.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-56', railcarNumber: 'AITX10058', carType: 'Tank', isTankCar: true, commodity: 'Jet Fuel', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-004', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Baytown, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 5200.00, daysInShop: 45, notes: '', companyId: 'company-1' },
  { id: 'car-57', railcarNumber: 'AITX10060', carType: 'Tank', isTankCar: true, commodity: 'Lubricants', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-005', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Port Arthur, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 10800.00, daysInShop: 32, notes: '', companyId: 'company-1' },
  { id: 'car-58', railcarNumber: 'AITX10061', carType: 'Tank', isTankCar: true, commodity: 'LPG', customer: 'ExxonMobil', projectNumber: 'PRJ-EXXON-006', reasonShopped: 'Valve Replacement', status: 'available', currentLocation: 'Houston, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 13500.00, daysInShop: 68, notes: '', companyId: 'company-1' },

  // Shell cars
  { id: 'car-59', railcarNumber: 'AITX10062', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'Shell', projectNumber: 'PRJ-SHELL-001', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Deer Park, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 21000.00, daysInShop: 38, notes: '', companyId: 'company-1' },
  { id: 'car-60', railcarNumber: 'AITX10063', carType: 'Tank', isTankCar: true, commodity: 'Diesel', customer: 'Shell', projectNumber: 'PRJ-SHELL-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Martinez, CA', homeRegion: 'West', originRegion: 'West', projectedCost: 5500.00, daysInShop: 55, notes: '', companyId: 'company-1' },
  { id: 'car-61', railcarNumber: 'AITX10064', carType: 'Tank', isTankCar: true, commodity: 'Chemicals', customer: 'Shell', projectNumber: 'PRJ-SHELL-003', reasonShopped: 'Tank Cleaning', status: 'scheduled', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 7800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-62', railcarNumber: 'AITX10065', carType: 'Tank', isTankCar: true, commodity: 'LNG', customer: 'Shell', projectNumber: 'PRJ-SHELL-004', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Lake Charles, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 28000.00, daysInShop: 52, notes: 'Cryogenic tank - specialized', companyId: 'company-1' },

  // Chevron cars
  { id: 'car-63', railcarNumber: 'AITX10066', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'Chevron', projectNumber: 'PRJ-CHEV-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'El Segundo, CA', homeRegion: 'West', originRegion: 'West', projectedCost: 5400.00, daysInShop: 62, notes: '', companyId: 'company-1' },
  { id: 'car-64', railcarNumber: 'AITX10067', carType: 'Tank', isTankCar: true, commodity: 'Gasoline', customer: 'Chevron', projectNumber: 'PRJ-CHEV-002', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Richmond, CA', homeRegion: 'West', originRegion: 'West', projectedCost: 16500.00, daysInShop: 28, notes: '', companyId: 'company-1' },
  { id: 'car-65', railcarNumber: 'AITX10068', carType: 'Tank', isTankCar: true, commodity: 'Jet Fuel', customer: 'Chevron', projectNumber: 'PRJ-CHEV-003', reasonShopped: 'Tank Cleaning', status: 'scheduled', currentLocation: 'Pascagoula, MS', homeRegion: 'South', originRegion: 'South', projectedCost: 8200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-66', railcarNumber: 'AITX10069', carType: 'Tank', isTankCar: true, commodity: 'Lubricants', customer: 'Chevron', projectNumber: 'PRJ-CHEV-004', reasonShopped: 'Lining', status: 'available', currentLocation: 'El Segundo, CA', homeRegion: 'West', originRegion: 'West', projectedCost: 11500.00, daysInShop: 72, notes: '', companyId: 'company-1' },

  // DuPont cars
  { id: 'car-67', railcarNumber: 'AITX10070', carType: 'Tank', isTankCar: true, commodity: 'TiO2', customer: 'DuPont', projectNumber: 'PRJ-DUPONT-001', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Wilmington, DE', homeRegion: 'Northeast', originRegion: 'Northeast', projectedCost: 19500.00, daysInShop: 45, notes: '', companyId: 'company-1' },
  { id: 'car-68', railcarNumber: 'AITX10071', carType: 'Covered Hopper', isTankCar: false, commodity: 'Polymers', customer: 'DuPont', projectNumber: 'PRJ-DUPONT-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Orange, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 4200.00, daysInShop: 58, notes: '', companyId: 'company-1' },
  { id: 'car-69', railcarNumber: 'AITX10072', carType: 'Tank', isTankCar: true, commodity: 'Acids', customer: 'DuPont', projectNumber: 'PRJ-DUPONT-003', reasonShopped: 'Lining', status: 'scheduled', currentLocation: 'Sabine, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 12800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-70', railcarNumber: 'AITX10073', carType: 'Covered Hopper', isTankCar: false, commodity: 'Nylon Pellets', customer: 'DuPont', projectNumber: 'PRJ-DUPONT-004', reasonShopped: 'Corrosion Repair', status: 'in_service', currentLocation: 'Victoria, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 8900.00, daysInShop: 22, notes: '', companyId: 'company-1' },

  // Nucor Steel cars
  { id: 'car-71', railcarNumber: 'AITX10074', carType: 'Gondola', isTankCar: false, commodity: 'Scrap Metal', customer: 'Nucor Steel', projectNumber: 'PRJ-NUCOR-001', reasonShopped: 'Frame Repair', status: 'available', currentLocation: 'Charlotte, NC', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 11500.00, daysInShop: 75, notes: '', companyId: 'company-1' },
  { id: 'car-72', railcarNumber: 'AITX10075', carType: 'Gondola', isTankCar: false, commodity: 'Steel Coils', customer: 'Nucor Steel', projectNumber: 'PRJ-NUCOR-002', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Birmingham, AL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 15800.00, daysInShop: 35, notes: '', companyId: 'company-1' },
  { id: 'car-73', railcarNumber: 'AITX10076', carType: 'Flatcar', isTankCar: false, commodity: 'Steel Plates', customer: 'Nucor Steel', projectNumber: 'PRJ-NUCOR-003', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Decatur, AL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 4500.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-74', railcarNumber: 'AITX10077', carType: 'Gondola', isTankCar: false, commodity: 'Iron Ore', customer: 'Nucor Steel', projectNumber: 'PRJ-NUCOR-004', reasonShopped: 'Coupler Replacement', status: 'available', currentLocation: 'Crawfordsville, IN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 7200.00, daysInShop: 48, notes: '', companyId: 'company-1' },

  // US Steel cars
  { id: 'car-75', railcarNumber: 'AITX10078', carType: 'Gondola', isTankCar: false, commodity: 'Scrap Metal', customer: 'US Steel', projectNumber: 'PRJ-USS-001', reasonShopped: 'Frame Repair', status: 'in_service', currentLocation: 'Gary, IN', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 13200.00, daysInShop: 42, notes: '', companyId: 'company-1' },
  { id: 'car-76', railcarNumber: 'AITX10079', carType: 'Flatcar', isTankCar: false, commodity: 'Steel Coils', customer: 'US Steel', projectNumber: 'PRJ-USS-002', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Pittsburgh, PA', homeRegion: 'Northeast', originRegion: 'Northeast', projectedCost: 16500.00, daysInShop: 68, notes: '', companyId: 'company-1' },
  { id: 'car-77', railcarNumber: 'AITX10080', carType: 'Gondola', isTankCar: false, commodity: 'Coal', customer: 'US Steel', projectNumber: 'PRJ-USS-003', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Fairfield, AL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 4800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-78', railcarNumber: 'AITX10081', carType: 'Hopper', isTankCar: false, commodity: 'Coke', customer: 'US Steel', projectNumber: 'PRJ-USS-004', reasonShopped: 'Corrosion Repair', status: 'in_service', currentLocation: 'Granite City, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 9800.00, daysInShop: 25, notes: '', companyId: 'company-1' },

  // Georgia Pacific cars
  { id: 'car-79', railcarNumber: 'AITX10082', carType: 'Box', isTankCar: false, commodity: 'Paper Products', customer: 'Georgia Pacific', projectNumber: 'PRJ-GP-001', reasonShopped: 'DOT Compliance', status: 'available', currentLocation: 'Atlanta, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 6500.00, daysInShop: 55, notes: '', companyId: 'company-1' },
  { id: 'car-80', railcarNumber: 'AITX10083', carType: 'Box', isTankCar: false, commodity: 'Lumber', customer: 'Georgia Pacific', projectNumber: 'PRJ-GP-002', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Savannah, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 12800.00, daysInShop: 32, notes: '', companyId: 'company-1' },
  { id: 'car-81', railcarNumber: 'AITX10084', carType: 'Flatcar', isTankCar: false, commodity: 'Plywood', customer: 'Georgia Pacific', projectNumber: 'PRJ-GP-003', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Augusta, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 4200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-82', railcarNumber: 'AITX10085', carType: 'Box', isTankCar: false, commodity: 'Tissue Products', customer: 'Georgia Pacific', projectNumber: 'PRJ-GP-004', reasonShopped: 'Wheel Repair', status: 'available', currentLocation: 'Macon, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 7100.00, daysInShop: 42, notes: '', companyId: 'company-1' },

  // LyondellBasell cars
  { id: 'car-83', railcarNumber: 'AITX10086', carType: 'Tank', isTankCar: true, commodity: 'Propylene', customer: 'LyondellBasell', projectNumber: 'PRJ-LYOND-001', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Channelview, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 18500.00, daysInShop: 38, notes: '', companyId: 'company-1' },
  { id: 'car-84', railcarNumber: 'AITX10087', carType: 'Covered Hopper', isTankCar: false, commodity: 'Plastic Pellets', customer: 'LyondellBasell', projectNumber: 'PRJ-LYOND-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'LaPorte, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 4500.00, daysInShop: 62, notes: '', companyId: 'company-1' },
  { id: 'car-85', railcarNumber: 'AITX10088', carType: 'Tank', isTankCar: true, commodity: 'Ethylene', customer: 'LyondellBasell', projectNumber: 'PRJ-LYOND-003', reasonShopped: 'Valve Replacement', status: 'scheduled', currentLocation: 'Morris, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 14200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-86', railcarNumber: 'AITX10089', carType: 'Tank', isTankCar: true, commodity: 'Benzene', customer: 'LyondellBasell', projectNumber: 'PRJ-LYOND-004', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Channelview, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 9200.00, daysInShop: 18, notes: '', companyId: 'company-1' },

  // Huntsman cars
  { id: 'car-87', railcarNumber: 'AITX10090', carType: 'Tank', isTankCar: true, commodity: 'MDI', customer: 'Huntsman', projectNumber: 'PRJ-HUNT-001', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'The Woodlands, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 20500.00, daysInShop: 72, notes: '', companyId: 'company-1' },
  { id: 'car-88', railcarNumber: 'AITX10091', carType: 'Tank', isTankCar: true, commodity: 'Epoxy Resins', customer: 'Huntsman', projectNumber: 'PRJ-HUNT-002', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 11800.00, daysInShop: 28, notes: '', companyId: 'company-1' },
  { id: 'car-89', railcarNumber: 'AITX10092', carType: 'Covered Hopper', isTankCar: false, commodity: 'Pigments', customer: 'Huntsman', projectNumber: 'PRJ-HUNT-003', reasonShopped: 'Qualification', status: 'scheduled', currentLocation: 'Port Neches, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 4800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-90', railcarNumber: 'AITX10093', carType: 'Tank', isTankCar: true, commodity: 'Amines', customer: 'Huntsman', projectNumber: 'PRJ-HUNT-004', reasonShopped: 'Tank Cleaning', status: 'available', currentLocation: 'The Woodlands, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 8500.00, daysInShop: 48, notes: '', companyId: 'company-1' },

  // Valero cars
  { id: 'car-91', railcarNumber: 'AITX10094', carType: 'Tank', isTankCar: true, commodity: 'Gasoline', customer: 'Valero', projectNumber: 'PRJ-VAL-001', reasonShopped: 'Qualification', status: 'in_service', currentLocation: 'San Antonio, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 5600.00, daysInShop: 22, notes: '', companyId: 'company-1' },
  { id: 'car-92', railcarNumber: 'AITX10095', carType: 'Tank', isTankCar: true, commodity: 'Diesel', customer: 'Valero', projectNumber: 'PRJ-VAL-002', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Port Arthur, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 17200.00, daysInShop: 65, notes: '', companyId: 'company-1' },
  { id: 'car-93', railcarNumber: 'AITX10096', carType: 'Tank', isTankCar: true, commodity: 'Ethanol', customer: 'Valero', projectNumber: 'PRJ-VAL-003', reasonShopped: 'Tank Cleaning', status: 'scheduled', currentLocation: 'Memphis, TN', homeRegion: 'South', originRegion: 'South', projectedCost: 8800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-94', railcarNumber: 'AITX10097', carType: 'Tank', isTankCar: true, commodity: 'Jet Fuel', customer: 'Valero', projectNumber: 'PRJ-VAL-004', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Corpus Christi, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 10500.00, daysInShop: 32, notes: '', companyId: 'company-1' },

  // Phillips 66 cars
  { id: 'car-95', railcarNumber: 'AITX10098', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'Phillips 66', projectNumber: 'PRJ-P66-001', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Ponca City, OK', homeRegion: 'South', originRegion: 'South', projectedCost: 19800.00, daysInShop: 78, notes: '', companyId: 'company-1' },
  { id: 'car-96', railcarNumber: 'AITX10099', carType: 'Tank', isTankCar: true, commodity: 'NGL', customer: 'Phillips 66', projectNumber: 'PRJ-P66-002', reasonShopped: 'Qualification', status: 'in_service', currentLocation: 'Borger, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 5900.00, daysInShop: 25, notes: '', companyId: 'company-1' },
  { id: 'car-97', railcarNumber: 'AITX10100', carType: 'Tank', isTankCar: true, commodity: 'Gasoline', customer: 'Phillips 66', projectNumber: 'PRJ-P66-003', reasonShopped: 'Valve Replacement', status: 'scheduled', currentLocation: 'Wood River, IL', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 13500.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-98', railcarNumber: 'AITX10101', carType: 'Tank', isTankCar: true, commodity: 'Diesel', customer: 'Phillips 66', projectNumber: 'PRJ-P66-004', reasonShopped: 'Tank Cleaning', status: 'available', currentLocation: 'Sweeny, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 8200.00, daysInShop: 52, notes: '', companyId: 'company-1' },

  // Marathon Petroleum cars
  { id: 'car-99', railcarNumber: 'AITX10102', carType: 'Tank', isTankCar: true, commodity: 'Crude Oil', customer: 'Marathon Petroleum', projectNumber: 'PRJ-MPC-001', reasonShopped: 'Heavy Repair', status: 'in_service', currentLocation: 'Findlay, OH', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 18500.00, daysInShop: 42, notes: '', companyId: 'company-1' },
  { id: 'car-100', railcarNumber: 'AITX10103', carType: 'Tank', isTankCar: true, commodity: 'Gasoline', customer: 'Marathon Petroleum', projectNumber: 'PRJ-MPC-002', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Garyville, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 5500.00, daysInShop: 58, notes: '', companyId: 'company-1' },
  { id: 'car-101', railcarNumber: 'AITX10104', carType: 'Tank', isTankCar: true, commodity: 'Diesel', customer: 'Marathon Petroleum', projectNumber: 'PRJ-MPC-003', reasonShopped: 'Tank Cleaning', status: 'scheduled', currentLocation: 'Detroit, MI', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 8800.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-102', railcarNumber: 'AITX10105', carType: 'Tank', isTankCar: true, commodity: 'Asphalt', customer: 'Marathon Petroleum', projectNumber: 'PRJ-MPC-004', reasonShopped: 'Lining', status: 'in_service', currentLocation: 'Canton, OH', homeRegion: 'Midwest', originRegion: 'Midwest', projectedCost: 11200.00, daysInShop: 28, notes: '', companyId: 'company-1' },

  // Mosaic Company cars (fertilizers)
  { id: 'car-103', railcarNumber: 'AITX10106', carType: 'Covered Hopper', isTankCar: false, commodity: 'Potash', customer: 'Mosaic Company', projectNumber: 'PRJ-MOS-001', reasonShopped: 'Qualification', status: 'available', currentLocation: 'Tampa, FL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 4200.00, daysInShop: 65, notes: '', companyId: 'company-1' },
  { id: 'car-104', railcarNumber: 'AITX10107', carType: 'Covered Hopper', isTankCar: false, commodity: 'Phosphate', customer: 'Mosaic Company', projectNumber: 'PRJ-MOS-002', reasonShopped: 'Corrosion Repair', status: 'in_service', currentLocation: 'Bartow, FL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 9500.00, daysInShop: 32, notes: '', companyId: 'company-1' },
  { id: 'car-105', railcarNumber: 'AITX10108', carType: 'Tank', isTankCar: true, commodity: 'Sulfuric Acid', customer: 'Mosaic Company', projectNumber: 'PRJ-MOS-003', reasonShopped: 'Heavy Repair', status: 'scheduled', currentLocation: 'Mulberry, FL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 21000.00, daysInShop: 0, notes: 'Hazmat - acid handling', companyId: 'company-1' },
  { id: 'car-106', railcarNumber: 'AITX10109', carType: 'Covered Hopper', isTankCar: false, commodity: 'DAP Fertilizer', customer: 'Mosaic Company', projectNumber: 'PRJ-MOS-004', reasonShopped: 'Wheel Repair', status: 'available', currentLocation: 'Plant City, FL', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 6800.00, daysInShop: 48, notes: '', companyId: 'company-1' },

  // Nutrien cars
  { id: 'car-107', railcarNumber: 'AITX10110', carType: 'Covered Hopper', isTankCar: false, commodity: 'Potash', customer: 'Nutrien', projectNumber: 'PRJ-NUT-001', reasonShopped: 'Qualification', status: 'in_service', currentLocation: 'Saskatoon, SK', homeRegion: 'West', originRegion: 'West', projectedCost: 4500.00, daysInShop: 22, notes: 'Canadian routing', companyId: 'company-1' },
  { id: 'car-108', railcarNumber: 'AITX10111', carType: 'Tank', isTankCar: true, commodity: 'Ammonia', customer: 'Nutrien', projectNumber: 'PRJ-NUT-002', reasonShopped: 'Heavy Repair', status: 'available', currentLocation: 'Geismar, LA', homeRegion: 'South', originRegion: 'South', projectedCost: 23000.00, daysInShop: 82, notes: 'Hazmat - pressure vessel', companyId: 'company-1' },
  { id: 'car-109', railcarNumber: 'AITX10112', carType: 'Covered Hopper', isTankCar: false, commodity: 'Urea', customer: 'Nutrien', projectNumber: 'PRJ-NUT-003', reasonShopped: 'Corrosion Repair', status: 'scheduled', currentLocation: 'Borger, TX', homeRegion: 'South', originRegion: 'South', projectedCost: 8200.00, daysInShop: 0, notes: '', companyId: 'company-1' },
  { id: 'car-110', railcarNumber: 'AITX10113', carType: 'Tank', isTankCar: true, commodity: 'UAN Solution', customer: 'Nutrien', projectNumber: 'PRJ-NUT-004', reasonShopped: 'Tank Cleaning', status: 'in_service', currentLocation: 'Augusta, GA', homeRegion: 'Southeast', originRegion: 'Southeast', projectedCost: 7500.00, daysInShop: 15, notes: '', companyId: 'company-1' },
];

let mockShops = [
  { id: 'shop-1', name: 'AITX Maumee', code: 'MAUM', location: '', city: 'Maumee', state: 'OH', region: 'Midwest', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 100, currentLoad: 72, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 75, capabilities: '["Qualification","Heavy Repair","Lining"]', certifications: '["AAR"]', contactName: 'Mark Stevens', contactEmail: '', contactPhone: '419-555-0142', notes: 'Primary AITX qualification hub', isActive: true, companyId: 'company-1' },
  { id: 'shop-2', name: 'AITX Texarkana', code: 'TXRK', location: '', city: 'Texarkana', state: 'TX', region: 'South', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 75, currentLoad: 54, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 85, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Laura King', contactEmail: '', contactPhone: '903-555-0198', notes: 'Strong turnaround on general repairs', isActive: true, companyId: 'company-1' },
  { id: 'shop-3', name: 'AITX Eagle', code: 'EAGL', location: '', city: 'Eagle Pass', state: 'TX', region: 'South', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 67, currentLoad: 48, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 70, capabilities: '["Qualification","Lining"]', certifications: '["AAR"]', contactName: 'James Ortiz', contactEmail: '', contactPhone: '830-555-0117', notes: 'Focus on south-region fleet', isActive: true, companyId: 'company-1' },
  { id: 'shop-4', name: 'Midland Rail Services', code: 'MDLD', location: '', city: 'Midland', state: 'TX', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 125, currentLoad: 90, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 90, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Eric Vaughn', contactEmail: '', contactPhone: '432-555-0122', notes: 'Preferred 3rd party tank shop', isActive: true, companyId: 'company-1' },
  { id: 'shop-5', name: 'Rescar Houston', code: 'RHOU', location: '', city: 'Houston', state: 'TX', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 117, currentLoad: 84, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 95, capabilities: '["Qualification","Lining"]', certifications: '["AAR"]', contactName: 'Sara Nelson', contactEmail: '', contactPhone: '713-555-0155', notes: 'High lining throughput', isActive: true, companyId: 'company-1' },
  { id: 'shop-6', name: 'RSI Rail Group', code: 'RSIB', location: '', city: 'Baton Rouge', state: 'LA', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 92, currentLoad: 66, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 100, capabilities: '["Heavy Repair","Qualification"]', certifications: '["AAR"]', contactName: 'Chris Wallace', contactEmail: '', contactPhone: '225-555-0133', notes: 'Handles southern fleet demand', isActive: true, companyId: 'company-1' },
  { id: 'shop-7', name: 'GBW Rail Services', code: 'GBWK', location: '', city: 'Kansas City', state: 'MO', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 108, currentLoad: 78, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 80, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Tom Reilly', contactEmail: '', contactPhone: '816-555-0145', notes: 'High-volume central location', isActive: true, companyId: 'company-1' },
  { id: 'shop-8', name: 'UTLX Alexandria', code: 'UTLA', location: '', city: 'Alexandria', state: 'LA', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 133, currentLoad: 96, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 85, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Anita Brooks', contactEmail: '', contactPhone: '318-555-0199', notes: 'Strong performance on schedule', isActive: true, companyId: 'company-1' },
  { id: 'shop-9', name: 'Watco Coffeyville', code: 'WCOF', location: '', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 79, currentLoad: 57, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 95, capabilities: '["Heavy Repair","Qualification"]', certifications: '["AAR"]', contactName: 'John Cooper', contactEmail: '', contactPhone: '620-555-0177', notes: 'High availability during peak season', isActive: true, companyId: 'company-1' },
  { id: 'shop-10', name: 'Vulcan Rail Services', code: 'VULC', location: '', city: 'Birmingham', state: 'AL', region: 'Gulf', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 83, currentLoad: 60, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 90, capabilities: '["Qualification","Lining"]', certifications: '["AAR"]', contactName: 'Paul Jackson', contactEmail: '', contactPhone: '205-555-0180', notes: 'Supports Gulf and Southeast region', isActive: true, companyId: 'company-1' },
  { id: 'shop-11', name: 'Procor Sarnia', code: 'PSAR', location: '', city: 'Sarnia', state: 'ON', region: 'Northeast', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 67, currentLoad: 48, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 100, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Kevin Miller', contactEmail: '', contactPhone: '519-555-0154', notes: 'Canadian partner facility', isActive: true, companyId: 'company-1' },
  { id: 'shop-12', name: 'Mid-America Railcar', code: 'MARC', location: '', city: 'Texarkana', state: 'AR', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: false, networkTier: 3, shopStatus: 'active', capacity: 50, currentLoad: 36, utilizationTarget: 0.85, baseCostPerCar: 11000, laborRate: 65, costIndex: 1.0, baseTurnTime: 70, capabilities: '["Qualification"]', certifications: '["AAR"]', contactName: 'Brian Todd', contactEmail: '', contactPhone: '870-555-0166', notes: 'Light repair and requalification focus', isActive: true, companyId: 'company-1' },
  { id: 'shop-13', name: 'AITX Bossier City', code: 'BOSS', location: '', city: 'Bossier City', state: 'LA', region: 'South', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 83, currentLoad: 60, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 80, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Megan Allen', contactEmail: '', contactPhone: '318-555-0128', notes: 'AITX southern-region shop', isActive: true, companyId: 'company-1' },
  { id: 'shop-14', name: 'AITX Longview', code: 'LONG', location: '', city: 'Longview', state: 'TX', region: 'South', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: false, networkTier: 1, shopStatus: 'active', capacity: 58, currentLoad: 42, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 75, capabilities: '["Qualification"]', certifications: '["AAR"]', contactName: 'Jeff Harmon', contactEmail: '', contactPhone: '903-555-0183', notes: 'Handles short-line qualification work', isActive: true, companyId: 'company-1' },
  { id: 'shop-15', name: 'TankCar Services', code: 'TCSD', location: '', city: 'Decatur', state: 'IL', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 100, currentLoad: 72, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 90, capabilities: '["Heavy Repair"]', certifications: '["AAR"]', contactName: 'Ryan Keller', contactEmail: '', contactPhone: '217-555-0140', notes: 'Strong for central U.S. routing', isActive: true, companyId: 'company-1' },
  { id: 'shop-16', name: 'Union Tank Repair', code: 'UTRM', location: '', city: 'Rosemount', state: 'MN', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 108, currentLoad: 78, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 85, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Lisa Carter', contactEmail: '', contactPhone: '651-555-0125', notes: 'Handles northern fleet assignments', isActive: true, companyId: 'company-1' },
  { id: 'shop-17', name: 'Frontier Railcar', code: 'FRBM', location: '', city: 'Billings', state: 'MT', region: 'West', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 58, currentLoad: 42, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 100, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Nathan Brooks', contactEmail: '', contactPhone: '406-555-0163', notes: 'Good for Western region repairs', isActive: true, companyId: 'company-1' },
  { id: 'shop-18', name: 'AITX East Chicago', code: 'ECHG', location: '', city: 'East Chicago', state: 'IN', region: 'Midwest', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: true, networkTier: 1, shopStatus: 'active', capacity: 92, currentLoad: 66, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 80, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Stephanie Doyle', contactEmail: '', contactPhone: '219-555-0192', notes: 'Centrally located for Midwest routing', isActive: true, companyId: 'company-1' },
  { id: 'shop-19', name: 'Ennis Railcar', code: 'ENNS', location: '', city: 'Ennis', state: 'TX', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 75, currentLoad: 54, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 85, capabilities: '["Qualification","Heavy Repair","Lining"]', certifications: '["AAR"]', contactName: 'John Mason', contactEmail: '', contactPhone: '972-555-0184', notes: 'Strong partner for Gulf region', isActive: true, companyId: 'company-1' },
  { id: 'shop-20', name: 'CF Rail', code: 'CFRM', location: '', city: 'Marshall', state: 'TX', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 83, currentLoad: 60, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 95, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Diana Lopez', contactEmail: '', contactPhone: '903-555-0158', notes: 'Handles overflow from AITX Longview', isActive: true, companyId: 'company-1' },
  { id: 'shop-21', name: 'Apex Rail', code: 'APEX', location: '', city: 'Hammond', state: 'IN', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 67, currentLoad: 48, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 90, capabilities: '["Heavy Repair"]', certifications: '["AAR"]', contactName: 'Charles Evans', contactEmail: '', contactPhone: '219-555-0175', notes: 'Midwest heavy repair capacity', isActive: true, companyId: 'company-1' },
  { id: 'shop-22', name: 'GATX Danville', code: 'GXDV', location: '', city: 'Danville', state: 'IL', region: 'Midwest', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 100, currentLoad: 72, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 85, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Roger Adams', contactEmail: '', contactPhone: '217-555-0179', notes: 'Solid reliability metrics', isActive: true, companyId: 'company-1' },
  { id: 'shop-23', name: 'National Steel Car', code: 'NSCH', location: '', city: 'Hamilton', state: 'ON', region: 'Northeast', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 58, currentLoad: 42, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 100, capabilities: '["Qualification","Fabrication"]', certifications: '["AAR"]', contactName: 'Ethan Brown', contactEmail: '', contactPhone: '905-555-0162', notes: 'Handles specialized tank rebuilds', isActive: true, companyId: 'company-1' },
  { id: 'shop-24', name: 'AITX Coffeyville', code: 'ACOF', location: '', city: 'Coffeyville', state: 'KS', region: 'Midwest', network: 'AITX-Own', servingRailroad: '', isAitxInternal: true, tankQualified: false, networkTier: 1, shopStatus: 'active', capacity: 67, currentLoad: 48, utilizationTarget: 0.9, baseCostPerCar: 15000, laborRate: 85, costIndex: 1.379, baseTurnTime: 70, capabilities: '["Qualification"]', certifications: '["AAR"]', contactName: 'Allison Reed', contactEmail: '', contactPhone: '620-555-0191', notes: 'AITX-controlled overflow site', isActive: true, companyId: 'company-1' },
  { id: 'shop-25', name: 'Nortrak Services', code: 'NTRK', location: '', city: 'Oklahoma City', state: 'OK', region: 'South', network: '3rd Party', servingRailroad: '', isAitxInternal: false, tankQualified: true, networkTier: 2, shopStatus: 'active', capacity: 83, currentLoad: 60, utilizationTarget: 0.85, baseCostPerCar: 13000, laborRate: 75, costIndex: 1.0, baseTurnTime: 90, capabilities: '["Qualification","Heavy Repair"]', certifications: '["AAR"]', contactName: 'Olivia Hunt', contactEmail: '', contactPhone: '405-555-0135', notes: 'Regional partner for central U.S.', isActive: true, companyId: 'company-1' },
];

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.json({
      token: 'mock-jwt-token-12345',
      user: mockUser,
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json(mockUser);
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

// Cars endpoints
app.get('/api/cars', (req, res) => {
  const { page = '1', pageSize = '20', status, customer, carType } = req.query;
  let filtered = [...mockCars];

  if (status) filtered = filtered.filter(c => c.status === status);
  if (customer) filtered = filtered.filter(c => c.customer === customer);
  if (carType) filtered = filtered.filter(c => c.carType === carType);

  const pageNum = parseInt(page as string);
  const pageSizeNum = parseInt(pageSize as string);
  const start = (pageNum - 1) * pageSizeNum;
  const paged = filtered.slice(start, start + pageSizeNum);

  res.json({
    data: paged,
    total: filtered.length,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.ceil(filtered.length / pageSizeNum),
  });
});

app.get('/api/cars/export', (req, res) => {
  const headers = ['Vehicle Number', 'Car Type', 'Is Tank Car', 'Commodity', 'Customer', 'Project Number', 'Reason Shopped', 'Status'];
  const rows = mockCars.map(c => [c.railcarNumber, c.carType, c.isTankCar ? 'Yes' : 'No', c.commodity, c.customer, c.projectNumber, c.reasonShopped, c.status]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="railcars_export.csv"');
  res.send(csv);
});

app.get('/api/cars/:id', (req, res) => {
  const car = mockCars.find(c => c.id === req.params.id);
  if (car) res.json(car);
  else res.status(404).json({ message: 'Car not found' });
});

app.post('/api/cars', (req, res) => {
  const newCar = {
    id: `car-${Date.now()}`,
    ...req.body,
    companyId: 'company-1',
  };
  mockCars.push(newCar);
  res.status(201).json(newCar);
});

app.put('/api/cars/:id', (req, res) => {
  const index = mockCars.findIndex(c => c.id === req.params.id);
  if (index !== -1) {
    mockCars[index] = { ...mockCars[index], ...req.body };
    res.json(mockCars[index]);
  } else {
    res.status(404).json({ message: 'Car not found' });
  }
});

app.delete('/api/cars/:id', (req, res) => {
  mockCars = mockCars.filter(c => c.id !== req.params.id);
  res.status(204).send();
});

app.patch('/api/cars/bulk', (req, res) => {
  const { carIds, updates } = req.body;
  mockCars = mockCars.map(c => carIds.includes(c.id) ? { ...c, ...updates } : c);
  res.json(mockCars.filter(c => carIds.includes(c.id)));
});

app.delete('/api/cars/bulk', (req, res) => {
  const { carIds } = req.body;
  mockCars = mockCars.filter(c => !carIds.includes(c.id));
  res.status(204).send();
});

app.post('/api/cars/bulk-import', (req, res) => {
  const { cars } = req.body;
  const results = {
    status: 'success' as 'success' | 'partial_success' | 'failed',
    newCarsAdded: 0,
    existingCarsUpdated: 0,
    failedRows: 0,
    errors: [] as { row: number; reason: string }[],
  };

  if (!Array.isArray(cars) || cars.length === 0) {
    res.status(400).json({ ...results, status: 'failed', errors: [{ row: 0, reason: 'No cars data provided' }] });
    return;
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const rowNum = i + 2;

    if (!car.railcarNumber) {
      results.errors.push({ row: rowNum, reason: 'Missing required field: railcarNumber' });
      results.failedRows++;
      continue;
    }

    const existingIndex = mockCars.findIndex(c => c.railcarNumber === car.railcarNumber);
    const isTankCar = car.isTankCar === true || car.carType?.toLowerCase().includes('tank');

    const carData = {
      id: existingIndex !== -1 ? mockCars[existingIndex].id : `car-${Date.now()}-${i}`,
      railcarNumber: car.railcarNumber,
      carType: car.carType || '',
      isTankCar,
      commodity: car.commodity || '',
      customer: car.customer || '',
      projectNumber: car.projectNumber || '',
      reasonShopped: car.reasonShopped || '',
      status: car.status || 'available',
      currentLocation: car.currentLocation || '',
      homeRegion: car.homeRegion || '',
      originRegion: car.originRegion || '',
      projectedCost: car.projectedCost || 0,
      daysInShop: car.daysInShop || 0,
      notes: car.notes || '',
      companyId: 'company-1',
    };

    if (existingIndex !== -1) {
      mockCars[existingIndex] = carData;
      results.existingCarsUpdated++;
    } else {
      mockCars.push(carData);
      results.newCarsAdded++;
    }
  }

  if (results.failedRows === cars.length) results.status = 'failed';
  else if (results.failedRows > 0) results.status = 'partial_success';

  res.json(results);
});

// Shops endpoints
app.get('/api/shops', (req, res) => {
  res.json(mockShops);
});

app.get('/api/shops/meta/filters', (req, res) => {
  res.json({
    regions: [...new Set(mockShops.map(s => s.region))],
    networks: [...new Set(mockShops.map(s => s.network))],
    railroads: [...new Set(mockShops.map(s => s.servingRailroad))],
  });
});

app.get('/api/shops/export', (req, res) => {
  const headers = ['Code', 'Name', 'City', 'State', 'Region', 'Network', 'Capacity', 'Tank Qualified', 'Status'];
  const rows = mockShops.map(s => [s.code, s.name, s.city, s.state, s.region, s.network, s.capacity, s.tankQualified ? 'Yes' : 'No', s.shopStatus]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="shops_export.csv"');
  res.send(csv);
});

app.get('/api/shops/:id', (req, res) => {
  const shop = mockShops.find(s => s.id === req.params.id);
  if (shop) {
    res.json({
      ...shop,
      capabilities: JSON.parse(shop.capabilities),
      certifications: JSON.parse(shop.certifications),
    });
  } else {
    res.status(404).json({ message: 'Shop not found' });
  }
});

app.post('/api/shops', (req, res) => {
  const newShop = {
    id: `shop-${Date.now()}`,
    ...req.body,
    capabilities: JSON.stringify(req.body.capabilities || []),
    certifications: JSON.stringify(req.body.certifications || []),
    companyId: 'company-1',
  };
  mockShops.push(newShop);
  res.status(201).json(newShop);
});

app.put('/api/shops/:id', (req, res) => {
  const index = mockShops.findIndex(s => s.id === req.params.id);
  if (index !== -1) {
    mockShops[index] = {
      ...mockShops[index],
      ...req.body,
      capabilities: JSON.stringify(req.body.capabilities || []),
      certifications: JSON.stringify(req.body.certifications || []),
    };
    res.json(mockShops[index]);
  } else {
    res.status(404).json({ message: 'Shop not found' });
  }
});

app.delete('/api/shops/:id', (req, res) => {
  mockShops = mockShops.filter(s => s.id !== req.params.id);
  res.status(204).send();
});

app.post('/api/shops/bulk-import', (req, res) => {
  const { shops } = req.body;
  const results = {
    status: 'success' as 'success' | 'partial_success' | 'failed',
    newShopsAdded: 0,
    existingShopsUpdated: 0,
    failedRows: 0,
    errors: [] as { row: number; reason: string }[],
  };

  if (!Array.isArray(shops) || shops.length === 0) {
    res.status(400).json({ ...results, status: 'failed', errors: [{ row: 0, reason: 'No shops data provided' }] });
    return;
  }

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    const rowNum = i + 2;

    if (!shop.code || !shop.name) {
      results.errors.push({ row: rowNum, reason: 'Missing required fields: code and name' });
      results.failedRows++;
      continue;
    }

    const existingIndex = mockShops.findIndex(s => s.code === shop.code);

    const shopData = {
      id: existingIndex !== -1 ? mockShops[existingIndex].id : `shop-${Date.now()}-${i}`,
      name: shop.name,
      code: shop.code,
      location: shop.location || '',
      city: shop.city || '',
      state: shop.state || '',
      region: shop.region || '',
      network: shop.network || '',
      servingRailroad: shop.servingRailroad || '',
      isAitxInternal: shop.isAitxInternal || false,
      tankQualified: shop.tankQualified !== false,
      networkTier: shop.networkTier || 5,
      shopStatus: shop.shopStatus || 'active',
      capacity: shop.capacity || 10,
      currentLoad: shop.currentLoad || 0,
      utilizationTarget: shop.utilizationTarget || 0.9,
      baseCostPerCar: shop.baseCostPerCar || 15000,
      laborRate: shop.laborRate || 75,
      costIndex: shop.costIndex || 1.0,
      baseTurnTime: shop.baseTurnTime || 14,
      capabilities: JSON.stringify(shop.capabilities || []),
      certifications: JSON.stringify(shop.certifications || []),
      contactName: shop.contactName || '',
      contactEmail: shop.contactEmail || '',
      contactPhone: shop.contactPhone || '',
      notes: shop.notes || '',
      isActive: shop.isActive !== false,
      companyId: 'company-1',
    };

    if (existingIndex !== -1) {
      mockShops[existingIndex] = shopData;
      results.existingShopsUpdated++;
    } else {
      mockShops.push(shopData);
      results.newShopsAdded++;
    }
  }

  if (results.failedRows === shops.length) results.status = 'failed';
  else if (results.failedRows > 0) results.status = 'partial_success';

  res.json(results);
});

// Analytics endpoint
app.get('/api/analytics/dashboard', (req, res) => {
  res.json({
    totalCars: mockCars.length,
    availableCars: mockCars.filter(c => c.status === 'available').length,
    inServiceCars: mockCars.filter(c => c.status === 'in_service').length,
    scheduledCars: mockCars.filter(c => c.status === 'scheduled').length,
    totalShops: mockShops.length,
    activeShops: mockShops.filter(s => s.isActive).length,
    tankQualifiedShops: mockShops.filter(s => s.tankQualified).length,
    avgUtilization: 0.72,
  });
});

// Plans endpoint (minimal)
app.get('/api/plans', (req, res) => {
  res.json([]);
});

// Scenarios endpoint (minimal)
app.get('/api/scenarios', (req, res) => {
  res.json([]);
});

app.get('/api/scenarios/customers', (req, res) => {
  res.json([...new Set(mockCars.map(c => c.customer))]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
  console.log(`\nTest credentials: any email/password combination works`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /api/auth/login`);
  console.log(`  GET  /api/cars`);
  console.log(`  POST /api/cars/bulk-import`);
  console.log(`  GET  /api/cars/export`);
  console.log(`  GET  /api/shops`);
  console.log(`  POST /api/shops/bulk-import`);
  console.log(`  GET  /api/shops/export`);
});
