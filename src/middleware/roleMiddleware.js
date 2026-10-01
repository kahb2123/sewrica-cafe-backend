const {
  hasPermission,
  hasRole,
  hasRoleOrHigher,
  getPermissionsForRole,
  routePermissions,
  roleHierarchy,
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
      return res.status(401).json({ message: 'Not authorized, no user' });
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
  getUserPermissions,
  roleMiddleware,
  getRoutePermissions,
};
