const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
};

const ADMIN_TABS = [
  'mainPageLayout',
  'banner',
  'breakdowns',
  'blog',
  'comments',
  'projects',
  'users',
  'socialMedia',
  'admins',
];

const GRANTABLE_ADMIN_TABS = ADMIN_TABS.filter((tab) => tab !== 'admins');

const CRUD_ACTIONS = ['read', 'create', 'update', 'delete'];

function getSuperAdminPermissions() {
  return ADMIN_TABS.map((tab) => ({
    tab,
    canRead: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    projectIds: [],
  }));
}

module.exports = {
  ADMIN_ROLES,
  ADMIN_TABS,
  GRANTABLE_ADMIN_TABS,
  CRUD_ACTIONS,
  getSuperAdminPermissions,
};
