/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('connected_accounts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    provider: {
      type: 'varchar(20)',
      notNull: true,
    },
    provider_email: {
      type: 'varchar(320)',
    },
    access_token: {
      type: 'text',
    },
    refresh_token: {
      type: 'text',
    },
    token_expires_at: {
      type: 'timestamptz',
    },
    carddav_password: {
      type: 'text',
    },
    connected_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('connected_accounts', 'user_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('connected_accounts');
};
