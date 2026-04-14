function readSessionValue(req, key) {
  if (req?.session && typeof req.session.get === "function") {
    return req.session.get(key);
  }

  return req?.session?.[key];
}

function writeSessionValue(req, key, value) {
  if (req?.session && typeof req.session.set === "function") {
    req.session.set(key, value);
    return;
  }

  if (req?.session) {
    req.session[key] = value;
  }
}

function clearSessionValue(req, key) {
  if (req?.session && typeof req.session.delete === "function") {
    req.session.delete(key);
    return;
  }

  if (req?.session) {
    req.session[key] = null;
  }
}

function getSessionUser(req) {
  return readSessionValue(req, "user") || null;
}

function setSessionUser(req, user) {
  writeSessionValue(req, "user", user);
}

function clearSessionUser(req) {
  clearSessionValue(req, "user");
}

function hasRole(user, role) {
  return user?.role === role;
}

function normalizePermissionKey(permissionKey) {
  return String(permissionKey || "").trim();
}

function hasPermission(user, permissionKey) {
  const normalizedPermissionKey = normalizePermissionKey(permissionKey);

  if (!normalizedPermissionKey) {
    return false;
  }

  if (user?.isRoot || user?.role === "root") {
    return true;
  }

  return Array.isArray(user?.permissions) && user.permissions.includes(normalizedPermissionKey);
}

function hasAnyPermission(user, permissionKeys) {
  return (Array.isArray(permissionKeys) ? permissionKeys : []).some((permissionKey) =>
    hasPermission(user, permissionKey),
  );
}

function sendAuthError(replyOrRes, statusCode, message) {
  if (typeof replyOrRes.code === "function") {
    return replyOrRes.code(statusCode).send({
      success: false,
      message,
    });
  }

  return replyOrRes.status(statusCode).json({
    success: false,
    message,
  });
}

function requireUser(req, reply, next) {
  const user = getSessionUser(req);

  if (!user) {
    return sendAuthError(reply, 401, "请先使用 Steam 登录。");
  }

  if (typeof next === "function") {
    return next();
  }
}

function requirePermission(permissionKey) {
  return function enforcePermission(req, reply, next) {
    const user = getSessionUser(req);

    if (!user) {
      return sendAuthError(reply, 401, "请先使用 Steam 登录。");
    }

    if (!hasPermission(user, permissionKey)) {
      return sendAuthError(reply, 403, "当前账号没有访问该页面的权限。");
    }

    if (typeof next === "function") {
      return next();
    }
  };
}

function requireAnyPermission(permissionKeys) {
  return function enforceAnyPermission(req, reply, next) {
    const user = getSessionUser(req);

    if (!user) {
      return sendAuthError(reply, 401, "请先使用 Steam 登录。");
    }

    if (!hasAnyPermission(user, permissionKeys)) {
      return sendAuthError(reply, 403, "当前账号没有访问该页面的权限。");
    }

    if (typeof next === "function") {
      return next();
    }
  };
}

function requireRoot(req, reply, next) {
  const user = getSessionUser(req);

  if (!user) {
    return sendAuthError(reply, 401, "请先使用 Steam 登录。");
  }

  if (!hasRole(user, "root")) {
    return sendAuthError(reply, 403, "当前账号不是 root 管理员。");
  }

  if (typeof next === "function") {
    return next();
  }
}

module.exports = {
  clearSessionUser,
  getSessionUser,
  hasAnyPermission,
  hasPermission,
  hasRole,
  requireAnyPermission,
  requirePermission,
  requireRoot,
  requireUser,
  setSessionUser,
};
