const roleHierarchy = {
  customer: 0,
  supply_chain: 1,
  cashier: 2,
  delivery: 3,
  cook: 4,
  chef: 4,
  admin: 5,
};

const PERMISSIONS = {
  ORDERS_VIEW: 'orders:view',
  ORDERS_ALL: 'orders:all',
  ORDERS_ASSIGN_CHEF: 'orders:assign_chef',
  ORDERS_ASSIGN_DELIVERY: 'orders:assign_delivery',
  ORDERS_UPDATE_STATUS: 'orders:update_status',
  ORDERS_ACCEPT: 'orders:accept',
  ORDERS_REJECT: 'orders:reject',
  ORDERS_START_COOKING: 'orders:start_cooking',
  ORDERS_COMPLETE_COOKING: 'orders:complete_cooking',
  ORDERS_START_DELIVERY: 'orders:start_delivery',
  ORDERS_COMPLETE_DELIVERY: 'orders:complete_delivery',
  ORDERS_VIEW_ASSIGNED: 'orders:view_assigned',

  STAFF_VIEW: 'staff:view',
  STAFF_CREATE: 'staff:create',
  STAFF_UPDATE: 'staff:update',
  STAFF_DELETE: 'staff:delete',

  MENU_MANAGE: 'menu:manage',
  INGREDIENTS_MANAGE: 'ingredients:manage',
  EXPENSES_MANAGE: 'expenses:manage',

  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',

  PAYMENTS_PROCESS: 'payments:process',
  PAYMENTS_VIEW: 'payments:view',
};

const rolePermissions = {
  customer: [
    PERMISSIONS.ORDERS_VIEW,
  ],

  supply_chain: [
    PERMISSIONS.INGREDIENTS_MANAGE,
  ],

  cashier: [
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.PAYMENTS_PROCESS,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.STAFF_VIEW,
  ],

  delivery: [
    PERMISSIONS.ORDERS_VIEW_ASSIGNED,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_START_DELIVERY,
    PERMISSIONS.ORDERS_COMPLETE_DELIVERY,
  ],

  cook: [
    PERMISSIONS.ORDERS_VIEW_ASSIGNED,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_START_COOKING,
    PERMISSIONS.ORDERS_COMPLETE_COOKING,
  ],

  chef: [
    PERMISSIONS.ORDERS_VIEW_ASSIGNED,
    PERMISSIONS.ORDERS_ACCEPT,
    PERMISSIONS.ORDERS_REJECT,
    PERMISSIONS.ORDERS_START_COOKING,
    PERMISSIONS.ORDERS_COMPLETE_COOKING,
  ],

  admin: Object.values(PERMISSIONS),
};

const routePermissions = {
  '/api/staff/orders/cooking': {
    GET: [PERMISSIONS.ORDERS_VIEW_ASSIGNED, PERMISSIONS.ORDERS_ACCEPT],
  },
  '/api/staff/orders/delivery': {
    GET: [PERMISSIONS.ORDERS_VIEW_ASSIGNED, PERMISSIONS.ORDERS_ACCEPT],
  },
  '/api/staff/orders/cooking/completed': {
    GET: [PERMISSIONS.ORDERS_VIEW],
  },
  '/api/staff/orders/delivery/completed': {
    GET: [PERMISSIONS.ORDERS_VIEW],
  },
  '/api/staff/orders/:orderId/chef-accept': {
    POST: [PERMISSIONS.ORDERS_ACCEPT],
  },
  '/api/staff/orders/:orderId/chef-reject': {
    POST: [PERMISSIONS.ORDERS_REJECT],
  },
  '/api/staff/orders/:orderId/delivery-accept': {
    POST: [PERMISSIONS.ORDERS_ACCEPT],
  },
  '/api/staff/orders/:orderId/delivery-reject': {
    POST: [PERMISSIONS.ORDERS_REJECT],
  },
  '/api/staff/start-cooking/:orderId': {
    POST: [PERMISSIONS.ORDERS_START_COOKING],
  },
  '/api/staff/complete-cooking/:orderId': {
    POST: [PERMISSIONS.ORDERS_COMPLETE_COOKING],
  },
  '/api/staff/start-delivery/:orderId': {
    POST: [PERMISSIONS.ORDERS_START_DELIVERY],
  },
  '/api/staff/complete-delivery/:orderId': {
    POST: [PERMISSIONS.ORDERS_COMPLETE_DELIVERY],
  },
  '/api/staff/stats/chef': {
    GET: [PERMISSIONS.ORDERS_VIEW_ASSIGNED],
  },
  '/api/staff/stats/delivery': {
    GET: [PERMISSIONS.ORDERS_VIEW_ASSIGNED],
  },
  '/api/staff/:role': {
    GET: [PERMISSIONS.STAFF_VIEW],
  },
};

