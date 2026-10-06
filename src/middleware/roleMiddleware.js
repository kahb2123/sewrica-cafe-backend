const {
  hasPermission,
  hasRole,
  hasRoleOrHigher,
  getPermissionsForRole,
  getPageAccessForRole,
  routePermissions,
  roleHierarchy,
  PAGE_ACCESS,
} = require('../config/roleMap');

const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user' });
    }

    const userRole = req.user.role;

    const granted = permissions.every((perm) => hasPermission(userRole, perm));

    if (!granted) {
      return res.status(403).json({
        message: `Access denied. Missing permission: ${permissions.filter((p) => !hasPermission(userRole, p)).join(', ')}`,
        code: 'INSUFFICIENT_PERMISSION',
      });
    }

    next();
  };
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user' });
    }

    if (!hasRole(req.user.role, ...roles)) {
      return res.status(403).json({
        message: `Access denied. Role '${req.user.role}' is not authorized`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
};

const requireRoleOrHigher = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user' });
    }

    if (!hasRoleOrHigher(req.user.role, role)) {
      return res.status(403).json({
        message: `Access denied. Requires role '${role}' or higher`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
};

const matchRoutePattern = (pattern, path) => {
  const paramNames = [];
  const regexPattern = pattern
    .replace(/^\//, '')
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '[^/]+';
      }
      return segment;
    })
    .join('\\/');

  const regex = new RegExp(`^${regexPattern}$`);
  const match = path.replace(/^\//, '').match(regex);

  if (!match) {
    return null;
  }

  const params = {};
  paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });

  return params;
};

const getRoutePermissions = (method, path) => {
  const upperMethod = method.toUpperCase();

  if (routePermissions[path] && routePermissions[path][upperMethod]) {
    return routePermissions[path][upperMethod];
  }

  for (const pattern of Object.keys(routePermissions)) {
    if (pattern.includes(':')) {
      const params = matchRoutePattern(pattern, path);
      if (params && routePermissions[pattern][upperMethod]) {
        return routePermissions[pattern][upperMethod];
      }
    }
  }

  return null;
};

const requireRoutePermission = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const userRole = req.user.role;

    const permissions = getRoutePermissions(req.method, req.route?.path || req.path);

    if (permissions) {
      const granted = permissions.every((perm) => hasPermission(userRole, perm));

      if (!granted) {
        return res.status(403).json({
          message: `Access denied. Missing permission: ${permissions.filter((p) => !hasPermission(userRole, p)).join(', ')}`,
          code: 'INSUFFICIENT_PERMISSION',
        });
      }
    }

    next();
  };
};

const mergePageAccessForUser = (user) => {
  const role = user.role;
  const base = getPageAccessForRole(role);
  const overrides = (user.pageAccessOverrides && typeof user.pageAccessOverrides === 'object') ? user.pageAccessOverrides : {};

  const merged = {};
  for (const [page, access] of Object.entries(PAGE_ACCESS)) {
    const override = overrides[page];
    if (override) {
      merged[page] = {
        canRead: override.canRead ?? base[page]?.canRead ?? false,
        canWrite: override.canWrite ?? base[page]?.canWrite ?? false,
      };
    } else {
      merged[page] = {
        canRead: !!access.read.includes(role),
        canWrite: !!access.write.includes(role),
      };
    }
  }
  return merged;
};

const getUserPageAccess = (req) => {
  if (req.user && req.user.pageAccessOverrides) {
    return mergePageAccessForUser(req.user);
  }
  if (req.user) {
    return mergePageAccessForUser(req.user);
  }
  return getPageAccessForRole(null);
};

const requirePagePermission = (page, action = 'read') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const pageAccess = getUserPageAccess(req);
    const pagePerm = pageAccess[page];

    if (!pagePerm) {
      return res.status(403).json({ message: `Access denied. Page '${page}' not found` });
    }

    if (action === 'write' && !pagePerm.canWrite) {
      return res.status(403).json({ message: `Access denied. Write permission required for '${page}'` });
    }

    if (action === 'read' && !pagePerm.canRead) {
      return res.status(403).json({ message: `Access denied. Read permission required for '${page}'` });
    }
    next();
  };
};

const getUserPermissions = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const permissions = getPermissionsForRole(req.user.role);

  res.json({
    success: true,
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive,
    },
    permissions,
    roleHierarchy,
  });
};

const roleMiddleware = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  req.hasPermission = (permission) => hasPermission(req.user.role, permission);
  req.hasRole = (...roles) => hasRole(req.user.role, ...roles);
  req.hasRoleOrHigher = (role) => hasRoleOrHigher(req.user.role, role);

  next();
};

module.exports = {
  requirePermission,
  requireRole,
  requireRoleOrHigher,
  requireRoutePermission,
  requirePagePermission,
  getUserPageAccess,
  getUserPermissions,
  roleMiddleware,
  getRoutePermissions,
};