const PAGE_ACCESS = {
  staffDashboard: {
    read: ['cook', 'chef', 'delivery', 'cashier', 'admin'],
    write: ['cook', 'chef', 'delivery', 'cashier', 'admin'],
  },
  staffOrdersCooking: {
    read: ['cook', 'chef', 'admin'],
    write: ['cook', 'chef', 'admin'],
  },
  staffOrdersDelivery: {
    read: ['delivery', 'admin'],
    write: ['delivery', 'admin'],
  },
  staffStats: {
    read: ['cook', 'chef', 'delivery', 'cashier', 'admin'],
    write: ['admin'],
  },
  staffProfile: {
    read: ['cook', 'chef', 'delivery', 'cashier', 'admin'],
    write: ['cook', 'chef', 'delivery', 'cashier', 'admin'],
  },
  adminDashboard: {
    read: ['admin'],
    write: ['admin'],
  },
  adminOrders: {
    read: ['admin', 'cashier'],
    write: ['admin'],
  },
  adminStaff: {
    read: ['admin'],
    write: ['admin'],
  },
  adminMenu: {
    read: ['admin'],
    write: ['admin'],
  },
  adminReports: {
    read: ['admin', 'cashier'],
    write: ['admin'],
  },
  adminIngredients: {
    read: ['admin', 'supply_chain'],
    write: ['admin', 'supply_chain'],
  },
  adminExpenses: {
    read: ['admin'],
    write: ['admin'],
  },
  adminUsers: {
    read: ['admin'],
    write: ['admin'],
  },
};

const canReadPage = (role, page) => {
  const access = PAGE_ACCESS[page];
  if (!access) {
    return false;
  }
  return access.read.includes(role);
};

const canWritePage = (role, page) => {
  const access = PAGE_ACCESS[page];
  if (!access) {
    return false;
  }
  return access.write.includes(role);
};

const getPageAccessForRole = (role) => {
  const result = {};
  for (const [page, access] of Object.entries(PAGE_ACCESS)) {
    result[page] = {
      canRead: access.read.includes(role),
      canWrite: access.write.includes(role),
    };
  }
  return result;
};

const hasPermission = (role, permission) => {
  const permissions = rolePermissions[role];
  if (!permissions) {
    return false;
  }
  if (permissions.includes('*')) {
    return true;
  }
  return permissions.includes(permission);
};

const hasRole = (role, ...allowedRoles) => {
  return allowedRoles.includes(role);
};

const hasRoleOrHigher = (role, minRole) => {
  const userLevel = roleHierarchy[role] ?? -1;
  const minLevel = roleHierarchy[minRole] ?? -1;
  return userLevel >= minLevel;
};

const getPermissionsForRole = (role) => {
  return [...(rolePermissions[role] || [])];
};

const hasPageRead = canReadPage;
const hasPageWrite = canWritePage;

module.exports = {
  roleHierarchy,
  PERMISSIONS,
  rolePermissions,
  routePermissions,
  PAGE_ACCESS,
  hasPermission,
  hasRole,
  hasRoleOrHigher,
  hasPageRead,
  hasPageWrite,
  getPageAccessForRole,
  getPermissionsForRole,
};
